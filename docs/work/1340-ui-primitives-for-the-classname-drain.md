---
kind: work
status: open
updated: 2026-10-24
priority: P1
area: ui
plan: css-system
---

# UI primitives for the feature className drain

## What

The 402 sites `orb/feature-classname-layout-only` and `orb/no-built-class-string` report (exact rows: `docs/plans/css-system/feature-classname-sites.md`) need primitive props that do not exist yet. This item builds them; items 1334–1336 and 1338 migrate the sites onto them.

## Owner rulings

2026-10-24:

- A bordered, rounded, filled Row or Stack is a **Card**: add the missing Card shapes (inset/outline row, nested well) as Card variants; no new surface vocabulary.
- Text colour by meaning is a **tone**: extend Text `tone` with `info`, `accolade`, `speaker`, `dialogue`, `narration`.
- Pointer visibility is a **primitive prop**: `hiddenAt="coarse"|"fine"` and `srOnlyAt="coarse"` on Text, Row, Stack and Button, a reveal prop on ListRow/Row for hover-reveal actions, and touch-floor props replacing the `*_AT_COARSE` constants.
- Link-styled buttons use a Button **`intent="link"`** (the Link primitive where it navigates); line-through is a Text **`strike`** boolean.
- Also needed from the site census: Icon `tone` (item 1334), an Icon shadow arm (`MESSAGE_ACTION_ICON_CLASS`), a numeric prop on `TrackerValue`, and the datum and code voices (item 1338).

## Done when

Every prop above exists in `@orb/ui` with a CT per new variant, the token or recipe it paints from, and law text in UI-Density-Law or ui-package-design naming it; no feature site is migrated in this item.

## Evidence

Built, each with its CT in `tests/ui/primitives/classname-drain-props.ct.tsx` (13 pass, coarse and fine pointer) and its law row in `docs/law/UI-Density-Law.md` §2.3 and §4.3:

| prop | paints from | site rows it unblocks (`feature-classname-sites.md`) |
| - | - | - |
| Text `tone` `info` | `TONE_INK` → `--color-info` | message-choices-block 60, connection-fact-rows 72, pivot-band 48, rpg-choice-echo 89 |
| Text and Heading `tone` `accolade` | `--color-accolade` | rpg-act-rail 72 and 77, rpg-game-door 83 and 100, rpg-game-tab 398, rpg-veiled-section 66, rpg-kicker 33 |
| Text `tone` `speaker`, `dialogue`, `narration` | the transcript prose tokens | character-appearance-tab 355, 360, 363; message-row-header 59; theme-editor 226, 230, 233 |
| Text `strike` | `line-through` | section-row 158, prompt-readout 289 and 309, rpg-quests-tab 79, 103, 203, tracker-blocks 186 |
| Text `voice="code"` | `font-mono text-code`, foreground | the `font-mono` rows (share-card, share-ip-certificate, share-preconditions, sharing-posture, invite-dialog, analytics tabs, corpus rows, message metadata and cost); each is a judgment site, because the gloss-step mono rows change step and ink |
| Icon `tone` | `TONE_INK` | the Icon rows painting `text-muted-foreground`, `text-warning`, `text-accolade`, `text-primary`, `text-destructive`, `text-success` |
| Icon `shadow` | `drop-shadow-sm` | `MESSAGE_ACTION_ICON_CLASS`: generation-credit 28, message-actions-cluster 53, 64, 76 |
| Button `intent="link"` | `text-primary underline` | composer-next-turn-line 80, character-filter-rail-parts 310 (its dotted decoration is not covered) |
| `hiddenAt`, `srOnlyAt` | `HIDDEN_AT`, `SR_ONLY_AT` (`lib/pointer-visibility.ts`) | `HIDE_AT_COARSE`, `SHOW_ONLY_AT_COARSE`, `LABEL_TO_SR_ONLY_AT_COARSE`, and `ROW_ACTION_INLINE` on Rows and Buttons |
| Row `reveal`, ListRow `revealActions` | `HOVER_REVEAL` (`lib/hover-reveal.ts`) | `ROW_REVEAL` (character-card 277, member-row 244) and `PIN_REVEAL` (persona-card-pin 49, persona-crown 38, persona-panel-row 167, persona-switch-list 274) |
| `touchFloor` on Row, Stack, Button, Badge, CollapsibleTrigger | `TOUCH_FLOOR_AT_COARSE` (`lib/touch-floor.ts`) | `VALUE_ROW_TOUCH_FLOOR_AT_COARSE` (rpg-actor-trackers 265 and 309, rpg-character-detail 100 and 427, meter-row 247), `CHIP_TOUCH_FLOOR_AT_COARSE` (rpg-actor-trackers 324), `CHIP_TOUCH_WIDTH_FLOOR_AT_COARSE` (chat-header 145, chat-recall-indicator 131), `DISCLOSURE_TOUCH_FLOOR_AT_COARSE` (turn-tool-calls-disclosure 91), `PICKER_GAP_AT_COARSE` (rpg-pack-rows 45) |
| Card `shape` `row`, `well`; `tone` `clear`, `accent` | `--radius-control`, `bg-muted`, `bg-accent`; `tiers.css` | rpg-pack-rows 165 and 184, theme-mini-surface 68, appearance-elevation-cards 62 and 75; character-facet-editor 330, persona-editor 92, plugin-leaf-nodes 263; theme-editor 207, appearance-density-cards 34 |
| TrackerValue `numeric`, Input `numeric` | Text and Input `tabular-nums` | the TrackerValue `tabular-nums` rows: rpg-act-rail 92, rpg-character-detail 75 and 149, rpg-game-tab 134, rpg-stat-profile-editor 108 and 126, meter-row 97 and 143 |

Not built: the `datum` voice as ruled in item 1338 (sans `tabular-nums` at the gloss step). The shipped `datum` is D5's mono label step on 63 sites, many of them machine text that belongs to `code`; redefining it before those sites move to `code` would render JSON payloads and provider ids in sans micro. The fork is in the lane report.

Also fixed: `Input` dropped its `width` prop, so every numeric TrackerValue editor rendered full width (red in the CT before the fix); `Card`'s div arm leaked `padding` to the DOM.

Checks: root `pnpm typecheck` green; `pnpm test tests/ui` (89 pass); the new CT plus `tests/client/features/rpg/components` (33 pass); `pnpm lint:css` clean; `knip:prod` exit 0; dependency-cruiser over `packages/ui/src`, `tests/ui/primitives` and the tracker blocks clean.
