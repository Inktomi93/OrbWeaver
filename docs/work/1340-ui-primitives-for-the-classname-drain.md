---
kind: work
status: doing
updated: 2026-10-25
priority: P1
area: ui
lane: closeout/css
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
- A hairline **`divider`** prop on Row and Stack: `start`, `end`, `top`, `bottom`.
- Button **`tone`** for the `ghost` and `link` intents: `primary`, `destructive`, `muted`, reusing `TONE_INK`.
- One **`receded`** prop replaces `opacity-50`, `opacity-60` and a `/60` muted ink.
- Card tones for the sidebar, translucent-card and backdrop fills and the input border.
- The datum order: the drain first moves the machine-text `voice="datum"` sites (payloads, ids, tool names, macros) to `voice="code"`. Only then does `datum` switch to the ruled spelling (sans, `tabular-nums`, gloss step), D5 is updated in the same change, and the `tabular-nums` rows move onto it.

## Done when

Every prop above exists in `@orb/ui` with a CT per new variant, the token or recipe it paints from, and law text in UI-Density-Law or ui-package-design naming it; no feature site is migrated in this item.

## Evidence

Built, each with its CT in `tests/ui/primitives/classname-drain-props.ct.tsx` (17 pass, coarse and fine pointer) and its law row in `docs/law/UI-Density-Law.md` §2.3 and §4.3:

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
| Row and Stack `divider` | `border-<edge> border-border` (`--color-border`) | context-rail 148, character-shelf 46, plugin-row 181, plugin-surface-shell 67, home-also-open-tile-body 57, character-library-welcome 336, new-chat-picker-surface 232, home-tile 113; the `last:`/`first:` resets (corpus-readiness-rail 94, roster-picker 82, accept-review 165) are not covered |
| Button `tone` on `ghost` and `link` | `TONE_INK` | persona-card-pin 49, persona-crown 38, persona-panel-row 167, rpg-field-lock 32, composer-guided-buttons 100, 241, 304, 335, jump-to-latest-pill 47 (its `text-foreground` is not covered) |
| `receded` on Text, Icon, Row, Stack, ListRow | `opacity.receded` (`--opacity-receded`, 60%) | context-rail 374 and 376, section-row 180, chat-summary-row 159 and 253, chat-character-bar 120, chat-documents-section 306, message-row-parts 214, tracker-blocks 151, payload-view 132 (its transition is not covered); the `opacity-50` rows move to the one step |
| Card `tone` `sidebar`, `translucent`, `backdrop`, `input` | `--color-sidebar` and `--color-sidebar-border`, `bg-card/80`, `bg-background/80`, `--color-input` | appearance-elevation-cards 46 and 76, appearance-looks-section 233, message-row-divider 22, import-library-section 89 |
| TrackerValue `numeric`, Input `numeric` | Text and Input `tabular-nums` | the TrackerValue `tabular-nums` rows: rpg-act-rail 92, rpg-character-detail 75 and 149, rpg-game-tab 134, rpg-stat-profile-editor 108 and 126, meter-row 97 and 143 |

The ruled `datum` spelling is built: the body face with tabular figures at the gloss step, in the foreground ink, with D5 updated; the gloss-step `numeric` rows moved onto it.

The finishing props, each with its case in `tests/ui/primitives/classname-drain-finish.ct.tsx` and its law row in `docs/law/UI-Density-Law.md` §2.3 and §4.3: the Text tones `foreground`, `prose`, `onPrimary`, `italic`, `selectAll`, `pulse`, `hoverCue` and the `lead` voice; Icon `pulse`, `openTurn`, `yieldOnHover`; the Button `solid` and `bare` intents, `tone` on `outline` and `secondary`, `selection="rail"`, `underline`, `reserveEdge`, `confirming`, `quietDisabled`, `focusRing`; the Card shapes `float`, `inset`, `plate`, `pill`, `bubble`, the tints and edge tones, `rail`, `shadow`, `holdsField`, `dropTarget`, `presence`, `spoiler`, `focusable`, `ownSlot`; the Row and Stack divider weight, tone, style and `between`, `ground`, `plate`, `focusTarget`, `scrollFade`, the `interactive` and `focus` reveals, `inertUntilHover`, `stateFill`, `highlight`, `spoiler`, `slide`, `lifted`, `fade`, `ink`, `opacityMotion`; the `Swatch` primitive; and the arms on Tabs, CollapsiblePanel, Separator, Skeleton, Textarea, Badge, Select, Input, DialogHeader, Command, BackgroundVideo, CrossfadeImage, MenuItem, WebSpinner and WeaveGlyph. The feature className classifier now reads one declaration per line and skips `@property` registrations (`tests/tooling/eslint-feature-classname.test.ts`). The chat row skin table also uses primitive props. Fixed art treatments and content-column reservations are now primitive choices rather than inline CSS objects. See [CSS closeout](../reviews/css-closeout.md) for current qualification.

Also fixed: `Input` dropped its `width` prop, so every numeric TrackerValue editor rendered full width (red in the CT before the fix); `Card`'s div arm leaked `padding` to the DOM.

Checks: root `pnpm typecheck` green; `pnpm test tests/ui` (89 pass); the new CT plus `tests/client/features/rpg/components` (33 pass); `pnpm lint:css` clean; `knip:prod` exit 0; dependency-cruiser over `packages/ui/src`, `tests/ui/primitives` and the tracker blocks clean.
