# volei-sync

The sync server for shared sessions. One Cloudflare Durable Object per room,
holding an append-only log of `AppAction`s and fanning them out over WebSockets.

It never interprets an action — it only orders, stores and broadcasts. All the
volleyball logic stays in the client reducer, so the two cannot drift apart.
It validates every frame against `../src/sync/protocol.ts`, the same schemas the
clients use.

## Cost

Free. SQLite-backed Durable Objects and WebSockets are both on the Workers free
plan, no credit card, and `*.workers.dev` gives you a hostname. Three phones
playing once a week is a few hundred requests a month against a six-figure daily
allowance. Check the current free-tier limits when you sign up, but nothing about
this workload is close to a paid threshold.

## Deploy

```bash
npm install
npx wrangler login
npx wrangler deploy
```

Deploy prints the origin, e.g. `https://volei-sync.<subdomain>.workers.dev`.

Then point the app at it. Set a repository variable named `SYNC_URL` (Settings →
Secrets and variables → Actions → Variables) to the **`wss://`** form of that
origin:

```
wss://volei-sync.<subdomain>.workers.dev
```

The next Pages deploy picks it up. Without it the app builds exactly as before,
single-device, with sharing switched off.

## Local development

```bash
npx wrangler dev
```

Then run the app against it:

```bash
VITE_SYNC_URL=ws://127.0.0.1:8787 npm run dev
```

## Tests

The app's own `npm test` covers the client half — rebase convergence, the wire
schemas, the offline queue. This covers the half that only exists here: seq
ordering, fan-out, `localId` dedupe, catch-up, and refusing to store a malformed
action. It drives real sockets, so it needs a server running.

Against a local `npm run dev`:

```bash
npm run test:integration
```

Against the deployed Worker:

```bash
SYNC_URL=wss://volei-sync.<subdomain>.workers.dev npm run test:integration
```

Each run uses a fresh random room, so runs never inherit each other's log and it
is safe to point at production.

## Protocol

Client → server:

| Message | Meaning |
| --- | --- |
| `hello {since}` | First frame on every connection: send me entries from `since` on. |
| `append {localId, action}` | Record this action. `localId` makes a resend idempotent. |
| `compact {localId, atSeq, state}` | Replace the log with this snapshot. Rejected if `atSeq` is stale. |

Server → client:

| Message | Meaning |
| --- | --- |
| `sync {reset, entries}` | Catch-up batch. `reset` means replay from an empty state. |
| `entry {entry}` | One newly recorded action, with its server-assigned `seq`. |
| `need-compaction {atSeq}` | The log is long; whichever client is caught up should snapshot it. |
| `error {message}` | A frame was malformed. |

## Access

A room id is the only credential: 128 bits of CSPRNG output, and anyone holding
the link can write. That is the intended trade for three friends and no login
screen. Treat a session link like a house key — if one leaks, leave the room and
create a new one, which takes a tap.
