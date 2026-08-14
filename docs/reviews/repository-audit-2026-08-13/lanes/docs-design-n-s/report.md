# Lane report — docs-design-n-s

## Lane identity

- Lane: `docs-design-n-s`
- Semantic scope: 27 design, study, record, and active-plan documents from `node-26-adoption-program.md` through `streaming-reveal-42.md`. Their status metadata is audited against only the specifically named current source, tests, gates, and UI seams.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`
- Working-tree basis: all 27 owned documents are clean and hash-identical to the assignment snapshot. A concurrently dirty design document exists outside this lane.
- Assigned files read: 27 / 27 (100%).
- Assigned lines read: 12,629 / 12,629 (100%).
- Assigned bytes read: 1,041,051 / 1,041,051 (100%).
- Dirty assigned paths: 0.
- Exclusions: source and tests remain owned by their semantic lanes; this lane used them only to verify claims the assigned documents expressly make.
- Structural scan coverage: `pnpm ast` loaded the documented TS/TSX scope for each positive claim: whole `packages` (2,133 TS, 605 TSX), `@orb/ui` (208 TS, 102 TSX), and RPG (74 TS, 0 TSX). No absence conclusion is made.
- Tests examined: 2 unit, 2 integration, 0 contract, 1 CT, 0 e2e, 0 type. No test was re-run.
- Commands with tool failure: 1 incomplete grouped AST call, rerun individually; see `commands.md`.
- Long-running AST commands: 18.8 s (`createRevealPlugin`), 22.9 s (`turnRung`), and 27.9 s (`toSorted`); the incomplete grouped call stopped at 30.2 s.

## Read receipt

`read-receipt.tsv` covers all 27 `OWNED` rows from `assignment.txt`; current lines, bytes, and SHA-256 values match every assigned value. No binary file is in scope.

## Architecture observed

The assigned corpus mixes planned design with explicitly closed or landed records; its own status labels must therefore not be read as a uniform implementation claim. The current streaming seam composes `createRevealPlugin()` into `@orb/ui` Markdown (`packages/ui/src/markdown/markdown.tsx:103-115`, R3), and the current RPG ladder retains multiple `turnRung` call sites in its persistence module (AST receipt; `packages/server/src/domain/rpg/persistence/snapshots.ts:220,361,396,432`, R3). The Node ratchet is a registered active gate (`scripts/check/gates/platform-spellings.ts:408-449`, R3). These limited source reads establish named reconciliations only, not a review of their sibling-owned implementations.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Node 26 W4 deferred-promise / spread-sort record | 4 | 3 | 4 | 4 | 2 | high | Current `withResolvers` and `toSorted` AST reaches; active gate at `scripts/check/gates/platform-spellings.ts:408-449`; gate harness fixture at `tests/tooling/check-gates.int.test.ts:761-765`. |
| OpenRouter tool-result warning (finding 4 record) | 3 | 3 | 4 | 1 | 1 | high | Warning emission at `packages/server/src/infra/providers/backends/openrouter/runners/chat/shared.ts:359-371`; focused assertions at `tests/server/infra/providers/backends/openrouter/runners/chat/chat-completions.test.ts:166-205`. |
| RPG rewind record | 4 | 3 | 4 | 1 | 2 | high | `turnRung` current source/AST receipts; transition assertions at `tests/server/domain/rpg/persistence/snapshots.int.test.ts:115-185`. |
| Streaming reveal record | 4 | 3 | 4 | 1 | 2 | high | Plugin composition at `packages/ui/src/markdown/markdown.tsx:103-115`; computed-animation CT at `tests/ui/markdown/markdown.ct.tsx:419-443`. |

## Findings

### DDESNS-01 — Landed W4 record still instructs a future implementation

- Severity: P3
- Class: law-drift
- Confidence: high — it would only fall if the live gate and its conformance fixture were removed; both are current working-tree bytes.
- Evidence rung: R4
- Scope denominator: 27 assigned documents; 1 landed record, corroborated by 1 active gate and 1 integration harness.
- Receipts: `docs/design/node-26-w4-residual-burndown.md:9-14` calls both arms landed and live; the same record nevertheless says to re-enable deferred capture "when this lands" at `:57-58` and to add the spread-sort arm "when this lands" at `:98-99`. The active gate names both arms and registers them at `scripts/check/gates/platform-spellings.ts:408-449`; its integration harness says the W4.5/W4.2 arms landed at `tests/tooling/check-gates.int.test.ts:761-765`.
- Established fact: the document contains mutually exclusive current instructions. Its raw site inventory also names a nonexistent `.ts` table file where the current AST reach is `packages/ui/src/primitives/table/table.tsx` (`docs/design/node-26-w4-residual-burndown.md:90`; AST receipt).
- User or system impact: a future Node/platform lane can needlessly re-enable or add an already-enforced arm, and may start from a dead raw path.
- What remains unverified: current execution of the full gate harness; this lane read the assertions but did not run a sibling-owned behavioral suite.
- Suggested next check or fix: retain the useful re-sweep record, but rewrite `:57-58` and `:98-99` as the superseded pre-landing prescription and correct the `.tsx` raw path.

### DDESNS-02 — Streaming-reveal design is stale after its named implementation landed

- Severity: P3
- Class: law-drift
- Confidence: high — the current production composition and CT both match the document's chosen design; a fresh rendered/live-stream exercise would raise the *operational* evidence, not change the stale-status conclusion.
- Evidence rung: R4
- Scope denominator: 27 assigned documents; 1 active design record, 2 named production files, and 2 named test files.
- Receipts: `docs/design/streaming-reveal-42.md:2-4` remains `status: active`; its chosen design promises `createRevealPlugin` composition at `:106-137` and the computed-animation CT at `:179-190`. The plugin is currently composed at `packages/ui/src/markdown/markdown.tsx:103-115`, and `tests/ui/markdown/markdown.ct.tsx:419-443` asserts a real `orb-word-reveal` computed animation plus code-fence exclusion. The document's raw test paths at `docs/design/streaming-reveal-42.md:187,190` end in `.ts`, while the present tests are `.tsx`.
- Established fact: the record still frames the selected architecture as an active fix despite its named implementation and regression test being present, and it sends a reader to two nonexistent raw test paths.
- User or system impact: a reader can treat a finished UI change as outstanding or lose time locating the regression coverage. This does not establish that streaming behavior is broken.
- What remains unverified: a current live-stream/rendering probe and the caret-specific CT named in the document; neither was executed in this docs lane.
- Suggested next check or fix: close or date-banner the record as landed, replace future-tense build text with a historical implementation receipt, and change both raw test references to `.tsx`.

## Proven strengths

- The OpenRouter record's declared loud-drop remedy is present in the runner and has focused positive/negative warning assertions (`docs/design/openrouter-provider-findings.md:81-92`; `packages/server/src/infra/providers/backends/openrouter/runners/chat/shared.ts:359-371`; `tests/server/infra/providers/backends/openrouter/runners/chat/chat-completions.test.ts:166-205`, R4).
- The RPG rewind record's declared selected-lineage repair is present and guarded by transition assertions for the quiet-sibling, non-selected-sibling, and quiet-tail cases (`docs/design/rpg-rewind-stuck-state.md:158-171,199-220`; `packages/server/src/domain/rpg/persistence/snapshots.ts:201-220,361-369`; `tests/server/domain/rpg/persistence/snapshots.int.test.ts:115-185`, R4).

## Declared versus completed

| Declared surface | Strongest current evidence | Classification |
| - | - | - |
| Node W4 deferred / spread-sort arms | R4 active gate plus integration-harness conformance text | Landed, but its record retains stale future instructions. |
| OpenRouter finding 4 (`isError` drop) | R4 warning-emission source plus focused positive/negative assertions | Declared applied and corroborated. |
| RPG rewind arm A | R4 persistence transition tests plus current ladder source | Declared fixed and corroborated. |
| Streaming word reveal | R4 production composition plus computed-animation CT | Implemented but still documented as active. |
| Remaining design/proposal/study documents | R0–R2 by this lane unless individually corroborated above | Intent, options, or historical evidence; not treated as shipped behavior. |

## Tests and gates

The read current tests contain meaningful assertions, rather than mere imports: the OpenRouter test asserts both the warning and its absence on success; RPG tests drive the swipe transition in both directions; the Markdown CT reads computed `animationName`, not only an attribute (`tests/server/infra/providers/backends/openrouter/runners/chat/chat-completions.test.ts:166-205`; `tests/server/domain/rpg/persistence/snapshots.int.test.ts:115-185`; `tests/ui/markdown/markdown.ct.tsx:419-451`, R4). `platform-spellings` is registered as active with must-flag/must-pass declarations (`scripts/check/gates/platform-spellings.ts:408-449,512-694`, R3), but this documentation lane did not run its positive control. `pnpm check:docs` passed and the six actual relative Markdown links resolve, but neither check proves behavioral correctness or validates raw inline-code paths.

## Cross-lane edges

- The gates/tooling lane should decide whether to run the current `platform-spellings` conformance harness before relying on the Node W4 record's historical landing receipt; this lane established only source/test presence.
- The UI rendering lane owns current visual verification of the streaming reveal and caret; DDESNS-02 is documentation drift, not a claim that the currently shipped visual result meets the design probe's live metrics.
- The current-docs/synthesis lane should consolidate the two P3 record repairs with other raw-path/status drift rather than infer implementation work from them.

## Tool receipts

See `commands.md` for the full-read traversal, hashes, scoped AST commands and file counts, safe docs check, Markdown-link resolver, raw-path candidate inventory, exclusions, and the one incomplete grouped AST run.

## Lane verdict

All 27 assigned documents were read and remain snapshot-clean. The corpus correctly distinguishes many proposals, studies, options, and records from shipped code; three claimed completed seams (OpenRouter warning, RPG rewind, streaming reveal) have current code/test corroboration. Two P3 documentation-truth defects remain: a landed Node W4 record retains pre-landing instructions, and the streaming-reveal record still reads active while its named code and CT are present. No production defect is asserted. The largest remaining uncertainty is live/runtime behavior, deliberately not re-executed from this documentation lane.
