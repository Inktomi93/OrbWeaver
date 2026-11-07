# Rendered-review fixes (items 2010, 2011, 2012)

Lane `wt/agent-a5a6754c31412b587`, built on `wt/agent-a15da337713c922a6` (merged first, as briefed).

## Survey (before any edit)

CodeGraph explores were run for the macro textarea, the Select and the hover-reveal recipe. `ast-grep` counts, each language run separately:

| Shape | Language | Scanned files | Matches | Files |
| - | - | - | - | - |
| `<MacroTextarea $$$A />` | tsx | 1591 | 7 | 6 (4 product, 2 test stories) |
| `<MacroTextarea $$$A />` | ts | 5462 | 0 | 0 |
| `macroTextareaVariants(...)`, `toRows(...)` | tsx | 1591 | 1 each | `macro-textarea.tsx` only |
| `<Select $$$A layout="inline" $$$B />` | tsx | 1595 | 2 | `rpg-subject-select.tsx`, `_classname-drain-finish-stories.tsx` |
| `<Select $$$A layout="inline" $$$B />` | ts | 5463 | 0 | 0 |
| `<Slider $$$A />` | tsx | 1602 | 9 | 8: three product (`knob-row.tsx`, `plugin-leaf-nodes.tsx`, `talkativeness-popover.tsx`), five test stories |
| `<Slider $$$A />` | ts | 5463 | 0 | 0 |

Positive controls: every zero above is a `.ts` scan, and the `.tsx` scan of the same pattern is non-zero. The first Select pattern (`layout="inline"` first) missed on attribute order; the second form above is the one counted.

## Outcome per acceptance item

- **A1 (F2) met.** `groupByCategory` runs inside `resolveSuggestions`, so the list, the highlight index, `aria-activedescendant` and ArrowDown all follow the drawn order. Not a key-only fix.
- **A2 (F3) met in emulation, not on a device.** The listbox anchors to the visual viewport and flips above the field (`data-above`) when the room below is short; it re-measures on visual-viewport resize and scroll, ancestor scroll and its own size. Real-device keyboard behaviour is unproven. Item 2010's "checked on a device" line stays open.
- **A3 (F4) met.** The inline Select takes `TOUCH_TARGET_PSEUDO_STRETCH`, the hit area `InlineAction`, `GlyphButton` and `HintTrigger size="inline"` already use. Box stays text height at both pointers; the hit area is the 44px token at coarse.
- **A4 (F6 to F14):** F6, F7, F8, F9, F11, F12, F13 fixed. F10 and F14 ruled as deferred (below). Slider `neutral` removed.
- **A5 met.** No hand-rolled feature class, no suppression, no new token needed.

## Decisions and the reasons

- **Macro list stays hand-rolled.** The persona footprint suite pins the listbox inside the editor at the field's width; `owner-css-surface.ts` pins the `macro-textarea-*` slots; floating-ui is not a workspace dependency. Placement is measured in `macro-textarea-placement.ts` (ref callback with cleanup, so no manual memo or effect).
- **F6** root cause is a tailwind-merge conflict: `transition-opacity` evicts the Button's `transition-[scale]`. Every `HOVER_REVEAL` arm now spells `transition-[opacity,scale]`, the `OVERLAY_MOTION` idiom. Fix lives in the recipe.
- **F7** the tile was a fixed-box `Button`; it is now a `PictureButton` with the faces' own box props.
- **F8** the meter label and the text-tracker label take `inset="control"`, the inset the avatar, status line and condition door already carry.
- **F9** the identity Row's `min-inline-0` gave `OverflowActions.floorOf` a floor of 0, so the title was squeezed before any action folded. An unscoped title now floors at its content (`minWidth="title"` is kept for a scoped one), so actions fold first. The old comment's claim had no ADR or law behind it (`rg` over `docs/adr` and `docs/law` finds only `client-architecture-lockdown.md:246`, which says nothing about truncation); it is replaced with the mechanism.
- **F11** `blockquote-component.tsx` owns the element like the hr, list and inline-code components: house tokens only, no dead vendor class in the DOM, and the root `[&_blockquote]` variants are gone. Stale comments in `markdown.tsx` rewritten.
- **F12** `cap="prose"` on the helper-model note; the Corpus row gloss takes `subtitleStep="label"` (the ratified lever for functional prose in a row).
- **F13** a facet with only its "All" entry is disabled, described by one visible line (`ParamSelect` gains `unavailableNote`).
- **Slider `neutral`** had no product consumer (KnobRow uses `default` and `ghost`; the only user was a test story). Removed, with its comments; the invalid-fill CT now covers the default fill.

