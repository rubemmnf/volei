/**
 * Live-socket checks against a running room server.
 *
 * The unit tests cover the client's rebase logic and the wire schemas; this
 * covers the half that only exists on the server — seq ordering, fan-out,
 * `localId` dedupe, catch-up, and refusing to store a malformed action.
 *
 *   npm run test:integration                       # against `npm run dev`
 *   SYNC_URL=wss://…workers.dev npm run test:integration   # against the deploy
 *
 * Every run uses a fresh random room, so runs never inherit each other's log.
 */

const BASE = (process.env.SYNC_URL ?? "ws://127.0.0.1:8123").replace(/\/+$/, "");

/**
 * How long a check waits for something to arrive. Generous on purpose: against
 * a real Cloudflare edge a round trip is a couple of hundred milliseconds, and
 * a tight window here fails as a flake rather than a finding.
 */
const ARRIVE_MS = 10_000;

/**
 * How long to wait before concluding something did *not* arrive. Negative
 * checks cannot be event-driven, so this is a flat quiet period.
 */
const QUIET_MS = 2_500;

if (typeof WebSocket === "undefined") {
  console.error("This needs Node 22+ for a global WebSocket.");
  process.exit(1);
}

// A refused socket surfaces from inside undici as an unhandled error, which
// would otherwise bury the one useful fact — nothing is listening — under a
// stack trace pointing into Node's internals.
for (const event of ["unhandledRejection", "uncaughtException"]) {
  process.on(event, (error) => {
    console.error(`\nCould not talk to ${BASE}.`);
    console.error("Start it with `npm run dev` in worker/, or set SYNC_URL to a deployed Worker.");
    console.error(`\n${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

const failures = [];

function check(name, ok, detail) {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}`);
  if (!ok) {
    if (detail) console.log(`        ${detail}`);
    failures.push(name);
  }
}

/** Rooms must satisfy the server's `/^[A-Za-z0-9_-]{16,64}$/`. */
function newRoomId() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16)))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const ROOM = newRoomId();

function connect(label) {
  const socket = new WebSocket(`${BASE}/room/${ROOM}`);
  const inbox = [];
  socket.addEventListener("message", (event) => inbox.push(JSON.parse(event.data)));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} did not connect to ${BASE} within ${ARRIVE_MS}ms`)),
      ARRIVE_MS,
    );
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve({ label, socket, inbox });
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`${label} failed to connect to ${BASE}`));
    });
  });
}

const send = (client, message) => client.socket.send(JSON.stringify(message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls until the condition holds, so a slow edge costs time and not a failure. */
async function waitUntil(condition, timeout = ARRIVE_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await sleep(50);
  }
  return false;
}

/** Every action a client has learned about, however it arrived. */
const entriesOf = (client) =>
  client.inbox.flatMap((m) => (m.type === "entry" ? [m.entry] : m.type === "sync" ? m.entries : []));

const addPlayer = (id) => ({ type: "add-player", id, name: `Player ${id}`, skill: 3 });

const tiedMatch = {
  type: "record-match",
  match: {
    id: "m1",
    sideA: ["1", "2", "3", "4"],
    sideB: ["5", "6", "7", "8"],
    scoreA: 25,
    scoreB: 25,
    timestamp: "2026-07-10T10:00:00.000Z",
  },
};

console.log(`room ${ROOM} on ${BASE}\n`);

const a = await connect("A");
const b = await connect("B");

send(a, { type: "hello", since: 0 });
send(b, { type: "hello", since: 0 });

await waitUntil(() => a.inbox.some((m) => m.type === "sync") && b.inbox.some((m) => m.type === "sync"));
check(
  "an empty room answers with a reset sync and no entries",
  a.inbox.some((m) => m.type === "sync" && m.reset === true && m.entries.length === 0),
  JSON.stringify(a.inbox),
);

// Both phones record at the same moment, each unaware of the other. This is the
// case a whole-blob sync would lose one half of.
send(a, { type: "append", localId: "a-1", action: addPlayer("p1") });
send(b, { type: "append", localId: "b-1", action: addPlayer("p2") });

await waitUntil(() => entriesOf(a).length >= 2 && entriesOf(b).length >= 2);
const aEntries = entriesOf(a);
const bEntries = entriesOf(b);

check("both clients receive both entries", aEntries.length === 2 && bEntries.length === 2,
  `A=${aEntries.length} B=${bEntries.length}`);
check("both clients agree on the order",
  JSON.stringify(aEntries.map((e) => e.localId)) === JSON.stringify(bEntries.map((e) => e.localId)),
  `A=[${aEntries.map((e) => e.localId)}] B=[${bEntries.map((e) => e.localId)}]`);
check("the server assigns seqs 0 and 1",
  JSON.stringify(aEntries.map((e) => e.seq)) === "[0,1]", JSON.stringify(aEntries.map((e) => e.seq)));

// A client that reconnects before its append was acknowledged sends it again.
send(a, { type: "append", localId: "a-1", action: addPlayer("p1") });
await sleep(QUIET_MS);
check("a resent localId is not recorded twice", entriesOf(a).length === 2, String(entriesOf(a).length));

// A third phone joins mid-session.
const c = await connect("C");
send(c, { type: "hello", since: 0 });
await waitUntil(() => c.inbox.some((m) => m.type === "sync"));
const cSync = c.inbox.find((m) => m.type === "sync");
check("a joining client is caught up from scratch",
  cSync?.reset === true && cSync.entries.length === 2, JSON.stringify(cSync));

// A client that already holds entry 0 asks only for what it is missing.
const d = await connect("D");
send(d, { type: "hello", since: 1 });
await waitUntil(() => d.inbox.some((m) => m.type === "sync"));
const dSync = d.inbox.find((m) => m.type === "sync");
check("a partly caught-up client gets only the tail, with no reset",
  dSync?.reset === false && dSync.entries.length === 1 && dSync.entries[0].seq === 1,
  JSON.stringify(dSync));

// Garbage must never enter the log, or every client would drop it forever.
send(a, { type: "append", localId: "bad-1", action: { type: "drop-database" } });
await waitUntil(() => a.inbox.some((m) => m.type === "error"));
check("an unknown action is rejected, not stored", entriesOf(a).length === 2, String(entriesOf(a).length));
check("and the sender is told", a.inbox.some((m) => m.type === "error"));

// Volleyball has no ties, and the server enforces it as the client does.
send(a, { type: "append", localId: "bad-2", action: tiedMatch });
await sleep(QUIET_MS);
check("a tied match is rejected by the server", entriesOf(a).length === 2, String(entriesOf(a).length));

for (const client of [a, b, c, d]) client.socket.close();

console.log(failures.length === 0 ? "\nall passed" : `\nfailed: ${failures.join(", ")}`);
process.exit(failures.length === 0 ? 0 : 1);
