# Dev Container — Claude Code Sandbox for orbweaver

An isolated Linux container where Claude Code runs in **permissive mode**
(`--dangerously-skip-permissions`) safely. The container is the security boundary:
non-root user + a default-deny egress firewall mean an agent with no prompts still
can't escape the box or phone home.

This is **only a coding sandbox**. The GPU/vLLM + local-light model stack runs on the
**host** (the `.models/` weights + `scripts/dev`); the container sets `VLLM_DISABLED=1`
and the local-light suites skip when weights are absent — by design (the firewall also
blocks HuggingFace downloads).

Ported from neo-tavern's sandbox with one load-bearing fix — see "pnpm store" below.

---

## Quick start

### VS Code (daily driver)
1. `code .` (open orbweaver), or open the folder in VS Code.
2. Bottom-left `><` → **Reopen in Container** (first build ~a few min; after that it's fast).
3. Open the integrated terminal → you're `node@…` in `/workspace`.
4. **First time only:** run `claude`, then `/login`, and paste the browser code (Max sub).
   This lands in the container's own `~/.claude` volume and persists — do it once.
5. Run it permissive: `claude --dangerously-skip-permissions`

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

---

## Daily workflow

- **Code + checks run IN the container:** `pnpm check`, `pnpm test`, `pnpm dev`, etc.
  Deps live in isolated `node_modules` volumes (see below).
- **`git push` from the HOST**, not the container. No SSH keys are mounted inside (by
  design — credentials stay on the host, never exposed to a permissive sandbox).
  You can still `git commit` inside; just push from a host terminal.
- **Models/vLLM run on the HOST.** In-container, `VLLM_DISABLED=1` and the local-light
  int suites self-skip. The firewall allows traffic to the host network, so a service
  the host exposes on its LAN address is reachable if you ever need it.
- **After editing any file in this folder**, rebuild:
  ```bash
  npx @devcontainers/cli up --remove-existing-container --workspace-folder .
  ```

---

## What's in here

| File | Purpose |
|------|---------|
| `devcontainer.json` | Container definition: image build, mounts, run args, lifecycle commands, container-only VS Code settings. |
| `Dockerfile` | The sandbox image: `node:24` + Claude Code + ast-grep + pnpm (corepack) + git/gh/delta/zsh/iptables + the baked Playwright Chromium. |
| `init-firewall.sh` | Default-deny egress firewall. Runs on every start (`postStartCommand`). Allowlists only what dev needs (npm, GitHub, Anthropic, VS Code); self-tests at the end. |

---

## The pnpm store (why this is simpler than neo's)

The repo is bind-mounted, so host and container would otherwise fight over
`node_modules` (pnpm stamps its store path in `.modules.yaml`; two different stores ⇒
the "store has changed, purge?" prompt every time you switch sides). The cure is the
standard one: **named volumes overlay every `node_modules`** — the root + all six
`packages/*/node_modules` — so nothing pnpm writes touches the host folder.

The store itself must share a device with those volumes (hardlinks), and pnpm 11's
per-device fallback would otherwise probe the bind-mounted `/workspace` and dump a
`.pnpm-store` into the host repo. Neo solved that with a `/usr/local/sbin/pnpm` wrapper
that injected `--store-dir` per store-touching subcommand — fragile (any subcommand
missing from its case list silently used the wrong store; `--store-dir` passed globally
breaks `run`/`exec` outright).

**Orb doesn't carry the wrapper.** pnpm 11 ignores `npm_config_store_dir` and the
user-level rc files for `store-dir`, but it honors the **pnpm-prefixed env var** —
`pnpm_config_store_dir` — verified empirically on pnpm 11.5.1. One `containerEnv` line
points every pnpm invocation (hooks, lifecycle commands, scripts) at the store volume,
with no subcommand list to rot. If a future pnpm major changes env-config handling,
re-verify with `pnpm store path` inside the container; the symptom of regression is a
`.pnpm-store/` appearing at the repo root on the host.

## Volumes

Per-project named volumes (survive rebuilds; wipe to reset):

```bash
docker volume rm \
  orbweaver-node_modules orbweaver-kit-node_modules orbweaver-contracts-node_modules \
  orbweaver-db-node_modules orbweaver-server-node_modules orbweaver-ui-node_modules \
  orbweaver-client-node_modules orbweaver-pnpm-store
```

Plus the per-container `claude-code-config-*` (login/settings) and
`claude-code-bashhistory-*` volumes.

## Separation of concerns

| Purpose | Where Claude writes code | How orbweaver's model stack runs |
|---------|--------------------------|----------------------------------|
| Sandbox (this folder) | in the container, firewalled | not here — `VLLM_DISABLED=1` |
| GPU/vLLM + local-light | — | on the host (`scripts/dev`, `.models/`) |
