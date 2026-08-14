# Client shared library and mirrored tests

## Lane identity

- Lane: `client-lib`
- Semantic scope: 45 `packages/client/src/lib` modules, 20 executable/type tests, and one CT story module.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`.
- Working-tree basis: current bytes equal the assignment SHA-256 for all 66 owned files; shared prerequisite bytes also match.
- Assigned files read: 75 / 75 (100%).
- Assigned lines read: 11,251 / 11,251 (100%).
- Assigned bytes read: 638,564 / 638,564 (100%).
- Dirty assigned paths: 0. The three lane artifacts are new, untracked audit outputs only.
- Exclusions: no production, test, gate, or sibling-lane files outside `assignment.txt` were analyzed; `packages/client/vite.config.ts` was read only to hand off the CT warning.

## Read receipt

`read-receipt.tsv` covers every one of the 66 owned and 9 shared rows in `assignment.txt`; all current hashes match its frozen values.

## Architecture observed

`packages/client/src/lib/index.ts:8-117` is the client-private `#lib` front door: it re-exports shared display, registry, notification, rendering, accessibility, and utility seams while deliberately excluding dev-only modules. `packages/client/src/lib/create-registry-context.tsx:28-42` mints the context/provider/read-hook trio used by registry consumers; `packages/client/src/lib/registry.ts:1-76` provides the duplicate-checking registry primitive. The repository-native importer lens finds live `#lib` imports across client composition, data, and feature modules (R3; `commands.md`).

The client library keeps operational/browser seams out of pure transforms: `agent-bridge.ts:40-86` waits for observed query activity before declaring initial-read settle, and `toast-notify.ts:25-55` adapts the implementation-free notification facade to the UI toast manager. Pure rendering and policy seams are independently exercised by the node unit suite (`message-render.test.ts:1-146`, `render-trust.test.ts:1-187`; R4); browser-visible readiness, motion, toast, and glyph behavior are exercised by the assigned CTs (R5; `commands.md`).

## Subsystem scorecards

| Subsystem (denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Shared pure library surfaces (45 source modules) | 4 | 3 | 3 | 3 | 3 | medium | `index.ts:8-117`; 89 current unit assertions; 3 current type checks; 246 client files import `#lib` (commands). |
| Browser instrumentation and notification seams (agent bridge, motion flaggers/stats, toast adapter; 5 CT files) | 4 | 3 | 4 | 2 | 3 | high | `agent-bridge.ts:40-86`, `toast-notify.ts:25-55`; 12/12 current CT cases. |
| Client-lib barrel liveness (45 source modules) | 0 | 3 | 2 | 3 | 0 | medium | `pnpm ast` reports no orphans/test-only exports and no client import cycles; liveness is syntax/resolution bounded, not end-to-end proof. |

## Findings

### client-lib-01 — CT build emits an unsupported-target warning for the configured JavaScript target

- Severity: P3
- Class: instrument-defect
- Confidence: high — rerun the CT build after aligning the Vite/esbuild target handling to raise this to a resolved state.
- Evidence rung: R5 for the passing CT run; R2 for the configuration declaration.
- Scope denominator: the five assigned CT files, whose run built 5,076 modules and passed 12 cases.
- Receipts: `packages/client/vite.config.ts:240-247` configures `target` and `cssTarget` as `"es2025"`; the current assigned CT command emitted `Unrecognized target environment "es2025"` for assigned modules including `agent-bridge.ts`, `motion-flaggers.ts`, `motion-stats.ts`, `weave-glyph.tsx`, and `index.ts`, then reported `12 passed · 0 failed · 0 flaky · 0 skipped` (`commands.md`).
- Established fact: the component-test build succeeds but emits repeated target-recognition warnings despite the declared target.
- User or system impact: warning volume obscures actionable CT output and could conceal a real transform/configuration issue.
- What remains unverified: whether Vite's CT transform merely warns and preserves the intended target, or silently lowers it; Vite/package configuration is outside this lane.
- Suggested next check or fix: root-config/tooling owner should inspect the Vite/esbuild version-target compatibility and make the CT transform either recognize the configured target or use an explicitly supported equivalent.

## Proven strengths

- `agent-bridge.ts:40-86` does not set `data-app-ready` merely because the grace elapsed; `agent-bridge.ct.tsx:18-35` drives a still-pending query beyond the grace, then proves the attribute appears only after resolution (R5).
- `trpc-devlog.ts:44-107` redacts sensitive key classes before console serialization; `trpc-devlog.test.ts:35-91` asserts that API-key/token/password values are absent while non-secret values remain visible (R4).
- `render-trust.ts`’s fail-closed row policy is covered by the 13 asserted cases in `render-trust.test.ts`, including absent policy and unauthenticated viewer arms (R4).

## Declared versus completed

The `#lib` barrel declares the cross-cutting client surface (`index.ts:8-117`, R2) and current client modules import it through the sanctioned alias (R3; 246 literal-confirmed importer files). The directly mirrored suite currently proves 13 node-test files/89 assertions, one type file/3 checks, and five CT files/12 browser cases (R4/R5). The assignment contains 45 source modules but only 20 executable/type test files plus one CT story, so this is not a claim that every exported helper has dedicated coverage.

## Tests and gates

The node tests assert behavior and error/fail-closed arms rather than existence: title fallback (`chat-title.test.ts:13-38`), non-DOM error payload omission (`client-error-report.test.ts:13-42`), regex/message pipeline behavior (`message-render.test.ts:1-146`), and redaction (`trpc-devlog.test.ts:35-91`). The assigned CT run currently proves browser behavior at R5; it was green, although its target warnings are finding `client-lib-01`. No lane-local gate positive control was run because gates are owned by the gate lanes; the test/liveness results are not static-gate substitutes.

## Cross-lane edges

- Hand off `client-lib-01` to the root-config/tooling lane: `packages/client/vite.config.ts:240-247` declares `es2025`, but the current CT build warns it is unrecognized.
- `pnpm ast importers @orb/client/lib` returned no results because internal consumers use `#lib`; the `#lib` importer result and literal 246-file count are the applicable wiring evidence, not a package-export absence claim.

## Tool receipts

`pnpm ast` was read and used for orphan, test-only, cycle, and importer lenses. The two clean liveness lenses were constrained to the 45 assigned lib sources and each returned exit 0/no results; an independent literal import search covered 932 client source files and found 246 `#lib` importer files. Full commands, timing, scoped test counts, the initial CT policy block, and the successful direct CT rerun are in `commands.md`.

## Lane verdict

All 75 assigned files are read and hash-current. The client library is demonstrably consumed through `#lib`; its assigned suites currently pass 89 unit assertions, 3 type checks, and 12 CT assertions. The audit found no orphan/test-only export or client import-cycle candidate in the assigned lib scope. The only finding is noisy CT target recognition for the configured `es2025` target; it does not fail the current CT run, but it weakens the signal-to-noise of that verification surface. Dedicated coverage cannot be inferred for every one of the 45 source modules from the assigned 20 executable/type test files plus story module.
