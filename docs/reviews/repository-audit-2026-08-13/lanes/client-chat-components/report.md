## Lane identity

- Lane: client-chat-components
- Semantic scope: 76 chat feature React components/hooks and 50 mirrored Playwright component-test files.
- Snapshot commit: `c93253a3f907fb7fd93d411c511a98ed378505db`.
- Working-tree basis: current working-tree bytes reconciled to the snapshot at 2026-08-14T05:29:00Z; every owned path matched.
- Assigned files read: 126 / 126 (100%).
- Assigned lines read: 20,675 / 20,675 (100%).
- Assigned bytes read: 1,081,316 / 1,081,316 (100%).
- Dirty assigned paths: 0.
- Exclusions: no binary files; non-owned feature dependencies, CT harness/stories, package config, and generated reports were inspected only as runtime prerequisites, not audited as owned source.

## Read receipt

`read-receipt.tsv` covers all 126 `OWNED` rows in `assignment.txt`, with current line count, byte count, SHA-256, method, timestamp, snapshot, and reconciliation status. All entries are `MATCH`.

## Architecture observed

The directory supplies React feature leaves; client composition reaches it through the chat feature’s section/surface/front-door chain, and CT stories import the components to mount browser proofs. The resolved importer lens reports 143 imports in 49 files, including `packages/client/src/features/chat/surfaces/chat-room-surface.tsx`, `packages/client/src/features/chat/lib/chats-section.tsx`, and `tests/client/features/chat/_ct-stories.tsx` (R3; `commands.md`, AST importer receipt). The input/mutation edges remain inside feature hooks: for example `AddChatDocumentDialog` drives its attach mutation at `packages/client/src/features/chat/components/add-chat-document-dialog.tsx:104`, while the composer’s browser proof drives the production tRPC route and commit signal (`tests/client/features/chat/components/composer.ct.tsx:1`, R5).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - |
| Composer and guided send controls (5 owned components; 2 direct CT files) | 4 | 4 | 5 | 3 | 4 | high | `packages/client/src/features/chat/components/composer.tsx:1`; `tests/client/features/chat/components/composer.ct.tsx:1`; current 464-test CT receipt (R5). |
| Message rendering, metadata, media, and reasoning (12 owned components; 9 direct CT files) | 4 | 4 | 5 | 3 | 4 | high | `packages/client/src/features/chat/components/message-row.tsx:1`; `tests/client/features/chat/components/message-row.ct.tsx:1`; `tests/client/features/chat/components/message-content.ct.tsx:1` (R5). |
| Settings-section contributions (10 owned components; 10 direct CT files) | 4 | 3 | 5 | 3 | 4 | high | `packages/client/src/features/chat/components/appearance-avatars-section.tsx:47`; `packages/client/src/features/chat/components/chat-behavior-streaming-section.tsx:52`; current same-basename CT files (R5). |
| Preview, roster, list, and auxiliary action leaves (49 owned components; mixed direct/indirect CT) | 3 | 3 | 2 | 3 | 3 | medium | AST importer receipt; 26 files lack a same-basename `.ct.tsx` companion (R3/R5 aggregate only). |

## Findings

### client-chat-components-01 — P2 candidate: 26 source leaves have no same-basename component-test companion

