---
kind: work
status: open
updated: 2026-10-10
priority: P3
area: client
---

# Phone pass P3 bundle

## What

P3 findings from the phone pass: alternate greeting stamps edited (edit.ts:606), nine-item message actions menu, context chip inconsistency, gutters 8 vs 24px, greeting/opening and every-chat naming splits, desktop-only dropzone copy, suggested tags push card fields, triple Connections heading, oversized switch with tiny label, empty role picker has no next step, double empty state on Home, avatar gutter width. Source: ~/Archives/orbweaver-reviews/phone-pass-oct10.md P3 items. Also: side-eye the phone topbar with Report a bug.

## Why

Phone pass findings below P2.

## Done when

Each P3 in the report is fixed or ruled, with the ruling recorded here.

## Evidence

Fixed:

- Dropzone copy follows the pointer. `FileDropzone` takes a `subject`; a fine pointer reads "drop it or click", a coarse pointer reads "tap to choose it", and the default line does the same. The character, preset, chat and library import dialogs pass a `subject`. Test: `tests/ui/primitives/file-dropzone/platform-pointer-instructions.suite.ct.tsx` (component test; 4 failed on the old source, 4 passed after, in Chromium and WebKit).

- Home on an account with no rooms says its empty state once: the masthead greets and the recents tile keeps the empty-state text and action. Test: `tests/client/features/app-shell/surfaces/platform-home-empty.suite.ct.tsx`.

- Choosing an alternate greeting no longer stamps `editedAt` (`createSetSeededGreeting` in `packages/server/src/domain/chat/verbs/edit.ts`, `editMessageContentStatements` in `packages/server/src/domain/chat/persistence/canon-write.ts`); a hand edit made earlier keeps its own stamp. D166 only keeps seeded greetings steppable and editable until the first user turn. The client reads no `editedAt` anywhere (no ast-grep match for `.editedAt` in `packages/client/src`, `-l ts` and `-l tsx`), so no edited mark renders for the row. Test through the router: `tests/server/domain/chat/verbs/greeting-step-edit-stamp.int.test.ts` (red on the old source: the step stamped the row; green after; the two greeting suites beside it stay green).

Ruled:

- The avatar gutter cost: the transcript chip is a 24px avatar in every style that keeps one, and Moonlit keeps its avatar chip on a phone. The gutter stays.

Open, with the reason each is not a clear bar:

- Nine-item message actions menu: the menu sits in the message edit toolbar, which the 1435 lane owns.
- Context chips, triple Connections heading, empty role picker's next step: each needs a choice of which element wins or a cross-section opener that does not exist.
- Gutters 8 versus 24px: shell CSS, owned by the shell lane.
- Greeting versus opening naming, and "Every chat" versus "Everywhere": a vocabulary ruling (`docs/law/vocabulary-map.md`).
- Suggested tags pushing card fields: board 0613.
- Oversized switch with a small label: the `Switch` primitive, owned by the tone lane.
- `shell-list-toggle` has no rule: the marker lives in the shell topbar, owned by the shell lane.
- Phone topbar side-eye: needs the side-eye role.
