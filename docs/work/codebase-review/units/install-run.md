# Unit: install-run

Band M. Path: `install.{sh,cmd}`, `start.{sh,cmd}`, `update.{sh,cmd}`,
`scripts/launcher/ui.{sh,cmd}`, `Dockerfile`, `docker/` (entrypoint, assembler, five compose
overlays, env files), `docker-compose.yaml`, `.dockerignore`, `docker/README.md` (skimmed against
cross-references). Read in full except README prose.

## Sweeps

- Twin parity: the six launchers read as three sh/cmd pairs; both self-rewrite-under-pull traps
  are fixed deliberately and differently (update.sh parses whole-body-as-function; update.cmd
  copies itself to %TEMP% first) — both documented. `ui.sh`/`ui.cmd` agree on port resolution
  (last `.env` `PORT=` wins, else 8788) and on the probe (any HTTP answer counts, 503-during-
  drain included).
- `bash -n` / `sh -n` all scripts clean; `shellcheck` + `shellcheck -x` clean (only SC1091 info
  before `-x`, and the files carry the `shellcheck source=` directives that make `-x` work).
- Suites that pin this unit: `container-security-config.int.test.ts` (15 tests, ran green twice,
  before and after the in-unit comment edits — loopback-default pin, hardening-key removal
  refuters, generated-password-never-in-log proof, node-version/devEngines parity, every compose
  shape resolves) and `release-image-publication.int.test.ts` (pins the release workflow
  publishing the tag compose pulls).
- Claim-truthing: `.dockerignore` allowlist matches the Dockerfile's COPYs and the git-refs
  wildcard story; `build:version-stamp` is a checked script delegating to the same
  `buildVersionStamp` the runtime reads back (`foundation/version` precedence doc verified);
  `LOCAL_LIGHT_*` / `PRIVATE_ENDPOINT_ALLOWLIST` / model names (jina-clip-v2, ettin-reranker-32m,
  RMBG-1.4) exist in `foundation/env/record/index.ts` and contracts; the `single-user` loopback
  story in the overlays cites `foundation/env/bind.ts` and `infra/auth/dispatch.ts` and both say
  what the overlay says they say; all `docker/README.md` section cross-refs exist ("LAN and
  HTTPS", "Reaching it by name", "From the internet: a tunnel", "Share with one press"); remote
  is `Inktomi93/OrbWeaver` with a live `release` branch (the lowercase slug in compose/Dockerfile
  LABELs resolves — GitHub is case-insensitive; not a finding).

## Findings

- \[P3] install.sh / install.cmd / update.{sh,cmd} (whole entry path) — the one command every
  stranger runs (`curl … install.sh | bash`, README.md:48) is executed by NO job in CI.
  `install.yml` is honest about it ("Source jobs exercise the README install"): nightly runs
  `pnpm install` + `pnpm start` + the compose bring-up and proves image identity, and only
  `start.cmd` is actually invoked. The installer's own logic — clone-the-release-branch, pnpm
  bootstrap incl. the mktemp-installer path, the docker-mode branch, `exec ./start.sh < /dev/tty`
  — and both update scripts' docker/source branches are human-tested only. Highest-traffic
  blast radius of anything found so far (an installer bug is the first thing a new user meets).
  Direction: one nightly step piping the checkout's own `install.sh` into bash against a scratch
  `ORB_DIR`, then `update.sh --no-start` inside the clone.
- \[P3] install.cmd:32-46 — drift from the documented twin: `install.sh:41-46` honors
  `ORB_MODE=source|docker` (header line 5) to answer the mode question unattended; the cmd twin
  never reads `%ORB_MODE%`, so Windows ignores the documented knob. Direction: read it before
  the question.
- \[P3] docker-compose.yaml:55 + docker/orbweaver.local.env.example — the base compose publishes
  `${ORB_BIND}:${ORB_PORT}→8788` with the CONTAINER port fixed, while the app honors `PORT` from
  the env files (and the HEALTHCHECK reads it). Setting `PORT` in `orbweaver.local.env` —
  plausible, since anything there overrides — moves the listen port inside the container, leaves
  the published mapping pointing at nothing, and the container still reports healthy. The
  host-network overlay handles `PORT` correctly, which makes the base file's silence the trap.
  Direction: one comment line in the env file: in the shipped shape use `ORB_PORT`, not `PORT`.
- \[P3] FIXED across the unit — the D141 sweep: ten archaeology violations (dates in Dockerfile
  ×2, .dockerignore ×2, assemble-runtime.sh ×2, container-security test ×3 incl. two git-hash
  cites, plus the `rebuild` narrative dates), the "four plain ref files" inventory counts ×3, and
  the "SillyTavern / linuxserver" project comparison in docker/entrypoint.sh:11. Rationale kept,
  dates/counts/hashes dropped; the security suite re-ran green after the edit.
- \[P3] FIXED in the ledger — this unit's boot exposed that the unit table under-claimed the root:
  `.github/` (22 files, the whole CI corpus), `.codex/`, `.devcontainer/`, `playwright/` and
  `.vscode/` appeared in no unit row. Rows added (phase 0: `root-ci` and `root-dev-environment`;
  `.codex/` folded into instruction-files; `playwright/` into the e2e row — see ledger).

## Verdict

reviewed (5). This is the most disciplined corner of the repo: the entrypoint's privilege dance
(root only to chown, setpriv by number, never edits /etc/passwd because the rootfs is read-only,
`--no-new-privs` + `--inh-caps=-all` baked into the image itself), the /node_modules-vs-/app/
node_modules symlink-depth argument for the plugin broker's lexical-path grant, the assembler's
refuse-on-upward-link guards, and the install workflow's image-identity proof (version.json stamp
\== tag sha == OCI revision label, digest pinned before compose runs it) are all genuinely careful
work with a proof beside each claim. The gaps are at the very outer membrane: the installer
scripts themselves run only when a human runs them, and the .cmd twin dropped one documented
knob. Both are one-workflow-step and one-line fixes.