- Severity: P2
- Candidate status: pending parent-CT branch tracing; do not promote to a repository defect without that reconciliation.
- Class: declared-not-tested
- Confidence: medium — it would rise to high after tracing every parent CT assertion to its leaf behavior; the current lane proves the suite executes, not that each of these leaves’ branches is asserted.
- Evidence rung: R3 for reachability; R5 only for the aggregate CT suite.
- Scope denominator: 26 / 76 owned source files lack a same-basename `.ct.tsx` mirror; 50 / 76 do have one. The 50 owned CT files executed 464 expected tests, 0 unexpected.
- Receipts: `packages/client/src/features/chat/components/chat-list-row-menu.tsx:49`, `packages/client/src/features/chat/components/member-row.tsx:47`, `packages/client/src/features/chat/components/composer-utility-menu.tsx:59`, `packages/client/src/features/chat/components/talkativeness-popover.tsx:27`, and `packages/client/src/features/chat/components/use-rewrite-modal.ts:26` export interaction-bearing surfaces; no corresponding same-basename file is among the 50 owned CT paths in `assignment.txt`. The importer lens proves these are reached (R3; `commands.md`), while `pnpm test:ct tests/client/features/chat/components` proves the 50 existing CTs pass (R5; `commands.md`).
- Established fact: the direct CT mirroring coverage is 50/76, leaving list-row actions, member controls, utility-menu behavior, the talkativeness picker, and the rewrite modal hook without a direct mirror in the owned CT set.
- User or system impact: mutations and stateful controls in this subset can regress while the current focused suite stays green; aggregate parent mounts are weaker evidence than an assertion that drives each control’s own visible/error/disabled branch.
- What remains unverified: whether a parent CT indirectly asserts every behavior of each unpaired leaf, especially confirmation/error paths.
- Suggested next check or fix: add focused CT coverage first for the mutation/control leaves named above, beginning with destructive list/member actions and disabled/error states; do not add tautological existence tests for purely presentational helpers.

## Proven strengths

- The 50 owned Playwright CT files ran through the actual CT configuration with 464 expected tests, 0 unexpected and 0 flaky outcomes (`reports/ct-report.json`, `commands.md`; R5).
- Browser proofs include concrete mutation/lifecycle behavior rather than existence-only checks: the composer suite holds the send route and verifies clear-on-commit behavior (`tests/client/features/chat/components/composer.ct.tsx:1`; R5), while message-row verifies real rendered style, attribution, and metadata variants (`tests/client/features/chat/components/message-row.ct.tsx:1`; R5).

## Declared versus completed

The 76 owned source paths are implemented exports and are resolved into client composition (R3; AST importer receipt). Fifty have named CT mirrors that were executed currently (R5). The remaining 26 are not declared dead or unwired — resolved imports reach several of them — but their strongest lane-local proof is R3 plus aggregate CT success, not direct behavior proof.

## Tests and gates

`playwright-ct.config.ts` selects `**/*.ct.tsx`; the exact scoped command executed all 50 owned CT files. Its report is current and clean: 464 expected / 0 unexpected / 0 flaky. The test-type and execution-membership gates passed globally, proving runner/type-program inclusion but not behavioral adequacy. The scoped `@orb/client` typecheck passed. The observed Vite `es2025` target messages were warnings during a successful CT build, not a product defect.

## Cross-lane edges

- The component lane’s R3 composition receipts terminate in `packages/client/src/features/chat/surfaces/chat-room-surface.tsx`, `lib/chats-section.tsx`, and `index.ts`; client-chat-runtime owns reconciliation of their actual runtime route reach.
- Mutation correctness behind component actions belongs to the client-chat-lib/runtime and server chat verb lanes; this lane only proves client invocation and browser behavior.

## Tool receipts

See `commands.md`. Structural scans used the repository `pnpm ast` implementation after its full-read barrier: orphan candidates (76-source component directory), importers (143 hits / 49 files), and cycles (client package). Native orphan/cycle commands returned no candidates; the TS+TSX literal import cross-check found 301 positive local/dynamic import sites but does not independently prove those negatives. No tool timed out or failed.

## Lane verdict

All 126 snapshot-owned paths were read and still match their assigned hashes.

The 50 owned CT files supply current R5 browser proof for 464 assertions, and client type/membership checks are clean.

The directory is live in client composition; native orphan/cycle lenses returned no candidates, retained as bounded tool outputs.

The meaningful remainder is a candidate direct-coverage gap for 26 unpaired leaves, concentrated in list/member/action controls; parent-CT branch tracing is required before severity graduates, and this is not evidence that those components are currently broken.