## Deferred, with reasons (for the orchestrator to file)

- **F10 (context tab chevron over the first letter).** The covered letter is a mid-scroll position; focus and selection already scroll clear of the mark through `scroll-padding-inline`. The evidence sheet (`s-ctx.png`) is gone and I could not reproduce a stationary overlap. A proximity scroll-snap on the tabs track would change every Tabs consumer for a case I cannot show. Needs a repro slot before a change.
- **F14 ("Set character scores" opens the roster).** The Status tab holds its open character in local state, so the Game tab cannot request one. The fix needs a request channel (a new state module under the client wiring rule) and a rule for which character opens (the viewer's own, as the inventory tab picks, or the first). That is a placement decision with repo-wide shape; recommendation: a one-field request in the rpg feature state, target = viewer's own actor else first.

## Siblings found, not fixed

`Input layout="inline"` (`input/variants.ts:56`) and the inline `NumberField` are also floorless at a coarse pointer. Outside the Select brief; same `TOUCH_TARGET_PSEUDO_STRETCH` fix applies.

## Commands and results

Red on HEAD sources, green on the fix (run via `pnpm test:ct <paths>`, `CT_PORT=5311`):

- `tests/client/lib/prompt-macro-completion.ct.tsx` (red on old: duplicate headers and key error; the ArrowDown test is a guard and passes on both)
- `tests/ui/primitives/macro-textarea/macro-completion-placement.ct.tsx`
- `tests/ui/primitives/select/inline-touch-floor.ct.tsx` (red both pointers)
- `tests/ui/primitives/button/press-transition.ct.tsx` (red)
- `tests/client/components/list-pane-header.ct.tsx` (red on the new fold test)
- `tests/client/components/face-strip-tile.ct.tsx` (captioned red; uncaptioned passes on old, kept as the control)
- `tests/client/features/rpg/components/status-card-edge.ct.tsx` (red, 7px)
- `tests/ui/markdown/blockquote.ct.tsx` (red: dead vendor classes)
- `tests/client/features/discovery/surfaces/corpus-browse-setting.ct.tsx` (red on gloss size)
- `tests/client/features/discovery/components/corpus-readiness-rail.ct.tsx` (red on the missing cap)
- `tests/ui/primitives/slider/invalid-fill.ct.tsx` (rewritten for the default fill; no fix-dependent red)

Neighbour pass, 63 passed: character-macro-completion, game-macro-browser, platform-persona-editor-footprint suite, platform-macro-description suite, inline-code, select trigger-ref, slider rail-end, classname-drain-finish and -props, face-strip-refs, plus the above.

Floor: `pnpm typecheck packages/client/tsconfig.json packages/ui/tsconfig.json tsconfig.tests-dom.json` exit 0. `pnpm lint:eslint` on every touched path, exit 0 (one combined run crashed with an `Atomics.wait` timeout under load; rerun in three batches, all clean). `pnpm depcruise` clean (a first run caught a test import of a character-lib label; the title is a local constant now). Biome clean. `pnpm e2e` not run.

## Visible changes for the ux recheck

| Change | Viewport | How to reach it |
| - | - | - |
| Macro list shows each category header once, list flips above the field near the bottom and inside the keyboard-shrunk viewport | 430x740 coarse, and desktop | Any prompt field (character greeting, persona): type `{{c` |
| Inline Select trigger unchanged in size, 44px hit area at coarse | 430x740 coarse | RPG subject select |
| Reveal-arm buttons ease their press (scale) | desktop | Chat and character list rows: press a Star |
| Face strip overflow tile level with the faces | desktop | A face strip narrow enough to fold |
| Meter and text-tracker names start on the card's text edge | desktop and 430 | RPG panel, Status tab |
| List pane actions fold into the overflow before the title is cut | 1280 with Context docked | Characters list header |
| Blockquote: rule and indent from house tokens | any | A message with `> quote` |
| Helper-model note capped to the prose measure; Corpus row gloss one step up | desktop | Corpus overview; Corpus Explore rows |
| Empty Corpus facets disabled with one explaining line | desktop | Corpus Explore with nothing distilled |

## Board items to file (not written by this lane)

1. F10 repro and fix (needs a slot with a stationary overlap).
2. F14 request channel for Status (recommendation above).
3. Coarse floor for `Input` and `NumberField` inline arms.
4. Device check for the macro list (soft keyboard), kept on 2010.

# Leg 2

Built on leg 1 (commit 4b3ab4fcb5). Composites branch files untouched (no dialog composites, `DestructiveAction`, status chips). `app-shell-topbar.ct.tsx` (lane L7) was run, not edited.

## Survey (leg 2)

CodeGraph explores run for: Input and NumberField inline arms, the Status tab and Game door, the topbar Temporary badge, the rail and persona avatar, the New chat picker skeleton. `ast-grep`, each language separately:

| Shape | Language | Scanned | Matches | Files |
| - | - | - | - | - |
| `<Input $$$A layout="inline" $$$B />` | tsx | 1604 | 5 | 3 (`tracker-value.tsx`, two test stories) |
| `<NumberField $$$A layout="inline" $$$B />` | tsx | 1604 | 3 | 3 (`knob-row.tsx`, `delivery-cluster.tsx`, `section-drill-in.tsx`) |
| both of the above | ts | 5463 | 0 | 0 |
| `<Autocomplete $$$A />` | tsx | 1612 | 6 | 5 (`tag-picker-dialog.tsx`, `corpus-list-surface.tsx`, three test stories) |
| `<CharacterPicker $$$A />` | tsx | 1612 | 12 | 12 |
| `<ShellTopbar $$$A />` | tsx | 1612 | 1 | `app-shell.tsx` |
| `setContextTab($$$A)` | ts / tsx | 5465 / 1612 | 2 / 1 | `shell-store.ts`; `rpg-game-tab.tsx` |
| `<Autocomplete>`, `<CharacterPicker>`, `<ShellTopbar>` | ts | 5465 | 0 | 0 |

Block-auto / text-height arms on interactive primitives (`rg` over `packages/ui/src/primitives`, second method; the `ast-grep` scan above covers the call sites):

| Arm | Interactive element | Has a floor |
| - | - | - |
| `select` `layout="inline"` | button | yes, leg 1 (`TOUCH_TARGET_PSEUDO_STRETCH`) |
| `inline-action` | button | yes (`TOUCH_TARGET_PSEUDO_STRETCH`) |
| `input` `layout="inline"` | `<input>` | no, see the fork below |
| `number-field` `layout="tile"` | `<input>` | no, same fork |
| `number-field` `layout="inline"` | `<input>` | not block-auto: the group sits on `CONTROL_BLOCK`; measured at the touch floor |
| `button` `wrap` and `stacked` | button | yes (min control block), per the merge-trace review |
| `tabs` cells | button | yes (`min-block-(--size-control-sm)`, `min-inline-(--size-touch-target)`) |
| avatar `fill` / `fillPortrait` / `ripplePortrait`, log-viewer fallback, drawer, aspect-frame | not interactive | n/a |

## Per-item result

- **A1 (Input and NumberField inline). Premise refuted; fork reported to the orchestrator (message sent).** A `::before` hit-area pseudo does not render on an `<input>`, so `TOUCH_TARGET_PSEUDO_STRETCH` cannot apply. `NumberField layout="inline"` is not block-auto at all; `tests/ui/primitives/number-field/inline-height.ct.tsx` measures its input at the touch-target token under a coarse pointer (green on unchanged source, so the finding is gone, not fixed), and the stepped field's input and steppers too. `Input layout="inline"` (one product consumer, `tracker-value.tsx`) and `NumberField layout="tile"` are click-to-edit twins of a datum that already carries the floor; a coarse `min-block` on them grows the box about 20px on entry and breaks the no-shift bar spelled in `input/variants.ts`. Default kept (no change); recommendation if the owner wants it anyway: `TOUCH_FLOOR_AT_COARSE.block` on those two arms and the call site reserving the taller box.
- **A2 (F14) met.** `state/rpg-status-sheet-request-store.ts` (the `connection-editor-request-store.ts` precedent, exported through `#state`), the Game button files a request, `useRpgStatusSheetRequest` in the Status tab takes it once and opens the viewer's own actor, else the first non-npc, then clears it. A request for another room is left alone. CT `score-door.ct.tsx`: red on old source (the roster shows), green now.
- **A3 (F10) ruled, no code change; fork reported.** Measured with a throwaway CT (deleted) on the production room context at 1100, 1280 and 1440 wide: 6 tabs, track 301 to 336px. Selecting each tab settles with the selected tab clear of both marks in every case (0 hits across 3 widths x 6 tabs). What sits under a mark at a settled position is always the partly scrolled neighbour: 14 to 32px of it under the end mark at rest, and under the start mark after a selection (for example "Members 32 of 47px" after selecting Preview), which reads as "◂review". At manual scroll offsets the same neighbour pattern shows at every offset. So a rest position does show the finding, and it is the fade-and-chevron's own cue acting on a cut neighbour. Removing it takes tab-boundary snapping plus a trailing filler on every Tabs strip (a primitive-wide behaviour change), which I did not make without a ruling. `pnpm snap` could not run the measurement: the worktree guard refuses a multi-statement `--eval`, so the CT stood in. 2012 stays open on this and on the Phone titles item below.
- **A4 (1841) gone.** `pnpm snap /databank --isolated --dirty --viewport 844x390 --design-audit --fail-on P3` shows no rail occlusion finding (only `double-empty-state`, unrelated), and the same at `/characters --mobile`. The probe CT showed that at rest Databank sits outside the section scroller and with Databank open it is at y=124 and hit-tests as itself, while the avatar is at y=330. `7222dd70f7` (2026-11-06, landscape rail peek and reveal) landed the fit that keeps the scroller above the foot. Guard added: `rail-short-landscape.ct.tsx` hit-tests the visible centre of every section button with `characters` and `databank` open (green on unchanged source, a regression guard, not red-first). Not closed: the item's done line says the design audit no longer flags it, which holds, but I cannot show the red state it was filed in.
- **A5 (1993) fixed in the product.** The Temporary badge lived in the wide topbar header, which a phone replaces with the narrow identity. `SectionDefinition.topbarMark` (chats supplies `ChatsTopbarMark`), `ShellTopbar` renders it once beside both identities, and the wide header no longer carries it, so exactly one badge exists in the DOM at every width (the e2e `getByText` stays strict-safe). CT `temporary-badge.ct.tsx` at phone and desktop: phone red on old source, desktop passes on both (control). Owed: `corpus-home-launch` (the orchestrator runs it). Not verified: a very narrow lead (the `<=16rem` second-row arm) puts the badge in the first row beside the controls; only the measured phone width was run.
- **A6 (1825, 1827):**
  - 1825 (a) chat context strip overlaps the tab control on a phone: not re-derived. `--open-chat latest` did not seat a room on the isolated stage, and the phone context sheet needs one. Open.
  - 1825 (b) twin kebabs on the phone character sheet: not re-derived (`--open-character Elias` did not select on the stage). Open.
  - 1825 (c) phone screen titles: present. `/characters --mobile 390x844` shows "Characte…" beside three trail doors. The title floor is `--dimension-shell-title-floor`, and `chrome.css` says the lead shrinks first to that floor before the trail folds. An F9-style fix (the title floors at its content so doors fold first) cannot be spelled in CSS for a title that must still truncate when long, and the floor is a shell ruling, so this is a fork: recommendation is a section-name arm of the shell title (a short fixed string) floored at its content. Open.
  - 1825 (d) Refinery short landscape opens scrolled past its top: gone. `/refinery --mobile --viewport 844x390` shows the heading at the top of the pane; no scroll finding in the audit (the only finding is `nested-card` on the picker). No CT; screenshot cited.
  - 1827 (a) picker skeleton jump: fixed for the New chat picker. The skeleton held 6 rows against a picker of search strip plus window plus edges (132px short). `CharacterPicker` takes `reserveBlock`; the surface passes `pickerWindowBox()` (new in `skeleton-row-metrics.ts`: search strip, `--height-picker-window`, two edges, all live tokens). The reserved box now equals the loaded command root (418px both). CT `new-chat-picker-skeleton.ct.tsx`: red on old source, green now. Residual: the whole dialog still grows about 18px at load from something other than the picker (not identified; the picker box is exact). Other pickers (3-row skeletons elsewhere) not individually re-derived.
  - 1827 (b) plugin panel switch gap: gone. The row-void audit finding is not reproducible: the toggle already rides an `inline` Field. A first gap measurement read 396/214/80px because the label element it found was `display: contents`; measured through the label's own box the switch sits within one section step of its label at 390, 844 and 1440. Assertion added to `platform-plugin-presentation.suite.ct.tsx` (green on unchanged source, a guard). The `width="content"` change I tried was reverted as unneeded.
  - 1827 (c) 42px tap targets: the Corpus omnibox was real: the autocomplete input measured 42px inside a 44px group. The input now spans the group's 1px edge (the NumberField input's own idiom) and the clear button centres itself. CT `touch-floor.ct.tsx`: red at 42, green at 44. The Appearance number stepper: measured at the touch floor on unchanged source (`inline-height.ct.tsx`, stepped field), and the first audit screen of Appearance has no tap-target finding; gone.

