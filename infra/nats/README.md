# NATS

NATS is the game's only backend. It stores each game in a key-value bucket, which is a named store of keys and values. It also passes presence messages between the two players, so each can see when the other is there.

On your computer, NATS runs in Docker. In production it is Synadia Cloud, on the free Personal plan.

Use this page to:

- [run NATS locally](#run-nats-locally)
- [see what the browser user may do](#what-the-browser-user-may-do)
- [set up production, once](#set-up-production-once)
- [check production permissions](#check-production-permissions)
- [understand what the public credential can do](#what-the-public-credential-can-do)
- [fix a production problem](#fix-a-production-problem)
- [check real devices](#real-device-checklist)

## Run NATS locally

```sh
just nats-up
just nats-down
```

`just nats-up` does three things:

1. Starts NATS in Docker (`docker-compose.yml`).
2. Waits until NATS accepts a connection (`wait.sh`).
3. Creates the bucket and sets it up (`provision.sh`).

It needs the [`nats` CLI](https://github.com/nats-io/natscli) and `jq`. It is safe to run twice.

`just nats-down` stops NATS. The games stay in a Docker volume.

### Ports

| Port | What uses it |
|---|---|
| 4222 | The `nats` CLI (`wait.sh`, `provision.sh` and your own commands), and the test that checks the browser user is refused over plain TCP |
| 9222 | The game and the tests, over WebSocket |
| 8222 | Nothing answers. Docker publishes the port for NATS monitoring, but the local config leaves monitoring off |

### Users

`nats-server.conf` defines two users in the `APP` account:

| User | Password | What it is for |
|---|---|---|
| `admin` | `admin-dev` | Creates the bucket. `provision.sh` and the tests use it. |
| `browser` | `browser-dev` | The game. It can only connect over WebSocket, and only use the [allow-list](#what-the-browser-user-may-do). |

These passwords only work on your computer.

### What `provision.sh` does

`provision.sh` creates the `bship_games` bucket with these settings. NATS keeps the bucket in a stream called `KV_bship_games`.

| Setting | Value |
|---|---|
| History | 5 values for each key |
| Time to live (TTL) | 90 days (`90d`) |
| Largest value | 16 KiB |
| Largest bucket | 256 MiB |
| Storage | file |
| Replicas | 1 |

Then it changes two settings on the stream:

| Setting | Value | Why |
|---|---|---|
| Direct get (`allow_direct`) | on | The game reads each game with a direct get. |
| Rollups (`allow_rollup_hdrs`) | **off** | A rollup is a write that deletes the messages before it. With rollups off, the browser credential cannot wipe games that way. |

It makes that change by sending `STREAM.UPDATE` through `nats request` with `jq`. `nats stream edit` refuses to run without a TTY on KV streams, even with `-f`.

To point `provision.sh` at another server, set `NATS_URL`, or set `NATS_CONTEXT` to a saved `nats` context.

## What the browser user may do

The browser user's sign-in details ship inside the game, so anyone can read them. The server limits that user to this allow-list. Local NATS and production use the same list.

| The user may | On these subjects |
|---|---|
| Publish | `$KV.bship_games.g.*`<br>`$JS.API.DIRECT.GET.KV_bship_games.$KV.bship_games.g.*`<br>`bship.*.here` |
| Subscribe | `_INBOX.>`<br>`bship.*.here` |

That is enough to read and write one game at a time, and to send and receive presence messages. [What the public credential can do](#what-the-public-credential-can-do) lists what follows from it.

## Set up production (once)

You need the `nats` CLI, `jq` and the GitHub CLI (`gh`).

1. **Create the account.** Sign up for Synadia Cloud on the free Personal plan, and create an account or team. Note the plan's limits: 10 connections, 10 streams, 100 consumers per stream, 5 GiB storage and 10 GiB data per billing cycle.

2. **Save an admin context for the CLI.** In the Synadia UI, create an admin user and download its creds file as `admin.creds`. A creds file holds a user's sign-in keys. Then run:

   ```sh
   nats context add synadia-bship-admin \
     --server tls://connect.ngs.global:4222 \
     --creds ./admin.creds
   nats --context synadia-bship-admin rtt
   ```

   Never commit a plaintext creds file. Git ignores `*.creds` files here. The repo keeps encrypted copies at `infra/nats/admin.creds.sops` and `infra/nats/browser.creds.sops`, made with [sops](https://github.com/getsops/sops) using the GPG keys listed in `.sops.yaml`:

   ```sh
   just creds-decrypt                               # writes ./admin.creds
   just creds-decrypt browser                       # writes ./browser.creds
   just creds-encrypt admin ~/Downloads/admin.creds # after rotating a user
   ```

   To give someone else access, add their GPG fingerprint to `.sops.yaml` (comma-separated), then run `sops updatekeys` on each `infra/nats/*.creds.sops` file.

3. **Create the bucket as admin:**

   ```sh
   NATS_CONTEXT=synadia-bship-admin bash infra/nats/provision.sh
   ```

   Then check that Synadia accepted the rollup change:

   ```sh
   nats --context synadia-bship-admin stream info KV_bship_games -j | jq '.config | {allow_direct, allow_rollup_hdrs}'
   ```

   It must print `true` for `allow_direct` and `false` for `allow_rollup_hdrs`.

4. **Create the browser user** in the Synadia UI. Give it exactly the [allow-list](#what-the-browser-user-may-do), and these limits:

   - payload: at most 64 KiB
   - at most 50 subscriptions
   - WebSocket only, if the UI offers a connection-type limit

   Download its creds file as `browser.creds`, and store the encrypted copy: `just creds-encrypt browser ./browser.creds`.

   To run the app on your computer against Synadia instead of local NATS, run `just env-synadia`. It decrypts the browser creds into `.env` and sets `VITE_NATS_AUTH=creds` and `VITE_NATS_URL`. To go back to local NATS, run `rm .env && just env`. Never put the admin creds in `.env`: Vite copies every `VITE_*` value into the app's JavaScript.

5. **Store the settings in GitHub.** The repository must be public for free Pages.

   ```sh
   gh secret set VITE_NATS_CREDS < browser.creds
   gh variable set VITE_NATS_URL --body wss://connect.ngs.global:443
   gh variable set VITE_KV_BUCKET --body bship_games
   ```

   `deploy.yml` builds with `VITE_NATS_AUTH=creds`. The site's Content-Security-Policy `connect-src` allows only `'self'` and that URL.

6. **Turn on Pages and deploy.** In the repository, set Settings, Pages, Source to **GitHub Actions**. Then push to `main`, or run the "Deploy to Pages" workflow. The deploy stops early if `VITE_NATS_URL`, `VITE_KV_BUCKET` or `VITE_NATS_CREDS` is empty.

## Check production permissions

The permission tests can run against production. They show that the browser user can do what the game needs, and nothing more.

```sh
just probe wss://connect.ngs.global:443 ./browser.creds
```

`just probe` sets `PROBE_NATS_URL` and `PROBE_CREDS`, then runs `tests/integration/permissions.test.ts`. With `PROBE_NATS_URL` set:

- the browser connection signs in with the creds file named in `PROBE_CREDS`
- the local admin connection is skipped, and so is its check that the refused stream was not created
- the plain-TCP refusal test is skipped, because Synadia's connection-type limit is unconfirmed

**What you should see:** create, get and update work. Purge, rollup, stream create and writes outside `g.*` are refused.

The tests write only `g.<random uuid>` keys. Delete them afterwards: see [Clear junk keys](#clear-junk-keys).

Do not run `sync.test.ts` against production. It needs the local admin user.

## What the public credential can do

The browser credential ships inside the site's JavaScript, so it is **public by design**. Game contents stay private because they are sealed with AES-GCM, and the key only lives in the invite link.

These are the accepted risks. Anyone who holds the credential can do the things marked "Yes".

| Risk | Possible with the allow-list? | Why, or what to do |
|---|---|---|
| Overwrite or delete any single game key (`g.*`). Put and delete share one subject. | Yes | Recovery: the game writes its cached copy back, and ignores a bad value. `purge` and rollup are refused (rollups are off on the stream). |
| Hold 10 connections and lock the family out. | Yes | [Rotate the browser user](#rotate-the-browser-user). |
| Use up the 10 GiB data allowance. Synadia then drops every connection until the next cycle. | Yes | See [Over the data allowance](#over-the-data-allowance). |
| Fill the bucket to 256 MiB. Writes then fail until it is cleared. | Yes | [Clear junk keys](#clear-junk-keys). |
| Create 100 consumers so no watcher can start. | **No** | The allow-list has no `$JS.API.CONSUMER.*` subject, and the game uses direct get and plain subjects instead of `kv.watch`. Stray consumers could only come from the admin user. |
| Read game contents or forge a move. | No | Games are sealed and authenticated. The holder can list game ids and see ciphertext. |
| Create, delete or purge streams or the bucket. | No | The allow-list has no subject for it. |

Synadia may also delete or migrate free-plan data, or withdraw the service, without notice. The copy of each game on the player's device is what makes this survivable.

## Fix a production problem

### Rotate the browser user

Use this when the credential was abused, or the connections or data allowance are used up.

1. In the Synadia UI, delete the browser user. This drops its connections. Then create a new one with the same [allow-list](#what-the-browser-user-may-do) and limits.
2. Store the new creds file:

   ```sh
   gh secret set VITE_NATS_CREDS < new-browser.creds
   just creds-encrypt browser ./new-browser.creds
   ```

3. Deploy, then wait for the workflow to finish:

   ```sh
   gh workflow run deploy.yml
   ```

Old copies of the game show "Update needed" after two sign-in errors, then reload into the new build.

### Clear junk keys

Use this when the bucket is full, or keys were vandalised.

```sh
nats --context synadia-bship-admin kv ls bship_games
nats --context synadia-bship-admin kv purge bship_games g.<uuid> -f     # one key
nats --context synadia-bship-admin stream purge KV_bship_games -f       # everything: all games reset
```

Players who still have a copy on their device write their game back the next time they open it. `deny_purge` is off on purpose, so the admin can purge.

### Delete stray consumers

Use this only if something other than the browser user created consumers. The browser user cannot.

```sh
nats --context synadia-bship-admin consumer ls KV_bship_games
nats --context synadia-bship-admin consumer rm KV_bship_games <name> -f
```

### Over the data allowance

Use this when the 10 GiB data allowance is used up. Synadia then drops every connection until the next billing cycle.

[Rotate the browser user](#rotate-the-browser-user) so the abuser is cut off. Then wait, or upgrade the plan.

## Real-device checklist

Run this on the production build (Pages), on an iPad with iPadOS 16 where possible. Tick each item.

The section numbers refer to the [design spec](../../docs/superpowers/specs/2026-11-13-sea-battle-design.md).

**Synadia and build** (spec Review 4)

- [ ] Synadia offers a WebSocket-only user limit (if not, note it here: the allow-list still holds).
- [ ] `provision.sh` succeeded on Synadia: `allow_rollup_hdrs` is `false`, and put, update and get still work.
- [ ] The JSR build of the client connects under the production CSP in Safari 16.4 (no CSP violations in the console).
- [ ] WebAssembly runs under the CSP (`'wasm-unsafe-eval'`) on iPadOS 16: shuffle ships in the browser.
- [ ] The permission probe passes against production (see [Check production permissions](#check-production-permissions)).

**Devices** (spec section 19): iPad Safari, iPad Home Screen app, iPhone, Mac Safari, Chrome

- [ ] Join by QR scan and by the shared link; share sheet and "Copy for the app".
- [ ] Audio unlocks on the first tap; the iOS silent switch behaves as intended (the app sets `navigator.audioSession` to playback where available).
- [ ] Spoken prompts in English and Spanish, in Safari and in the Home Screen app.
- [ ] Rotation, and Reduce Motion on.
- [ ] Offline banner; the app shell opens offline.
- [ ] Resume after a day away; background then foreground reconnects within a few seconds.
- [ ] Two devices fire at the same moment: one result, no reversed shot.
- [ ] Touch drag of ships on the placement screen (drag, drop, rotate, drop on an overlap is refused).
- [ ] Install hint shows in Safari, not in the Home Screen app.
