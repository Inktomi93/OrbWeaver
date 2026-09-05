---
kind: review
status: active
updated: 2026-09-05
---

# Cold review — ResourceHost layout, size, and inventory family

## Verdict

**CONFIRMED.** The current `resource-layout-size-inventory.md` bytes close the ResourceHost census as 53 policies, partition it exactly into 13 in-family and 40 out-of-family policies, and correctly give all 13 in-family policies zero current conversion eligibility. No outstanding confirmed finding remains. One material report defect was found and corrected during review: the report now distinguishes the owner-ruled `.ts`/`.tsx`-only destination from the delivered planner's live `.mts` admission.

## Findings

None in the current reviewed bytes.

## Corrected during review

### Resolved P1 — destination source-extension law originally omitted delivered planner drift

`docs/reviews/gate-runtime/resource-layout-size-inventory.md:19` — the first owner-ruling insertion stated that the final AST/compiler population contains only `.ts`/`.tsx` without recording that the delivered planner currently admits `.mts`; a cutover reader could therefore treat an unmet owner requirement as already implemented. Concrete failure scenario: `tests/server/infra/providers/backends/local-light/fixtures/orphan-survival-child.mts` is compiler-owned by `tsconfig.json`; a final syntax policy with population `@tests` is planned as runnable with that `.mts` path in both its declared and effective source populations, contrary to the destination ruling. Evidence: `tooling/src/verify/lib/policy-plan.ts:23` spells `\.(?:[cm]?ts|tsx)$`; `tooling/src/verify/lib/policy-program-membership.ts:101-118` forwards every authored compiler member; `tooling/src/verify/lib/population-resolver.ts:291-310` applies root membership without a default extension fence. A live `resolvePolicyScope` + `planPolicyCommand` control returned `programIds:["tsconfig.json"]`, `mode:"run"`, `declaredHasTarget:true`, and the `.mts` path in `effectiveSourcePaths`. Correction status: **resolved in the current report** at lines 19 and 85, which now names the delivered drift as parent seam work and explicitly forbids widening source extensions as the resource-proof repair. No runtime code was changed in this lane.

## Verified clean

### Governing law and review surface

- Read in full: root `AGENTS.md`, `docs/architecture/core/AGENTS.md`, `.claude/agent-doctrine.md`, `.claude/rules/gates-and-tooling.md`, `.claude/rules/lane-standing-facts.md`, `tooling/src/verify/gates/GATE-AUTHORING.md`, `docs/architecture/core/Documentation-Law.md`, `docs/architecture/core/Core-Docs-Formatting-Law.md`, `docs/architecture/core/Core-Laws-and-Precedents.md`, `docs/design/gate-runtime-standardization.md`, `docs/reviews/gate-runtime/resource-gate-access-patterns.md`, `resource-host-foundation.md`, `uncovered-gate-conversion-census.md`, `exception-authority-census.md`, `planner-cli-integration.md`, and the current family report.
- Read all 13 candidate gate modules in full: `baseline-single-migration`, `client-structure`, `component-size`, `component-size-ui`, `feature-owns-definition`, `feature-structure`, `no-nul-bytes-in-source`, `package-layout`, `server-layout`, `test-layout`, `tooling-slot-template`, `ui-exports-map-complete`, and `ui-primitive-structure`.
- Read the final policy/proof/pass/resource contracts and the complete `policy-conformance`, `policy-plan`, `policy-pass`, `policy-pass-context`, `policy-validation`, `resource-policy`, `ResourceHost`, resource-reader, and resource-tree implementations. Read all nine focused resource/pass/conformance/planner test files exercised by the report's command.
- `git rev-parse HEAD` returned the stated base `2800f78b63e702fb98c117d2ce810c843901d25f`. `git log --all -- docs/reviews/gate-runtime/resource-layout-size-inventory.md` returned no prior path history. The source diff is a single new report; no gate, helper, test, runtime, registry, baseline, product, schema, CSS, or catalog file changed.

### Closed census and partition

- Planted structural control: the `ast-grep` `pair` rule for key `fsBacked` with boolean value `true` scanned `baseline-single-migration.ts` and returned the known descriptor pair (`scannedFileCount=1`, `skippedFileCount=0`, one match).
- Full structural run: the same rule scanned all 255 top-level gate modules with zero skipped files and returned 53 matches in 53 distinct files. Literal corroboration `rg -l 'fsBacked\s*:\s*true' tooling/src/verify/gates --glob '*.ts'` returned 53 files; a per-file count check found exactly one occurrence in each. Independent `find` and `rg --files` top-level inventories both returned 255 modules with an empty set diff.
- Parsed the report tables by column and compared them with the literal 53-file set: 13 in-family, 40 out-of-family, 53 unique combined, zero duplicates, and an empty partition-versus-corpus diff.
- The current report's common-seam count is correct: eleven resource-only tree policies need TypeScript-bearing resource proofs; `baseline-single-migration` instead needs migration JSON, while `ui-primitive-structure` is the hybrid source/resource member.

