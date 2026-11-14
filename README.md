# Sea battle

A two-player sea-battle game for kids (ages 6 to 9). One player creates a game and shares a link or QR code, and the other joins. It is an installable PWA that plays in iPad/iPhone Safari, the Home Screen app and current laptop browsers. English and Spanish.

Built on the web platform: TypeScript, Custom Elements, a Rust to WebAssembly game engine, and Web APIs, with no UI framework. NATS KV (JetStream) is the only backend, and game state is sealed with AES-GCM using a key that only lives in the invite link. Hosted on GitHub Pages.

## Requirements

Node 24, Rust with the `wasm32-unknown-unknown` target, Docker (for local NATS), the [`nats` CLI](https://github.com/nats-io/natscli) and `jq`.

## Run it

```sh
npm ci
npm run nats:up     # local NATS in Docker, creates the bucket
npm run dev         # http://localhost:5173/battleship/
```

`.env` points the app at `ws://localhost:9222` as the `browser` user. Stop NATS with `npm run nats:down`.

## Tests

| Command | What |
|---|---|
| `npm test` | Unit tests (Vitest), including theme contrast |
| `npm run test:rust` | Rust engine tests |
| `npm run test:int` | Integration tests, needs `npm run nats:up` |
| `npm run e2e` | Playwright in Chromium and WebKit (two players, a11y), needs `npm run nats:up`; builds and previews the site on port 4173 |
| `npm run typecheck` | `tsc --noEmit` |

On first use run `npx playwright install chromium webkit`.

## Testing on an iPad

Serve over the LAN and let Vite proxy the WebSocket so the page stays same-origin:

```sh
npm run nats:up
VITE_NATS_URL=/nats npm run dev -- --host
```

Open `http://<your-mac-ip>:5173/battleship/` on the iPad.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds with the production NATS settings and publishes to Pages. CI (`ci.yml`) runs every suite on branches and pull requests.

Production NATS setup, the permission probe, the accepted risks of the public browser credential, the runbook and the real-device checklist are in [`infra/nats/README.md`](infra/nats/README.md).

### Steps only the owner can do

- Create the Synadia Cloud account, the admin and browser users, and the `.creds` files.
- Set the GitHub secret and variables (`VITE_NATS_CREDS`, `VITE_NATS_URL`, `VITE_KV_BUCKET`).
- Make the repository public and set Settings, Pages, Source to **GitHub Actions**.
- Run the real-device checklist.

## Layout

- `src/` app code (screens in `src/app/screens`, components in `src/ui`, NATS in `src/net`, crypto in `src/crypto`)
- `engine/` Rust game rules, built to `src/engine/engine.wasm` by `npm run wasm`
- `infra/nats/` local server, provisioning and the production runbook
- `e2e/` and `tests/integration/` Playwright and NATS integration tests
