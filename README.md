# Sea battle

Sea battle is a two-player game for children aged 6 to 9. One player starts a game and shares a link or QR code, and the other player joins.

It is an installable web app (PWA). It plays in Safari on iPad and iPhone, as a Home Screen app, and in current laptop browsers. It is in English and Spanish.

## How it is built

- **The web platform, with no UI framework.** TypeScript, Custom Elements and Web APIs.
- **A Rust game engine.** It holds the rules and is compiled to WebAssembly.
- **NATS is the only backend.** NATS is a messaging server. Each game lives in one of its key-value buckets (JetStream).
- **Sealed game state.** Each game is encrypted with AES-GCM, and the key only lives in the invite link.
- **GitHub Pages** hosts the site.

## Run it on your computer

### Before you start

The tasks need bash. They are written for macOS and Linux.

Install these tools:

| Tool | The project uses it to |
|---|---|
| [Node.js](https://nodejs.org/) 24 or newer | run Vite, Vitest and Playwright |
| [pnpm](https://pnpm.io/installation) 12 | install the JavaScript packages |
| [just](https://just.systems/) 1.27 or newer | run every task on this page |
| [Rust](https://rustup.rs/) 1.88 or newer | compile the game engine to WebAssembly |
| [Docker](https://docs.docker.com/get-started/get-docker/), with Compose | run NATS on your computer |
| [`nats` CLI](https://github.com/nats-io/natscli) | wait for NATS to start, then create the bucket |
| [`jq`](https://jqlang.org/) | change the bucket's settings |

Rust also needs the WebAssembly target:

```sh
rustup target add wasm32-unknown-unknown
```

Check that everything is in place:

```sh
just doctor
```

It marks each tool `ok` or `MISSING`. When nothing is missing, the last line is `All required tools found.`

### Start the game

1. Create your settings file and install the packages:

   ```sh
   just setup
   ```

   The first time, it prints `created .env from .env.example`.

2. Start NATS:

   ```sh
   just nats-up
   ```

   This starts NATS in Docker, waits for it, and creates the bucket that holds the games. The last line is `KV_bship_games: allow_direct on, rollups off`.

3. Start the game:

   ```sh
   just dev
   ```

   This builds the game engine, then prints `Local: http://localhost:5173/battleship/`.

4. Open <http://localhost:5173/battleship/> in a browser. Select **Tap to start**, then choose a picture, type a name and select **Save**. You then see **New game**.

### Play both sides

Each browser profile is one player, so you need two to play a game:

1. In the first window, select **New game**. The game shows an invite with a QR code. Select **Copy link**.
2. Open the link in a private window, or in another browser. Select **Tap to start** and choose a picture and a name, as before. Then select **Join!**

Both windows then show **Place your ships**.

A second tab in the same window is still the first player.

Two pages help while you work:

| Page | What it does |
|---|---|
| [`#/dev/local`](http://localhost:5173/battleship/#/dev/local) | Puts two players on one screen, in memory. It works without NATS, and only under `just dev`. |
| [`#/debug`](http://localhost:5173/battleship/#/debug) | Shows the connection status, the server and bucket in use, the current game, the versions and the last 20 errors. |

### Stop

Press Ctrl+C in the terminal that runs `just dev`. `just` prints an error line that says the recipe was terminated by signal 2. That is expected.

Then stop NATS:

```sh
just nats-down
```

Your local games stay in a Docker volume, so they are still there after the next `just nats-up`.

### Settings

`just setup` copies `.env.example` to `.env`. The values match local NATS, so the game works without changes. Git ignores `.env`.

| Setting | Local value | What it does |
|---|---|---|
| `VITE_NATS_URL` | `ws://localhost:9222` | Where the game finds NATS. A path such as `/nats` means "the same address as the page": the dev server passes `/nats` on to local NATS. |
| `VITE_NATS_AUTH` | `userpass` | How the game signs in: `none`, `userpass` or `creds`. |
| `VITE_NATS_USER`, `VITE_NATS_PASS` | `browser`, `browser-dev` | The name and password for `userpass`. |
| `VITE_NATS_CREDS` | not set | For `creds`: the text of a creds file, which holds a user's sign-in keys. Only production uses it. |
| `VITE_KV_BUCKET` | `bship_games` | The bucket that holds the games. |

Vite reads `.env` when `just dev` or `just build` starts. A value set in your shell wins over the one in `.env`.

Production does not use `.env`. The deploy workflow sets these values from GitHub: see [Deploy](#deploy).

### If something goes wrong

| What you see | What to do |
|---|---|
| `MISSING` in `just doctor` | Install that tool, then run `just doctor` again. |
| A Rust error that mentions `wasm32-unknown-unknown` | The WebAssembly target is missing. Run `rustup target add wasm32-unknown-unknown`. |
| `Cannot connect to the Docker daemon` | Start Docker, then run `just nats-up` again. |
| `port is already allocated` or `address already in use` | Another program or container is using port 4222, 9222 or 8222. Stop it, then run `just nats-up` again. |
| `NATS did not become ready` | NATS did not start. Run `docker logs nats-nats-1` to see why. If the log says `is a directory`, Docker cannot see the repo's folder. Colima and Docker Desktop only share some folders: move the repo under your home folder, or share its folder with Docker. |
| `Local NATS is not up, or has no bship_games bucket` | Run `just nats-up`. |
| **New game** shows "You're offline. Your game is saved" | The game cannot reach NATS. Run `just nats-up`, then open [`#/debug`](http://localhost:5173/battleship/#/debug) to check the server and bucket. |
| `Port 5173 is in use, trying another one...` | Vite picked the next free port. Open the address it prints after `Local:`. |
| An error over the page: `Failed to resolve import "./engine.wasm?url"` | The game engine is not built. Run `just wasm`, then reload the page. `just dev` builds it for you, so this only happens if you start Vite another way. |
| `Executable doesn't exist` from Playwright | Run `just playwright-install`. |

## Run the tests

| Command | What it runs | What it needs first |
|---|---|---|
| `just test` | Unit tests (Vitest), including theme contrast | Nothing |
| `just test-rust` | Rust engine tests | Nothing |
| `just typecheck` | `tsc --noEmit` | Nothing |
| `just test-int` | Integration tests against local NATS | `just nats-up` |
| `just e2e` | Playwright in Chromium and WebKit: a two-player game, accessibility, and starting offline | `just nats-up`, and `just playwright-install` the first time |

`just e2e` builds the site and serves it on port 4173. If something is already serving that port, Playwright tests that instead of your latest code, so stop it first.

To run part of a suite, add the tool's own options. For example, `just test -t "defaults to no auth"` or `just e2e --project chromium`.

## Try it on an iPhone or iPad

- **In the iOS Simulator** (part of [Xcode](https://developer.apple.com/xcode/)): the Simulator shares your Mac's network. [Start the game](#start-the-game), then open `http://localhost:5173/battleship/` in the Simulator's Safari.
- **On a real device:** use the deployed site, and work through the [real-device checklist](infra/nats/README.md#real-device-checklist).

A real device cannot use the dev server over your network. The game needs the browser's crypto features (`crypto.subtle`), and Safari only provides them over https or on `localhost`.

## Deploy

Pushing to `main` runs [`deploy.yml`](.github/workflows/deploy.yml). It builds the site with the production NATS settings and publishes it to GitHub Pages.

[`ci.yml`](.github/workflows/ci.yml) runs every test suite on branches and pull requests. It uses the same `just` commands as this page.

Each GitHub Action is pinned to a commit, not a version tag, so a moved tag cannot change what runs. Dependabot opens a pull request each week when a pinned action has a new release.

### First deploy: steps only the owner can do

1. Create the Synadia Cloud account, the admin and browser users, and their `.creds` files.
2. Set the GitHub secret and variables: `VITE_NATS_CREDS`, `VITE_NATS_URL` and `VITE_KV_BUCKET`.
3. Make the repository public, and set Settings, Pages, Source to **GitHub Actions**.
4. Run the real-device checklist.

Until step 2 is done, the deploy stops early with an error that names the missing setting.

[`infra/nats/README.md`](infra/nats/README.md) has the detail: production NATS setup, the permission probe, the accepted risks of the public browser credential, the runbook and the real-device checklist.

## Where things are

| Path | What is in it |
|---|---|
| `src/` | The game: screens in `src/app/screens`, components in `src/ui`, NATS in `src/net`, crypto in `src/crypto` |
| `engine/` | The Rust game rules. `just wasm` builds them to `src/engine/engine.wasm` |
| `infra/nats/` | Local NATS, the bucket setup and the production runbook |
| `e2e/`, `tests/integration/` | Playwright tests and NATS integration tests |
| `justfile` | Every task. Run `just` to list them |
