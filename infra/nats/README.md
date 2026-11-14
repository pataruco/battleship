# NATS: local development, production setup and runbook

NATS is the only backend. Locally it runs in Docker; in production it is Synadia Cloud (free Personal plan).

## Local server

```sh
npm run nats:up     # docker compose up -d, wait.sh, provision.sh
npm run nats:down
```

`nats-server.conf` defines two users in the `APP` account: `admin` (`admin-dev`, creates the bucket) and `browser` (`browser-dev`).
`browser` is WebSocket-only and may only:

- publish `$KV.bship_games.g.*`, `$JS.API.DIRECT.GET.KV_bship_games.$KV.bship_games.g.*`, `bship.*.here`
- subscribe `_INBOX.>`, `bship.*.here`

`provision.sh` needs the `nats` CLI and `jq`. It creates the `bship_games` bucket (history 5, ttl 90d, max value 16 KiB, max bucket 256 MiB, file storage, 1 replica), then turns direct get on and **rollups off** by sending `STREAM.UPDATE` through `nats request` with `jq`. (`nats stream edit` refuses to run without a TTY on KV streams, even with `-f`.) It is safe to run twice.

## Production setup (Synadia Cloud), once

1. Create a Synadia Cloud account (free Personal plan). Create an account/team and note the system limits: 10 connections, 10 streams, 100 consumers per stream, 5 GiB storage, 10 GiB data per billing cycle.
2. Save an admin context for the CLI. In the Synadia UI, create an admin user, download its `.creds`, then:

   ```sh
   nats context add synadia-bship-admin \
     --server tls://connect.ngs.global:4222 \
     --creds ./admin.creds
   nats --context synadia-bship-admin rtt
   ```

   Keep `admin.creds` out of the repo.
3. Provision the bucket as admin:

   ```sh
   NATS_CONTEXT=synadia-bship-admin bash infra/nats/provision.sh
   ```

   Check that Synadia accepted the rollup edit:
   `nats --context synadia-bship-admin stream info KV_bship_games -j | jq '.config | {allow_direct, allow_rollup_hdrs}'` must print `true` and `false`.
4. Create the browser user in the Synadia UI with exactly this allow-list:
   - publish: `$KV.bship_games.g.*`, `$JS.API.DIRECT.GET.KV_bship_games.$KV.bship_games.g.*`, `bship.*.here`
   - subscribe: `_INBOX.>`, `bship.*.here`
   - limits: payload at most 64 KiB, at most 50 subscriptions, and, if the UI offers a connection-type limit, WebSocket only.

   Download its `.creds` as `browser.creds`.
5. Store the settings in GitHub (the repo must be public for free Pages):

   ```sh
   gh secret set VITE_NATS_CREDS < browser.creds
   gh variable set VITE_NATS_URL --body wss://connect.ngs.global:443
   gh variable set VITE_KV_BUCKET --body bship_games
   ```

   `deploy.yml` builds with `VITE_NATS_AUTH=creds`, and the CSP `connect-src` allows only `'self'` plus that URL.
6. Settings, Pages, Source: **GitHub Actions**. Push to `main` (or run the "Deploy to Pages" workflow). The deploy fails early if `VITE_NATS_URL` is empty.

## Permission probe against production