## New tests, layer and production entry (Spine-Testing, `tests/support/README.md`)

All are component tests (CT, browser world, `pnpm test:ct`); none restates a production value as a literal beyond a name production holds only inside a `.tsx` (the lint rule `orb/no-hand-copied-label` is clean).

| Test | Layer | Production entry it runs |
| - | - | - |
| `tests/client/features/rpg/components/score-door.ct.tsx` | CT, real corpus root through `routeTrpc` / `serveCorpusProcedures` | `ChatsContextTab` via the section registry, `RpgGameTab`, `RpgStatusTab`; story `RpgFollowedTabStory` follows `useContextTab` the way the context host does |
| `tests/client/features/app-shell/surfaces/temporary-badge.ct.tsx` | CT, corpus root, phone and desktop | `AppShell` via `AppShellRoomStory`, the chats section's `header` and `topbarMark` |
| `tests/client/features/app-shell/surfaces/rail-short-landscape.ct.tsx` | CT, corpus root, 844x390 coarse | `AppShell` via `AppShellStory`, `Rail`, `useRailSectionsFit` |
| `tests/client/features/app-shell/surfaces/new-chat-picker-skeleton.ct.tsx` | CT, corpus root with `holdCorpusProcedure("character.list")` | `AppShell` via `AppShellTemporaryNewChatStory`, `NewChatPickerSurface`, `CharacterPicker`, `QueryBoundary` reserve |
| `tests/ui/primitives/autocomplete/touch-floor.ct.tsx` | CT, ui primitive (no app data) | `Autocomplete` |
| `tests/ui/primitives/number-field/inline-height.ct.tsx` | CT, ui primitive | `NumberField` inline and stepped layouts |
| assertion in `tests/client/features/plugin/components/platform-plugin-presentation.suite.ct.tsx` | CT platform suite, installed showcase plugin | the card-atlas surface through `PluginPresentationPageStory` |

