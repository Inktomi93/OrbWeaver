---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: client
plan: cross-surface-consistency
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

Step 7a re-check:

- Suggested tags pushing card fields: board 0613 landed, so that finding is closed with it.
- Message actions menu: the 1435 lane that owned the toolbar has landed. This re-check did not recount the menu; the rendered review of the phone message toolbar decides it.
- The earlier recommended defaults predate the CSS system and are withdrawn; each point is judged below against D336, the token ramps, the step-4 extraction, the 1489 templates and `docs/law/client-architecture-lockdown.md` §4.

Judged on the current standard. Instrument: `pnpm snap --dirty --mobile --viewport 390x844` on isolated stage band 0, scenario `Connections`, `Rules`, `Blank chat` with computed-geometry evals; run slot `reports/runs/snap/agent-a9e84be4a77dcc8a0-3246413-2026-10-31T22-45-39-887Z`. Load was 34 on 24 cores (load-suspect; layout numbers, not timing). Fresh-stage db, so no connections exist.

Closed, the standard decides:

- Oversized switch with a small label: the Rules switch measures a 64x44 track beside a 13px label. The track is `--size-switch-track` 64 and `--size-switch-track-height` 44 at a coarse pointer (48 and 32 at a fine one), set in `packages/ui/src/primitives/switch/variants.ts`; the label is the `label` voice step. The pair is the touch-target ramp, not a defect; no change.
- Nine-item message actions menu: ruled. `packages/client/src/features/chat/components/message-actions-row.tsx` states "disabled-with-reason when absent, NEVER hidden (owner: no reduced menus)" for the continuation pair, and `.claude/rules/ui-and-client.md` ("Empty, disabled and degraded states") says to render the real surface with inapplicable affordances disabled and explained. The `More message actions` control renders at 390 (x 338..370, y 70..102, run slot above); the menu count was not recounted.
- Phone topbar: the chat topbar at 390 holds Back to Chats (12..60), Show details (226..274), Members (282..326) and Memory (334..378) with 8px gaps, no overlap and no horizontal scroll (scrollWidth 390). No Report a bug control sits in it. The side-eye of the topbar itself is not done here.

Built under the owner rulings:

- Connections settings heading. The shell crumb and the pane title stay. The first section's h3 "Connections" is screen-reader-only (`sr-only`), the mechanism `ConnectionsBody` already uses while an editor is open (`packages/client/src/features/credentials/components/connections-list-section.tsx`). Test: `tests/client/features/credentials/components/connections-list-heading.ct.tsx` finds the heading by role and level 3 and measures it at most 1px; it failed on the old source (width 1280) and passes after.
- Empty role picker: no opener inside the picker. The Connections list empty state on the same screen offers Add connection. Closed, no change.
- Scope wording is "Everywhere". The two outliers, `packages/client/src/features/databank/components/add-document-body.tsx` (scope toggle) and `packages/client/src/features/databank/components/databank-active-in.tsx` (active-in badge), now read "Everywhere". The sweep of "Every chat" in `packages/client` and `tests` (rg, plus ast-grep string scans with `-l ts` and `-l tsx`) found no other scope chip or scope label. What remains is verb phrases and sentences ("Use in every chat", "Runs in every chat", "Fires in every chat", "Feed every chat"), which are switch and menu sentences, not scope labels. The testkit and e2e names (`tests/e2e/support/surface-sections.ts`) address those sentences and stay. The vocabulary row is in `docs/law/vocabulary-map.md`.
- A character's first message is the "greeting". The vocabulary row is in `docs/law/vocabulary-map.md`. Renamed in UI copy: the character greeting strip and its add, remove and edit names (`packages/client/src/features/character/components/character-greeting-preview.tsx`, words in `packages/client/src/features/character/lib/greeting-copy.ts`), the member card viewer section title (`packages/client/src/features/chat/components/member-card-viewer.tsx`), the populate control gloss (`packages/client/src/features/rpg/components/rpg-populate-control.tsx`), and the preset labels for the greeting steer, its prose slot and the greeting block (`packages/contracts/src/preset/index.ts`, `packages/contracts/src/preset/prose.ts`, `packages/contracts/src/rpg/prose.ts`). Code names stay: the `opening` steer id, the `{{opening}}` macro, `rpg.populate.openingBlock`, `data-slot="greeting-opening"`. Not renamed, because they do not mean a character's first message: the Select opening observation, "Opening the session", "reopening this dialog", "Opening tag", and the imagery templates gloss "Your opening line". Test: `tests/client/features/character/components/greeting-focus.ct.tsx` addresses the controls through `greeting-copy.ts`; it failed on the old source (the Greeting 2 pill did not exist) and passes after.

Closed, the standard decides. Instrument: `pnpm snap --dirty --mobile --viewport 390x844` on an isolated stage of this checkout, run slot `reports/runs/snap/agent-a44ccd58358ddfee1-3435825-2026-10-31T23-11-37-834Z`. The box was loaded (52 on 24 cores), so the numbers are layout only. The fresh stage holds no chat, so the chat topbar boxes come from the earlier capture above.

- Context chips. The Members chip (`RosterChipButton` in `packages/client/src/features/chat/components/chat-header.tsx`) and the Memory chip (`packages/client/src/features/chat/components/chat-recall-indicator.tsx`) are both `Button variant="outline" shape="pill" size="sm"`: one chip family. "MEMORY — IDLE" is the accessible name from `recallLabel`; the chip paints a glyph and a digit, never caps text. The actionable-chip grammar (ink lifts, border does not distinguish) is stated at the Memory chip. No change.
- Gutters 8 versus 24px. The two numbers are two tiers. The topbar rides `--spacing-block` for its inset (12 at x 12 in the Home capture) and `--spacing-row` for the 8px gap between its controls (`packages/client/src/features/app-shell/surfaces/shell/chrome.css`); page content sits at x 24, width 342 at 390 in the same capture, which is the page surface's own edge padding. The 8 is a control gap and the 24 is a surface edge, so they are not one gutter. The topbar values are tokens from `packages/ui/src/tokens/tokens.json`; no value is added. No change.
- `shell-list-toggle` has no rule. It is a focus-return marker (`LIST_TOGGLE_MARKER`, written as `data-focus-return-marker` in `packages/client/src/features/app-shell/components/shell-topbar.tsx` and read by `useOverlayFocus`), not a style hook. A rule for it would be dead CSS. No change.
