# Orbweaver

A self-hosted, agent-native AI roleplay chat platform — a ground-up rebuild of an earlier codebase of
ours, rewritten so the architecture is enforced rather than documented.

**Status: active development.** The rebuild IS the live line (`main`); the pre-rollback code survives
as the `legacy-main` branch, reference-only. Orbweaver keeps what worked in the previous codebase (the
per-feature template) and rebuilds the rest so the **file structure is self-documenting** and the
**boundaries are physics, not lint**. Mutable work lives in
[Orbweaver Project 1](https://github.com/users/Inktomi93/projects/1).

## Run it

**Docker (any OS, nothing else to install):**

```bash
git clone https://github.com/Inktomi93/orbweaver && cd orbweaver
docker compose up -d --build       # first run builds the image; `docker compose logs orbweaver` prints your login
```

Open <http://localhost:8788>, sign in, add an API key or point a connection at a model server you already run
(Ollama, KoboldCpp, LM Studio, vLLM, …). The full guide — login modes, LAN/HTTPS, your own vLLM, secrets,
the dev overlay — is [`docker/README.md`](docker/README.md).

**From source** (Node 26 + pnpm, any OS — see Develop below): run `pnpm install && pnpm start`. The first
run in a terminal asks for the port, who uses the app (just you, or people on your network) and how they
sign in, and saves the answers in `.env`; you never edit that file by hand. `pnpm start --setup` asks
again, offers your current answers, and changes only those settings. `pnpm start` then builds the client
bundle if it needs building and runs the production server in this terminal at <http://localhost:8788>;
Ctrl-C stops it. `pnpm start --port 9000` uses another port for one run without saving it. With no
terminal to ask in (a service, CI, piped input), it asks nothing, writes nothing and starts on the
defaults. "Just me" is the default: it has no login, so it listens on *this* machine only and you are the
owner here. `pnpm start` is plain Node — no bash, no `setsid` — and it runs the same thing the container
does (`NODE_ENV=production node packages/server/src/entry/index.ts`); its macOS and Windows boots are not
yet verified on real hardware.

**Other devices, and the internet.** Run `pnpm start --setup` and choose "people on my network": the
server then listens on every interface and people sign in with a password; the first visit from this
machine sets the owner's password. Setup prints the addresses to open from another device. The IP address
always works; the `<name>.local` address works where `.local` names resolve (macOS and most phones;
Windows and Linux may need mDNS support). Under WSL2, other devices cannot reach WSL's own address: turn on
mirrored networking (`networkingMode=mirrored` in `.wslconfig`, Windows 11) or forward the port from
Windows with `netsh interface portproxy add v4tov4 listenport=8788 connectport=8788 connectaddress=<WSL address>`.
A phone at `http://192.168.1.20:8788` can sign in over plain http, but the password and
the session cookie travel in clear on your network, and the login screen says so; put HTTPS in front when
you can. An IP address and this computer's own name (`http://<name>.local:8788`) work as is; any other name
(a tailnet or tunnel hostname) goes in `ALLOWED_HOSTS` in `.env`. The server refuses names it does not know,
so a web page cannot reach it through your browser. For the internet, never forward a router port: run a tunnel instead. `tailscale serve --bg 8788`
publishes the app to your tailnet over HTTPS, and `cloudflared tunnel run --token <token>` with a public
hostname whose service is `http://localhost:8788` publishes it through Cloudflare. Never put a proxy or
tunnel in front of single-user. The boot log states who can reach the box and who its owner is; the
tunnel recipes, including Tailscale identity instead of passwords, are in [`docker/README.md`](docker/README.md).

**Work on the code** (any OS): `pnpm install && pnpm dev` runs the watched server and the vite client
from source in this terminal. Open <http://localhost:5173>; the server listens on 8788, and `PORT` and
`VITE_PORT` in `.env` move them. The server restarts on a source change, and Ctrl-C stops both. `pnpm dev`
reads the same `.env` as the server, and when the server would refuse a setting, it stops before it starts
anything and names that setting. It is plain Node with no bash; its macOS and Windows runs are not yet verified on
real hardware. `pnpm stack up` is the maintainers' Linux supervisor for the same dev stack (`setsid`, `ss`, `/proc`).

**Back up your data (from source).** Everything the app keeps is in `data/` (or wherever `DATA_DIR` points):
`data/db/` holds the database, `data/assets/` your uploads, `data/users/` per-user runtime state, and
`data/secrets/` two secrets the server generates on first boot: `credentials_key`, the key that decrypts
saved provider keys, and `session_secret`, the pepper for passwords and sign-ins. `data/cache/` holds only
what the app regenerates (model weights, image variants, import staging) and can be left out. So the rule is
one sentence: stop the app, copy `data/` except `data/cache/`, start it again. To restore, stop the app and
put the copy back. A database restored without its `credentials_key` cannot read any saved provider key, and
without its `session_secret` no local password or sign-in works, so a boot that finds either file missing
while the database still depends on it refuses to start and names the file. A `data/` dir from an older
version is moved into this layout on the first boot, in place. Before a boot applies new database
migrations, the app also copies the database to `data/backups/orbweaver.db.backup-<stamp>`. It keeps the
five newest copies plus the newest of each of the last seven days that had one. `touch
data/backups/orbweaver.db.backup-<stamp>.keep` exempts a copy from that cleanup. Migrations only go forward,
so to roll back an update, stop the app, put a copy in place of `data/db/orbweaver.db`, delete the
`-wal`/`-shm` files beside it, and start the older checkout. Docker users: see [`docker/README.md`](docker/README.md).

**Run the checks on Linux or WSL2.** The test and check harness leans on `nice`, cgroup fencing and bash
hooks, so it is Linux-shaped. macOS can run the tests, `pnpm start` and `pnpm dev`; it cannot run
`pnpm stack`.

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

Requires **pnpm** and **Node 26**. Get both through pnpm, on any OS:

```bash
# 1. pnpm, which needs no Node to run
curl -fsSL https://get.pnpm.io/install.sh | sh -                                     # macOS, Linux
Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression  # Windows PowerShell
# 2. Node 26
pnpm runtime set node 26 -g
```

Any pnpm works: inside this repo it runs the version `package.json` pins. If Windows Defender blocks the
pnpm binary, `winget install -e --id pnpm.pnpm` or `npm install -g pnpm` installs it instead. Every
dependency version lives in the `catalog:` of `pnpm-workspace.yaml`; a `package.json` names only
`catalog:` or `workspace:*`.

```bash
pnpm install     # deps (hard-linked from pnpm's global store) + git hooks (lefthook, via `prepare`)
pnpm check       # biome lint + tsc typecheck across all packages
```

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
