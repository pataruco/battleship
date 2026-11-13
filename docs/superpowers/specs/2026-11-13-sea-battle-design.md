# Sea battle for the kids — design & build plan

> **Working title only.** The kids will name the game and pick its theme later.
> Status: draft for adversarial review (Fable) · 2026-11-13 · repo `pataruco/battleship` (empty, no commits yet) → GitHub Pages at `https://pataruco.github.io/battleship/`.

---

## Review comments (Fable, 2026-11-13)

This is the adversarial pass. My comments are the quoted blocks that begin **Review N**, placed next to the text they concern. The original text is unchanged. The appendix at the end lists what checked out, what I couldn't verify, and the sources.

**Verdict.** The core design holds: one sealed document per game, compare-and-set writes, the key in the link, and board logic in Rust. Most factual claims checked out against the nats.js 3.4.0 and nats-server 2.15.3 source, Synadia's pricing page and terms, and WebKit/MDN for Safari 16.4.

**Fix before building**

| Review | Where | Problem |
|---|---|---|
| 1 | §7, *When the tab returns* | Coming back to the game on iOS 16 leaves it dead for about a minute |
| 2 | §14, mitigations | One message can erase every game, and the two optional hardening items cancel each other |
| 3 | §7, *Load and resume* | Devices never put their own copy back, so games get stuck or lost when they needn't |
| 4 | §18 | The real backend and the real iPad arrive last |

**Should fix**

| Review | Where | Problem |
|---|---|---|
| 5 | §7, *Write* | Two gaps in the write loop |
| 6 | §11 | Voice and sound on iOS 16 |
| 7a, 7b | §14, §7 | The public credential allows more than §14 lists, and the allow-list can be narrower |
| 8 | §13 | The lost-game nudges overstate two protections |
| 9 | §13 | Service worker: precache list and update wording |
| 10a, 10b, 10c | §15, §17, §7 | Dev, device testing and CI don't match production; the bundle-size figure |
| 11 | §7, *Presence* | Heartbeat replies can loop |

**Small corrections:** Reviews 12–22, inline. Review 23 (§19) lists the tests these comments call for.

**One decision for you:** Review 1 recommends replacing `kv.watch` with a small "moved" note plus `kv.get`. If you'd rather keep `kv.watch`, the alternative is in the same comment.

> **Review 12 (small), about the status line at the top.** The repo is no longer empty: this spec is committed (`a319d10`). §16 and the M0 row in §18 still say it gets committed in M0.

---

## 1. Context

A two-player sea-battle guessing game for the owner's kids (ages 6–9). They play each other or a grown-up, in the same room or far apart (both matter equally), on iPads/iPhones and laptops. The owner wants it built on the native web platform: HTML, CSS, TypeScript compiled to plain JS, Rust compiled to WebAssembly, and Web APIs. It's hosted for free on GitHub Pages, with **NATS as the only backend**. One player creates a game and gets a UUID link, and the other joins with it. When someone leaves, the game is effectively paused. It resumes whenever both come back, from the copy saved in NATS (as a NATS payload) and cached on each device.

**Success looks like:**
- Getting the second player in takes **≤ 2 taps each** (scan the QR code or open the shared link, then tap Join).
  > **Review 13 (small).** This leaves out the one-time profile step (pick an avatar, type a name), which a first-time guest meets before placement (§8). Say "≤ 2 taps each, after the one-time profile".
