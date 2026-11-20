---
kind: law
status: active
updated: 2026-11-15
---

# UI surface and interaction rules

The rules for how a surface shows depth, which states a control paints, how hover behaves at a touch pointer, how content swaps move and how the app says where the reader is. They bind shell chrome, rows and `@orb/ui` primitives alike. Each rule gives its reason, the checker that holds it or none, and the older law it extends. Cite a rule as ui-surface-and-interaction-rules §2.3.

## 1. Surface kinds

Every later rule names a surface by its kind. A surface has one kind at a time. The words below are house terms for these rules, not user-facing copy.

1. A float is a surface painted over other content by its mount position or a fixed position: a dialog, an alert dialog, a sheet (a Drawer, or a shell panel in `overlay` mode), a popover, a menu, a select, combobox or autocomplete popup, a tooltip, a toast, the command palette, a floating chip and the room's sidecar column while it is lifted. Reason: it covers something, so the reader must see it sit above that thing. Checker: none. Extends: UI-Architecture-and-Layout §4.1a and the float radius in UI-Density-Law §2.1.
2. A raised-in-flow surface is a card or control that sits in the layout and lifts off its own ground: an `interactive` Card and an `elevated` Card. Reason: it is operable or movable in place, and the lift says so. Checker: none. Extends: the Card row of UI-Density-Law §4.3.
3. Docked chrome is the app frame and what is level with it: the rail, the topbar, the phone tab bar, a pane in its track (`docked` mode), the phone list that is the screen, a pane's header band and the selection bar, which is sticky inside its own list. Reason: it does not cover content; it bounds it. Checker: none. Extends: the shell region map in UI-Architecture-and-Layout §4.1.
4. Text or a glyph over art is a run of text or an icon painted over a wallpaper, a portrait or an image. Reason: its shadow serves legibility, never depth. Checker: none. Extends: the over-art plate law in UI-Theming-and-Content §12.1 (D144).
5. A focus or state ring is a ring, glow, rail or inset line that marks a state on its host: the focus ring, the selection rail, a focal glow, the active rail glow and the solid button's top highlight. Reason: it marks a state, so it follows §3 and not §2. Checker: none. Extends: the one-focal rule CD3 in UI-Density-Law §3.2.
6. A shell panel's kind follows its mode: docked chrome in `docked` mode, a float in `overlay` mode and no surface at all in `collapsed` mode, where it is off screen and paints nothing the reader can see. Reason: one element changes kind as the reader opens and closes it. Checker: none. Extends: the panel modes in UI-Architecture-and-Layout §4.1.

## 2. Shadow and depth

The float shadow is `--shadow-overlay`, built from the theme-derived ingredients of D200. The `elevation` Appearance setting (`appearance.elevation`: `flat` "Flat", `ramp` "Layered", `glow` "Lifted (glow)") is stamped on `.shell-grid` as `data-elevation`.

