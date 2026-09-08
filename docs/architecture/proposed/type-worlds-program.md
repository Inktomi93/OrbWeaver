---
kind: spec
status: active
updated: 2026-09-07
---

# Type worlds, test registration, and derived tool configuration

This document owns the durable design. [Program #1351](https://github.com/Inktomi93/orbweaver/issues/1351) owns execution, dependencies, decisions, and verification receipts. The implementation is pre-launch: remove superseded structures rather than maintaining compatibility copies. The separate [gate-runtime cutover](../../design/gate-runtime-standardization.md) remains its own program.

## Outcome

Every authored TypeScript file has an intended world and explicit compiler ownership. Test kind, compiler world, executor, and scheduling requirements have one authoritative vocabulary. Native configs and verification jobs consume shared facts instead of maintaining parallel lists of files or projects. Independent native observations prove that the derived configuration selects and checks the intended population.

A package's source can participate in its own compiler program and a consumer's import closure. Those are different facts. Test/harness roots have one primary owner; declarations need explicit ambient ownership. A file in some program is not necessarily in the correct program, and a correct root does not prove its imported closure is compatible.

## Existing authorities

| Fact | Home |
| - | - |
| Workspace packages, manifests, declared dependencies and exports | pnpm workspace and package manifests |
| Authored files and Git change identity | `tooling/src/verify/lib/policy-repo-inventory.ts` |
| Compiler roots, references and inherited config inputs | `tooling/src/verify/lib/policy-program-membership.ts` |
| Intended world and primary compiler owner | `tooling/src/_shared/project-worlds.ts` |
| Native compiler import closures | the TS7 listing used by `tooling/src/verify/ops/tests-type-membership.ts` |
| Verification stages, tiers and execution adapters | `tooling/src/verify/lib/registry.ts` |
| Capacity policy | `tooling/concurrency-profile.json` and its validated readers |
| Native runner observations | Vitest and Playwright collection; execution-membership reconciliation |

Keep cheap intent data separate from expensive observations. Reuse the shared compiler reader; do not grow a second parser in a config or codemod. If additional consumers require a lower shared home, extract the existing leaf once without reversing tooling dependency direction.

## Source and test structure

Preserve the package cake by responsibility. Source moves are justified by ownership and dependency direction, not by making every folder look alike. Pure UI logic may stay in UI; a Node test alone is not a reason to relocate it into kit.

The source-mirror test tree remains the default. File/folder reorganization is authorized when it establishes clearer ownership, compatible closures, or test isolation. Helpers declare their world through `tests/support/{iso,node,browser}/`; the existing support home avoids an unrelated rename to `_support`. An iso helper cannot import a node/browser helper; a node helper cannot import a browser helper. Enforce those boundaries when the helper split lands.

Barrel purity is the cause-level repair. `#lib`, `#state`, `#data`, `#forms`, and `@orb/ui/lib` must not drag DOM-dependent modules into a Node-safe front door. Move DOM halves to the owning feature or primitive; do not create a new generic browser barrel. Split mixed modules so pure constants/types retain their proper home. Re-measure the current graph before moves; historical leaf and importer counts are not a current work manifest.

## Test vocabulary and scheduling

The registry owns supported kinds and their interpretation across layout, compiler routing, runtime collection, execution reconciliation, lint surfaces, and job selection. Registration precedes renames. Preserve useful conventional suffixes rather than renaming for appearance alone. Browser-subject runtime tests use `.dom.test.ts`; browser type-only tests use `.dom.test-d.ts`. The earlier `.ct-d.ts` choice is superseded. Keep `.spec.ts` for E2E unless a concrete harness requirement justifies changing it.

Compiler world, executor, test purpose, and resource needs are distinct axes. A browser-subject type check does not run a browser. A Node driver can control a real browser. A long-running test is not automatically a correctness-serial test or mutation-ineligible.

Use native Vitest tags for cross-cutting labels and supported test options, with strict registration and derived type vocabulary. Tags do not provide file import isolation, cross-process serialization, or resource locks. Native filtering still imports included files, and `list --filesOnly` does not enumerate tag-filtered test cases. File populations and genuinely different executor settings must therefore be selected before collection where required.

Re-derive every old serial/live assignment from current code and the current capacity profile:

- Fix avoidable shared ports, databases, temporary paths, and fixture reapers through proper ownership and isolated resources.
- Separate timing/rate assertions from ordinary structural assertions where they need different conditions.
- Re-test historical timeout/CPU-weight assignments under current budgeting; do not preserve them as permanent serial tags or suffixes.
- Keep measured-rate validity distinct from timeout scaling.
- Derive mutation eligibility from actual execution capability and resource requirements, not from membership in an old serial project.

The tests-as-workspace-package fork remains unnecessary by default. Adopt it only if a concrete benefit outweighs its changes to dependency resolution, Knip, lint ownership, and the package graph.

## Tool configuration and jobs

Make repeated populations and execution facts authoritative, then simplify each native config around them. This is a join of existing authorities, not a universal configuration schema.

- Vitest, Playwright, ESLint, dependency-cruiser, Knip, CPD and Stryker must consume the relevant shared package/world/test/population facts.
- Native TypeScript/JavaScript configs can compose shared data directly. Generate deterministic sections for static formats only where necessary.
- Generate the fields TypeScript forces children to restate; hand-author intent. Abstract templates carry `files: []`; the default Node program has explicit roots; ambient ownership survives inheritance/overrides.
- Preserve tool-specific rule policy, deliberate grants, public-entry semantics, mutation targets/calibration, and independent oracles. A current violation must not generate its own permission.
- Keep Stryker derivation pure: importing it cannot mutate the base Vitest config. Share mechanical configuration while retaining explicit calibrated policy.
- Preserve and adapt native-config liveness checks when selectors move behind imports or generated layers. A static reader that cannot follow the new form must refuse or be replaced by an effective-config witness, never silently pass.
- Keep scripts/hooks/CI as thin entry points into the existing verifier and supervisors. Tier admission, actual requested subjects, deferrals, and exit classification must compose correctly.
- Preserve tinker’s measured performance mechanisms, artifact identity, private CT builds, and watchdog behavior. Capacity-reader semantics and admission-control guarantees must be stated accurately.

A shared glob string does not establish shared semantics. Compare each tool's native resolved population and effective policy against independent intended facts. Avoid expensive repository/compiler discovery on every editor save; materialize expensive observations at the appropriate invocation boundary.

## Ordered implementation

| Phase | Deliverable | Completion evidence |
| - | - | - |
| 0 | Shared vocabulary and repo-wide actual-versus-intended membership report | Every authored TS file represented; unknown intent and missing/wrong ownership visible; discovered nested/reference programs; no premature target enforcement |
| 1 | Helper world homes, import-direction boundaries, scoped compiler coverage | Correct helper placement and boundary controls; production changes still trigger the necessary dependent test type programs |
| 2 | Delete the failed `pure.ts` mirrors | One surviving source/export home; no compatibility mirror |
| 3 | Source ownership and barrel closure repair | DOM-less compiler proofs for the intended pure front doors; current importer/closure evidence; regression pins |
| 4 | Unified test registration and reclassification | Registry before moves; `.dom.test.ts`/`.dom.test-d.ts`; obsolete directory rulings and filename lists removed; native collection/execution retained |
| 5 | Small world configs and stable native-config adapters | Explicit roots/ambient ownership; forced fields generated; selected-file and effective-policy equivalence |
| 6 | Predictive enforcement and ledger retirement | Wrong/missing owners and forbidden boundaries fail through real enforcers; no unresolved ownership hidden by a green aggregate |
| 7 | File-to-typecheck router | Correct programs for file/folder/package/changed inputs; actual subjects carried into execution; honest empty/deferred/error results |

Hard dependencies: phase 0's instrument before migration measurements; phase 2 before 3; phase 3 before closure-dependent phase 4 reclassification; predictive enforcement after the target structure is correct. Existing false-clean job/scoping/exit defects and isolation prerequisites may be repaired immediately; that is not permission to reclassify closures early.

The codemod-kit repair [#1860](https://github.com/Inktomi93/orbweaver/issues/1860) is a prerequisite to bulk moves. Preserve dry-run/preview integrity, path/overwrite guards, extensionful reference rewrites and apply refusal. Fix bulk-move cost and wrong-world diagnostics before relying on the kit. A delta measured under the wrong compiler world is not sufficient protection if that world already hides the relevant type error.

## Membership report

`pnpm check:tests-membership --json` retains every authored TypeScript row: intended world, required primary program, actual root owners, actual closure membership, and outcome. The report explicitly identifies the checks its exit code currently enforces.

During migration, target drift remains informational while the existing test-orphan and reference-lib guards enforce. Transitional client/ui test-directory containment is not target intent. Unknown declaration ownership is reported explicitly. Neither the report's successful exit nor a single green type program is program completion.

## Acceptance

- Reconcile authored inventory, intended ownership, native compiler roots/closures, native runner collection, and actual execution by identity, not just counts.
- Exercise positive and negative controls for fresh packages/kinds, nested/reference configs, inherited arrays, declarations, unknown/empty/overlapping projects, removed grant subjects, and unsupported inputs.
- Compare tool-native selector semantics for dotfiles, negation order, separators, config-relative paths, generated/foreign/transient files and relevant case behavior.
- Preserve every authoritative behavioral regression and explain deliberate population changes. A smaller unannounced population is not a speed improvement.
- Verify dry-run/no-write and failed-apply/no-write behavior before reorganization; retain realistic-scale performance and reference-identity evidence.
- Run the affected behavioral tier and a fresh composed release battery after the train drains. Keep inherited gate-cutover failures explicit during intermediate checkpoints; never translate them into a clean verdict.
- Update the board, current design and durable receipts. Remove superseded readers, lists, aliases, comments and compatibility scaffolding in the corresponding migration.

Mutation threshold changes, unrelated product features, and the remaining gate conversions are not bundled into this program by default. Finish the coordinated world/test/config work first; the gate program remains a subsequent work queue.
