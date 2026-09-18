# Orbweaver

The ground-up remake of **neo-tavern** — a self-hosted, agent-native AI roleplay chat platform
(SillyTavern-class, without SillyTavern's structural sins).

**Status: active development.** The rebuild IS the live line (`main`); the pre-rollback code survives
as the `legacy-main` branch, reference-only. Orbweaver keeps what worked from neo-tavern (the
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

**From source, Linux** (Node 26 + pnpm, see Develop below): `pnpm install && pnpm stack up` boots the dev
stack at <http://localhost:5173>. A production server from a checkout: `pnpm build` once, then
`AUTH_FALLBACK=owner pnpm stack start-fg prod` (single-user; settings go in `.env` — copy `.env.example`).
The `pnpm stack` supervisor is a Linux bash script (`setsid`, `ss`, `/proc`); on macOS or Windows use
Docker, or WSL2 on Windows. The bare server itself is portable — what the container runs is exactly
`NODE_ENV=production node packages/server/src/entry/index.ts` after `pnpm build` — but that path is
unverified off Linux today.

## Read first

- **`docs/architecture/core/AGENTS.md`** — the cold-start reading router and current architecture map.
- **`docs/architecture/core/Core-0-Architecture-and-Structure.md`** — the constitution: package layout, server tiers, per-feature
  template, central test mirror, the partitioning rule, and the 13 enforcement gates.

## Core bets

1. **pnpm workspace packages** — the layer cake is resolver-enforced (tier-1), not just linted.
2. **`#` subpath imports intra-package, package deps cross-package, zero `paths` aliases.**
3. **Name by role; no `_shared` junk drawers** — services are features, primitives are `kit`.
4. **One central `tests/` tree mirroring `src` 1:1** — agent-enforceable, clean src.

The guiding constraint: **you (and agents) should be able to derive where anything lives, and what
may import what, from the tree alone.**

## Develop

Requires **Node 26 LTS** (`.nvmrc`) + **pnpm** (pinned via `packageManager`; run `corepack enable`).

```bash
pnpm install     # deps (hard-linked from pnpm's global store) + git hooks (lefthook, via `prepare`)
pnpm check       # biome lint + tsc typecheck across all packages
```

**Worktrees just work** — and unlike neo-tavern, without a symlink hack. Each `git worktree` gets its
OWN `node_modules` (correct when branches carry different deps; fast via the shared global store). In a
fresh worktree:

```bash
pnpm run worktree:bootstrap   # pnpm install (deps + hooks) + link .env from the main checkout
```

Hooks live in the shared common gitdir, so they fire in every worktree automatically once its deps are
installed; every hook/check script resolves the worktree root via `git rev-parse` (no hardcoded paths).
External versions are centralized in the pnpm **catalog** (`pnpm-workspace.yaml`).