1. A float casts the float shadow and no other drop shadow. The select, combobox and autocomplete popups take it through `POPUP_SURFACE` in `packages/ui/src/lib/popup-surface.ts`. A part inside a float, such as the command palette's `Command` root, casts nothing of its own; the float casts once. Reason: one recipe makes every float read as the same height above the page, and a second shadow inside it reads as a second layer. Checker: `tests/ui/primitives/float-shadow.suite.ct.tsx` holds the anchored floats and `tests/client/features/app-shell/surfaces/app-shell-command.ct.tsx` holds the palette; none holds the rest. Extends: ui-platform-rulings §8.1 (no independent elevation ramp).
2. Docked chrome never casts a drop shadow, at any `elevation` value. It separates from its neighbour by a hairline (`--color-sidebar-border` or `--color-border`) or by a step of surface tone. A pane's pinned header band is docked chrome. Reason: a shadow says the chrome floats, and it paints onto its neighbour, such as the phone tab bar; the major design systems keep docked navigation level and separate it by tone or a line. Checker: the elevation cases in `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` hold the docked panes and the surface roots; none holds the other chrome. Extends: the mobile one-shell rule in UI-Architecture-and-Layout §4.1 ("docked in flow, no sheet, no scrim") and the shell's elevation home in client-architecture-lockdown §4.4.
3. An inset one-pixel line is a hairline, whatever CSS property draws it. A band rule drawn as an inset `box-shadow` obeys §2.2 as a hairline. Reason: the property is a layout choice; the reader sees a line. Checker: none. Extends: the band separator in `packages/client/src/features/app-shell/surfaces/shell/panels.css`.
4. The `elevation` setting changes the depth of raised-in-flow surfaces and the tone of docked chrome. It never makes docked chrome cast. `glow` lifts an `interactive` Card and nothing else. A pane in `overlay` mode is a float and casts at every setting. Reason: the setting chooses how much depth the page shows, not whether the frame floats. Checker: the elevation cases in `tests/client/features/app-shell/surfaces/app-shell-appearance.ct.tsx` hold the panes, and `tests/ui/primitives/card/elevation-setting.ct.tsx` holds the cards. Extends: the Card row of UI-Density-Law §4.3. The table below states each kind and value.
5. A float that ends at docked chrome clips its shadow at that edge. A sheet that ends above the phone tab bar casts above the bar and slides in from the bar's top edge. Reason: the bar is level with the content, so nothing paints onto it. Checker: the swipe case in `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` holds the sheet's clip; none holds the shadow. Extends: the MOBILE block of UI-Architecture-and-Layout §4.1.
6. Every drop shadow falls from a light above the screen: zero horizontal offset and a downward vertical offset. Reason: a second direction reads as a second light. Checker: none. Extends: D200.
7. A float also carries its depth in surface tone: it paints a step of the D201 ramp above what it covers (`--color-popover` or `--color-card` over `--color-sidebar` and `--color-background`). Reason: a shadow is hard to see on a dark theme, and the tone step stays visible there. Checker: none. Extends: D201.
8. Text or a glyph over art takes a theme-derived shadow token for legibility (`--shadow-shell-over-art`, `--shadow-prose`, `--text-shadow-wordmark`), never a framework default. The Icon `shadow` axis draws `--shadow-shell-over-art` as a drop shadow. It ignores the `elevation` setting. Reason: its job is contrast against arbitrary art, and a default shadow does not follow the theme. Checker: `tests/ui/primitives/icons/icon-shadow.ct.tsx` holds the Icon; none holds the text halos. Extends: UI-Density-Law §2.3 (`halo`) and D200.
9. A focus or state ring ignores the `elevation` setting. Reason: a state reads the same at every depth. Checker: none. Extends: CD3 in UI-Density-Law §3.2.
10. Scroll-edge separation on docked chrome uses a hairline or a tone step, never a shadow. A scroll cue inside a scroller (a fade or a cue gradient in the scroller's own fill) is a content cue and not elevation. Reason: §2.2 holds while content scrolls. Checker: none. Extends: the scroll-driven fades row of ui-platform-rulings §8.4. Whether the topbar changes at all on scroll: §7.
11. A dialog, an alert dialog and a sheet take the scrim and make what they cover inert. A popover whose body holds input the reader can lose is modal: it absorbs a press outside it and shows no scrim. Any other popover, a menu, a list popup and a tooltip take no scrim, and what lies behind them stays live. A toast and a floating chip never scrim and never make anything inert. Every scrim paints `--color-backdrop` through `SCRIM` or `SCRIM_BASE` in `packages/ui/src/lib/scrim.ts`. Reason: the scrim tells the reader that the page behind will not answer until the float closes. Checker: none. Extends: the modal rule in `packages/ui/src/primitives/popover/popover.tsx` and UI-Architecture-and-Layout §4a (a house modal inerts the background).
12. A shell overlay pane takes the shell scrim over the content, from below the topbar, so the topbar and its panel toggle stay live. On a phone, a sheet opened from the tab bar ends above the bar, so the bar and its open tab stay in view. The sheet is a modal like any other: its scrim covers the bar, the bar is inert and leaves the accessibility tree, focus stays in the sheet, and focus returns to the sheet's tab when it closes. A tap on the bar closes the sheet and does nothing else. The full-screen phone Context sheet covers the bar and makes it inert. Reason: what a modal covers does not answer a press or a reader, and the bar in view tells the reader where the sheet came from. Checker: the You sheet cases in `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` hold the tab bar sheet, and `tests/client/features/app-shell/surfaces/platform-sheet-inert.suite.ct.tsx` holds the full-screen case; none holds the pane overlay. Extends: the MOBILE block and the mobile one-shell rule of UI-Architecture-and-Layout §4.1.

### Which surfaces cast, and what each elevation value changes

| Surface kind | Casts a drop shadow | `flat` (Flat) | `ramp` (Layered) | `glow` (Lifted) |
| - | - | - | - | - |
| Float | always, the float shadow, once | the float shadow | the float shadow | the float shadow |
| Raised-in-flow | an `elevated` Card always; an `interactive` Card under `glow` only | an `elevated` Card casts; an `interactive` Card casts nothing | the same as `flat` | an `interactive` Card casts the float shadow too |
| Docked chrome | never | one panel tone, hairline seams | panes take `--color-surface-raised`, content and topbar `--color-card`; the hairlines between them go | the same as `flat` |
| A pane sliding over content | always: it is a float | the float shadow and the shell scrim | the same as `flat` | the same as `flat` |
| Text or a glyph over art | never a depth shadow; a legibility halo (§2.8) | unchanged | unchanged | unchanged |
| Focus or state ring | never; it paints its ring, rail or glow (§2.9) | unchanged | unchanged | unchanged |

## 3. States for controls, chrome and rows

`@orb/ui` primitives owe a state set (UI-Primitives-and-Reuse §13.8, R7, and the interaction states in ui-package-design §5). This section gives the same set to shell chrome and rows, and adds the states a navigation control can hold.

| State | What it means | Semantics |
| - | - | - |
| rest | nothing is happening | none |
| hover | the pointer is over it, where the primary input can hover (§4) | none |
| focus-visible | the keyboard has reached it | `:focus-visible`; the focus ring |
| pressed | a pointer or key is down on it | `:active`; the press acknowledgement |
| selected | a choice that persists inside its control: a pressed toggle, the open tab | `aria-pressed` or `aria-selected` |
| current | the reader's place: the page or section, or the open entity in a list | `aria-current="page"` for a page or section, `aria-current="true"` for a row or cell |
| open | a trigger whose sheet, dialog, menu or popover is up | `aria-expanded="true"` with the `aria-haspopup` value for what it opens |
| disabled | it cannot act now, and says why | `aria-disabled`, explained (`.claude/rules/ui-and-client.md`) |
| loading | its own action is in flight | the control keeps its place and shows the wait |

1. Every control in shell chrome and every interactive row paints each state it can hold, by the semantics in the table. Reason: chrome styled in `shell.css` inherits no primitive variant, so it skips states unless the law names them. Checker: none. Extends: R7 in UI-Primitives-and-Reuse §13.8.
2. A trigger whose surface is up carries the open state, never `aria-current`. A float is not a page. Reason: `aria-current` tells a reader that this is where they are; the float is where they are going for a moment. Checker: the You tab case in `tests/client/features/app-shell/surfaces/mobile-bar.ct.tsx`. Extends: the You tab ruling below.
3. One bar paints one pressed item. While a trigger's surface is open, the trigger paints in the active item's roles, and the current item keeps `aria-current` and drops its paint to rest. The rule binds wherever the trigger stays in view while its surface is open: the phone tab bar. A desktop modal trigger keeps its rest paint, because the dialog's scrim is its open state. Reason: two lit tabs ask the reader which one they are in. Checker: the You tab case in `tests/client/features/app-shell/surfaces/mobile-bar.ct.tsx`. Extends: the MOBILE block of UI-Architecture-and-Layout §4.1.
4. The You tab is a door to the mobile projection of shell chrome. It never carries `aria-current` and never stands in for a section; the current section holds a bar slot of its own. Reason: owner ruling, recorded in the You tab comment block of `packages/client/src/features/app-shell/components/rail.tsx`. Checker: the You tab case in `tests/client/features/app-shell/surfaces/mobile-bar.ct.tsx`. Extends: the MOBILE block of UI-Architecture-and-Layout §4.1.
5. The focus ring draws over every other paint and never replaces it. Hover never repaints an item that is selected, current or open. Reason: the reader must not lose the state they set by moving the pointer or the keyboard. Checker: none. Extends: the focus law in UI-Architecture-and-Layout §4.3.6.
6. Every pressable item acknowledges the press at every pointer, a bar tab and a list row included. Reason: an item with no press state feels as if it did not take the tap. Checker: none. Extends: the micro-interaction row of motion-and-animation-guide §2.
7. A destination on a bar or rail is never disabled or hidden because its content is empty. It opens to its taught empty state. Reason: a missing tab hides the feature; an empty state teaches it. Checker: none. Extends: UI-Architecture-and-Layout §4.3.1 and the Plugin pages entry in §4.1 of that doc.
8. A row that owns child rows uses the open state (`aria-expanded`), not `aria-current`, while a child holds the reader's place. Reason: a parent and a child both marked current announce two places for one location. Checker: none. Extends: the disclosure row contract in `packages/ui/src/primitives/list-row/list-row.tsx`.

## 4. Hover and touch

`hover-capable` is the `(hover: hover)` capability variant in `packages/ui/src/styles/theme.css`. Tailwind compiles a `hover:` or `group-hover:` class under the same query, so those classes are already gated. A stylesheet `:hover` rule, a `:focus-within` key and a `:has()` key are not.

1. A hover treatment that changes what is shown (a swap, a reveal, a hide) applies only where the primary input can hover. Where it cannot, the rest state shows what the hover would. Reason: a tap sets `:hover` and `:focus-within` on a touch browser, so a hover swap fires on a tap and stays. Checker: `tests/ui/primitives/list-row/subtitle-swap.ct.tsx`. Extends: axis 3 of UI-Architecture-and-Layout §4b and UI-Architecture-and-Layout §4.3.4.
2. Keyboard focus reveals what hover reveals, at every pointer. A focus that a pointer or a tap causes does not. Key a reveal that hides at a touch pointer on `:focus-visible` inside its group, never on `:focus-within`. Reason: a keyboard user has no hover, and a tap must not trigger a hover swap through focus. Checker: `tests/ui/primitives/list-row/subtitle-swap.ct.tsx` holds the subtitle swap, and the touch case in `tests/client/components/hover-reveal.ct.tsx` holds `HOVER_REVEAL.focus`. Extends: `HOVER_SWAP` in `packages/ui/src/lib/hover-reveal.ts`.
3. A hover treatment that changes only colour or opacity also applies only where the primary input can hover. In a class string, `hover:` meets this as compiled, so it stays legal in features. In a stylesheet, put every `:hover` rule inside `@variant hover-capable`. Reason: a touch browser keeps `:hover` on the last tapped element, so its hover tint reads as pressed after the tap. Checker: the closed You tab paint in `tests/client/features/app-shell/surfaces/mobile-bar.ct.tsx` holds the rail tabs; none holds other stylesheets. Extends: axis 3 of UI-Architecture-and-Layout §4b.
4. A fact or a control that hover reveals is reachable by a tap at a touch pointer: shown at rest there, or one tap away. Reason: a touch reader has no hover. Checker: none. Extends: the tap-equivalent rule in axis 3 of UI-Architecture-and-Layout §4b, from actions to facts.
5. The press acknowledgement (`:active`) is not a hover treatment. It applies at every pointer. Reason: a tap needs its feedback most. Checker: none. Extends: ui-surface-and-interaction-rules §3.6.

## 5. Content swaps

A swap replaces what a region shows. A swap is one of three classes.

| Class | Cases |
| - | - |
| Peer switch | section to section, Corpus mode to mode, a LIST selection that changes CONTENT, a Settings group to another group |
| Push and back | on a phone, a selection that pushes CONTENT over the LIST, and the topbar Back that returns |
| Change in place | a tab or Context tab to another inside a region, data that arrives, a filter that narrows a list, a value that updates |

1. A peer switch and a push or back crossfade the captured region through `withViewTransition` in `packages/client/src/lib/view-transition.ts`, called through `withContentSwap` in `packages/client/src/state/shell-store.ts`. The outgoing side fades at `--motion-fast` and the incoming side at `--motion-base` with `--ease-out-expo`, at a fixed scale. A push and a back use the same crossfade, with no slide. Reason: one motion for every change of screen tells the reader the screen changed, and the exit does not hold up the entrance. Checker: the section swap cases in `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx`. Extends: the page, route and section row of motion-and-animation-guide §2. Whether a push slides: §7.
2. A change in place does not animate the swap. A tab's indicator glides; its panel changes in one frame. Data arrival follows the list-item entrance and the decided-against loading crossfade. Reason: these happen many times a session, and motion there adds wait without telling the reader anything. Checker: none. Extends: motion-and-animation-guide §3.8, items 1, 2 and 5 of motion-and-animation-guide §4.2.
3. The captured region is the surface that is the screen's content: `.shell-content`, or on a phone the LIST while it is the screen. One content region renders on each side of a swap. Chrome paints live; floats follow §5.7. Reason: a swap with no named region on one side is a hard cut. Checker: the phone case in `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx`. Extends: the view-transition contract in UI-Architecture-and-Layout §4a.
4. The same pair of screens swaps the same way on every viewport. A swap that crossfades on a desktop crossfades on a phone. Reason: a reader who moves between devices learns one behaviour. Checker: the phone and section swap cases in `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx`. Extends: UI-Architecture-and-Layout §4.1 (one shell, panels toggled).
5. Under reduced motion a swap lands in one frame. `withViewTransition` skips the transition when `motionIsReduced` is true. Reason: reduced motion removes motion; it does not shorten it. Checker: the motion-off section swap case in `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx`. Extends: motion-and-animation-guide §3.9.
6. A new swap runs its write through `withContentSwap`, never a direct store write. Reason: the content-scoped float closes and the crossfade starts in the same commit. Checker: none. Extends: the lifetime rule in UI-Architecture-and-Layout §4a.
7. A float over the captured region stays above it through a swap. A float that stays open paints live, and a float the swap closes fades out with the outgoing side at `--motion-fast`. A shell sheet and the scrim while it dims carry their own capture name during a swap, from the view-transition block in `packages/client/src/features/app-shell/surfaces/shell/content.css`. Reason: the swap's snapshots paint above every live element, so an uncaptured float over the content is covered for the whole fade. Checker: the phone Context sheet case in `tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx` holds the shell sheets; none holds the portalled floats. Extends: the view-transition contract in UI-Architecture-and-Layout §4a.

## 6. Current location

1. On a desktop, the rail button of the active section carries `aria-current="page"` and the active paint: the tone tint, the glow and the gradient ring. Reason: the rail is where the reader looks for the section. Checker: `tests/client/features/app-shell/surfaces/platform-rail-gradient-ring.suite.ct.tsx` holds the ring; none holds the rest. Extends: UI-Architecture-and-Layout §4.1 (RAIL).
2. On a phone, the tab of the active section carries `aria-current="page"`, the tone tint and the accent bar along the tab's edge toward the content, the brand cell's mark at `--border-width-rule` in `--color-tone-solid`. The bar moves with the pressed paint (§3.3). A section the bar does not list takes a bar slot while it is active, so the current section is always a visible tab. Reason: the bar answers where the reader is without a second door, and a shape beside the tint marks the tab for a reader who cannot tell the tint apart. Checker: the current-section case in `tests/client/features/app-shell/surfaces/mobile-bar.ct.tsx` holds the slot, and its You tab case holds the bar. Extends: the MOBILE block of UI-Architecture-and-Layout §4.1.
3. On a phone, the topbar names the screen in words. On a desktop, the CONTENT header names the active entity. Reason: a tab tint says the section; the words say the screen inside it. Checker: none. Extends: UI-Architecture-and-Layout §4.1 (CONTENT) and the phone topbar rule in ui-platform-rulings §8.1.
4. Inside a section, the LIST row of the open entity carries `aria-current` through `data-selected`, with the selection rail and tint. The Context strip cell of the open tab carries `aria-current` or `aria-selected`. Reason: the reader finds the open thing in the list without reading CONTENT. Checker: none. Extends: the ListRow contract in `packages/ui/src/primitives/list-row/list-row.tsx`.
5. One set holds one current item. A navigation landmark or a list never announces two. Reason: two current items name two places for one location. Checker: none. Extends: ui-surface-and-interaction-rules §3.8.
6. Rows in one list that share a name are told apart by a title qualifier after the name (`ListRow` `titleQualifier`). The qualifier names only what differs: a qualifier that repeats the name is never shown, so a row whose datum repeats its name shows the name alone. A qualifier that names the row by a second identifier, such as a character handle, takes the name's face in muted ink (`titleQualifierFace="body"`, as `LibraryRow` sets); the mono face stays for a qualifier that is a datum, such as a date. Reason: an identifier in another face reads as a second, different name, and a qualifier equal to the name tells the rows apart no better than the name does. Checker: `tests/client/features/character/components/character-row-namesakes.ct.tsx` holds the character library; none holds the other lists. Extends: the title qualifier contract in `packages/ui/src/primitives/list-row/list-row.tsx`.

## 7. Open questions for the owner

These are product choices the rules above do not settle. Each lists its options with the recommended default first.

- Does the topbar change when content scrolls under it? Options: (a) no: it keeps its rest separation, a hairline under Flat and Lifted and a tone step under Layered; (b) a tone step appears while content is scrolled under it; (c) a hairline appears only then. Systems split between a tone lift on scroll, a blur edge and an overflow shadow; §2.10 already excludes a shadow.
- Does a phone push (LIST to CONTENT) and its Back slide, or crossfade like a peer switch? Options: (a) crossfade, as today and the §5.1 default; (b) a slide in from the inline end and back out, with the crossfade under reduced motion. Some systems slide a hierarchy push; reduced-motion guidance replaces the slide with a fade.
- Does the image lightbox cast the float shadow? Options: (a) no: a picture over a dimmed screen needs no lift; record it as the one float that casts nothing; (b) yes, as every other dialog. Today its popup sets `shadow-none`.

## 8. Not yet ruled

No rule here covers these. Silence is not permission: raise the case before building it.

- Toast placement against the phone tab bar and an open sheet.
- What a tooltip or a popover may hold: interactive content, essential copy, and what a touch reader gets instead of a tooltip.
- Gestures: the visible control every swipe and long press needs beside it.
- Tab bar membership: how many items it holds, label rules and when a badge or count may appear.
- Loading thresholds: when a wait shows nothing, a skeleton or progress.
- Stacked dialogs: whether a dialog may open another.