The picker test lives under `app-shell/surfaces` because the shell story and helpers are that feature's; the chat folder may not import them (`tests-client-features-own-test-helpers`).

## Commands and results (leg 2)

- Red first on HEAD sources: `score-door` (red), `temporary-badge` phone (red, desktop control passes), `touch-floor` autocomplete (42 against 44), `new-chat-picker-skeleton` (red). Green guards on unchanged source: `rail-short-landscape`, `number-field/inline-height`, the atlas toggle assertion.
- Green batch, 70 passed: the leg 2 suites plus `app-shell-topbar`, `section-swap-ready`, `own-key-panels`, `scene-panel`, `game-macro-browser`, `status-card-edge`.
- `pnpm typecheck packages/client/tsconfig.json packages/ui/tsconfig.json tsconfig.tests-dom.json`: exit 0. `pnpm lint:eslint` on every touched path: exit 0. `pnpm depcruise`: clean (a first run caught the picker test importing app-shell helpers from the chat folder; moved). Biome clean. No `pnpm e2e`.
- `pnpm snap` runs (isolated, dirty tree): Characters 844x390 mobile clean; Databank 844x390 only `double-empty-state`; Corpus mobile `tap-target` 42px (fixed, now 44); Extensions desktop clean (no plugin rows on the stage, so row-void had no candidates); Refinery 844x390 `nested-card` only; Appearance mobile text-over-art and `undersized-ui-text` only. The guard refuses multi-statement `--eval`, so the Status/F10 measurements ran as CTs.

## Visible changes added for the ux recheck

| Change | Viewport | How to reach it |
| - | - | - |
| The Game tab's "Set character scores" opens the viewer's own sheet with the score controls | desktop and phone | A d20 room, host: Context panel, Game tab, press the button |
| Temporary badge visible in the phone topbar | 390x844 | Home, temp chat tile, the open room |
| Corpus omnibox input 44px | 390 coarse | Corpus, Explore |
| New chat picker reserves its box while the library loads | desktop and phone | New chat from Home or Chats, first open of a session |

## Board items and forks (leg 2)

1. Fork, Input inline and NumberField tile coarse floor (default: keep; recommendation above).
2. Fork, F10 Tabs strip tab-boundary snapping with a trailing filler (primitive-wide; default: ruled as the fade's cue).
3. Fork, phone section titles floored at their content so trail doors fold first (shell title floor ruling).
4. 1825 (a) and (b) re-derivation on a seated room and character fixture.
5. The unidentified 18px growth of the New chat dialog after the picker loads.
6. Other pickers' first-open skeleton boxes (3-row skeletons in the rules and rpg pickers).
