// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import type { AppAction } from "../app-state";
import { DEFAULT_SETTINGS } from "../settings";
import {
  SYNC_STORAGE_KEY,
  SyncClient,
  clearSync,
  loadSync,
  saveSync,
  type PersistedSync,
  type SocketLike,
} from "./client";
import type { ClientMessage, LogEntry, ServerMessage } from "./protocol";

/** A socket the test drives by hand: nothing is queued, nothing is timed. */
class FakeSocket implements SocketLike {
  sent: ClientMessage[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.closed = true;
    this.onclose?.();
  }

  open(): void {
    this.onopen?.();
  }

  deliver(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const addPlayer = (id: string): AppAction => ({
  type: "add-player",
  id,
  name: "Player " + id,
  skill: 3,
});

type Harness = {
  client: SyncClient;
  sockets: FakeSocket[];
  persisted: PersistedSync[];
  /** Pending reconnect callbacks, so a test can fire one without real timers. */
  retries: (() => void)[];
};

function harness(restore?: PersistedSync): Harness {
  const sockets: FakeSocket[] = [];
  const persisted: PersistedSync[] = [];
  const retries: (() => void)[] = [];
  let nextId = 0;

  const client = new SyncClient({
    roomId: "room1",
    clientId: "client1",
    serverUrl: "wss://example.test",
    restore,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    delay: (_ms, run) => {
      retries.push(run);
      return () => {};
    },
    newId: () => "local" + ++nextId,
    onPersist: (value) => persisted.push(value),
  });

  return { client, sockets, persisted, retries };
}

const entry = (seq: number, localId: string, action: AppAction): LogEntry => ({
  seq,
  localId,
  action,
});

beforeEach(() => {
  clearSync();
});

describe("persistence", () => {
  test("round-trips a room record", () => {
    const value: PersistedSync = {
      roomId: "room1",
      clientId: "client1",
      lastSeq: 4,
      pending: [{ localId: "a", action: addPlayer("p1") }],
      confirmed: { version: 3, players: [], sessions: [], settings: DEFAULT_SETTINGS },
    };
    saveSync(value);
    expect(loadSync()).toEqual(value);
  });

  test("returns null rather than throwing on a corrupt record", () => {
    localStorage.setItem(SYNC_STORAGE_KEY, "{not json");
    expect(loadSync()).toBeNull();
  });

  test("rejects a record whose pending action is not a real action", () => {
    localStorage.setItem(
      SYNC_STORAGE_KEY,
      JSON.stringify({
        roomId: "room1",
        clientId: "client1",
        lastSeq: 0,
        pending: [{ localId: "a", action: { type: "drop-database" } }],
        confirmed: { version: 3, players: [], sessions: [], settings: DEFAULT_SETTINGS },
      }),
    );
    expect(loadSync()).toBeNull();
  });
});

describe("dispatch", () => {
  test("renders immediately while offline and keeps the action pending", () => {
    const { client, persisted } = harness();
    client.dispatch(addPlayer("p1"));

    expect(client.getState().players).toHaveLength(1);
    expect(persisted.at(-1)?.pending).toHaveLength(1);
    expect(persisted.at(-1)?.confirmed.players).toHaveLength(0);
  });

  test("sends the action once online", () => {
    const { client, sockets } = harness();
    client.connect();
    sockets[0].open();
    client.dispatch(addPlayer("p1"));

    expect(sockets[0].sent).toContainEqual({
      type: "append",
      localId: "local1",
      action: addPlayer("p1"),
    });
  });
});

describe("connect", () => {
  test("asks for entries after what it already holds", () => {
    const { client, sockets } = harness({
      roomId: "room1",
      clientId: "client1",
      lastSeq: 7,
      pending: [],
      confirmed: { version: 3, players: [], sessions: [], settings: DEFAULT_SETTINGS },
    });
    client.connect();
    sockets[0].open();

    expect(sockets[0].sent[0]).toEqual({ type: "hello", since: 8 });
  });

  test("asks from zero on a fresh device", () => {
    const { client, sockets } = harness();
    client.connect();
    sockets[0].open();

    expect(sockets[0].sent[0]).toEqual({ type: "hello", since: 0 });
  });

  test("resends everything typed while disconnected, after reconnecting", () => {
    const { client, sockets, retries } = harness();
    client.dispatch(addPlayer("p1"));
    client.dispatch(addPlayer("p2"));
    expect(sockets).toHaveLength(0);

    client.connect();
    sockets[0].open();
    sockets[0].close();
    retries[0]();
    sockets[1].open();

    const appends = sockets[1].sent.filter((m) => m.type === "append");
    expect(appends.map((m) => m.localId)).toEqual(["local1", "local2"]);
  });
});

describe("receiving", () => {
  test("does not apply its own action twice when the echo arrives", () => {
    const { client, sockets } = harness();
    client.connect();
    sockets[0].open();
    client.dispatch(addPlayer("p1"));
    sockets[0].deliver({ type: "entry", entry: entry(0, "local1", addPlayer("p1")) });

    expect(client.getState().players).toHaveLength(1);
  });

  test("applies another device's entry", () => {
    const { client, sockets } = harness();
    client.connect();
    sockets[0].open();
    sockets[0].deliver({ type: "entry", entry: entry(0, "theirs", addPlayer("p9")) });

    expect(client.getState().players.map((p) => p.id)).toEqual(["p9"]);
  });

  test("ignores a malformed frame instead of feeding it to the reducer", () => {
    const { client, sockets } = harness();
    client.connect();
    sockets[0].open();
    sockets[0].onmessage?.({ data: JSON.stringify({ type: "entry", entry: { seq: "x" } }) });

    expect(client.getState().players).toHaveLength(0);
  });

  test("a reset sync replaces confirmed history rather than extending it", () => {
    const { client, sockets } = harness();
    client.connect();
    sockets[0].open();
    sockets[0].deliver({ type: "entry", entry: entry(0, "old", addPlayer("p1")) });
    sockets[0].deliver({
      type: "sync",
      reset: true,
      entries: [entry(0, "snapshot", addPlayer("p9"))],
    });

    expect(client.getState().players.map((p) => p.id)).toEqual(["p9"]);
  });
});

describe("compaction", () => {
  test("answers when caught up with nothing pending", () => {
    const { client, sockets } = harness();
    client.connect();
    sockets[0].open();
    sockets[0].deliver({ type: "entry", entry: entry(3, "theirs", addPlayer("p1")) });
    sockets[0].deliver({ type: "need-compaction", atSeq: 3 });

    const compact = sockets[0].sent.find((m) => m.type === "compact");
    expect(compact).toMatchObject({ atSeq: 3 });
    expect(compact?.type === "compact" && compact.state.players).toHaveLength(1);
  });

  // A snapshot taken with work outstanding would silently drop that work.
  test("stays quiet while it still has unacked work", () => {
    const { client, sockets } = harness();
    client.connect();
    sockets[0].open();
    sockets[0].deliver({ type: "entry", entry: entry(3, "theirs", addPlayer("p1")) });
    client.dispatch(addPlayer("p2"));
    sockets[0].deliver({ type: "need-compaction", atSeq: 3 });

    expect(sockets[0].sent.some((m) => m.type === "compact")).toBe(false);
  });

  test("stays quiet when it is behind the seq being compacted", () => {
    const { client, sockets } = harness();
    client.connect();
    sockets[0].open();
    sockets[0].deliver({ type: "need-compaction", atSeq: 9 });

    expect(sockets[0].sent.some((m) => m.type === "compact")).toBe(false);
  });
});

describe("status", () => {
  test("reports offline, connecting, then online", () => {
    const { client, sockets } = harness();
    const seen: string[] = [];
    client.subscribe(() => seen.push(client.getStatus()));

    expect(client.getStatus()).toBe("offline");
    client.connect();
    sockets[0].open();

    expect(seen).toEqual(["connecting", "online"]);
  });

  test("stops reconnecting once disposed", () => {
    const { client, sockets, retries } = harness();
    client.connect();
    sockets[0].open();
    client.dispose();

    expect(sockets[0].closed).toBe(true);
    expect(retries).toHaveLength(0);
  });
});
