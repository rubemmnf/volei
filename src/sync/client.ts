import { z } from "zod";
import type { AppAction } from "../app-state";
import { AppStateSchema, type AppState } from "../types";
import { AppActionSchema, parseServerMessage, toWireAction, type ClientMessage } from "./protocol";
import {
  applyEntry,
  applyLocal,
  applySync,
  emptyEngine,
  engineFrom,
  renderState,
  type Engine,
  type PendingAction,
} from "./rebase";

export const SYNC_STORAGE_KEY = "volei-sync-v1";

/** Backoff bounds for reconnecting. Gym wifi drops often; give up slowly. */
const MIN_RETRY_MS = 500;
const MAX_RETRY_MS = 30_000;

const PendingActionSchema = z.object({ localId: z.string(), action: AppActionSchema });

/**
 * What a device remembers about its room between launches.
 *
 * Deliberately a separate key from `volei-state-v1`: that one holds the rendered
 * state and stays the save file this app has always had, untouched by whether a
 * room is joined. This one is connection bookkeeping, and must never travel to
 * the other phones — it is not part of the synced `AppState`.
 *
 * `confirmed` is cached so a cold start inside a room renders instantly and
 * offline, rather than sitting blank until the socket opens.
 */
export const PersistedSyncSchema = z.object({
  roomId: z.string().min(1),
  clientId: z.string().min(1),
  lastSeq: z.number().int().min(-1),
  pending: z.array(PendingActionSchema),
  confirmed: AppStateSchema,
});

export type PersistedSync = z.infer<typeof PersistedSyncSchema>;

export function loadSync(): PersistedSync | null {
  const raw = localStorage.getItem(SYNC_STORAGE_KEY);
  if (raw === null) return null;
  try {
    return PersistedSyncSchema.parse(JSON.parse(raw));
  } catch {
    // A corrupt room record is not worth blocking the app for: drop it and the
    // device falls back to standalone, with its own state file intact.
    return null;
  }
}

export function saveSync(value: PersistedSync): void {
  localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(value));
}

export function clearSync(): void {
  localStorage.removeItem(SYNC_STORAGE_KEY);
}

export type SyncStatus = "offline" | "connecting" | "online";

/** The parts of `WebSocket` this client uses, so tests can supply a fake. */
export type SocketLike = {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

export type SyncClientOptions = {
  roomId: string;
  clientId: string;
  /** Origin of the Worker, e.g. `wss://volei-sync.example.workers.dev`. */
  serverUrl: string;
  restore?: Pick<PersistedSync, "confirmed" | "lastSeq" | "pending">;
  createSocket?: (url: string) => SocketLike;
  /** Injected so tests drive reconnects without real timers. */
  delay?: (ms: number, run: () => void) => () => void;
  newId?: () => string;
  onPersist?: (value: PersistedSync) => void;
};

export class SyncClient {
  private engine: Engine;
  private socket: SocketLike | null = null;
  private status: SyncStatus = "offline";
  private attempt = 0;
  private cancelRetry: (() => void) | null = null;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  private readonly createSocket: (url: string) => SocketLike;
  private readonly delay: (ms: number, run: () => void) => () => void;
  private readonly newId: () => string;

  constructor(private readonly options: SyncClientOptions) {
    this.createSocket =
      options.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike);
    this.delay =
      options.delay ??
      ((ms, run) => {
        const handle = setTimeout(run, ms);
        return () => clearTimeout(handle);
      });
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.engine = options.restore
      ? engineFrom(options.restore.confirmed, options.restore.lastSeq, options.restore.pending)
      : emptyEngine();
  }

  get roomId(): string {
    return this.options.roomId;
  }

  getState(): AppState {
    return renderState(this.engine);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  connect(): void {
    if (this.disposed || this.socket) return;
    this.setStatus("connecting");

    const base = this.options.serverUrl.replace(/\/+$/, "");
    const socket = this.createSocket(base + "/room/" + this.options.roomId);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.setStatus("online");
      // Ask for everything after what we already hold, then re-offer whatever
      // was typed while disconnected. The server dedupes on `localId`, so
      // resending an action it already recorded is harmless.
      this.send({ type: "hello", since: this.engine.lastSeq + 1 });
      for (const p of this.engine.pending) {
        this.send({ type: "append", localId: p.localId, action: toWireAction(p.action) });
      }
    };

    socket.onmessage = (event) => this.receive(event.data);
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.setStatus("offline");
      this.scheduleReconnect();
    };
  }

  /** Apply an action locally at once, and put it on the wire if we are online. */
  dispatch(action: AppAction): void {
    const pending: PendingAction = { localId: this.newId(), action };
    this.engine = applyLocal(this.engine, pending);
    this.persist();
    this.send({ type: "append", localId: pending.localId, action: toWireAction(action) });
    this.emit();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelRetry?.();
    this.cancelRetry = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.listeners.clear();
  }

  private receive(data: unknown): void {
    if (typeof data !== "string") return;

    let message;
    try {
      message = parseServerMessage(data);
    } catch {
      // Never feed an unvalidated payload to the reducer. Dropping one bad frame
      // is safe: the next `hello` re-requests whatever was missed.
      return;
    }

    switch (message.type) {
      case "sync":
        this.engine = applySync(this.engine, message.reset, message.entries);
        break;
      case "entry":
        this.engine = applyEntry(this.engine, message.entry);
        break;
      case "need-compaction":
        // Only answer when fully caught up and holding nothing unacked, so the
        // snapshot cannot omit work that has not been folded in yet.
        if (this.engine.pending.length === 0 && this.engine.lastSeq === message.atSeq) {
          this.send({
            type: "compact",
            localId: this.newId(),
            atSeq: message.atSeq,
            state: this.engine.confirmed,
          });
        }
        return;
      case "error":
        return;
    }

    this.persist();
    this.emit();
  }

  private send(message: ClientMessage): void {
    if (this.status !== "online" || !this.socket) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      // A send racing a close is expected; the reconnect path resends pending.
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    const ceiling = Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** this.attempt);
    this.attempt += 1;
    // Jitter so three phones losing the same wifi do not retry in lockstep.
    const wait = ceiling / 2 + Math.random() * (ceiling / 2);
    this.cancelRetry = this.delay(wait, () => {
      this.cancelRetry = null;
      this.connect();
    });
  }

  private setStatus(status: SyncStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit();
  }

  private persist(): void {
    this.options.onPersist?.({
      roomId: this.options.roomId,
      clientId: this.options.clientId,
      lastSeq: this.engine.lastSeq,
      pending: this.engine.pending,
      confirmed: this.engine.confirmed,
    });
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
