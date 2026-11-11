# Unit: scripts-patches

Band M. Path: `scripts/` (30 files, ~2K lines, all read or outlined in full) and `patches/`
(50 patch files; wiring and version-matching verified, minified diff bodies not read line by
line — noted as a coverage limit).

## Sweeps

- Wiring: every file in `scripts/` is reachable from a package.json script, lefthook, a
  workflow, a playwright config, or a package script (`generate-seed-vectors` →
  packages/default-content, `surface-gallery` → playwright-surface-controls.config.ts). Zero
  orphans. Testkit imports from scripts are legal by the testkit rule ("tests, the test
  runner configs and scripts import it").
- Patch diff (scripted, `node /tmp/opencode/patchdiff.mts`): 50 declared in
  pnpm-workspace.yaml `patchedDependencies`, 50 files present, zero undeclared files, and all
  50 exact `name@version` keys resolve in pnpm-lock.yaml. (An earlier run of my own first regex
  claimed four stale keys — that was my broken parser, corrected with a file-based one before
  any claim.)
- Behavior patches carry port-tests: `@vitest/eslint-plugin` names
  `tests/tooling/eslint-vitest-plugin-patch.test.ts` in its declaration comment as the both-
  directions refuter; the workspace entries each carry a one-line WHY and "a bump must port it".
- Script verification after the in-unit edits: `bash -n` + `shellcheck -x` clean on every
  shell file; `commit-msg-check.sh --help` renders; the validator smoke-tested against
  conforming / malformed-trailer / malformed-header messages (refuses exactly as specified);
  `container-security-config.int.test.ts` (which executes `sandbox.sh` through a fakeBin) re-ran
  15/15 green.

## Findings

- \[P2] Dockerfile:90 (the prod-deps stage comment, found from the patches side) — "Every
  patched dependency is a dev tool, so a --prod deploy never installs one and pnpm would refuse
  its patch as unused" is false: `drizzle-orm`, `hono`, `openid-client`, `isomorphic-git`
  (packages/server/package.json:85-93), `@ai-sdk/provider` + `ai` (packages/inference/
  package.json:21,27), `libsql` (via `@libsql/client`, packages/db/package.json:25), and
  `@huggingface/transformers`/`onnxruntime-common` are production dependencies of the deploy
  graph — patched code runs in the published image. The `--config.allow-unused-patches=true`
  flag is justified by the genuinely dev-only patches (playwright-core, lighthouse, drizzle-kit,
  stryker, …), but as worded the sentence also waives the unused-patch signal for a future
  patch that stops applying in prod. Direction: rewrite the reason to name the two classes —
  prod patches apply through the deploy, dev-only patches are what the flag tolerates.
- \[P3] FIXED scripts/commit-msg-check.sh:2-17 — board-number cite (`#1584`), a date stamp and
  inventory counts ("6,344-commit history", "96%", "11%", "0.7%") per the comment law, and one
  false claim: "lefthook.yml has no post-merge or post-commit entry" — lefthook.yml:19 is a
  post-commit command (restage-docs). Corrected to "lefthook.yml's post-commit only restages
  formatted docs"; help `sed` window re-bounded to the new header; smoke-tested both doors.
- \[P3] FIXED scripts/dev/sandbox.sh:5-6 — date stamp on the owner-ruling cite removed,
  rationale kept; the fakeBin suite re-ran green over the edited script.

## Verdict

reviewed (3: one P2, two fixed in-unit). The scripts layer is uniformly careful — the CI trio
(contributor-ready/stop, approve-release-run) is paranoia done right: TOCTOU double-reads on
the PR and run objects before approving, a closed version-only diff as the approval condition,
teardown that verifies the ports actually freed. `typecheck.ts` refuses to check the vacuous
solution file; `prepare.ts` handles the manifest-install / bare-repo / linked-worktree shapes
each with a reason; the assembler-grade comments in `deps-update.ts` (why the env var, not the
flags) are the good kind of archaeology-free knowledge. The unit's one open defect is a Docker
comment that mis-describes its own patch policy — the thesis again: the machinery is right, the
sentence beside it went false. Coverage limit recorded: the 50 patch bodies (mostly minified
upstream JS) were not diff-read; their declarations and port-tests were.
