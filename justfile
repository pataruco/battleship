# Tasks for the sea-battle PWA. Run "just" to list them; "just setup" prepares a fresh clone.

set shell := ["bash", "-euo", "pipefail", "-c"]
set positional-arguments

compose := "docker compose -f infra/nats/docker-compose.yml"
nats_admin := env("NATS_URL", "nats://admin:admin-dev@localhost:4222")

[private]
default:
    @{{ quote(just_executable()) }} --justfile {{ quote(justfile()) }} --list --unsorted

# Create .env and install dependencies (fresh clone)
[group("setup")]
setup: env install

# Copy .env.example to .env unless .env already exists
[group("setup")]
env:
    @[ -e .env ] || { cp .env.example .env && echo "created .env from .env.example"; }

# Install JavaScript dependencies exactly as locked
[group("setup")]
install:
    pnpm install --frozen-lockfile

# Download the Playwright browsers (CI passes --with-deps)
[group("setup")]
playwright-install *ARGS:
    pnpm exec playwright install "$@" chromium webkit

# Check that the required tools are installed
[group("setup")]
doctor:
    #!/usr/bin/env bash
    set -u
    missing=0
    ok() { printf "  ok       %s\n" "$1"; }
    bad() { printf "  MISSING  %s\n" "$1"; missing=1; }
    for tool in node pnpm cargo rustc docker nats jq; do
      if command -v "$tool" >/dev/null 2>&1; then ok "$tool"; else bad "$tool"; fi
    done
    if command -v node >/dev/null 2>&1; then
      if node -e "process.exit(+process.versions.node.split(/[.]/)[0] >= 24 ? 0 : 1)"; then ok "node 24 or newer"; else bad "node 24 or newer (found $(node --version))"; fi
    fi
    if command -v docker >/dev/null 2>&1; then
      if docker compose version >/dev/null 2>&1; then ok "docker compose"; else bad "docker compose (the Compose v2 plugin)"; fi
    fi
    # Works with or without rustup: ask rustc where the target libraries would live.
    if command -v rustc >/dev/null 2>&1; then
      libdir="$(rustc --print target-libdir --target wasm32-unknown-unknown 2>/dev/null || true)"
      if [ -n "$libdir" ] && ls "$libdir"/libcore-*.rlib >/dev/null 2>&1; then
        ok "rust target wasm32-unknown-unknown"
      else
        bad "rust target wasm32-unknown-unknown (run: rustup target add wasm32-unknown-unknown)"
      fi
    fi
    if [ "$missing" -eq 0 ]; then echo "All required tools found."; else echo "Install what is marked MISSING, then run: just doctor" >&2; fi
    exit "$missing"

# Dev server at http://localhost:5173/battleship/ (run nats-up first)
[group("dev")]
dev *ARGS: env wasm
    pnpm exec vite "$@"

# Start local NATS in Docker, wait for it and create the bucket
[group("dev")]
nats-up:
    {{ compose }} up -d
    bash infra/nats/wait.sh
    bash infra/nats/provision.sh

# Stop local NATS
[group("dev")]
nats-down:
    {{ compose }} down

# Compile the Rust engine to src/engine/engine.wasm
[group("build")]
wasm:
    node scripts/build-wasm.mjs

# Production build into dist/: wasm, typecheck, vite build. Never creates .env
[group("build")]
build: wasm typecheck
    pnpm exec vite build

# Serve dist/ at http://localhost:4173/battleship/
[group("build")]
preview:
    pnpm exec vite preview --port 4173

# Re-render the PNG icons from public/icons/icon.svg (needs playwright-install)
[group("build")]
icons:
    node scripts/icons.mjs

# Type-check with tsc
[group("test")]
typecheck:
    pnpm exec tsc --noEmit

# Unit tests (Vitest)
[group("test")]
test *ARGS: wasm
    pnpm exec vitest run --project unit "$@"

# Rust engine tests
[group("test")]
test-rust:
    cargo test --manifest-path engine/Cargo.toml

# Integration tests against local NATS (run nats-up first)
[group("test")]
test-int *ARGS: wasm _nats-ready
    pnpm exec vitest run --project integration "$@"

# End-to-end tests in Chromium and WebKit; builds and previews on port 4173 (run nats-up first)
[group("test")]
e2e *ARGS: env _nats-ready
    pnpm exec playwright test "$@"

# Permission probe against a real server: just probe wss://connect.ngs.global:443 ./browser.creds
[group("test")]
probe URL CREDS:
    PROBE_NATS_URL={{ quote(URL) }} PROBE_CREDS={{ quote(join(invocation_directory(), CREDS)) }} pnpm exec vitest run --project integration tests/integration/permissions.test.ts

# Fails fast with a hint when local NATS is down or has no bucket
_nats-ready:
    @nats --server {{ quote(nats_admin) }} --timeout 2s kv info bship_games >/dev/null 2>&1 || { echo "Local NATS is not up, or has no bship_games bucket. Run: just nats-up" >&2; exit 1; }