### Runtime and semantic receipts

- Independent off-tree `verifyPolicyProofs` control: a resource-only `tooling-slot` policy with one explicit non-TypeScript carrier plus TypeScript fixture paths failed both `mustFlag` and `mustPass` at `evaluate` with `resource authored-tree:tooling-slot is outside the effective resource population`. This directly exercises `policy-conformance.ts:69-84`, `resource-reader.ts:168-210,227-243`, and `resource-policy.ts:12-18`; it confirms the report's common proof refusal rather than inferring it from prose.
- `ui-primitive-structure` source/resource overlap is enforced in both planner and pass (`policy-plan.ts:187-202`, `policy-pass.ts:170-181`). `test-layout` and `ui-primitive-structure` still require the absent mirror fact; `baseline-single-migration` still requires strict journal JSON; `client-structure` still requires TSX text; `no-nul-bytes-in-source` still lacks `scripts`, `docs`, tooling-root, and per-occurrence line facts. No provider-complete policy was overlooked.
- Live ResourceHost acquisition reproduced the report exactly: `client-source=1,437`, `ui-source=490`, `tooling-slot=1,752`, `packages=4,123`, and `tests=3,310`, all `ready` with path counts equal to member counts.
- Independent LOC comparison reproduced all reported numbers. Client: 1,286 judged files, all 1,286 differ because host metadata counts terminal LF; legacy has one violation and host metadata has four, adding exactly `data/invalidation.ts`, `refinery-content-surface.tsx`, and `lib/registry-contracts.ts` at the 450-line boundary. UI: 358 judged files, all 358 differ, and both algorithms report zero violations.
- Destination extension ruling is preserved: final source population is `.ts`/`.tsx` only; `.mts`, `.cts`, `.mjs`, and `.cjs` remain explicit non-source ResourceHost inputs or eventual cleanup, never a widened compiler population. The current planner drift is explicitly recorded as unresolved parent seam work.

### Commands and tests

- `pnpm gate:contract` exited 1 as the expected migration census and reported exactly 1,447 findings across 255 modules. The full captured output contained 1,450 lines: command line, summary, 1,447 structurally valid finding lines, and the expected lifecycle exit line; a full-file parser found zero malformed/unaccounted lines. Code totals sum to 1,447: 241 descriptor wrappers, 660 legacy fields, 345 direct walks, 2 gate-owned Projects, 40 module lets, 145 module mutations, and 14 baseline ledgers. Each of the four report-sampled candidates has three findings; zero source changes means zero reduction.
- `pnpm test:scoped tests/tooling/verify/ops/resource-reader.test.ts tests/tooling/verify/ops/resource-host.test.ts tests/tooling/verify/ops/resource-tree.test.ts tests/tooling/verify/ops/resource-config.test.ts tests/tooling/verify/ops/resource-tracked.test.ts tests/tooling/verify/lib/resource-policy.test.ts tests/tooling/verify/lib/policy-pass.test.ts tests/tooling/verify/ops/policy-conformance.test.ts tests/tooling/verify/lib/policy-plan.test.ts --maxWorkers=4` passed 9/9 files, 89/89 tests, with no type errors.
- `pnpm check:docs docs/reviews/gate-runtime/resource-layout-size-inventory.md` passed before the final owner-ruling correction; both current review docs are rechecked together after this artifact is written.
- Whole-tree `pnpm check`, the full gate battery, full tests, CSS conversion, schema work, planner repair, rendered probes, Project/board actions, main, push, global baseline regeneration, and catalog regeneration were not run or touched, per the explicit lane fence.

## Regions not read

The 40 out-of-family gate modules were not reread in full. Their membership was verified exhaustively by exact set comparison against the closed 53-policy resource manifest, but their CSS, config, installed/generated, document/registry, schema, test-presence, and tool-proof algorithms were outside the narrowed review. No source or behavior conclusion beyond membership/classification is claimed for them. No rendered surface exists in this docs-only diff.

## Unconfirmed, low priority

None.

## Durable lesson for the orchestrator

Index entry: **Final policy source-extension fence** — destination AST/compiler populations are `.ts`/`.tsx` only; the delivered `[cm]?ts` planner drift must close before cutover, and resource-proof repair must keep non-source inputs behind typed ResourceHost facts.

Body: `policy-conformance` and `policy-validation` already treat only `.ts`/`.tsx` as source proof files, but compiler membership plus root population resolution currently admits the live `.mts` fixture. Close that mismatch in the parent planner/resource seam; do not solve the tree-proof collision by widening the source regex.

Issue summary: CONFIRMED after one mid-review correction; 0 outstanding findings, severity ceiling none. The 53-resource-policy census and exact 13+40 partition hold, all 13 narrowed-family policies remain ineligible under exercised proof/runtime or named provider gaps, and the current family report now records the owner-ruled `.ts`/`.tsx` destination plus the delivered `[cm]?ts` drift that parent seam work must close. Review: `docs/reviews/stickler/2026-09-05-resource-layout-size-inventory.md`.
