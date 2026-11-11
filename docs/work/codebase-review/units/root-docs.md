# Unit: root-docs

Band S. Paths: README.md, CONTRIBUTING.md, ACCESSIBILITY.md, SECURITY.md, CODE_OF_CONDUCT.md,
LICENSE (AGPL-3.0-only text, matches `package.json` `license`). Pass for staleness against the
ledger and the actual tree, per the unit row.

## Sweeps

Every verifiable mechanism claim checked against the tree — all true unless listed as a finding:

- README run paths: `install.sh`/`.cmd`, `start`, `update`, `docker-compose.yaml` default image,
  `docker/README.md`, port 8788, healthz, `.env` `OPEN_BROWSER`, `pnpm start --setup/--port`,
  `pnpm share`, `pnpm stack up/down` (`tooling/src/stack/cli.ts`), `pnpm dev` at 5173
  (`packages/client/vite.config.ts` DEV_SERVER_PORT), worktree:bootstrap/prepare scripts,
  `pnpm runtime set node 26 -g` (real pnpm 12.15 subcommand, verified via `pnpm runtime --help`).
- README release/versioning story matches release.yml + release-please-config.json +
  `pnpm release`/`pnpm sync` (github-sync.sh) + the identity-block chain proven in install-run;
  `releases?q=plugin-authoring` matches the `plugin-authoring-v<version>` cut; "Hosted runners
  retain measurements without asserting timing budgets" matches ci.yml (no budget asserts);
  tags exist through v0.3.1 so "first release is v0.1.0" is true history.
- README/CONTRIBUTING workflow descriptions match the workflows as reviewed in root-ci —
  including the e2e-smoke job in ci.yml that a first pass nearly miscounted (job-name regex
  `[a-z-]+` excludes digits; `e2e-smoke` was there all along).
- CONTRIBUTING commands all exist (`lint`, `lint:eslint`, `lint:css`, `typecheck`, `depcruise`,
  `test`, `test:tools`, `test:ct`); `ORB_HUMAN_COMMIT=1` is real in scripts/commit-msg-check.sh;
  the `windows_proof_only`/`windows_proof_repetitions` inputs exist in install.yml; pre-commit
  Biome and pre-push github-sync match lefthook.yml.
- SECURITY.md walls map to real machinery: QuickJS broker (`infra/plugin-host/realm.ts`,
  `worker-runtime.ts`, `cpu-guard.ts`), pinned-hash cloudflared (`infra/relay/contract.ts`,
  `binary.ts`), `data/secrets/` file names match docker/entrypoint.sh + README:126; the
  advisory contact matches the issue-template security link.
- ACCESSIBILITY.md: theme contrast gate, jsx-a11y (in eslint.config.ts), touch floors
  (`packages/ui/src/lib/control-size.ts` + tokens), ui-audit a11y checks (accessible names,
  landmarks, heading order, positive-tabindex — all in `tooling/src/ui-audit/lib/`),
  focus tests under `tests/client/components/`.
- CODE_OF_CONDUCT + SECURITY + issue templates share one contact (<studio@inktomi.tech>) ✓.
- `rg tests/legacy` over the unit files: zero.

## Findings

- \[P3] `ACCESSIBILITY.md:23-24,61` — "A build check fails any new screen that skips that
  \[focus moves into an opening view]" / "the focus-on-arrival gate": the gate name appears
  nowhere in `tooling/`, `tests/` or the law docs (two methods: name grep across the tree,
  concept grep for initial-focus/focus-trap/FocusScope — the Base UI `initialFocus`/`finalFocus`
  props and focus CTs exist, but no gate under that name and none located that fails a screen
  for skipping focus-on-open). May be a real gate under house vocabulary my sweep missed;
  phase 6/7 must prove or retire the claim. Unverified-by-reviewer, filed as a lead.

## Verdict

reviewed (1: one P3 lead). The public-facing docs are the best-maintained prose in the repo:
every install path, script name, workflow description, version-identity rule, security wall and
gate I could mechanically check was true, including several claims with coupled implementations
that changed under them (the identity block, the broker, the relay pin) — these files are
clearly edited when the shape moves, unlike the CI/ config prose that produced the phase-0 P1
and half the P2s. That refines the thesis rather than eating it: prose does have a gate here,
and it is the author's own pass over the doc at ship time — the rot concentrates in prose
*embedded next to machinery* (comments, refusal messages, ignore lists) that no reading audience
ever re-reads. Docs aimed at humans stay honest because humans read them.
