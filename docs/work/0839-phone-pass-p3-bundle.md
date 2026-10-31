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

Not built, for a product call or another owner:

- Triple Connections heading. At 390 the shell crumb reads Settings, Connections; the pane title is an h2 "Connections" at y 71; the first section is an h3 "Connections" at y 72, then h3 "Model roles" (y 579) and h3 "Saved keys" (y 2036). Which of the three to drop is a template call (the settings-pane template in `docs/plans/cross-surface-consistency/design.md`). Recommended: keep the pane title and the shell crumb, and make the first section's heading screen-reader-only, as `ConnectionsBody` already does while an editor is open.
- Empty role picker with no next step. The Model roles section sits under the Connections list section, whose own empty state carries the Add connection action on the same screen. Recommended: no new opener inside the role picker; if the owner wants one, a ghost button to `CONNECTIONS_LIST_ADDRESS` through `openConfigTo`, the opener `BuiltinRerankerHint` in `connections-roles-section.tsx` already uses.
- "Every chat" versus "Everywhere". `docs/law/vocabulary-map.md` already carries "Everywhere" and "This chat" as the shipped scope words (Documents rack chips, the Regex section, the character gallery). "Every chat" is the outlier at `packages/client/src/features/databank/components/add-document-body.tsx:144` and `packages/client/src/features/databank/components/databank-active-in.tsx:74`. Recommended: "Everywhere", which reverses the earlier default and needs no map change. The persona rulings are unaffected: there is still no Everywhere persona picker.
- Greeting versus opening naming: a vocabulary row for the owner; no word is mapped yet.
- Context chips (a caps bordered "MEMORY — IDLE" pill beside a plain "1 member" chip) and gutters 8 versus 24px: the chip row geometry is uniform (above) but the pill-versus-chip styling was not judged, and the gutter probe returned no usable number. Both are shell-owned and stay open for the rendered review of the shell, with no value added to match the old finding.
- `shell-list-toggle` has no rule: shell-owned, unchanged.
