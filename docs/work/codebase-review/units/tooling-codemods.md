# tooling-codemods

- Path: `tooling/src/codemods/`
- Band: M (13,697 code lines, 600 files — tokei; the bulk is fixture input/expected data, real
  logic is ~45 `scripts/codemod.ts` + yamls)
- Status: reviewed
- Law above the axes: the `codemod` skill (`.claude/skills/codemod/SKILL.md`) is this unit's
  structural law — layout table, author rules 1–16, verify protocol, and the apply rule
  "delete a one-shot codemod in the same commit that applies it; keep a rewrite that may recur
  or whose fixtures document a shape." No plan doc governs the unit (`docs/plans` grep: only a
  passing cite in `test-enforcement/design.md:42`); the board has no codemod item (overview +
  backlog searched) except 2246, which already owns the `literal-to-binding` merge defect.

## Sweeps

- Hatch sweep (`any|eslint-disable|@ts-|TODO|FIXME`): every `any` is the ast-grep rule key or
  English prose. Zero suppressions, zero TODO/FIXME. D141 archaeology: zero dated comments, zero
  issue cites — second consecutive unit with none. `` policy `X` `` dialect: zero (rc=1 unpiped).
  `tests/legacy` cites: zero. Relative imports escaping the sandbox: zero (rc=1 unpiped).
- Skill-law verification: biome's codemod override exists exactly as claimed (`noDefaultExport`
  off, `useNodejsImportProtocol` off, `tooling/src/codemods/*/scripts/*.ts`, `biome.json:560`);
  knip/Biome/ESLint/depcruiser all skip fixtures as the skill claims. Module-level `new Set`s are
  constant lookup tables, not the stateful caches the sandbox gotcha warns about.
- Header-cite truthing (every dense claim probed, all TRUE): `orb/no-unsafe-cast` and
  `orb/no-native-title` live in the eslint plugin; `tests/tooling/_eslint-config.ts` and
  `tests/tooling/_server-address.ts` exist; the composed-real claim is real
  (`vitest.config.ts:133,165` wire `setupFiles: [COMPOSED_REAL_SETUP]`); the class-token-to-prop
  transaction guard matches the skill's migrate-owner story and its `pnpm ui-facts` run steps use
  flags the CLI actually declares (`tooling/src/ui-facts/index.ts:19`); `derive-port-members`
  reads exactly what `pnpm unwired ports` writes (proved in tooling-unwired).
- Fixture matrix, hand-run: all 45 codemods × every fixture dir, language chosen by fixture
  extension (the ts/tsxt/css split is a skill gotcha; a naive `-l typescript` sweep prints 18
  false FAILs). Result: **all green 2026-11-10** except one harness trap (below). Nothing in CI,
  a script or a hook runs this matrix (finding 2).
- Deletion-clause liveness: `git log --diff-filter=D` proves three codemod dirs were deleted
  after applying (`auth-config-overlay-to-env`, `wrap-asymmetric-matchers`, `pass-root-logger`),
  so the skill's delete-after-apply law is obeyed — selectively (finding 3).
- Workflow integrity sweep: every `js_file` target exists; `reports/` outputs are gitignored
  (`.gitignore:47`); `class-token-to-prop` run steps resolve. One planted-probe result:
  `codemod workflow validate` passes a codemod.yaml whose `name` belongs to another codemod —
  it checks node/template/matrix structure only, never identity (finding 1's aggravator).

## Findings

- \[P3, FIXED in-unit] `tooling/src/codemods/vars-to-infer-input/codemod.yaml:2-4` — the file
  declared `name: "trpc-error-code"` and trpc-error-code's description: a copy-paste scaffold
  ("copy the closest existing codemod") that was never re-pointed, so two codemod packages
  carried one identity. `workflow validate` passes it before and after the fix (probed) — the
  door checks structure, not name↔directory, so the identity class is another item for the
  triage integrity test. Fixed: name and description re-pointed; validate still green.
- \[P3] `tooling/src/codemods/vars-to-infer-input/plan.client.json` — a 98-line committed census
  plan with zero consumers and zero references repo-wide (rg rc=1): its workflow reads the plan
  by param from the TARGET directory, and the skill orders "Keep the map out of the commit" for
  exactly this artifact. It is the fossil of the completed client rewrite, readable only as
  archaeology nobody cites. Fix: delete, or cite it in the workflow/codemod docs as the record
  of skipped sites.
- \[P3] No door runs the fixture suites. `knip.ts:97` says fixtures are "input/expected data for
  `codemod jssg test`", but no script, hook or workflow invokes that command (`.github`,
  `scripts/`, `package.json` searched; only skill/reference prose mentions it). The suites are
  green today only because nobody edited a script since the authors' manual runs — the sweep's
  dead-door shape in its mildest form: a real, passing proof obligation with no door.
  Direction: a plain loop script over `tooling/src/codemods/*/` picking language by fixture
  extension (D333-clean ordinary test, not a revived gate; no board item owns it). While there,
  `plugin-node-sources/tests-schemas/` runs its fixtures against `scripts/node-schemas.ts`, not
  `scripts/codemod.ts` — a second-script shape the skill's layout table doesn't document, so a
  naive runner reports a false stale-metrics FAIL.
- \[P3] Cluster: applied one-shot codemods whose pre-shape is extinct in the tree and which carry
  no external citation — `confirm-trigger-to-destructive-action` (`<ConfirmDialog … trigger=>`
  multiline rg: 0), `section-container-prop` (`<Section className="@container"`: 0),
  `text-prose-cap-pair` (`prose={true}`: 0), `row-ink-to-icon-tone` (`<Row className="text-`: 0),
  `mono-gloss-to-datum-mono` (the gloss+mono pair survives only as a history comment in
  `home-tile.tsx:156`), `mono-class-to-code-voice` (surviving `font-mono` is code-editor/diff/
  tokens, not Text), `keys-of-record` (helper and calls `keysOf(`: 0 — the codemod can match
  nothing), `eslint-resolved-config` (`calculateConfigForFile`: only self-hits). The deletion
  clause is live law (three deletions in git history), so each of these owes either a cited keep
  ("may recur" / "fixtures document the shape") or deletion. NOT in the cluster: reusables with
  live partners (`drop-proven-cast-id`↔`orb/no-unsafe-cast`, `native-title-to-tip`↔
  `orb/no-native-title`, `trpc-error-code`/`string-union-to-tuple`/`rename-identifier`/
  `rewrite-import-specifiers`/`remove-composed-real-warm`/`vars-to-infer-input` as skill-cited
  exemplars, `class-token-to-prop` as migrate-owner machinery, `derive-port-members` as live
  unwired program).

## Verdict

reviewed (0 P2, 3 P3 + 1 fixed in-unit). The unit sits in the tooling-unwired freshness tier:
zero archaeology, zero hatches, and every dense header claim verified TRUE on first probe — the
mechanism thesis again, these files live under active UI/plan work. What this unit adds to the
thesis is the MILD dead door: its proofs are real and passing (45/45 fixtures green when I
hand-ran them), but nothing will notice the day a script diverges from its expected files —
knip's own comment names the runner no door invokes. The identity finding shows even the
validate door has a blind spot (structure, not name), and the museum cluster shows the skill's
delete-after-apply law is obeyed three times out of eleven extinct one-shots — a law with
enforcement examples but no census. All three fixes are ledger-safe: an ordinary test loop, a
deletion, and a metadata re-point, no revived gate anywhere.
