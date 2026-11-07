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
