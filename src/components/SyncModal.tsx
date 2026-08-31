import { useState } from "react";
import type { AppState } from "../types";
import { exportState } from "../storage";
import { isSyncConfigured, type SyncState } from "../sync/use-sync";

type Props = {
  state: AppState;
  sync: SyncState;
  onClose: () => void;
};

const STATUS_LABEL: Record<SyncState["status"], string> = {
  standalone: "This phone only",
  offline: "Offline — results are saved here and will send when you reconnect",
  connecting: "Connecting…",
  online: "Live — everyone in the room sees results as you type them",
};

const STATUS_COLOR: Record<SyncState["status"], string> = {
  standalone: "text-zinc-500",
  offline: "text-amber-400",
  connecting: "text-zinc-400",
  online: "text-emerald-400",
};

/** Accepts a full share link or a bare room id, since people paste both. */
export function parseRoomInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const fromHash = /room=([A-Za-z0-9_-]{16,64})/.exec(trimmed);
  if (fromHash) return fromHash[1];
  return /^[A-Za-z0-9_-]{16,64}$/.test(trimmed) ? trimmed : null;
}

export function roomLink(roomId: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#room=${roomId}`;
}

export function SyncModal({ state, sync, onClose }: Props) {
  const [joinText, setJoinText] = useState(() => window.location.hash.slice(1));
  const [error, setError] = useState<string | null>(null);
  const [confirmingJoin, setConfirmingJoin] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleDownload = () => {
    const blob = new Blob([exportState(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `volei-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (!sync.roomId) return;
    const link = roomLink(sync.roomId);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Volei session", url: link });
        return;
      } catch {
        // Dismissing the share sheet is not a failure; fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Could not copy. Select the link above and copy it by hand.");
    }
  };

  const handleJoin = () => {
    const roomId = parseRoomInput(joinText);
    if (!roomId) {
      setError("That does not look like a session link.");
      return;
    }
    if (!confirmingJoin) {
      setConfirmingJoin(true);
      setError(null);
      return;
    }
    sync.joinRoom(roomId);
    window.location.hash = "";
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-black text-white">Shared Session</h3>
          <button type="button" onClick={onClose} className="text-zinc-400 font-bold px-2">
            ✕
          </button>
        </div>

        <p className={`text-sm font-bold ${STATUS_COLOR[sync.status]}`}>
          {STATUS_LABEL[sync.status]}
        </p>

        {!isSyncConfigured() && (
          <p className="text-amber-400/80 text-xs">
            No sync server is configured for this build, so sharing is unavailable. Deploy the
            Worker in <span className="font-mono">worker/</span> and rebuild with{" "}
            <span className="font-mono">VITE_SYNC_URL</span> set.
          </p>
        )}

        {sync.roomId ? (
          <section className="flex flex-col gap-4">
            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
              Invite the others
            </h4>
            <p className="text-zinc-500 text-xs">
              Anyone with this link can enter results. Send it once — their phone remembers it.
            </p>
            <p className="bg-black border border-zinc-800 rounded-xl p-3 text-[11px] text-zinc-400 font-mono break-all">
              {roomLink(sync.roomId)}
            </p>
            <button
              type="button"
              onClick={handleShare}
              className="w-full bg-emerald-500 text-black font-black py-3 rounded-xl"
            >
              {copied ? "Link Copied" : "Share Link"}
            </button>
            <button
              type="button"
              onClick={() => {
                sync.leaveRoom();
                onClose();
              }}
              className="w-full border border-zinc-700 text-white font-bold py-3 rounded-xl"
            >
              Leave Room (keeps this phone's data)
            </button>
          </section>
        ) : (
          <section className="flex flex-col gap-4">
            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
              Start sharing
            </h4>
            <p className="text-zinc-500 text-xs">
              Creates a room from what is on this phone right now, then gives you a link for the
              others. Everyone can enter results, and everyone sees them straight away.
            </p>
            <button
              type="button"
              onClick={() => sync.createRoom()}
              disabled={!isSyncConfigured()}
              className="w-full bg-emerald-500 text-black font-black py-3 rounded-xl disabled:opacity-30"
            >
              Create Room From This Phone
            </button>

            <div className="flex flex-col gap-2 border-t border-zinc-800 pt-4">
              <label htmlFor="join-room" className="text-xs font-bold text-zinc-500">
                Or join with a link someone sent you
              </label>
              <input
                id="join-room"
                value={joinText}
                onChange={(e) => {
                  setJoinText(e.target.value);
                  setConfirmingJoin(false);
                  setError(null);
                }}
                placeholder="Paste the link"
                className="w-full bg-black text-white text-xs rounded-xl border border-zinc-700 p-3 font-mono"
              />
              {confirmingJoin && (
                <p className="text-amber-400/80 text-xs">
                  Joining replaces this phone's players and history with the room's. Download a
                  backup first if you are not sure.
                </p>
              )}
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="button"
                onClick={handleDownload}
                className="w-full border border-zinc-700 text-white font-bold py-3 rounded-xl"
              >
                Download Backup First
              </button>
              <button
                type="button"
                onClick={handleJoin}
                disabled={!isSyncConfigured() || !joinText.trim()}
                className={`w-full font-bold py-3 rounded-xl disabled:opacity-30 ${
                  confirmingJoin
                    ? "bg-amber-400 text-black font-black"
                    : "border border-zinc-700 text-white"
                }`}
              >
                {confirmingJoin ? "Tap Again to Join and Replace" : "Join Room"}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