- A game left for days **resumes exactly where it was**, on either device. Device storage is only a cache: as long as anyone still holds the link (the other player's device, or a shared message), the game comes back from NATS.
- A 6-year-old can play **without reading help**: pictures, colours and spoken prompts.
- Hits, sinks and wins **feel like big moments**: sound, animation and voice.

## 2. Goals, non-goals, anti-goals

**Goals (v1)**
- Classic rules: 10×10 board; fleet of ships with lengths 5, 4, 3, 3, 2; one shot per turn; the turn passes after every shot; ships may touch but not overlap. The sinking of a ship is announced. First to sink the whole fleet wins.
- Create a game, join by link or QR, resume any time, and take your turn while the other player is away (async play).
- English + Spanish: follows the device language, with a switch on the Home screen. Spoken prompts in both.
- Emoji reactions, rematch with a running score, installable Home Screen app (PWA).
- Works in iPad/iPhone Safari, the iOS Home Screen app, and current laptop browsers.

**Non-goals (v1).** Computer opponent. Rule variants (Quick 8×8, hit-again, Salvo), though the engine is structured so they're cheap later. "Your turn" push alerts. Typed chat. Spectators. Accounts or logins. Several players sharing one device. Making moves while offline (the app *opens* offline, but a move needs a connection). Backing up or syncing the "My games" list across devices (a family-card backup was considered and deferred).

**Anti-goals (a failure even if it technically works)**
- Fiddly joining.
- A game that gets lost.
- Needing a grown-up to read the screen.
- Flat, joyless feedback.
- Copying the boxed board game's name, art or look. The rules are the old public-domain pencil-and-paper game; the name and art will be original.

## 3. Decisions

| Area | Decision | Decided by |
|---|---|---|
| Players & devices | Ages 6–9 (early and confident readers); same-room and long-distance; iPad/iPhone + laptops | owner |
| Rules | Classic only (above) | owner |
| WebAssembly | **Rust**, for the rules engine and the QR-code encoder. No generated glue (no wasm-bindgen) and no bot opponent | owner |
| Fair play | **Honour system, instant hit/miss.** Both fleets live in the shared (encrypted) game doc, so either device can resolve a shot immediately, even when the other player is offline | owner |
| Look | Neutral sea theme. All colours in CSS custom properties and all art as SVG in one theme folder, so it can be re-skinned | owner |
| Languages | English + Spanish | owner |
| Tooling | TypeScript built by **Vite**. The shipped site is static files | owner |
| Invite link | **Session UUID + secret key in the URL fragment.** Everything sent to NATS is encrypted in the browser | owner |
| Turn alerts | None in v1 | owner |
| Extras | Emoji reactions · rematch + running score · Home Screen app | owner |
| Address | `https://pataruco.github.io/battleship/` permanently. The repo keeps its name even after the kids name the game (renaming would break every invite link and installed app) | owner |
| Firing | Aim, then a big FIRE button | owner |
| Devices' OS | iOS/iPadOS 16.x → Safari 16.4 baseline | owner |
| Spanish | Latin American | owner |
| NATS host | **Synadia Cloud, free Personal plan**, for real games. Local Docker nats-server for dev and tests; `wss://demo.nats.io:8443` for device testing only (§15) | my recommendation, owner confirmed |
| Devices per player | **One device (storage container) = one player.** No multi-profile switching | owner |
| Lost-game protection | **Nudges only** (§13). A same-room game whose two devices both get wiped is gone, and that's accepted | owner |
| Everything in §20 | Calls I made; please check them | me |

> **Review 14 (small), Address row.** The permanent URL contains "battleship", a Hasbro trademark, while §2 lists copying the boxed game's name as an anti-goal. You've decided to keep the repo name, so this is only a flag: the time before the first invite link exists is the last free moment to choose a neutral path.

## 4. Architecture

```
 iPad (Safari or Home Screen app)                      Laptop (any modern browser)
┌─────────────────────────────────────┐              ┌─────────────────────────────┐
│ Screens: Custom Elements + CSS      │              │          same app           │
│ Game controller (TS, pure reducer)  │              └──────────────┬──────────────┘
│  ├─ Rules engine  (Rust → WASM)     │                             │
│  ├─ Seal/unseal   (Web Crypto)      │                             │
│  ├─ Cache         (IndexedDB)       │                             │
│  └─ NATS client   (wss://)          │                             │
└──────────────────┬──────────────────┘                             │
                   │   only encrypted payloads cross this line      │
                   └────────────►  NATS server  ◄───────────────────┘
                                   ├─ JetStream KV bucket `bship_games`
                                   │    key `g.<uuid>` → sealed game doc (the save)
                                   └─ core subject `bship.<uuid>.here` → presence heartbeats
 HTML / JS / CSS / .wasm / SVG are static files served by GitHub Pages
```

- **Source of truth:** a single NATS KV entry per game. Each device keeps an IndexedDB cache for instant start and an offline view. iOS gives Safari and the Home Screen app separate storage, and Safari may evict a site's storage after a period of non-use, so device storage can never be the only copy.
- **Device storage roles:** IndexedDB holds the profile, the "My games" list (id, secret, seat, last sealed doc + revision, highest `seq`, opponent name/avatar) and my last fleet. localStorage holds only the synchronous boot preferences (language, sound, voice), so the first paint is in the right language with no flash.
- **Runtime dependencies:** only the NATS JS client. Everything else is hand-written on top of Web APIs. Dev-only tools: Vite, TypeScript, Vitest, Playwright, cargo.

## 5. Session links & encryption

- **Create:** `id = crypto.randomUUID()`; `secret = 16 random bytes` (`crypto.getRandomValues`) encoded as base64url (22 chars).
- **Link:** `https://pataruco.github.io/battleship/#/g/<id>/<secret>`. Routing is hash-based, so the whole route lives in the fragment, which browsers never send to GitHub Pages or NATS and which is never put in `Referer`.
- **Key:** `HKDF-SHA-256(ikm = secret, salt = utf8(id), info = "bship/v1")` → non-extractable AES-GCM-256 `CryptoKey`.
- **Seal:** `0x01 ‖ iv(12 random bytes) ‖ AES-GCM(plaintext, aad = "bship/v1/<id>/<channel>")`, where `channel` is `doc` or `here`. A payload can't be moved to another game or channel.
- Anyone without the link sees only ciphertext and the UUID in key and subject names. Someone with the link can see both fleets in dev tools; that's the honour system we accepted.
- **If the secret is lost, the game is lost** (by design). The secret lives in every holder's IndexedDB "My games" list and in any shared message (Messages/WhatsApp history). The nudges in §13 push towards there always being a shared message.

## 6. Game document & rules of play

Plaintext (before sealing). It's JSON, under 2 KB:

```ts
type Seat = { playerId: string; name: string; avatar: string };
type Ship = { bow: number /* cell 0..99 */; dir: 'h' | 'v' };   // fleet order = lengths [5,4,3,3,2]
type GameDoc = {
  v: 1;                       // schema version
  id: string;                 // session UUID (also bound into AAD)
  seq: number;                // +1 on every accepted action; replay/rollback guard
  engine: number;             // rules-engine version that wrote this doc
  seats: [Seat, Seat | null]; // 0 = creator, 1 = joiner
  round: number; score: [number, number];
  phase: 'setup' | 'battle' | 'over';
  fleets: [Ship[] | null, Ship[] | null];
  ready: [boolean, boolean];
  shots: [number[], number[]];          // cells fired by each seat this round, in order
  turn: 0 | 1; firstTurn: 0 | 1; winner: 0 | 1 | null;
  rematch: [boolean, boolean];
  reactions: [Reaction | null, Reaction | null]; // last emoji per seat: { emoji, seq }
};
```

**Actions.** These are handled by a pure TS reducer `reduce(doc, action) → doc | Error`. Board questions are delegated to WASM.

| Action | Preconditions | Effect |
|---|---|---|
| `create(profile)` | — | seat 0, phase `setup` |
| `join(profile)` | seat 1 empty | seat 1 |
| `place(seat, fleet)` | phase `setup`; `engine.checkFleet` ok | `fleets[seat]`, `ready[seat]=false` |
| `ready(seat)` | fleet placed | if both seats filled and both ready → `battle`; round 1: random first turn; later rounds: previous loser starts |
| `fire(seat, cell)` | `battle`, `turn==seat`, cell not yet fired | append the shot; `engine.outcome` → hit / miss / sunk / win; win → `over`, `winner`, `score++`; else turn flips |
| `react(seat, emoji)` | emoji in fixed set | `reactions[seat]` |
| `rematch(seat)` | phase `over` | when both agree → `round++`, back to `setup`, clear fleets/ready/shots/rematch |

> **Review 15 (small): three reducer details**
>
> - **Coin flip.** `ready` picks a random first turn inside a reducer described as pure, and the write loop re-runs the reducer on every retry (§7), so a retry flips again. Have the caller draw the bit and pass it in the action.
> - **`winner` after a rematch.** `rematch` doesn't say what happens to `winner`, and the next `ready` needs it for "previous loser starts". Either say it's kept through `setup`, or set `firstTurn` to the loser in `rematch` and clear `winner` there.
> - **`engine`.** Make it a rules version that changes only when outcomes change. The QR encoder lives in the same crate (§9), and a QR fix shouldn't trigger "Update needed" on older apps (§7 *Version skew*).

The split is deliberate: **Rust decides everything about the board** (placement validity, hit/miss/sunk/win, random placement). **TypeScript decides everything about people and time** (seats, turns, rounds, score, reactions). Both devices run the same code over the same doc, so they always agree.

## 7. Sync over NATS

- **Write (compare-and-set loop):** read `{doc, revision}` (from the live watch, or `kv.get`) → `reduce` → `kv.update("g."+id, seal(next), revision)`. On a wrong-revision error, re-read and retry, up to 5 times. A rejected action, such as "not your turn" after the retry, is shown kindly in the UI. `create` uses `kv.create`, which fails if the key already exists.
  > **Review 5 (should fix): two gaps in the write loop**
  >
  > - **Unknown outcome.** If the reply is lost (a timeout or a reconnect), the move may still have landed. This bullet and *No take-backs* treat that as a failure and offer "Try again", and then the board changes anyway. On a timeout, re-read first; if the document already contains my action, play the result.
  > - **Second conflict code.** nats.js treats 10071 and 10164 as the same conflict (`kv/src/kv.ts:596-601`). The server returns 10164 on replicated streams when two writes to one key are in flight together (`server/jetstream_batching.go:777-791`). The free plan's single-replica stream returns 10071, so this only bites after an upgrade, and local Docker can never show it. Treat both as "re-read and retry", here and under *CAS errors*.
- **Live:** `kv.watch({ key: "g."+id })` → unseal → accept only if `doc.id` matches and `seq` is higher than the highest `seq` seen (persisted per game in IndexedDB; an equal `seq` is our own echo and is ignored) → diff against the previous doc to drive animations (new shot, sink, join, reaction).
  > **Review note.** See Review 1 (this watcher stops delivering for about a minute after the iPad has slept) and Review 3 (the echo rule breaks when two tabs share IndexedDB).
- **No take-backs for kids:** firing starts a roughly 600 ms shell-flight animation while the write is in flight, and the result (splash or boom) appears only once the write is acknowledged. If the write fails (offline, or the turn changed), the shell fizzles and a friendly banner offers "Try again". The UI never shows a result that it later reverses. The grid is disabled while a write is pending, so double taps do nothing.
- **Load and resume:** render the cached doc instantly → `kv.get` → reconcile. An absent or purged key means "This game has sailed away (expired)"; a deleted or unreadable value triggers recovery (see *Missing vs deleted* below).
  > **Review 3 (fix before building): devices never put their own copy back, so games get stuck or lost when they needn't**
  >
  > - **Stuck.** If the server holds an older document than a device has seen, that device ignores it forever (the *Live* rule), and its own moves can't pass compare-and-set, because every re-read returns the document it refuses. The recovery under *Missing vs deleted* can cause this by restoring an older revision than the other device has seen. So can a replayed old document (§14 *Rollback*).
  > - **Lost.** Synadia's terms let it delete a free customer's data, including streams, "at any moment, without notice" (terms §8); §15 says only inactive accounts are at risk. Five junk writes also push all five kept revisions out, and a move to another NATS host (§15 escape hatch) starts empty. In each case both devices still hold the last good document in IndexedDB, and the spec shows "sailed away" anyway.
  > - **Two tabs** share IndexedDB, so "an equal `seq` is our own echo" makes the second tab ignore the first tab's move.
  >
  > **Change:** one reconcile rule, used wherever a server document meets a local one. "Newer" means higher `round`, then more shots fired, then higher `seq`, so emoji sent on a stale copy can't outrank real moves. Compare the server's document with the one this tab is showing:
  > - Server newer: adopt it.
  > - Same: nothing to do.
  > - Server older, or the key is missing, deleted or unreadable: write the local copy back with compare-and-set (`create` if the key is absent).
  > - No local copy and nothing readable: "This game can't be opened right now. Ask the other player to open it." (If `kv.watch` stays, try the history first, as now.)
  >
  > Cache only documents the server acknowledged or returned, never an unacknowledged write.
  >
  > **Consequences to accept:** a game no longer expires while any device remembers it, so the 90-day TTL becomes server clean-up (§20 item 6). After a server loss, a player can lose one shot made on the restored copy.
  >
  > **Touches:** *Live*, *Expiry*, *Missing vs deleted*, §4 storage roles, §14 mitigations, §15 escape hatch, §21.
- **When the tab returns** (`visibilitychange` → visible) or after a reconnect: re-fetch with `kv.get`. iOS kills WebSockets on backgrounded tabs, so this is the normal resume path, not an edge case.
  > **Review 1 (fix before building): coming back to the game on iOS 16 leaves it dead for about a minute**
  >
  > - The watcher is a server-side consumer. The server deletes it after 5 minutes with no listener, and the client only notices after two missed 30-second heartbeats. So after the iPad has slept for more than 5 minutes, the opponent's moves don't arrive for 60–90 s once the app is back. (nats.js 3.4.0 `jetstream/src/jsmstream_api.ts:188-192`, `jetstream/src/pushconsumer.ts:253-275`)
  > - On iOS 15/16, Safari reportedly doesn't fire the socket's close event when the network drops (WebKit bug 247943, fixed in 17.3; second-hand, the bug page wasn't opened for this review). With `pingInterval: 30_000` and two missed pings, the client takes 60–90 s to notice. Until then this `kv.get` and every move time out after 5 s.
  >
  > **Change:** treat every return from hidden (longer than about 5 s) as a cold start: cancel the 2-minute close timer, call `nc.reconnect()` (`core/src/nats.ts:579`), then `kv.get`. The close timer's callback must check that the page is still hidden, because iOS runs overdue timers on resume.
  >
  > **Live updates, recommended:** drop `kv.watch`. After each acknowledged write, the writer publishes a sealed `moved` note carrying the new `seq` on the presence subject, and every heartbeat carries `seq` too. A device that sees a higher `seq` than its own does `kv.get`. The client restores plain subscriptions on reconnect, and there is no server-side state to expire. It also removes every consumer permission (Review 7b).
  >
  > **Alternative, if you'd rather keep `kv.watch`:** start a fresh watcher on every resume and reconnect, and still put `seq` in the heartbeat as a safety net.
  >
  > **Touches:** *Live*, *Presence*, *Connection etiquette*, *Browser user permissions*, the §4 diagram, §19.
- **Presence:** sealed heartbeat `{seat, playerId}` on `bship.<id>.here` every 15 s while the page is visible, an immediate reply when a new heartbeat arrives (fast discovery), and `bye` on `pagehide`. The opponent shows as "away" after 45 s of silence. Presence only affects the UI and is never stored.
  > **Review 11 (should fix): two presence details**
  >
  > - **Reply loop.** If the "immediate reply" is itself a heartbeat, the other client answers it, and the two ping-pong without end. Define "new" as "from a player who was away", and never reply to a reply.
  > - **Own echo.** A client receives its own heartbeats back unless the connection sets `noEcho: true`. That option is safe here, because KV replies come from the server.
- **Home refresh:** when online, the Home screen `kv.get`s every game in "My games" to show **"Your turn!"** badges. This is the v1 substitute for push alerts.
- **Connection etiquette** (the free plan allows 10 concurrent connections): one connection per app instance. It's closed after the page has been **hidden for 2 minutes** and reopened on `visibilitychange` → visible, so a forgotten laptop tab doesn't hold a slot. iOS drops hidden-tab WebSockets anyway. If the connection is refused because the plan is full, show "The sea is busy, try again in a minute" and retry with backoff.
- **Expiry:** bucket `ttl` (stream `max_age`) of 90 days. Age counts per stored message and every write stores a new one, so a game expires 90 days after its last move. Reads don't renew it. Expiry is silent unless `markerTTL` is set.
- **Time shown to kids** ("last move 2 days ago") uses the KV entry's server timestamp, never device clocks. Nothing in the rules depends on time.
  > **Review 16 (small).** "Never device clocks" is too strong: "2 days ago" still needs the device's idea of now. Only the move's timestamp comes from the server.
- **Version skew:** a device that reads a doc with a higher `v` or `engine` than it knows shows "Update needed", triggers the service-worker update, and never writes. Newer apps migrate older docs on read.
- **Client:** `@nats-io/nats-core` + `@nats-io/kv` **3.4.x installed from JSR** (`npx jsr add @nats-io/nats-core @nats-io/kv`). The npm 3.4.0 builds are CommonJS-only and Vite can't tree-shake them (a `Kvm` import costs about 229 KB from npm vs 77 KB from JSR, [nats.js#484](https://github.com/nats-io/nats.js/issues/484)). Never mix npm and JSR copies, because error `instanceof` checks break. Move to npm once the ESM fix (merged for 3.5) is published. Never import `@nats-io/transport-node` in browser code.
  > **Review 10c (should fix): the 77 KB figure needs a bundler setting.** In nats.js#484, 77 KB is the "JSR + `sideEffects: false`" column; plain JSR is 159 KB and npm is 229 KB. Tell the bundler the NATS packages are side-effect-free (Rollup's `treeshake.moduleSideEffects`), or expect 159 KB. The npm fix is merged (#487) and due in 3.5.0-0. As of 2026-11-13, npm `latest` is 3.4.0 and `next` is 3.4.1-0, both still CommonJS.
- **Connect:** `wsconnect({ servers: "wss://host:port" /* always explicit */, authenticator: credsAuthenticator(creds), name: "bship-web", maxReconnectAttempts: -1, reconnectTimeWait: 2000, pingInterval: 30_000 })`. One connection per app instance.
  > **Review 17 (small): connect options**
  >
  > - Add `ignoreClusterUpdates: true`. Otherwise the client adds any servers the cluster advertises to its reconnect list, and the CSP (§14) allows only one host.
  > - Write the production URL as `wss://connect.ngs.global:443`, to match "always explicit"; §15 omits the port.
  > - The first `wsconnect` rejects instead of retrying (`waitOnFirstConnect` defaults to false), so the "sea is busy" retry needs its own loop. A full plan shows up as the server error text "maximum account active connections exceeded" (`server/errors.go:69`).
  > - `credsAuthenticator` only fits production; see Review 10a.
- **Open:** `new Kvm(nc).open("bship_games", { allow_direct: true })`. This makes no network call, and direct gets are faster.
- **Keys:** `g.<uuid>` for games (the prefix leaves room for other key spaces).
- **CAS errors:** `update` fails with JetStream error 10071 "wrong last sequence" → re-read and retry.
- **Missing vs deleted:** `get` returns `null`, or an entry whose `operation` is `DEL`/`PURGE`. On `DEL`, or on a value that fails to unseal, recover the newest valid revision via `kv.history({ key })` (bucket history 5) and re-write it. Only a `PURGE`, or a key that's simply absent, means "expired".
  > **Review note.** If Review 3 is accepted, the device's own copy becomes the recovery source, and an absent key no longer means "expired" for a device that still holds the game.
- **Bucket** (created once with admin credentials by `infra/nats/provision.sh`; the browser only ever `open`s it): `history 5`, `ttl 90d`, `max_value_size 16 KiB`, `max_bucket_size 256 MiB`, `storage file`, `replicas 1`, `allow_direct`. Optional `markerTTL` (server ≥ 2.11) so an open game sees its own expiry.
  > **Review note.** See Review 2 (§14): rollups must be switched off on this stream, and `markerTTL` can't be combined with that.
- **Browser user permissions** (worked out from the nats.js 3.4.0 and nats-server 2.15 source):
  - publish: `$KV.bship_games.>`, `$JS.API.DIRECT.GET.KV_bship_games.>`, `$JS.API.CONSUMER.CREATE.KV_bship_games.>`, `$JS.API.CONSUMER.INFO.KV_bship_games.*`, `$JS.API.CONSUMER.DELETE.KV_bship_games.*`, `$JS.FC.>`, `bship.*.here`
  - subscribe: `_INBOX.>`, `bship.*.here`
  - Nothing under `$JS.API.STREAM.>` is allowed, so the user can't create, delete or purge streams or the bucket.
  - User limits: WebSocket connections only, payload ≤ 64 KiB, ≤ 50 subscriptions.
  > **Review 7b (should fix): narrow the allow-list; one limit is unconfirmed**
  >
  > - The subjects above do match what nats.js 3.4.0 publishes for put, update, get, watch and history. `CONSUMER.INFO` isn't needed, because watch and history read a cached copy; it's harmless.
  > - `$KV.bship_games.>` can be `$KV.bship_games.g.*`, and `$JS.API.DIRECT.GET.KV_bship_games.>` can be `$JS.API.DIRECT.GET.KV_bship_games.$KV.bship_games.g.*`.
  > - If Review 1's recommendation is taken, the consumer lines and `$JS.FC.>` go away. The whole list becomes: publish `$KV.bship_games.g.*`, `$JS.API.DIRECT.GET.KV_bship_games.$KV.bship_games.g.*`, `bship.*.here`; subscribe `_INBOX.>`, `bship.*.here`.
  > - "WebSocket connections only": Synadia's user guide mentions limits "such as Data, Payload, and Subscriptions" and no connection-type limit. Confirm it in the Synadia UI during M0 (Review 4).

## 8. Identity, joining, resuming

- **Profile (once per device or container; one player per device, owner's decision):** pick an avatar (about 12 original SVG sea creatures) and type a first name. Stored in IndexedDB with a random `playerId`, and editable later from Home.
  > **Review 18 (small).** Name and avatar are copied into each game's `seats` (§6), and no action updates them, so "editable later" won't reach games already joined. Say names are fixed per game, or add an action.
- **Host:** Home → **New game** (one tap) → Invite screen: big **QR code** (Rust → WASM → SVG), **Share** (Web Share API → iOS share sheet: Messages / WhatsApp / AirDrop), **Copy link** as a fallback, and an animated "Waiting for a friend…". The host can start placing ships while waiting.
- **Guest:** scans the QR with the Camera app or taps the link → "**Join Sam's game!**" (one tap) → profile step only if first time → placement.
- **How a device knows its seat:** a local binding `gameId → seat` in IndexedDB first; failing that, a seat whose `playerId` matches this device's profile.
- **Rejoin:** a game in "My games", or opening its link again, goes straight back in. If the device doesn't recognise a seat (new device, or the iOS Home Screen app vs Safari) and both seats are taken → "**Who are you?**" shows both players' avatars; tap one and it's remembered. **Claiming is local only**: it writes the binding on this device and never changes the shared doc. If that player is online right now on another device (seen via presence), a gentle "are you sure?" appears first.
  > **Review 19 (small), worth knowing.** This picker lets a child remove a game from the list, reopen the link, tap a sibling's avatar and see the sibling's fleet: three taps, no dev tools. It's inside the honour system you chose, so no change is needed.
- **Host on a second device:** if seat 1 is still empty and the device isn't recognised, the big button is "Join Sam's game!", with a small "I'm Sam, on another device" link underneath. That way a host opening their own link on a laptop doesn't steal the guest seat.
- **Placement:** drag ships (Pointer Events), tap a ship to rotate, **Shuffle** (random fleet from WASM) and **Ready!**. Invalid spots glow red, as validated by WASM. Next round offers "Same ships as last time?".
- **Remove from my list:** local only; the server copy expires on its own.

## 9. Rules engine & QR (Rust → WebAssembly)

- Crate `engine/`: `crate-type = ["cdylib"]`, target `wasm32-unknown-unknown`, `#[no_mangle] extern "C"` exports, release profile `opt-level="z"`, `lto`, `codegen-units=1`, `panic="abort"`, `strip`. Optional `wasm-opt -Oz`. Expect roughly 30–60 KB.
- **Narrow numeric ABI.** No wasm-bindgen. Data crosses as bytes in linear memory:

| Export | Meaning |
|---|---|
| `memory`, `alloc(len)→ptr`, `dealloc(ptr,len)` | buffer management |
| `engine_version()→u32` | written into docs |
| `fleet_check(fleet_ptr)→i32` | 0 = ok, or error code (out of bounds / overlap / wrong ships) |
| `fleet_random(seed_ptr /*16 B*/, out_ptr /*10 B*/)→i32` | randomness comes from JS (`crypto.getRandomValues`); a small PRNG inside, deterministic for tests |
| `shot_outcome(fleet_ptr, shots_ptr, n)→i32` | result of the n-th shot: miss / hit / sunk(ship k) / sunk+fleet destroyed; negative = repeat or out of range |
| `board_cells(fleet_ptr, shots_ptr, n, reveal, out_ptr /*100 B*/)` | per-cell state for rendering |
| `qr_encode(text_ptr, len, out_ptr, cap)→i32` | side length (modules written to `out`) or an error; built on the `qrcodegen` crate, ECC medium |

- Fleet encoding: 5 × `[bow cell, dir]` = 10 bytes, in the fixed order 5, 4, 3, 3, 2. Board size and fleet live in a `Rules` struct (classic for v1), so variants can be added later.
- **TS loader** (`src/engine/engine.ts`): `import url from './engine.wasm?url'` → `WebAssembly.instantiateStreaming(fetch(url))`, falling back to `instantiate(arrayBuffer)` if the MIME type is wrong. Typed wrapper methods. **Re-create `Uint8Array` views after any call that may allocate** (memory growth detaches old views).

## 10. Screens & UX

Screens are hash routes. Each screen is a Custom Element in light DOM, with CSS cascade layers and a tiny EventTarget store.

1. **Home:** big **New game** button, the **My games** cards (opponent avatar, "Your turn!" or "Dad's turn", last move "2 days ago"), language switch `EN | ES`, sound and voice toggles, my avatar.
2. **Profile:** avatar grid + name.
3. **Invite:** QR code, Share, Copy link, "Place my ships" while waiting.
4. **Join**, **Who are you?**, **Expired / bad link** (friendly, with a "Start a new game" button).
5. **Placement:** my sea + ship dock, Shuffle, Ready. A badge shows when the opponent is ready.
6. **Battle:** "Their sea" + "My sea" (incoming shots). **Aim, then FIRE** (owner's choice): tapping a square aims (crosshair, and the voice says "E 3"); tapping another square moves the aim; a big **🔥 FIRE!** button fires. On a keyboard, arrow keys aim and Enter fires. At round end, the loser's screen reveals where the winner's surviving ships were. Side by side on iPad landscape and laptops; on a phone, the target sea is large with a mini "my sea" toggle (container queries). A turn banner shows the avatar + "Your turn!" / "Dad's turn…" + a presence dot ("Dad is away, your move will be waiting for him"). Emoji bar.
7. **Round over:** win celebration, or a gentle "Good game!" when you lose. Score tally "Sam 2 – Dad 1", with **Play again** pulsing.
8. **Debug** (hidden route `#/debug`, for the grown-up): connection state, server, bucket, game revision and `seq`, app/engine/doc versions, last errors. There's no analytics, so this is how problems get diagnosed.

**Kid-first rules.** Every button has an icon and one or two words. Every status is also spoken. Grid labels are A–J × 1–10, and the voice says "B 5 … Hit!". Hit and miss use **shape and colour** (✕ / •). Big targets: cells ≥ 32 px on phones and ≥ 44 px on iPad. The font is `ui-rounded, system-ui` (SF Pro Rounded on Apple devices).

**Accessibility.** The grid is `role="grid"` with button cells, roving tabindex, arrow keys and Enter/Space to fire. An `aria-live` region announces results. Focus is visible. Contrast meets WCAG 2.2 AA. `prefers-reduced-motion` swaps big animations for fades.

## 11. Delight

- **Sound:** synthesised with the Web Audio API (splash, boom, sinking glug, fanfare, chime when the opponent joins). No audio files. The `AudioContext` is unlocked on the first tap, as iOS requires. Mute toggle.
- **Voice:** `speechSynthesis`, picking a voice that matches `en-*` or `es-*`. If no voice matches, there's no voice and the text still shows. Short phrases only. Voice toggle.
  > **Review 6 (should fix): voice and sound on iOS 16**
  >
  > - **Speech needs one tap per page load.** Calls before that tap are silently dropped (WebKit's 16.x-era `SpeechSynthesis.cpp`); after it, speech can start from a network event. So on a cold open "Your turn!" is silent, which breaks "every status is also spoken" (§10). The spec unlocks only the `AudioContext`. Start every cold open with one big tap-to-start that unlocks both.
  > - **The silent switch may have no fix on 16.x.** MDN lists `navigator.audioSession` from 16.4, but a WebKit engineer says setting the type to `playback` works "since iOS 17" (WebKit bug 237322). Test it in M0. If sound stays muted, show a "sound is off, check the switch" hint.
  > - **Speech in the Home Screen app on 16.x:** no source either way. Add it to the M0 device check.
- **Animation:** Web Animations API + CSS: shell drop, splash ripple, hit flash + screen shake, ship sinking with bubbles, coin toss at battle start, confetti on a win, and the opponent's avatar sliding in when they join. View Transitions between screens where supported (progressive enhancement).
- **Emoji reactions:** a fixed kid-safe set (🎉 😱 😂 👏 😭 🔥), with no typing. Stored as the last reaction per seat in the doc, so it reaches the opponent live or when they next open the game. It floats up big on their screen. Rate limited to one every 3 s per device.

## 12. Languages

- `src/i18n/en.ts` and `es.ts` implement one `Messages` type, so a missing key is a compile error. `Intl.PluralRules` and `Intl.RelativeTimeFormat` are used for "2 days ago".
- **Spanish is Latin American** (`es-419` for `Intl` and `<html lang>`). Voice preference: `es-MX` → `es-US` → any `es-*`. English voice: device's `en-*` variant → any `en-*`.
- Language choice: saved preference → `navigator.languages` (`es*` → Spanish) → English. `<html lang>` is kept in sync. Spoken prompts use the same language.
- Ship names come from the theme file per language, with neutral defaults (e.g. EN *Flagship, Frigate, Corvette, Sloop, Dinghy* / ES *Buque insignia, Fragata, Corbeta, Balandra, Bote*). The kids can rename them with the theme.
- The Spanish copy gets reviewed by the owner before release.

## 13. Home Screen app & device storage

- `manifest.webmanifest`: name (placeholder), `start_url: "./"`, `scope: "./"`, `display: "standalone"`, icons 192/512/maskable + `apple-touch-icon` 180.
- **Hand-written service worker** (`/battleship/sw.js`, scope `/battleship/`). Navigations are network-first with the cached `index.html` as a fallback. Hashed `/assets/*` are cache-first, since they're immutable. The cache name carries the build id, and old caches are deleted on activate. A new version activates the next time the user is on Home, never mid-game.
  > **Review 9 (should fix): service worker**
  >
  > - **Opening offline needs a precache list.** The service worker doesn't control the first page load, so cache-first alone leaves gaps. The build plugin in §17 that injects the build id must inject the list of built files too, and the worker caches them on install.
  > - **"Never mid-game" isn't what network-first navigation does.** Any reload fetches the new `index.html`, and iOS reloads discarded tabs often. Say that an update can arrive on any reload, and that the version-skew rule (§7) keeps that safe. Precache every chunk or avoid lazy chunks, because a Pages deploy removes the old hashed files.
- **Install hint:** iOS has no install prompt, so iPad/iPhone Safari shows a one-time illustrated hint (Share → Add to Home Screen). Desktop Chromium uses `beforeinstallprompt` behind an Install button.
- **`navigator.storage.persist()`** is requested after the first game is created. WebKit grants it heuristically, mostly for Home Screen apps.
- **iOS caveat (confirmed through iOS 27):** links tapped in Messages and QR codes scanned with the Camera **always open Safari, never the installed app**. The Home Screen app and Safari have **separate storage**, so a game joined in Safari won't appear in the installed app's list, and vice versa. Safari also clears a site's storage after 7 days of Safari use without a visit; Home Screen apps keep their own count. Mitigations: NATS is the source of truth; the installed app has a **Paste link** button on Home; Safari, when it detects iOS, shows "Playing in the Home Screen app? Copy this link → Paste link there".
- **Lost-game nudges** (owner chose nudges over a backup):
  1. On the Invite screen, **Share** is as prominent as the QR code.
  2. Every game has a **"Share link again"** action (battle-screen menu and the Home card), so either player can re-send it.
  3. The first time a round starts on a device that never shared or copied this game's link (a QR-only join), a one-time card says "Keep this game safe: send it to a grown-up", with a Share button.
  4. The install hint is shown more firmly in Safari, because Home Screen apps don't get the 7-day wipe.
  5. `navigator.storage.persist()` is requested.
  - **Accepted:** a same-room game whose two devices both get wiped, with no shared message, is gone.
  > **Review 8 (should fix): the nudges overstate two protections**
  >
  > - **Nudge 5 does nothing on the kids' devices.** `navigator.storage.persist()` doesn't protect a Safari 16 tab from the 7-day wipe. WebKit only describes an exemption from Safari 17, and grants it mainly to Home Screen apps.
  > - **The wipe takes the profile too**, not only "My games".
  > - **The app that keeps its storage can't receive links, and the one that receives links forgets.** Links and QR scans open Safari, which forgets after a week away. The Home Screen app keeps its storage but only gets a game through Paste link, which the spec treats as a footnote. A game is a long-lived pairing, since rematches reuse the link, so that bridge is paid once per pair.
  >
  > **Change:** say plainly that set-up is a grown-up job, once per pair: get the link into each kid's Home Screen app. On iOS Safari, make "Copy for the app" as prominent as Join. Later option: scan the QR inside the app. The camera works in Home Screen apps since iOS 13.4; there's no `BarcodeDetector`, so decode with `rqrr` in WASM (already a dev-dependency, §19).
  >
  > This doesn't reopen the nudges-only decision. It corrects what the nudges can do.
- **Pages caches everything for 10 minutes** (`max-age=600`), so the service worker fetches navigations with `cache: "no-cache"` to pick up a new deploy promptly.

## 14. Security & privacy model

- **The browser credential is public by nature:** it ships inside the site's JS. NATS can't stop someone holding it from subscribing with wildcards, so it can't make a UUID act as a secret.
- **What an outsider holding the public credential can do:** list game IDs, see ciphertext (including other clients' reply traffic on `_INBOX.>`), and **overwrite, delete or purge any game key**. Put, delete and purge share one subject, so permissions can't separate them.
- **What they can't do:** read or forge game contents (AES-GCM with a key that never touches NATS), or touch the bucket or stream itself.
- **Mitigations for overwrites and deletes:**
  - A value that fails to unseal is ignored, and a `DEL` is recovered from history (5 revisions).
  - `seq` monotonicity rejects replayed old docs.
  - Bucket size, value size and TTL are capped, as are user limits.
  - Optionally, disable rollup headers on the bucket's stream to make purges fail (try in M7, and keep it only if put/update/history still work).
  > **Review 2 (fix before building): one message can erase every game, and the two optional hardening items cancel each other**
  >
  > - A message published to any key with the header `Nats-Rollup: all` purges the whole stream, which is every game. KV buckets are created with rollups allowed. So an outsider can empty the bucket, although the line above says they can't "touch the bucket or stream itself". (nats-server 2.15.3 `server/stream.go:7633-7642`; nats.js `kv/src/kv.ts:443`)
  > - Setting a marker TTL forces rollups back on, so the item above and the optional `markerTTL` in §7 can't both be chosen. (`server/stream.go:2109-2113`)
  >
  > **Change:** make it a requirement, and part of provisioning from the first milestone. After `nats kv add …`, run `nats stream edit KV_bship_games --no-allow-rollup`; the server then refuses rollup headers (`server/stream.go:6664`, `7159-7168`). Leave `deny_purge` off, so an admin can still clear junk through the stream API, which the browser user can't call. Drop `markerTTL`. Add a test: as the browser user, a publish with `Nats-Rollup: all` and a `kv.purge()` are both refused.
  >
  > What's left for an outsider is deleting or overwriting one key at a time, which Review 3 covers.
  >
  > **Touches:** §7 *Expiry* and *Bucket*, §15 production setup step 2, `provision.sh`, §19.
- **Residual risk:** a deliberate attacker could still wipe games. This is accepted for a family game.
  > **Review 7a (should fix): the public credential allows more than this section lists.** Besides overwriting and deleting, anyone who copies it out of the site can:
  > - hold 10 connections and lock the family out;
  > - use up the 10 GiB data allowance, after which Synadia drops every connection until the next billing cycle (pricing page);
  > - fill the bucket to its size cap, after which every write fails until an admin clears it (KV buckets refuse new writes when full, `kv/src/kv.ts:413-414`);
  > - create 100 consumers, the plan's cap per stream, so no watcher can start.
  >
  > **Change:** list these as accepted. Add a short runbook: rotate the user and redeploy, clear junk keys, delete stray consumers. Handle rejected credentials in the app: nats.js stops reconnecting after two auth errors in a row, so show "Update needed" and reload. Narrow the allow-list (Review 7b, §7).
- **Rollback:** re-publishing an old sealed doc is rejected on any device that has seen a higher `seq`. Accepted risk for a brand-new device.
- **Players** can peek at each other's fleets with dev tools. Accepted (honour system).
- **CSP** in a `<meta>` tag (GitHub Pages can't set headers, and `frame-ancestors` doesn't work in meta): `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' <NATS URL for this build>; img-src 'self' data: blob:; style-src 'self'`. Vite injects `connect-src` per mode: `ws://localhost:*` in dev, `wss://demo.nats.io:8443` for device testing, and the production URL. No third-party scripts and no analytics, so the fragment never leaks. Verify the WASM + CSP combination on the iPadOS 16 iPad in M0.
  > **Review 20 (small): CSP**
  >
  > - `'wasm-unsafe-eval'` is supported from Safari 16.0 (MDN), and `connect-src 'self'` matches a same-origin `wss:` socket there too. Keep the M0 check, but §20 item 10 and §21 can stop calling the keyword unverified.
  > - `style-src 'self'` blocks inline `style="…"` attributes in template strings and `<style>` inside inline SVG. Set styles through the CSSOM or classes, and use presentation attributes in the art.
  > - Add `base-uri 'none'; object-src 'none'; form-action 'none'`.
  > - Vite's dev server needs a looser policy for hot-reload styles. The strict one still gets exercised by the e2e run against `vite preview`.

## 15. NATS hosting

| Environment | Server | Notes |
|---|---|---|
| Dev + automated tests | `infra/nats/docker-compose.yml`: `nats:2.15` with `jetstream {}` and `websocket { port: 9222, no_tls: true }` | Page on `http://localhost:5173` + `ws://localhost:9222`, so no mixed content. `provision.sh` creates the bucket with admin credentials. `nats-server.conf` defines a **`browser` user with exactly the §7 permissions**, which the app and the tests use, so permission mistakes show up locally rather than in production. |
| Device testing (iPad on the LAN) | `wss://demo.nats.io:8443` | **Never for keeps:** one shared account holding hundreds of strangers' streams; anyone can delete; no uptime promise. Encryption keeps contents private. Port 4222 is raw TCP and can't be used by browsers. |
| **Production** | **Synadia Cloud, free Personal plan**, `wss://connect.ngs.global` | JetStream/KV included (server 2.15). Limits: **10 concurrent connections**, 100 subs per connection, 5 GiB storage, 10 GiB/month data, no replicated storage (`replicas 1`). Free accounts left inactive may be deleted. |

> **Review 10a (should fix): three login modes, and a simpler device-testing set-up**
>
> - §7 always uses `credsAuthenticator`, but a user in a plain `nats-server.conf` logs in with a password, and demo.nats.io has no login. Choose the authenticator from build config, and say so here.
> - Per-user payload and subscription limits come from the user's JWT. A plain config file has none per user (it does have `allowed_connection_types`), so the local `browser` user mirrors the subject permissions, not the limits.
> - Drop the demo.nats.io row. Proxy the NATS WebSocket through Vite's dev server, so the iPad talks to the laptop's NATS with the real `browser` permissions. If the self-signed certificate blocks the service worker or the socket on iOS (unverified either way), use a tunnel with a trusted certificate.

> **Review 21 (small), production row.** Limits to add from the pricing page: 10 streams, 100 consumers per stream, 1 MiB max message, 2 accounts. The 10 GiB data allowance is per billing cycle, and going over drops every connection until the next cycle. "Free accounts left inactive may be deleted" understates the terms: Synadia may delete or migrate free customers' data "at any moment, without notice" (terms §8), may withdraw the service without notice (§5(b)), and commits to no uptime or support (§4). Review 3 is what makes that survivable.

**Production setup (M7):**
1. Create the account.
2. Create the bucket with an admin context (`nats kv add bship_games --history 5 --ttl 90d --max-value-size 16KiB --max-bucket-size 256MiB --replicas 1`, plus `allow_direct`).
3. Create a **browser user** in the Synadia UI with exactly the §7 permissions and limits, then download its `.creds`.
4. Store the creds as a GitHub Actions secret, injected at build as `VITE_NATS_CREDS`. It ends up public inside the bundle; the secret only keeps it out of the repo.
5. Changing permissions means new creds and a redeploy.

> **Review note.** Step 2 needs the rollup switch from Review 2, and Review 4 moves this whole list to M0.

**Escape hatch:** the server URL, creds and bucket are build-time config only. Moving to a self-hosted nats-server behind Caddy (automatic HTTPS) on a small VPS is a config change plus `provision.sh`. Games don't migrate, but they're short-lived.

> **Review note.** With Review 3, games migrate by themselves: each device writes its copy to the new server the next time it opens the game.

## 16. Repo layout

```
index.html
vite.config.ts · tsconfig.json · package.json
public/            manifest.webmanifest, icons/, sw.js (build id injected at build)
src/
  main.ts          boot: prefs → profile → router
  app/             router.ts, store.ts, screens/*.ts (one Custom Element per screen)
  game/            types.ts, reducer.ts, actions.ts
  engine/          engine.ts (WASM loader + typed API), engine.wasm (build output, git-ignored)
  net/             nats.ts (connection), game-store.ts (KV CAS loop + watch), presence.ts
  crypto/          link.ts (id/secret parse+format), seal.ts (HKDF + AES-GCM)
  storage/         idb.ts (tiny promise wrapper), games-repo.ts, prefs.ts
  ui/              sea-grid.ts, ship-dock.ts, qr-code.ts, player-badge.ts, emoji-bar.ts, fx-layer.ts
  fx/              audio.ts (Web Audio synth), speech.ts, motion.ts
  i18n/            index.ts, en.ts, es.ts
  theme/default/   tokens.css, art.svg (sprite: ships, splash, boom, avatars), names.ts
  styles/          base.css (layers, reset, layout)
engine/            Cargo.toml, src/{lib.rs, rules.rs, rng.rs, qr.rs}
e2e/               two-player Playwright specs
infra/nats/        nats-server.conf (local: admin + `browser` user mirroring prod permissions), docker-compose.yml, provision.sh (bucket)
.github/workflows/ ci.yml, deploy.yml
docs/superpowers/specs/2026-11-13-sea-battle-design.md   (this design, committed in M0)
```

## 17. Build, CI, deploy

- **Scripts:** `dev` (Vite; `--host` + HTTPS via `@vitejs/plugin-basic-ssl` for iPad testing, since secure-context APIs are needed), `wasm` (cargo build → copy to `src/engine/`), `build` (wasm → `tsc --noEmit` → `vite build`), `test` (Vitest), `test:rust` (`cargo test`), `e2e` (Playwright), `nats:up` (docker compose).
- **Vite:** `base: '/battleship/'`; `build.target` and CSS targets of Safari 16.4 / current evergreen browsers.
  > **Review 22 (small).** Also pin TypeScript `lib` to ES2023, so built-ins that Safari 16.4 lacks fail the type check (`Promise.withResolvers`, Set methods, `Uint8Array.toBase64`). `build.target` only lowers syntax; it doesn't add missing APIs.
- **CI** (`ci.yml`, on PRs): Rust toolchain + `wasm32-unknown-unknown`, `cargo test`, wasm build, typecheck, Vitest, Playwright (Chromium + WebKit) against `vite preview` + a NATS service container.
  > **Review 10b (should fix): CI.** A GitHub Actions service container starts before checkout, so it can't be given `nats-server.conf`, and the stock image runs without JetStream or WebSocket. Run `docker compose -f infra/nats/docker-compose.yml up -d --wait` as a step instead.
- **Deploy** (`deploy.yml`, on `main`): build → `actions/upload-pages-artifact` → `actions/deploy-pages`. Pages source: "GitHub Actions". NATS config is injected at build time: `VITE_NATS_URL` and `VITE_KV_BUCKET` from repo variables, `VITE_NATS_CREDS` from a repo secret (public once bundled; see §15).
- **Service-worker build id:** `public/sw.js` isn't processed by Vite, so a roughly 20-line local Vite plugin replaces `__BUILD_ID__` in `dist/sw.js` after the bundle is written.
  > **Review note.** The same plugin must also inject the list of built files for the precache (Review 9).
- **Local dev:** `http://localhost:5173` + `ws://localhost:<ws-port>` (no mixed content because the page is http and localhost is a secure context). iPad on the LAN: `https://<laptop-ip>:5173` + a `wss://` NATS endpoint.

## 18. Milestones (each one ends with something you can run)

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold: Vite + TS + Rust crate + CI + Pages deploy of a "hello sea" page that loads a WASM function; design doc committed. Check: the repo is public, or the account has a paid plan (Pages on private repos needs one) | Live on Pages; `.wasm` loads via streaming, under the CSP, on the kids' iPadOS 16 iPad |
| M1 | Rules engine + QR in Rust, TS loader, `<qr-code>` | `cargo test` + Vitest green; a QR on screen scans with an iPad camera |
| M2 | Reducer + **local two-board prototype** (dev-only route, no network) | The kids can play a full game on one laptop to test the feel early |
| M3 | Sync: link/crypto, NATS connection, KV CAS + watch, presence, IndexedDB cache | Integration tests against local NATS: create / join / fire / conflict / reconnect / resume |
| M4 | Full UI flow: Home, Profile, Invite, Join, Who-are-you, Placement, Battle, Round over, Rematch/score, Expired | Two-browser Playwright game passes in Chromium and WebKit |
| M5 | Delight + languages: sound, voice, animations, reactions, EN/ES complete | Manual pass with the kids; a no-reading playthrough works |
| M6 | Home Screen app: manifest, icons, SW, install hint, Paste link, storage persist | Installed on iPad; opens offline; updates cleanly |
| M7 | Production NATS on Synadia Cloud (§15): bucket + scoped browser user + creds secret, prod CSP, release | A permission probe with the browser creds can't delete or purge the bucket or create streams; real iPad ↔ laptop game across two homes, resumed the next day |

> **Review 4 (fix before building): the real backend and the real iPad arrive last**
>
> Synadia appears in M7, and the iPad checks are spread over M0, M5 and M6. Only the real pair can settle these:
> - whether Synadia offers the "WebSocket connections only" user limit (Review 7b);
> - whether Synadia accepts the stream edit in Review 2 (its FAQ says stream config can be edited);
> - the JSR build of the client under Vite, the CSP and Safari 16.4;
> - speech in the Home Screen app, and the silent switch (Review 6).
>
> **Change:** make M0 a walking skeleton. Create the Synadia account, the hardened bucket, the scoped user and the creds secret now. The "hello sea" page on Pages connects, does create/get/update on a test key and one publish/subscribe round trip, speaks a phrase and plays a sound. Check it on the iPadOS 16 device, in Safari and from the Home Screen. M7 shrinks to the release and a cross-home game.

## 19. Verification

- **Rust:** fleet validation (bounds, overlap, wrong ships); `fleet_random` always valid across 10 000 seeds; outcomes for miss, hit, sunk and win; repeat-shot rejection; QR round-trip (encode → decode with the `rqrr` dev-dependency).
- **Vitest (unit):** reducer transitions for every action and precondition; CAS retry against a fake KV; seal/unseal, including wrong key, wrong AAD and tampered bytes; link format/parse; i18n key parity; presence timeout; `seq` guard.
- **Vitest (integration, local NATS in Docker, connecting as the `browser` user):** two clients create and join; simultaneous writes resolve via CAS; watch delivers the opponent's move; reconnect after the server restarts; resume from cache + `kv.get`; expired-key handling; recovery after a `DEL` and after a garbage overwrite; a permission probe showing the `browser` user can't delete, purge or create streams.
- **Playwright (Chromium + WebKit, two browser contexts = two players):** create → read the link from the page → join → shuffle → ready → play scripted shots to a win (the test holds the link, so it can unseal the doc and aim at real ship cells) → rematch → close player B, A moves, reopen B → state correct.
- **Real devices (checklist):** iPad Safari + Home Screen app, iPhone, Mac Safari, Chrome. QR scan join, share sheet, audio unlock, voice in EN/ES, rotation, reduced motion, offline banner, resume after a day away, iOS background/foreground reconnect.
- **Accessibility:** automated audit of each screen + a keyboard-only playthrough.

> **Review 23: tests the comments above call for**
>
> - As the `browser` user, a publish with `Nats-Rollup: all` and a `kv.purge()` are refused (Review 2).
> - Reconcile cases: server older, key missing, value unreadable, no local copy (Review 3). Two tabs on one device see each other's moves.
> - A write whose reply is lost counts as a success once the re-read shows the action. Both conflict codes cause a retry, against a fake KV (Review 5).
> - After a forced reconnect, the opponent's next move arrives within a few seconds (Review 1).
> - A document with a higher `v` or `engine` is read-only. §7 *Version skew* has no test today.
> - Reword the permission probe. "Can't delete, purge or create streams" is about stream-level actions; the browser user can still write delete markers on keys.

## 20. Calls I made (please check)

1. **No UI framework.** Custom Elements in light DOM, CSS cascade layers, and a tiny EventTarget store.
2. **One KV entry per game with compare-and-set**, rather than an event stream. Resume is one `get`, conflicts are handled by CAS, "expire after 90 days of no moves" falls out of `max_age`, and it matches "store the session as a NATS payload". Docs are under 2 KB, so rewriting the whole doc is free.
3. **Presence** is sent as heartbeats on a core NATS subject and never stored.
4. **Seat identity** is remembered per device, with the honour-system "Who are you?" picker everywhere else.
5. **Ships may touch.** In round 1, a random player goes first; after that, the loser starts the next round.
6. **Games expire after 90 days** with no move.
7. **Reactions are persisted** (last one per seat), so async players still see them.
8. **No moves while offline** in v1; the app shell opens offline.
9. **Hash routing.** Hand-written service worker and IndexedDB wrapper. Sounds are synthesised, not recorded.
10. **Browser baseline: Safari 16.4** (the kids' iPads/iPhones run iOS/iPadOS 16.x, so update them to the latest 16.7.x) plus current evergreen browsers. Consequences: CSS nesting is compiled away (Lightning CSS, `safari 16.4` target); `<dialog>` rather than the Popover API (Safari 17); View Transitions only as a bonus (Safari 18); `navigator.storage.persist`, `navigator.audioSession` and `'wasm-unsafe-eval'` are feature-detected or verified on the real iPad in M0. Older iPads mean modest CPU/RAM, so animations stick to `transform`/`opacity`.
11. **Next step after approval and review:** break the milestones into a task-level implementation plan and build milestone by milestone, test-first.

> **Review note.** Item 2 stands: Review 1 only changes how the other device hears about a write. Item 6 changes meaning under Review 3. Item 10 is touched by Reviews 6, 8 and 20.

## 21. Risks & open items

- **iOS storage split** between Safari and the Home Screen app: mitigated (§13) but still a little confusing for kids.
- **A QR-only same-room game** can be lost if both devices' storage is wiped and nobody shared the link. Accepted by the owner (nudges only). A family-card backup on NATS is the known fix if this bites.
- **Synadia free plan:**
  - 10 concurrent connections (§7 etiquette keeps the family well under that).
  - Free accounts left inactive may be deleted, which would take every saved game with it and stop play until the config is switched (§15 escape hatch).
- **nats.js packaging:** JSR install until the npm ESM fix (3.5) is published; pin versions and don't mix registries.
- **The public demo NATS server** can wipe data and anyone can delete keys there, so it's for device testing only.
- **Browser credentials are public by nature:** anyone holding them could wipe games (§14). Accepted for a family game.
- **Web Audio on iPhone** may follow the silent switch, so test on a device.
- **Speech** voice quality varies by device and language; text is always shown as well.
- **The 'wasm-unsafe-eval' CSP keyword and the `navigator.audioSession` API on Safari 16.4** are unverified; check them in M0/M5 on the real iPad.

> **Review note.** To update from the comments above: the Synadia risks (Reviews 3 and 21), the public credential (Review 7a), `'wasm-unsafe-eval'` (now verified, Review 20), `navigator.audioSession` (Review 6) and the QR-only loss case (Review 8).

---

## Review appendix (Fable, 2026-11-13)

**What checked out**

- nats-server 2.15.3 is current (released 2026-11-11), and a Synadia node reported the same version. nats.js 3.4.0 is the latest on npm and JSR, and the npm build is CommonJS-only.
- `Kvm.open()` makes no network call (`kv/src/kv.ts:323-347`).
- The §7 permission subjects match what 3.4.0 publishes for put, update, get, watch and history.
- `kv.create`, `kv.update`, `KvEntry.created`, `resumeFromRevision`, `markerTTL` and the `nats kv add` flags in §15 exist as described.
- Synadia Personal plan: 10 connections, 100 subscriptions per connection, 5 GiB storage, single replica, `wss://connect.ngs.global:443`, custom permissions set in the web UI.
- `'wasm-unsafe-eval'` and a same-origin `wss:` socket under `connect-src 'self'` both work from Safari 16.
- A scan of the 3.4.0 client and its key library found no JavaScript built-ins newer than Safari 16.4 that would throw.
- §5 (links and encryption) needs no change.
- The invite link is about 101 characters, which fits a 41×41 QR code at medium error correction.

**Not verified**

- WebKit bug 247943 (sockets that look open after resume on iOS 15/16) is second-hand.
- Whether speech works in the Home Screen app on iOS 16.x.
- Whether a self-signed certificate allows a service worker or a `wss:` socket on iOS.
- Whether Synadia offers a per-user connection-type limit.

**Sources**

- nats.js v3.4.0, nats-server v2.15.3 and natscli (`cli/stream_command.go`, `cli/kv_command.go`) on GitHub. Paths are cited in the comments.
- [nats.js#484](https://github.com/nats-io/nats.js/issues/484)
- Synadia: [pricing](https://docs.synadia.com/cloud/pricing), [FAQ](https://docs.synadia.com/cloud/resources/faq), [terms](https://www.synadia.com/legal/terms), [user management](https://docs.synadia.com/cloud/user-guides/user-mgmt)
- WebKit: [storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/), [bug 237322](https://bugs.webkit.org/show_bug.cgi?id=237322), [bug 247943](https://bugs.webkit.org/show_bug.cgi?id=247943), [Safari 16.4 features](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
