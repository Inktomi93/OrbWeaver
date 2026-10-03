# Orbweaver

**Roleplay with your friends in the same scene, live.**

Orbweaver is a self-hosted AI roleplay app with real-time multiplayer: several people and several characters
in one live scene. Invite friends in, turn any story into a game, and keep chats that remember what happened
a hundred messages ago. It runs on your own machine, and your characters, chats and keys stay there. It is an
alpha.

**The [Orbweaver wiki](https://github.com/Inktomi93/orbweaver/wiki) is the user guide:** install, connecting a
model, your first chat, and every feature below.

## What it does

- **Play together.** Invite friends into a room. Everyone takes turns, the characters answer all of you, and
  every device you sign in on stays live. ([Share with friends](https://github.com/Inktomi93/orbweaver/wiki/Share-with-Friends))
- **Turn any story into a game.** One switch adds stats, relationships, quests, inventory and a journal that
  the story keeps up to date, with optional D20 rules. ([RPG mode](https://github.com/Inktomi93/orbweaver/wiki/RPG-Mode))
- **Stories that remember.** Rolling summaries keep long chats coherent, and old moments come back by meaning
  and by keyword. ([How memory works](https://github.com/Inktomi93/orbweaver/wiki/How-Memory-Works))
- **Your library.** Browse characters as a map of similar cards, search by description, and improve cards with
  the Refinery. ([Refinery](https://github.com/Inktomi93/orbweaver/wiki/Refinery))
- **Plugins and themes.** Sandboxed plugins that show what they want before they run, and themes down to the
  backdrop and type. ([Plugins](https://github.com/Inktomi93/orbweaver/wiki/Plugins), [Themes](https://github.com/Inktomi93/orbweaver/wiki/Themes))
- **Coming from SillyTavern.** One import brings your characters, chats, personas, presets, lorebooks and
  themes, and reports anything it skipped. ([Coming from SillyTavern](https://github.com/Inktomi93/orbweaver/wiki/Coming-from-SillyTavern))

Orbweaver ships no language model. Paste an API key (OpenRouter, Anthropic and others) or point it at a model
server you already run, such as Ollama, KoboldCpp, LM Studio or vLLM.
([Connect a model](https://github.com/Inktomi93/orbweaver/wiki/Connect-a-Model))

## Run it

Pick one path. Each serves the app at <http://localhost:8788>. Both install the latest stable release from
the `release` branch; `main` is the development line.

### Docker (Linux, macOS, Windows)

```bash
git clone --branch release https://github.com/Inktomi93/orbweaver && cd orbweaver
docker compose up -d
```

Open <http://localhost:8788>. There is no login: the port is published on this machine only, and you are the owner. Compose pulls the published release image, so there is no build step; [`docker/README.md`](docker/README.md) shows how to build from the checkout instead. The app starts its plugin watchdog and isolated broker as child processes inside the container. [`docker/README.md`](docker/README.md) also covers updates, login modes, LAN and HTTPS, tunnels, secrets and backups.

### From source

Install Git, then pnpm. pnpm fetches the Node version this repo pins by itself, so there is no Node to install:

```bash
curl -fsSL https://get.pnpm.io/install.sh | sh -    # Linux, macOS
```

```powershell
Invoke-WebRequest https://get.pnpm.io/install.ps1 -UseBasicParsing | Invoke-Expression    # Windows PowerShell
```

If Windows Defender blocks the pnpm binary, run `winget install -e --id pnpm.pnpm` instead. Then, on every platform:

```bash
git clone --branch release https://github.com/Inktomi93/orbweaver && cd orbweaver
pnpm install
pnpm start
```

To update, stop the app, then `git pull`, `pnpm install` and `pnpm start` again.

The first `pnpm start` in a terminal asks for the port and who uses the app, and saves the answers in `.env`. It builds the client bundle when needed, runs the server in this terminal, and opens the app in your default browser once the server answers. Set `OPEN_BROWSER=off` in `.env` to keep the browser closed. Ctrl-C stops the server. With no terminal (a service, CI, piped input) it asks nothing, opens nothing and starts on the defaults. Over SSH it opens no browser. `pnpm start --port 9000` uses another port for one run.

On Windows, double-click `start.cmd` in the checkout after `pnpm install`. It runs `pnpm start` in its own console window and keeps the window open when the start fails, so you can read why. In a terminal, use PowerShell or Windows Terminal: under Git Bash's own terminal node sees no TTY, so setup asks nothing. `.github/workflows/install.yml` runs these steps on fresh Linux, macOS and Windows runners, and the Docker steps on Linux, and waits for the server to answer. Native starts on every platform run plugins in a separate bounded broker below an RSS and heartbeat watchdog; the plugin broker's macOS and Windows boots are not yet verified on real hardware.

### Who can sign in

| Choice | How | What happens |
| - | - | - |
| Just me (default) | nothing | No login. The server listens on this machine only, and you are the owner. |
| Me and friends | `pnpm start --setup`, then "me and friends" | Password login on every interface. The first visit from this machine sets the owner's password. Setup prints the addresses to open, and the step that invites friends from outside your network. |
| Single sign-on | `AUTH_MODE=oidc` or `AUTH_MODE=forward-header` in `.env` | "Login modes" in [`docker/README.md`](docker/README.md) lists the keys. Leave `AUTH_FALLBACK` and `AUTH_FALLBACK_TRUSTED_PEERS` out of `.env`: the app refuses them there and resolves them from the mode. |

In Docker, a login mode takes three lines, because the shipped defaults grant the no-login owner: `AUTH_MODE` (`local`, `oidc` or `forward-header`), `AUTH_FALLBACK=deny` and an empty `AUTH_FALLBACK_TRUSTED_PEERS=`. Put them in `docker/orbweaver.local.env`, or in the `environment:` block as step 1 of "LAN and HTTPS" in [`docker/README.md`](docker/README.md) shows. The first `local` boot prints the password (`docker compose logs orbweaver`).

A device on your network signs in over plain http, so the password and the session cookie travel in clear; the login screen says so. Put HTTPS in front when you can. An IP address and `http://<this machine>.local:8788` work as is; add any other name to `ALLOWED_HOSTS` in `.env`. Under WSL2, turn on mirrored networking (`networkingMode=mirrored` in `.wslconfig`, Windows 11) so other devices reach the app.

### Share over the internet

- `pnpm share` runs one launch with a password login and a public link, which the log prints. The server downloads a pinned `cloudflared` on the first share. `.env` is not changed.
- After "me and friends", sign in as the owner and press Start sharing in Settings → Admin → Multi-user. It downloads the same pinned `cloudflared` into `data/cache/relay/` and gives you a public link to send. Docker never asks the setup questions: set the three login lines above, then press Start sharing the same way.
- For a lasting address, run a tunnel: `tailscale serve --bg 8788`, or `cloudflared tunnel run --token <token>` with a public hostname whose service is `http://localhost:8788`. The recipes are in [`docker/README.md`](docker/README.md).
- Never forward a router port. Never put a proxy or tunnel in front of "just me": a relayed request is never the owner, so it answers 401.

### Back up your data

Everything the app keeps is in `data/`, or wherever `DATA_DIR` points. Stop the app, copy `data/` except `data/cache/`, and start it again. `data/secrets/` holds `credentials_key` (it decrypts saved provider keys) and `session_secret` (the pepper for passwords and sign-ins); a database restored without them cannot read its keys or sign anyone in, and boot refuses and names the file. Before a boot applies new migrations, it copies the database to `data/backups/`. Migrations only go forward: to roll back, stop the app, put a backup in place of `data/db/orbweaver.db`, delete the `-wal` and `-shm` files beside it, and start the older checkout.

## Work on the code

Everything below is for contributors. Orbweaver's code is written mostly by AI agents, so its architecture is
enforced by the toolchain rather than documented. Development happens on `main`; clone it without
`--branch release`.

`pnpm dev` runs the watched server and the Vite client from source on Linux, macOS and Windows; open <http://localhost:5173>. The server restarts on a source change, and Ctrl-C stops both. `pnpm stack up` runs the same dev stack detached, and `pnpm stack down` stops it. See [CONTRIBUTING.md](CONTRIBUTING.md) for checks and native platform evidence.

## Read first

- **`docs/law/Constitution.md`** — the cold-start reading router and current architecture map.
- **`docs/law/Core-0-Architecture-and-Structure.md`** — the constitution: package layout, server tiers, per-feature
  template, central test mirror, the partitioning rule, and the enforcement gates.

## Core bets

1. **pnpm workspace packages** — the layer cake is resolver-enforced (tier-1), not just linted.
2. **`#` subpath imports intra-package, package deps cross-package, zero `paths` aliases.**
3. **Name by role; no `_shared` junk drawers** — services are features, primitives are `kit`.
4. **One central `tests/` tree mirroring `src` 1:1** — agent-enforceable, clean src.

The guiding constraint: **you (and agents) should be able to derive where anything lives, and what
may import what, from the tree alone.**

## Develop

Install Git and pnpm as "From source" under "Run it" says. On Windows, install Git for Windows with Git Bash available to the hooks. Inside this repo, pnpm runs the package manager and Node versions pinned in `package.json`. Every dependency version lives in the `catalog:` of `pnpm-workspace.yaml`; a `package.json` names only `catalog:` or `workspace:*`.

```bash
pnpm install                               # deps (hard-linked from pnpm's global store) + git hooks (lefthook, via `prepare`)
pnpm runtime set node 26 -g                 # Node on PATH for Git hooks that invoke it directly
pnpm exec playwright install chromium      # once: the browser build the component and e2e tests run in
pnpm check                                 # biome lint + tsc typecheck across all packages
```

On Linux, `pnpm exec playwright install --with-deps chromium` also installs the browser's system libraries.

The contributor commands use native Node on macOS and Windows; WSL2 is optional. The manual [contributor workflow](.github/workflows/contributor.yml) proves a fresh install, `pnpm dev`, Snap, `pnpm check` and a fixed component test on native runners. Read its completed artifacts before claiming native contributor parity; those results are still required.

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

There are two channels. `main` is integration and development: lanes, hooks and worktrees all work against
it. The `release` branch is stable: release-please versions it from conventional commits, and every stable
release is a `v<version>` tag, a GitHub Release with its notes, and a `ghcr.io/inktomi93/orbweaver` image.
Below 1.0, a `feat` commit bumps the minor version and a `fix` the patch; a breaking change also bumps only
the minor. The first release is v0.1.0.

Every running Orbweaver reports ONE identity block — `{ version, commit, short, builtAt?, source, channel }` —
in four places, so a bug report can always say what it is running:

| Where | What it shows |
| - | - |
| **Settings → Admin → About this install** | the version line + a Copy button, and a manual "Check for updates" |
| `GET /healthz` | the same block on every arm, 200 and 503 alike |
| the boot log's FIRST line | `boot: orbweaver <version line>` |
| a captured bug report (`pnpm bug:reports`) | the first header field of the bundle |

The version line is `v0.1.0` for a stable release and `0.1.0-dev+823d76f4343a` for anything else. `version`
is the ROOT `package.json` version. `commit` is read from `.git`'s plain ref files at boot (no git binary,
no child process); a container image has no `.git`, so the build stamps `/app/version.json` instead and the
reader prefers it. When neither can answer, the commit reads `unknown` — never a fabricated sha. A build is
`stable` only when its commit is the commit its own `v<version>` tag names, so a checkout or image of the
release tag is stable and everything else, including `main`, is a dev build. There is no `dirty` flag: it
cannot be derived without git, and a field that is always `false` would lie exactly when it matters.

**Shipping a stable release** (`.github/workflows/release.yml`, `release-please-config.json`):

1. Promote `main`: open a pull request from `main` into `release` on GitHub and merge it with a merge commit.
2. The push to `release` runs release-please, which opens or updates the release PR: the next version, the
   root `package.json` bump, and the release notes built from the conventional commits since the last
   release.
3. Merge the release PR. The same workflow tags `v<version>`, publishes the GitHub Release, builds the image
   from the tag, checks that it reports itself as that stable release, and pushes `:<version>` and `:latest`.
4. Merge `release` back into `main`, so dev builds report the new version (`0.2.0-dev+<commit>`).

The GitHub Release page is the changelog's one home; nothing in this repository duplicates it.

**Checking for updates** is manual and one-shot. The About section's button sends a single unauthenticated
GET through the app's SSRF-safe egress belt and reports `up to date`, `update available`, or `couldn't
check` with the reason. A stable build asks for the latest GitHub Release
(`https://api.github.com/repos/Inktomi93/orbweaver/releases/latest`) and compares versions; a dev build asks
for main's head (`https://api.github.com/repos/Inktomi93/orbweaver/commits/main`) and compares commits. No
polling, no timer, no persisted state, and nothing about your deployment is sent anywhere.
