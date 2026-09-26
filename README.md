# Orbweaver

A self-hosted, agent-native AI roleplay chat platform — a ground-up rebuild of an earlier codebase of
ours, rewritten so the architecture is enforced rather than documented.

**Status: active development.** The rebuild IS the live line (`main`); the pre-rollback code survives
as the `legacy-main` branch, reference-only. Orbweaver keeps what worked in the previous codebase (the
per-feature template) and rebuilds the rest so the **file structure is self-documenting** and the
**boundaries are physics, not lint**. Mutable work lives in
[Orbweaver Project 1](https://github.com/users/Inktomi93/projects/1).

## Run it

Pick one path. Each serves the app at <http://localhost:8788>.

### Docker (Linux, macOS, Windows)

```bash
git clone https://github.com/Inktomi93/orbweaver && cd orbweaver
docker compose up -d --build
```

Open <http://localhost:8788>. There is no login: the port is published on this machine only, and you are the owner. [`docker/README.md`](docker/README.md) covers login modes, LAN and HTTPS, tunnels, secrets and backups.

### From source

Install Git, then pnpm, then Node 26 through pnpm:

```bash
curl -fsSL https://get.pnpm.io/install.sh | sh -    # Linux, macOS
pnpm runtime set node 26 -g
```

```powershell
Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression    # Windows PowerShell
pnpm runtime set node 26 -g
```

If Windows Defender blocks the pnpm binary, run `winget install -e --id pnpm.pnpm` instead. Then, on every platform:

```bash
git clone https://github.com/Inktomi93/orbweaver && cd orbweaver
pnpm install
pnpm start
```

The first `pnpm start` in a terminal asks for the port and who uses the app, and saves the answers in `.env`. It builds the client bundle when needed, runs the server in this terminal, and opens the app in your default browser once the server answers. Set `OPEN_BROWSER=off` in `.env` to keep the browser closed. Ctrl-C stops the server. With no terminal (a service, CI, piped input) it asks nothing, opens nothing and starts on the defaults. `pnpm start --port 9000` uses another port for one run.

On Windows, double-click `start.cmd` in the checkout after `pnpm install`. It runs `pnpm start` in its own console window and keeps the window open when the start fails, so you can read why. In a terminal, use PowerShell or Windows Terminal: under Git Bash's own terminal node sees no TTY, so setup asks nothing. The macOS and Windows boots are not yet verified on real hardware.

### Who can sign in

| Choice | How | What happens |
| - | - | - |
| Just me (default) | nothing | No login. The server listens on this machine only, and you are the owner. |
| People on my network | `pnpm start --setup`, then "people on my network" | Password login on every interface. The first visit from this machine sets the owner's password. Setup prints the addresses to open. |
| Single sign-on | `AUTH_MODE=oidc` or `AUTH_MODE=forward-header` in `.env` | "Login modes" in [`docker/README.md`](docker/README.md) lists the keys. Leave `AUTH_FALLBACK` and `AUTH_FALLBACK_TRUSTED_PEERS` out of `.env`: the app refuses them there and resolves them from the mode. |

In Docker, a login mode takes three lines, because the shipped defaults grant the no-login owner: `AUTH_MODE` (`local`, `oidc` or `forward-header`), `AUTH_FALLBACK=deny` and an empty `AUTH_FALLBACK_TRUSTED_PEERS=`. Put them in `docker/orbweaver.local.env`, or in the `environment:` block as step 1 of "LAN and HTTPS" in [`docker/README.md`](docker/README.md) shows. The first `local` boot prints the password (`docker compose logs orbweaver`).

A device on your network signs in over plain http, so the password and the session cookie travel in clear; the login screen says so. Put HTTPS in front when you can. An IP address and `http://<this machine>.local:8788` work as is; add any other name to `ALLOWED_HOSTS` in `.env`. Under WSL2, turn on mirrored networking (`networkingMode=mirrored` in `.wslconfig`, Windows 11) so other devices reach the app.

### Share over the internet

- `pnpm share` runs one launch with a password login and a public link, which the log prints. The server downloads a pinned `cloudflared` on the first share. `.env` is not changed.
- For a lasting address, run a tunnel: `tailscale serve --bg 8788`, or `cloudflared tunnel run --token <token>` with a public hostname whose service is `http://localhost:8788`. The recipes are in [`docker/README.md`](docker/README.md).
- Never forward a router port. Never put a proxy or tunnel in front of "just me": a relayed request is never the owner, so it answers 401.

### Back up your data

Everything the app keeps is in `data/`, or wherever `DATA_DIR` points. Stop the app, copy `data/` except `data/cache/`, and start it again. `data/secrets/` holds `credentials_key` (it decrypts saved provider keys) and `session_secret` (the pepper for passwords and sign-ins); a database restored without them cannot read its keys or sign anyone in, and boot refuses and names the file. Before a boot applies new migrations, it copies the database to `data/backups/`. Migrations only go forward: to roll back, stop the app, put a backup in place of `data/db/orbweaver.db`, delete the `-wal` and `-shm` files beside it, and start the older checkout.

### Work on the code

`pnpm dev` runs the watched server and the vite client from source in this terminal; open <http://localhost:5173>. The server restarts on a source change, and Ctrl-C stops both. The checks (`pnpm check`, the test harness) need Linux or WSL2. `pnpm stack up` runs the same dev stack detached, and `pnpm stack down` stops it.

## Read first

- **`docs/law/Constitution.md`** — the cold-start reading router and current architecture map.
- **`docs/law/Core-0-Architecture-and-Structure.md`** — the constitution: package layout, server tiers, per-feature
  template, central test mirror, the partitioning rule, and the 13 enforcement gates.

## Core bets

1. **pnpm workspace packages** — the layer cake is resolver-enforced (tier-1), not just linted.
2. **`#` subpath imports intra-package, package deps cross-package, zero `paths` aliases.**
3. **Name by role; no `_shared` junk drawers** — services are features, primitives are `kit`.
4. **One central `tests/` tree mirroring `src` 1:1** — agent-enforceable, clean src.

The guiding constraint: **you (and agents) should be able to derive where anything lives, and what
may import what, from the tree alone.**

## Develop

Install pnpm and Node 26 as "From source" under "Run it" says. Any pnpm works: inside this repo it runs the version `package.json` pins. Every dependency version lives in the `catalog:` of `pnpm-workspace.yaml`; a `package.json` names only `catalog:` or `workspace:*`.

```bash
pnpm install                               # deps (hard-linked from pnpm's global store) + git hooks (lefthook, via `prepare`)
pnpm exec playwright install chromium      # once: the browser build the component and e2e tests run in
pnpm check                                 # biome lint + tsc typecheck across all packages
```

On Linux, `pnpm exec playwright install --with-deps chromium` also installs the browser's system libraries.

**Worktrees just work** — without a symlink hack. Each `git worktree` gets its
OWN `node_modules` (correct when branches carry different deps; fast via the shared global store). In a
fresh worktree:

```bash
pnpm run worktree:bootstrap   # pnpm install (deps + hooks) + link .env from the main checkout
```

Hooks live in the shared common gitdir, so they fire in every worktree automatically once its deps are
installed; every hook/check script resolves the worktree root via `git rev-parse` (no hardcoded paths).
External versions are centralized in the pnpm **catalog** (`pnpm-workspace.yaml`).

## Versioning + releases

Every running Orbweaver reports ONE identity block — `{ version, commit, short, builtAt?, source }` — in
four places, so a bug report can always say what it is running:

| Where | What it shows |
| - | - |
| **Settings → Admin → About this install** | `v0.0.0 (823d76f4343a, checkout)` + a Copy button, and a manual "Check for updates" |
| `GET /healthz` | the same block on every arm, 200 and 503 alike |
| the boot log's FIRST line | `boot: orbweaver v0.0.0 (823d76f4343a, checkout)` |
| a captured bug report (`pnpm bug:reports`) | the first header field of the bundle |

`version` is the ROOT `package.json` version — the number a release bumps. `commit` is read from `.git`'s
plain ref files at boot (no git binary, no child process); a container image has no `.git`, so the build
stamps `/app/version.json` instead and the reader prefers it. When neither can answer, the commit reads
`unknown` — never a fabricated sha. There is no `dirty` flag: it cannot be derived without git, and a
field that is always `false` would lie exactly when it matters.

**Cutting a release:**

```bash
pnpm version minor        # (or patch/major) — bumps the root package.json AND creates the v<version> tag
git push origin main --follow-tags
```

Push the tag, then write the changelog on GitHub's release page for that tag — that page is the
changelog's one home; nothing in this repository duplicates it.

**Checking for updates** is manual and one-shot: the About section's button performs a single
unauthenticated `GET https://api.github.com/repos/Inktomi93/orbweaver/commits/main` through the app's
SSRF-safe egress belt, compares that sha to this build's, and reports `up to date` / `update available` /
`couldn't check` + why. No polling, no timer, no persisted state, and nothing about your deployment is
sent anywhere.