The integration permission tests read the target from the environment. With `PROBE_NATS_URL` set, the browser connection uses `credsAuthenticator` on the file in `PROBE_CREDS`, the local admin connection and the stream-absence check are skipped, and the plain-TCP refusal test is skipped (Synadia's connection-type limit is unconfirmed).

```sh
PROBE_NATS_URL=wss://connect.ngs.global:443 PROBE_CREDS=./browser.creds \
  npx vitest run --project integration tests/integration/permissions.test.ts
```

Expected: create/get/update works; purge, rollup, stream create and writes outside `g.*` are refused. The tests write only `g.<random uuid>` keys. Delete them afterwards (see "Clear junk keys"). Do not run `sync.test.ts` against production: it needs the local admin user.

## What the browser credential can do (accepted risks)

The browser credential ships inside the site's JavaScript, so it is **public by design**. Game contents stay private because they are AES-GCM sealed with a key that only lives in the invite link. Anyone holding the credential can:

| Risk | True with the allow-list above? |
|---|---|
| Overwrite or delete any single game key (`g.*`). Put and delete share one subject. | Yes. Recovery: the app writes its cached copy back, and a bad value is ignored. `purge` and rollup are refused (rollups are off on the stream). |
| Hold 10 connections and lock the family out. | Yes. |
| Use up the 10 GiB data allowance, after which Synadia drops every connection until the next cycle. | Yes. |
| Fill the bucket to 256 MiB (writes then fail until cleared). | Yes. |
| Create 100 consumers so no watcher can start. | **No.** The allow-list has no `$JS.API.CONSUMER.*` subject, and the app uses direct get and plain subjects instead of `kv.watch`. Stray consumers could only come from the admin user. |
| Read game contents or forge a move. | No (sealed, authenticated). They can list game ids and see ciphertext. |
| Create, delete or purge streams or the bucket. | No. |

Synadia may also delete or migrate free-plan data, or withdraw the service, without notice. The device copy of each game is what makes this survivable.

## Runbook

**Rotate the browser user and redeploy** (credential abused, connections or data allowance exhausted):

1. In the Synadia UI, delete the browser user (this drops its connections) and create a new one with the same allow-list.
2. `gh secret set VITE_NATS_CREDS < new-browser.creds`
3. `gh workflow run deploy.yml`, then wait for it. Old copies of the app show "Update needed" after two auth errors and reload into the new build.

**Clear junk keys** (bucket full, or vandalised keys):

```sh
nats --context synadia-bship-admin kv ls bship_games
nats --context synadia-bship-admin kv purge bship_games g.<uuid> -f     # one key
nats --context synadia-bship-admin stream purge KV_bship_games -f       # everything: all games reset
```

Players who still have a device copy write their game back on the next open. `deny_purge` is off on purpose so the admin can purge.

**Delete stray consumers** (only expected if something other than the browser user created them):

```sh
nats --context synadia-bship-admin consumer ls KV_bship_games
nats --context synadia-bship-admin consumer rm KV_bship_games <name> -f
```

**Over the data allowance:** every connection is dropped until the next billing cycle. Rotate the user (above) so the abuser is cut off, then wait, or upgrade the plan.

## Real-device checklist

Run this on the production build (Pages), on an iPadOS 16 iPad where possible. Tick each item.

Synadia and build (spec Review 4):
- [ ] Synadia offers a WebSocket-only user limit (if not, note it here: the allow-list still holds).
- [ ] `provision.sh` succeeded on Synadia: `allow_rollup_hdrs` is `false`, and put, update and get still work.
- [ ] The JSR build of the client connects under the production CSP in Safari 16.4 (no CSP violations in the console).
- [ ] WebAssembly runs under the CSP (`'wasm-unsafe-eval'`) on iPadOS 16: shuffle ships in the browser.
- [ ] Permission probe passes against production (section above).

Devices (spec section 19): iPad Safari, iPad Home Screen app, iPhone, Mac Safari, Chrome.
- [ ] Join by QR scan and by the shared link; share sheet and "Copy for the app".
- [ ] Audio unlocks on the first tap; the iOS silent switch behaves as intended (the app sets `navigator.audioSession` to playback where available).
- [ ] Spoken prompts in English and Spanish, in Safari and in the Home Screen app.
- [ ] Rotation, and Reduce Motion on.
- [ ] Offline banner; the app shell opens offline.
- [ ] Resume after a day away; background then foreground reconnects within a few seconds.
- [ ] Two devices fire at the same moment: one result, no reversed shot.
- [ ] Touch drag of ships on the placement screen (drag, drop, rotate, drop on an overlap is refused).
- [ ] Install hint shows in Safari, not in the Home Screen app.
