## Lane identity

- Lane: `client-chat-lib`
- Semantic scope: chat feature library models, contributions, render dispatch, notifications, and mirrored node/CT tests.
- Snapshot commit: `c93253a3f907fb7fd93d411c511a98ed378505db`.
- Working-tree basis: post-read reconciliation at `632d42f989448451e7cbcc789a985ee0a862208c`, 2026-08-13T23:37:15-06:00; all owned bytes remain assignment-identical.
- Assigned files read: 86 / 86 (100%).
- Assigned lines read: 6,368 / 6,368 (100%).
- Assigned bytes read: 334,882 / 334,882 (100%).
- Dirty assigned paths: 0.
- Exclusions: sibling source/components/composition roots are not semantically audited; only their AST-reference receipts are used for wiring.

## Read receipt

`read-receipt.tsv` covers every `OWNED` assignment path with current count and SHA-256 values. It reconciles exactly (86 files, 6,368 text lines, 334,882 bytes); no audit-state drift occurred.

## Architecture observed

The library keeps DOM-free transformations and total dispatches in `lib` (for example attribution, document visibility, slash parsing, arrival diffs, settings projections, and notice mapping), while TSX contribution definitions carry registrations to feature components. `makeChatsSection` exposes the chat shell definition at `packages/client/src/features/chat/lib/chats-section.tsx:113`; AST follows it through the feature front door to `packages/client/src/main.tsx:239` (R3). `chatSlashCommands` is similarly assembled in `packages/client/src/main.tsx:200` (R3). Warning mapping is feature-consumed by `packages/client/src/features/chat/components/chat-content.tsx:14` (R3).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Pure chat render/model rules (45 non-TSX production files; 24 node suites) | 4 | 3 | 4 | 3 | 3 | high | `attribution.ts:180`, `slash-command.ts:145`, `new-arrivals.ts:62`, `warning-notice.ts:34`; 234 current unit assertions (R4) |
| Chat shell/contribution surface (14 TSX/contribution files; 2 CT suites) | 4 | 3 | 5 | 3 | 4 | high | `packages/client/src/features/chat/lib/chats-section.tsx:113-158`; `packages/client/src/main.tsx:239` AST receipt (R3); current CT assertions at `tests/client/features/chat/lib/chats-section.ct.tsx:155-525` and `tests/client/features/chat/lib/chats-selection-title.ct.tsx:44-84` passed (R5) |

## Findings

No product or instrument defect was established. The first raw-Playwright attempt was an invocation error: it bypassed the repository's sanctioned wrapper and was rejected before launch. The coordinator reran `pnpm test:ct tests/client/features/chat/lib`; both assigned CT files passed 21/21, producing a fresh `reports/ct-report.json`. The failed attempt remains in `commands.md` as superseded audit history, not a finding.

## Proven strengths

- `resolveRowAttribution` preserves historical character identity, refuses cross-user persona fallback, and has total narrator handling (`packages/client/src/features/chat/lib/attribution.ts:180-238`, `:136-146`), covered by the current 32-test attribution suite (`tests/client/features/chat/lib/attribution.test.ts:64-78`, `:218-235`, `:443-497`) — R4.
- The message-model dispatch is exhaustive at compile time for both chat-style skins and warning/abort axes (`packages/client/src/features/chat/lib/message-row-variants.ts:171-227`, `warning-notice.ts:34-72`, `turn-abort-notice.ts:31-45`), with current unit coverage of vocabularies and all warning/abort members — R4.
- The two owned CT suites now have current R5 browser proof: 21/21 tests passed through the sanctioned repository wrapper, covering host/member visibility, mutations, and draft title behavior.

## Declared versus completed

The assigned source declares 59 production modules and 27 mirrored support/test files. `pnpm ast orphans packages/client/src/features/chat/lib` returned zero candidates across the 59 production modules; without an independent negative method this remains bounded tool output. Twenty-four node tests executed currently and passed (234 assertions, R4). Both CT suites executed through the sanctioned wrapper and passed 21/21 (R5).

## Tests and gates

Node tests meaningfully exercise success and failure boundaries: identity fallbacks, stale-boundary refusal, complete union vocabularies, parser escapes, set replacement, and no-op/abort cases. `pnpm check:tests-execution-membership` and `pnpm check:tests-membership` passed, proving runner/type-program membership for the whole test tree. The CT tests are well-targeted and currently green at 21/21 through the sanctioned wrapper. No green static result is treated as behavioral proof.

## Cross-lane edges

- Composition reach is owned by the client shell/runtime lane: current AST evidence shows `main.tsx:200,239` consumption, but this lane did not audit registry correctness beyond those resolved references.
- Browser runtime/CT harness ownership remains with verification-harness, but its sanctioned `pnpm test:ct` wrapper executed this lane successfully; the rejected raw invocation is not a harness defect.

## Tool receipts

See `commands.md` for full scope, exits, duration, AST counts, literal denominator, and failure handling. AST completed: bare usage, one 25.2s `orphans` lens, two importer lenses, and two reference lenses. No long AST command timed out. The raw CT invocation was rejected before launch; the sanctioned CT command passed and supersedes it.

## Lane verdict

All 86 assigned files were fully read and remained snapshot-identical. The pure library has strong current node-level R4 proof (24 files, 234 assertions), both assigned CT files pass 21/21 at R5, and the principal composition surfaces resolve into `main.tsx`. The native orphan lens returned no candidates, retained as bounded tool output rather than a universal absence claim. No source or harness defect was established in this lane.
