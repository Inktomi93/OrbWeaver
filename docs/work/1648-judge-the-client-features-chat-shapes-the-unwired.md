---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/chat shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `client/features/chat`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ChatBooksSectionProps` / `ChatDocumentsSectionProps` | `client/src/features/chat/components/chat-books-section.tsx:48` | restated | unknown (read) | section props that share two fields by coincidence: keep both |
| `ChatBooksSectionProps` / `InjectionsManagerProps` | `client/src/features/chat/components/chat-books-section.tsx:48` | restated | unknown (read) | section props that share two fields by coincidence: keep both |
| `ChatBooksSectionProps` / `RegexOnScreenGroupProps` | `client/src/features/chat/components/chat-books-section.tsx:48` | restated | unknown (read) | section props that share two fields by coincidence: keep both |
| `ChatBooksSectionProps` / `RegexSectionProps` | `client/src/features/chat/components/chat-books-section.tsx:48` | restated | unknown (read) | section props that share two fields by coincidence: keep both |
| `ChatDocumentsSectionProps` / `InjectionsManagerProps` | `client/src/features/chat/components/chat-documents-section.tsx:121` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/chat/components/injections-manager.tsx:317`; a shape that matches by coincidence stays |
| `ChatDocumentsSectionProps` / `RegexOnScreenGroupProps` | `client/src/features/chat/components/chat-documents-section.tsx:121` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/chat/components/regex-on-screen-group.tsx:44`; a shape that matches by coincidence stays |
| `ChatDocumentsSectionProps` / `RegexSectionProps` | `client/src/features/chat/components/chat-documents-section.tsx:121` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/chat/components/regex-section.tsx:55`; a shape that matches by coincidence stays |
| `ChatImportDialogProps` / `CharacterImportDialogProps` | `client/src/features/chat/components/chat-import-dialog.tsx:56` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/character/components/character-import-dialog.tsx:47`; a shape that matches by coincidence stays |
| `InjectionsManagerProps` / `RegexOnScreenGroupProps` | `client/src/features/chat/components/injections-manager.tsx:317` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/chat/components/regex-on-screen-group.tsx:44`; a shape that matches by coincidence stays |
| `InjectionsManagerProps` / `RegexSectionProps` | `client/src/features/chat/components/injections-manager.tsx:317` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/chat/components/regex-section.tsx:55`; a shape that matches by coincidence stays |
| `ReasoningVars` / `ContinueRestoreVars` | `client/src/features/chat/components/message-reasoning.tsx:29` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/chat/components/message-actions-row.tsx:74`; a shape that matches by coincidence stays |
| `RegexOnScreenGroupProps` / `RegexSectionProps` | `client/src/features/chat/components/regex-on-screen-group.tsx:44` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/chat/components/regex-section.tsx:55`; a shape that matches by coincidence stays |
| `ContinueRestoreVars` / `GateKey` | `client/src/features/chat/hooks/use-composer-utilities.ts:26` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/chat/hooks/use-variant-history.ts:29`; a shape that matches by coincidence stays |
| `ContinueRestoreVars` / `ReasoningVars` | `client/src/features/chat/hooks/use-composer-utilities.ts:26` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/chat/components/message-reasoning.tsx:29`; a shape that matches by coincidence stays |
| `SetHostDisplayScriptsVars` / `RpgSceneCardsProps` | `client/src/features/chat/hooks/use-context-panel-mutations.ts:46` | restated | unknown (read) | mutation variables and component props that share two fields by coincidence: keep both |
| `SetOfferChoicesVars` / `RpgSceneCardsProps` | `client/src/features/chat/hooks/use-context-panel-mutations.ts:60` | restated | unknown (read) | mutation variables and component props that share two fields by coincidence: keep both |
| `SetCharactersCanReactVars` / `RpgSceneCardsProps` | `client/src/features/chat/hooks/use-context-panel-mutations.ts:74` | restated | unknown (read) | mutation variables and component props that share two fields by coincidence: keep both |
| `SetReactionsEnabledVars` / `RpgSceneCardsProps` | `client/src/features/chat/hooks/use-context-panel-mutations.ts:87` | restated | unknown (read) | mutation variables and component props that share two fields by coincidence: keep both |
| `SetMemberPersonaLoreVars` / `RpgSceneCardsProps` | `client/src/features/chat/hooks/use-context-panel-mutations.ts:101` | restated | unknown (read) | mutation variables and component props that share two fields by coincidence: keep both |
| `ContinueTurnVars` / `SwipeVars` | `client/src/features/chat/hooks/use-continue-turn.ts:24` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/chat/components/swipe-strip.tsx:34`; a shape that matches by coincidence stays |
| `GateKey` / `ReasoningVars` | `client/src/features/chat/hooks/use-variant-history.ts:29` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/chat/components/message-reasoning.tsx:29`; a shape that matches by coincidence stays |
| `GateKey` / `ContinueRestoreVars` | `client/src/features/chat/hooks/use-variant-history.ts:29` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/chat/components/message-actions-row.tsx:74`; a shape that matches by coincidence stays |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

22 rows: applied 0, kept 22, handed off 0, owner question 0. No code changed. Scan: ast-grep inline rule (identifier, type_identifier, property_identifier) with `-l ts` and `-l tsx` over `packages tests` (5199 ts and 1450 tsx files): every shape is declared and used only in its own file, except `ContinueRestoreVars`, declared in two files.

- Section props `{ chatId, isHost }` (`ChatBooksSectionProps`, `ChatDocumentsSectionProps`, `InjectionsManagerProps`, `RegexOnScreenGroupProps`, `RegexSectionProps`; 10 rows): kept. Each is the prop contract of a separate component. They match because the settings tab passes the same two values to each sibling; one shared type would make five component contracts change together when one gains a prop.
- `ChatImportDialogProps` / `CharacterImportDialogProps` (1 row): kept. Both are `{ open, onOpenChange }` of dialogs in different features. A shared type needs a sideways feature import or a lift for two fields; the dialogs change for different reasons.
- `ReasoningVars`, `ContinueRestoreVars`, `GateKey`, `ContinueTurnVars`, `SwipeVars` (6 rows): kept. Each is the variables of a different tRPC procedure (`clearReasoning`, `undoContinue`/`revertContinue`, `continueTurn`, `swipe`) or a query gate key (`GateKey` for `listMessageVariants`). Sharing `{ chatId, messageId }` is a coincidence of the procedures' inputs; merging couples unrelated procedures.
- `SetHostDisplayScriptsVars`, `SetOfferChoicesVars`, `SetCharactersCanReactVars`, `SetReactionsEnabledVars`, `SetMemberPersonaLoreVars` / `RpgSceneCardsProps` (5 rows): kept as the item states; mutation variables against component props.
- Flag, not a row: `ContinueRestoreVars` with the `undoContinue` and `revertContinue` mutation hooks is declared in both `hooks/use-composer-utilities.ts` and `components/message-actions-row.tsx`. That is duplicated mutation hooks, a different finding from this scan.
