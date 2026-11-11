# Unit: root-dev-environment

Band S. Paths: `.devcontainer/` (Dockerfile, devcontainer.json, init-firewall.sh, README,
tools/package.json + lock), `.vscode/` (settings.json, extensions.json). 896 code lines read in
full.

## Sweeps

- Pin cross-checks against the repo's pins: `tools/package.json` pnpm `12.15.0` == root
  `packageManager`; Dockerfile `PLAYWRIGHT_VERSION=1.64.1` == catalog `@playwright/test`; base
  `node:26` major == devEngines `26.11.1` (the guard test pins all three). The
  `playwright-core@1.64.1` patch is `types/`-only (browser-realm-types re-exports), so the
  build-time `npx playwright-core` Chromium download matches the patched runtime's revision
  expectation — no bake mismatch.
- Guard suite executed (it is the unit's own test population): `pnpm vitest run --config=vitest.config.ts tests/tooling/container-security-config.int.test.ts` — 15/15 green,
  including the docker-compose shape resolutions and the real-`npm ci` integrity test.
- Claim-truthed claims that held: `pnpm sandbox` → `scripts/dev/sandbox.sh` exists and the
  launcher pins verified there; the store-dir env story (`pnpm_config_store_dir`, pnpm ignoring
  `npm_config_store_dir`/rc) matches pnpm 12 behavior; `no-new-privileges=false` is genuinely
  required for the firewall's sudo; dependabot DOES cover the devcontainer base image — the
  docker ecosystem's file fetcher regex-matches `dockerfile|containerfile` recursively under the
  configured directory (dependabot-core `docker/lib/dependabot/file_fetcher.rb`), so the
  guard's "Dependabot bumps base images on its own" comment is true for `.devcontainer/Dockerfile`.
- Volume list vs workspace: devcontainer mounts + Dockerfile mkdir cover root, `tooling`, and all
  11 `packages/*` — consistent with each other, missing `tests/support` (below). The
  extensions/settings pair is coherent (container carries a minimal set; `.vscode/` is the
  shared source the devcontainer comment defers to).
- D141: one date stamp in `.devcontainer/` — FIXED in-unit (devcontainer.json "owner ruling
  2026-09-01" → ruling named, date dropped). README prose keeps its date (comment law targets
  code comments).
- `rg tests/legacy` over the unit: zero hits.

## Findings

- \[P2] `.devcontainer/devcontainer.json:45-70` + `.devcontainer/Dockerfile:48-63` — the sandbox's
  isolation doctrine ("nothing pnpm writes lands on the bind-mounted host folder") excludes
  `tests/support`: `@orb/testkit` is a workspace package (pnpm-workspace.yaml:6) with real
  dependencies (`@orb/client`, `@orb/db`, `@anthropic-ai/sdk`, playwright, transformers), so
  `tests/support/node_modules` is a symlink farm pnpm creates on the host bind mount in the
  container — the exact host/container reinstall ping-pong every other importer got a named
  volume to prevent (it exists on this host today). The README's blanket claim at :85 ("A
  container config test fails when a workspace package has no volume") is false as proven:
  the guard at `tests/tooling/container-security-config.int.test.ts:64-67` enumerates
  `readdirSync(packages)` + the literal `"tooling"`, so any importer outside `packages/`
  besides tooling slips through — and the suite is green on this tree with the hole open
  (15/15). Direction: drive the volume list (and the guard) from pnpm-workspace.yaml's packages
  globs instead of a directory scan — third instance of the closed-vocabulary-drift pattern
  (with the lint-rule-id proof and the dependabot ignore set).
- \[P2] `.devcontainer/init-firewall.sh:57-71` vs `:136-166` — the GitHub meta fetch is explicitly
  made non-fatal ("skipping GitHub IPs" on HTTP failure, timeout, or junk body), but
  `api.github.com` reaches the allowlist *only through that fetch* (it is not in the domain
  loop), and the post-lock self-test hard-requires `curl https://api.github.com/zen` after
  OUTPUT=DROP. A transient meta failure (unauthenticated rate limit is per-IP) therefore fails
  `postStartCommand` on every container start and leaves egress locked with GitHub dead — the
  "non-fatal" comments describe an intent the script's own final gate refuses. Direction: put
  `api.github.com` in the dig-based domain loop independently of the meta fetch, or make the zen
  check conditional on `gh_ranges` being non-empty.
- \[P3] `.devcontainer/Dockerfile:100-102` — comment claims "the runtime firewall
  (init-firewall.sh) blocks cdn.playwright.dev, so a runtime playwright install dies with
  ENETUNREACH"; init-firewall.sh:93 allowlists `cdn.playwright.dev` explicitly. Stale half of a
  coupled pair (baking Chromium at build time is still right for cold-start cost — the blocking
  claim that justifies it is not true).
- \[P3] `.devcontainer/tools/package.json` + Dockerfile ARGs — the sandbox toolchain is outside
  every update channel: dependabot's npm entries all use `directory: /` (the pnpm workspace
  importers), and `.devcontainer/tools/` is not an importer, so `@anthropic-ai/claude-code`
  (the sandbox's primary tool) and `@ast-grep/cli` never get update PRs; the pnpm pin survives
  only because the container guard test fails on drift. The Dockerfile ARGs (`GIT_DELTA_VERSION`,
  `ZSH_IN_DOCKER_VERSION`, `PLAYWRIGHT_VERSION`) are likewise invisible to dependabot
  (ARG-versioned downloads are not a managed shape) — the playwright ARG already drift-coupled
  to the catalog and stayed true only by attention. Direction: one extra npm directory entry
  for `/devcontainer/tools`; a test pinning `PLAYWRIGHT_VERSION` to the catalog would match the
  repo's own coupling-proof idiom.
- \[P3] `.devcontainer/README.md:107-111` — the "wipe to reset" snippet lists 8 of the 15 volumes;
  following it verbatim resets root+6 packages and the store while leaving tooling,
  default-content, inference, plugin-sdk, plugin-toolchain and showcase-plugins volumes holding
  stale state — a half-reset, which is the class of state that produces mystery reinstall
  bugs. Direction: one `docker volume ls --filter name=orbweaver` line instead of a hand-list.
- \[P3] `.devcontainer/Dockerfile:67-71,91` — the delta `.deb` and the zsh-in-docker script are
  fetched at build time over TLS with no checksum or signature — in the image whose entire job
  is being the security boundary for a permissive agent. Version-tagged, so it is a supply
  chain note, not a hole.
- \[P3] `.devcontainer/devcontainer.json:26` — "owner ruling 2026-09-01" carries a date stamp into
  a config comment (D141, comments.md rule 39). FIXED in-unit: ruling named, date dropped.

## Verdict

reviewed (6: two P2, four P3; one P3 FIXED in-unit). This sandbox is far better than
most: the store/env story is real and tested, the bypass is correctly quarantined to the
container volume, the firewall self-tests itself and fixed the upstream re-run poisoning and
dup-ipset bugs on the way. But it repeats the sweep's founding crime in its purest form: the
volumes design is a closed vocabulary ("every workspace package") maintained by a hand-typed
list in three places (Dockerfile, devcontainer.json, guard test), and the guard derives its list
from the wrong directory — so the biggest test-side package in the repo is quietly off the
doctrine, and the README promises a tripwire that cannot fire for it. And the firewall's
"non-fatal" is fatal: the same comment-vs-control-flow split the thesis predicts. The pnpm
version sync here is the counterexample that indicts the rest: where a guard test pinned the
coupling, the pin held; where prose carried it, the prose went stale.
