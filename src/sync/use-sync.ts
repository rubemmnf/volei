import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { appReducer, type AppAction } from "../app-state";
import type { AppState } from "../types";
import { SyncClient, clearSync, loadSync, saveSync, type SyncStatus } from "./client";

/**
 * Origin of the sync Worker, baked in at build time. Empty in a checkout that
 * has not deployed one, which is what keeps sharing entirely optional: with no
 * URL the app is exactly the single-device app it has always been.
 */
export const SYNC_SERVER_URL: string = import.meta.env.VITE_SYNC_URL ?? "";

export const isSyncConfigured = (): boolean => SYNC_SERVER_URL.length > 0;

/** Room ids are the only credential, so they come from the CSPRNG, not `Math.random`. */
export function newRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type SyncState = {
  state: AppState;
  dispatch: (action: AppAction) => void;
  /** `standalone` means no room is joined — the app's original mode. */
  status: SyncStatus | "standalone";
  roomId: string | null;
  /** Starts a room seeded with this device's current state. */
  createRoom: () => string;
  /** Joins an existing room. The room's history replaces local state. */
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
};

type Room = { roomId: string; clientId: string; seed: AppState | null };

function restoreRoom(): Room | null {
  const saved = loadSync();
  if (!saved) return null;
  return { roomId: saved.roomId, clientId: saved.clientId, seed: null };
}

/**
 * Owns the app state, in a room or out of one.
 *
 * Standalone it is a plain `useReducer`, unchanged. In a room the reducer moves
 * into `SyncClient`, which folds server-ordered entries into a confirmed state
 * and replays this device's unacknowledged actions on top — so `state` is always
 * something the UI can render immediately, connected or not.
 */
export function useSync(initial: AppState): SyncState {
  const [localState, localDispatch] = useReducer(appReducer, initial);
  const [room, setRoom] = useState<Room | null>(restoreRoom);
  const clientRef = useRef<SyncClient | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // The client is created here rather than in state so that StrictMode's
  // mount/unmount/mount cycle disposes and rebuilds it, instead of leaving a
  // permanently disposed instance behind.
  useEffect(() => {
    if (!room) return;

    const saved = loadSync();
    const client = new SyncClient({
      roomId: room.roomId,
      clientId: room.clientId,
      serverUrl: SYNC_SERVER_URL,
      restore:
        saved && saved.roomId === room.roomId
          ? { confirmed: saved.confirmed, lastSeq: saved.lastSeq, pending: saved.pending }
          : undefined,
      onPersist: saveSync,
    });

    clientRef.current = client;
    const unsubscribe = client.subscribe(rerender);
    // Seeding is an ordinary action: it queues as pending and is sent as the
    // room's first entry, so creating a room offline works like anything else.
    if (room.seed) client.dispatch({ type: "replace-state", state: room.seed });
    client.connect();
    rerender();

    return () => {
      unsubscribe();
      client.dispose();
      clientRef.current = null;
      rerender();
    };
  }, [room]);

  const client = clientRef.current;
  const state = client ? client.getState() : localState;

  // Read by `createRoom`, which must seed with whatever is on screen right now.
  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatch = useCallback((action: AppAction) => {
    const client = clientRef.current;
    if (client) client.dispatch(action);
    else localDispatch(action);
  }, []);

  const createRoom = useCallback(() => {
    const roomId = newRoomId();
    setRoom({ roomId, clientId: newRoomId(), seed: stateRef.current });
    return roomId;
  }, []);

  const joinRoom = useCallback((roomId: string) => {
    // No seed: the room's own history is the truth, and it replaces what is here.
    clearSync();
    setRoom({ roomId, clientId: newRoomId(), seed: null });
  }, []);

  const leaveRoom = useCallback(() => {
    // The state stays exactly as it is on this device; only the link is cut.
    clearSync();
    setRoom(null);
  }, []);

  return {
    state,
    dispatch,
    status: client ? client.getStatus() : "standalone",
    roomId: room?.roomId ?? null,
    createRoom,
    joinRoom,
    leaveRoom,
  };
}
