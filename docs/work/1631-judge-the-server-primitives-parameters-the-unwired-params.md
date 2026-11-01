---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/primitives parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/primitives`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `parseReasoningTags.options.strict` | `server/src/primitives/reasoning/index.ts:31` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `createRegexApplyReplace.timeoutMs` | `server/src/primitives/regex/index.ts:26` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `createRegexTest.timeoutMs` | `server/src/primitives/regex/index.ts:54` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `buildCardV3.fields.spec` | `server/src/primitives/serde/card/index.ts:830` | unsupplied-prop | delete | delete the prop and its default path (1 call); 25 test calls supply it |
| `defineJsonRowsSerde.spec.envelopeOptional` | `server/src/primitives/serde/lib/index.ts:223` | unsupplied-prop | delete | delete the prop and its default path (4 calls) |
| `defineJsonObjectSerde.spec.legacyVersionKeys` | `server/src/primitives/serde/lib/index.ts:255` | unsupplied-prop | delete | delete the prop and its default path (6 calls) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

6 rows: applied 5, handed off 1, kept 0, owner questions 0.

Applied: `parseReasoningTags.options.strict` (the open tag is always anchored at the start, as the sole caller `domain/chat/engine/pipeline.ts:492` always got); `createRegexApplyReplace.timeoutMs` and `createRegexTest.timeoutMs` (both callers, `entry/compose/chat.ts:416,418`, pass none; the 50 ms ReDoS watchdog keeps its name, `REGEX_APPLY_TIMEOUT_MS`); `defineJsonRowsSerde.spec.envelopeOptional` and `defineJsonObjectSerde.spec.legacyVersionKeys` (the shared envelope spec is split: `legacyVersionKeys` lives on `JsonRowsSerdeSpec`, supplied by world-info at `serde/world-info/index.ts:44`; `envelopeOptional` lives on `JsonObjectSerdeSpec`, supplied by persona and regex at `serde/persona/index.ts:43` and `serde/regex/index.ts:22`; the shared `checkEnvelope` reads both through `EnvelopeRelaxations`).

Handed off (only a test file supplies it; test not rewritten): `buildCardV3.fields.spec`. The only production caller, `domain/export/verbs/export-character.ts:145`, never sets it; `tests/server/primitives/serde/card/card-serde.contract.test.ts` supplies it (the V2 arm at 245, via `exportFields`). Readers: `serde/card/index.ts:869-873`.

Survey: codegraph_explore on the six symbols; ast-grep `parseReasoningTags($$$)` on -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): 1 call (tsx 0); literal `rg` for envelopeOptional, legacyVersionKeys, buildCardV3, createRegexApplyReplace, createRegexTest: no spread or `as const` writer.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.tests-iso.json tsconfig.node.json` exit 0; `pnpm test` card-serde.contract, library-planes, prompt-cache-prefix, core-reasoning: 4 files, 77 passed.
