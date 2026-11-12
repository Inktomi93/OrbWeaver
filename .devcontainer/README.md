# Dev Container — Claude Code Sandbox for orbweaver

An isolated Linux container where Claude Code runs in **permissive mode**
(`--dangerously-skip-permissions`), as a non-root user behind a default-deny egress firewall. The point of
the sandbox is to run without prompts (owner ruling). The ruling has no egress proxy, so the firewall
stops accidental egress, not a steered agent: see "What the firewall stops".

This is **only a coding sandbox**. The GPU/vLLM + local-light model stack runs on the
**host** (the `.models/` weights; the vLLM launcher lives outside this repo); in the container the
local-light suites skip when weights are absent — by design (the firewall also blocks HuggingFace
downloads).

Ported from neo-tavern's sandbox with one load-bearing fix — see "pnpm store" below.

---

## Quick start

### VS Code (daily driver)

1. `code .` (open orbweaver), or open the folder in VS Code.
2. Bottom-left `><` → **Reopen in Container** (first build ~a few min; after that it's fast).
3. Open the integrated terminal → you're `node@…` in `/workspace`.
4. **First time only:** run `claude`, then `/login`, and paste the browser code (Max sub).
   This lands in the container's own `~/.claude` volume and persists — do it once.
5. Run it permissive: `claude --dangerously-skip-permissions` (a bare `claude` is the same thing:
   `postCreateCommand` seeds the container's own `~/.claude/settings.json` with
   `defaultMode: bypassPermissions` and pre-accepts the one-time bypass dialog).

### Pure CLI (no VS Code)

```bash
cd development/orbweaver
npx @devcontainers/cli up --workspace-folder .            # build + start
npx @devcontainers/cli exec --workspace-folder . zsh      # shell inside
# inside:
claude --dangerously-skip-permissions
```

Or attach to a running container directly: `docker exec -it <id> zsh`
(`docker ps --filter label=devcontainer.local_folder=$PWD`).

The host launcher does all of the above in one shot: `pnpm sandbox` (see `scripts/dev/sandbox.sh`).
Bypass is CONTAINER-ONLY: the committed project `.claude/settings.json` pins no permission mode, so
host sessions keep whatever the host user settings say.

---

## Daily workflow

- **Code + checks run IN the container:** follow [CONTRIBUTING.md](../CONTRIBUTING.md) for native checks and scoped tests. Start the dev stack with `pnpm dev`.
  Deps live in isolated `node_modules` volumes (see below).
- **`git push` from the HOST**, not the container. No SSH keys are mounted inside (by
  design — credentials stay on the host, never exposed to a permissive sandbox).
  You can still `git commit` inside; just push from a host terminal.
- **Models/vLLM run on the HOST.** In-container there is no GPU, and the local-light
  int suites self-skip. The sandbox reaches no host service (see "Host services").
- **After editing any file in this folder**, rebuild:
  ```bash
  npx @devcontainers/cli up --remove-existing-container --workspace-folder .
  ```

---

## What's in here

| File | Purpose |
| - | - |
| `devcontainer.json` | Container definition: image build, mounts, run args, lifecycle commands, container-only VS Code settings. |
| `Dockerfile` | The sandbox image: `node:26` + Claude Code + ast-grep + pnpm + git/gh/delta/zsh/iptables + the baked Playwright Chromium. |
| `tools/package.json`, `tools/package-lock.json` | Exact coding-tool versions and integrity-locked dependencies, installed with `npm ci`. The pnpm version matches the repository's `packageManager`. |
| `init-firewall.sh` | Default-deny egress firewall. Runs on every start (`postStartCommand`). It drops first and builds the allowlist under that policy, so a failure or a re-run never leaves egress open. It admits HTTPS to the allowlist (npm, GitHub, Anthropic, VS Code), ssh only to GitHub's git ranges and DNS only to the resolvers in the container's `/etc/resolv.conf`, and no host port; self-tests at the end. |
| `zshrc` | The shell setup, copied to `~/.zshrc`: Debian's zsh and fzf, history on the `/commandhistory` volume, and a prompt with the git branch. The build fetches no shell framework. |

---

## What the firewall stops

`init-firewall.sh` admits traffic by address and port. `tests/tooling/container-security-config.int.test.ts` runs the real script and fails when it admits any other rule.

It stops:

- a connection to an address off the allowlist, on any port;
- a connection to the allowlisted addresses on a port other than 443, or 22 for GitHub's git ranges;
- DNS to a resolver other than the ones `/etc/resolv.conf` names;
- every connection to or from a host port;
- IPv6, apart from loopback.

It does not stop:

- **A request to another site on a shared content network.** The allowlist holds addresses that content networks share across their customers. A connection to one of npm's Cloudflare addresses that names another Cloudflare site reaches that site.
- **Data leaving inside DNS lookups.** The resolvers are recursive. A lookup of a name under an attacker's domain reaches that domain's server, with the data in the name.

So the session credentials in `/home/node/.claude` are not protected from an agent steered by content it fetched: one `curl` or a few `dig` lookups carry them out, with no credential of the attacker's. A file the agent writes into the bind-mounted `/workspace` also runs on the host the next time the owner runs it there, outside the firewall. The owner ruled for no egress proxy and accepts both.

## Host services

The firewall admits no host port in either direction. The sandbox needs none: VS Code and the devcontainers CLI reach the container through `docker exec`, and DNS has its own rule.

To reach one service the host runs, such as a model server, add one rule to step 7 of `init-firewall.sh` for its port on the bridge gateway (`ip route` shows it as the default route), then rebuild:

```bash
iptables -A OUTPUT -p tcp -d "$(ip route | awk '$1 == "default" {print $3}')" --dport <port> -j ACCEPT
```

The service must listen on all interfaces. Add the rule to the closed list in `tests/tooling/container-security-config.int.test.ts` in the same change.

## The pnpm store (why this is simpler than neo's)

The repo is bind-mounted, so host and container would otherwise fight over
`node_modules` (pnpm stamps its store path in `.modules.yaml`; two different stores ⇒
the "store has changed, purge?" prompt every time you switch sides). The cure is the
standard one: **named volumes overlay every `node_modules`**: the root and every importer that the
`packages:` globs of `pnpm-workspace.yaml` select, so nothing pnpm writes touches the host folder.
`tests/tooling/container-security-config.int.test.ts` reads those globs and fails when an importer has no
volume in `devcontainer.json` or no mount point in the `Dockerfile`.

The store itself must share a device with those volumes (hardlinks), and pnpm's
per-device fallback would otherwise probe the bind-mounted `/workspace` and dump a
`.pnpm-store` into the host repo. Neo solved that with a `/usr/local/sbin/pnpm` wrapper
that injected `--store-dir` per store-touching subcommand — fragile (any subcommand
missing from its case list silently used the wrong store; `--store-dir` passed globally
breaks `run`/`exec` outright).

**Orb doesn't carry the wrapper.** pnpm ignores `npm_config_store_dir` and the
user-level rc files for `store-dir`, but it honors the **pnpm-prefixed env var**,
`pnpm_config_store_dir` (checked with `pnpm store path` on pnpm 12.6.0). One `containerEnv` line
points every pnpm invocation (hooks, lifecycle commands, scripts) at the store volume,
with no subcommand list to rot. If a future pnpm major changes env-config handling,
re-verify with `pnpm store path` inside the container; the symptom of regression is a
`.pnpm-store/` appearing at the repo root on the host.

## Volumes

Per-project named volumes survive rebuilds. Each name starts with the checkout folder's name (`orbweaver-` below). Stop the container, then wipe every one to reset:

> [!WARNING]
> Keep both filters anchored. A bare `name=orbweaver` filter also matches the app's own data volumes, such as `orbweaver_data`.

```bash
docker volume rm $(docker volume ls -q --filter 'name=^orbweaver-.*node_modules$' --filter 'name=^orbweaver-pnpm-store$')
```

Plus the per-container `claude-code-config-*` (login/settings) and
`claude-code-bashhistory-*` volumes.

## Separation of concerns

| Purpose | Where Claude writes code | How orbweaver's model stack runs |
| - | - | - |
| Sandbox (this folder) | in the container, firewalled | not here — no GPU |
| External model servers | — | Managed outside this repository and configured as app connections. |
