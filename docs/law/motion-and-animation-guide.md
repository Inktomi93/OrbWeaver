---
kind: law
status: active
updated: 2026-09-19
---

# Motion & Animation Guide

The motion law (promoted proposed/ → core/ under D66). How motion is built in this app: **CSS
/ Tailwind keyed off Base UI data-attributes and CSS vars, on three INTERACTION duration tokens
(`fast`/`base`/`layout`) plus continuous/ambient tokens (`shimmer`/`breathe`/`precip`/`transit`/`ambient`)
and one easing curve** — never a React animation hook, never a second easing curve. §1 is the Base UI
mechanics an agent needs to add motion; §2 the taxonomy → token map; §3 the house principles
(numbering is stable — code cites `guide §3.7`/`§3.9`); §4 the motion inventory (what's built,
where, and what was deliberately left out).

## 1. Base UI animation mechanics cheat-sheet

Base UI (`base-ui.com`, package `@base-ui/react`, current major 1.x) is a
headless/unstyled primitives library — floating-ui + Radix-adjacent lineage. It does not ship
any CSS or animation itself; it exposes **data-attributes and CSS custom properties** that
describe component state, and you attach transitions/keyframes to them yourself.

### 1.1 The state data-attributes (the actual contract)

Every interactive Base UI primitive (Dialog, Popover, Menu, Select, Tooltip, Accordion,
Collapsible, Tabs, Drawer, Autocomplete, Combobox, AlertDialog, ...) renders its root/popup
parts with a common vocabulary of `data-*` attributes reflecting state. The universal ones
for anything that mounts/unmounts or opens/closes:

| Attribute | Meaning |
| - | - |
| `[data-open]` | present while the element is open/visible |
| `[data-closed]` | present while the element is closed (but see `keepMounted` below) |
| `[data-starting-style]` | present for one frame when the element **begins** its enter transition — the "from" state |
| `[data-ending-style]` | present while the element is playing its **exit** transition — the "to" state |
| `[data-disabled]` | present when the part is disabled |
| `[data-instant]` | present when a change should apply with no transition (e.g. instant open triggered by keyboard type-ahead, or when a component first mounts already-open) |

Per-primitive additions, on the primitives this codebase wraps:

- **Dialog / AlertDialog**: `data-nested`, `data-nested-dialog-open` on the popup (style a
  parent dialog differently while a child dialog is stacked on top of it), plus the
  `--nested-dialogs` CSS var (count of stacked dialogs).
- **Popover / Select / Menu / Tooltip / Autocomplete / Combobox** (all float/anchor via the
  `Positioner` part): `data-side`, `data-align`, `data-anchor-hidden`, `data-instant`, plus
  the anchor-positioning CSS vars in §1.3.
- **Accordion**: `Accordion.Panel` gets `data-open`/`data-starting-style`/`data-ending-style`
  /`data-disabled`/`data-orientation`/`data-index`; `Accordion.Trigger` gets
  `data-panel-open`. CSS vars: `--accordion-panel-height`, `--accordion-panel-width`.
- **Collapsible**: same shape as Accordion's panel — `data-open`/`data-closed`/
  `data-starting-style`/`data-ending-style`, with `--collapsible-panel-height` /
  `--collapsible-panel-width`.
- **Tabs**: `Tabs.Tab` gets `data-active`, `data-disabled`, `data-orientation`,
  `data-activation-direction` (`left`/`right`/`up`/`down`/`none` — which way the selection
  moved, for directional slide effects). `Tabs.Indicator` exposes six position/size CSS
  vars: `--active-tab-left/right/top/bottom/width/height`.
- **Drawer** (`primitives/drawer/`): `data-swiping`, `data-swipe-direction`,
  `data-swipe-dismiss`, plus `--drawer-swipe-movement-x/-y` and `--drawer-snap-point-offset`
  (the vars the drawer skin actually consumes; `data-swiping:transition-none` mirrors the
  toast). `unverified:` Base UI may also expose `--drawer-swipe-progress` /
  `--drawer-swipe-strength` (a velocity scalar for a "fling" release) — the codebase does NOT
  consume either today, so don't cite them as this app's behavior.

The important framing: **you never write imperative animation code for open/close.** You
write CSS that keys off these attributes; Base UI flips the attributes at the right moments
and (critically) keeps the DOM node alive long enough for your CSS to finish.

### 1.2 Transitions vs `@keyframes` — and why Base UI's docs prefer transitions

Two ways to animate the same open/close state, with a real tradeoff:

**CSS transitions** (Base UI's own preference, stated directly in their styling guide):
key the "from" values off `[data-starting-style]`/`[data-ending-style]` and transition to
the resting `[data-open]` values.

```css
.Popup {
  opacity: 1;
  transform: scale(1);
  transition: opacity 150ms, transform 150ms;
}
.Popup[data-starting-style],
.Popup[data-ending-style] {
  opacity: 0;
  transform: scale(0.95);
}
```

**`@keyframes`**, keyed off `[data-open]` / `[data-closed]` directly:

```css
.Popup[data-open] {
  animation: scaleIn 150ms ease-out;
}
.Popup[data-closed] {
  animation: scaleOut 150ms ease-in;
}
@keyframes scaleIn { from { opacity: 0; transform: scale(.95); } }
@keyframes scaleOut { to   { opacity: 0; transform: scale(.95); } }
```

**Base UI's stated reason to prefer transitions:** a transition can be smoothly cancelled
and retargeted mid-flight (user closes a popover half a frame after opening it — the
transition just reverses from wherever it currently is). A running `@keyframes` animation
cannot be interrupted and re-targeted the same way — if state flips mid-animation it
restarts or snaps. This is the same "interruptibility" property Emil Kowalski calls out as
the single biggest tell of premium vs. amateur motion (§3). **Default to transitions.**
Reach for `@keyframes` only for effects a transition literally cannot express — multi-step
sequences, shimmer sweeps, spinner rotation, attention-getters (shake). The only `@keyframes`
in the app today is the skeleton shimmer (`ui/src/styles/globals.css`).

This app's existing `OVERLAY_MOTION` fragments already made this exact call — they're
transitions + `data-starting-style:`/`data-ending-style:` Tailwind arbitrary-variant classes,
not `@keyframes`. That's the correct default; keep it.

**But the transition NAMES ITS PROPERTIES — never `transition-all` on a focusable element.**
Both fragments were `transition-all` until 2026-08-08 and are now `transition-[opacity,scale]`.
`outline-*` is interpolable, so `all` fades a focus ring in over the duration and a keyboard user
moving at speed sees a desaturated half-ring at every stop — and these popups ARE focus stops
(Base UI's floating focus manager stamps a managed `tabindex` on any `role="dialog"` floating
element and moves focus into it on open; measured on dialog + popover). `all` also silently
animates the layout vars Base UI recomputes live (`--available-height`, `--anchor-width`), so a
repositioned popup lags its anchor. Same finding as the toast root (`toast/variants.ts`) and the
same reason Button has to name `scale`. Pinned by unpolled `transitionProperty` reads in
`tests/ui/primitives/dialog/dialog.ct.tsx` + `tests/ui/primitives/popover/popover.ct.tsx`.
**AMENDED 2026-09-02 (#1102) — zero `transition-all` sites remain.** #1069's amendment recorded
"three surviving `transition-all` sites (accordion panel, collapsible panel, progress indicator)"
as NON-focusable and safe to keep the shorthand; that count missed a fourth,
`appearance-sizing-section.tsx`'s density live-preview, and undersold the actual failure mode —
`transition-all` doesn't only race a focus ring, it also animates INHERITED properties the element
never opted into (`scrollbarColor`), which the app's `[anim]` flagger convicted OVER BUDGET on the
collapsible panel and the density preview regardless of focusability. All four now name their
properties explicitly: `transition-[height]` (accordion panel, collapsible panel — the ratified
\#953/#1069 lifecycle allowance, §4.2 item 3), `transition-[width,background-color]` (progress
indicator), `transition-[gap,padding]` (density preview, `appearance-sizing-section.tsx`). The
tabs indicator was the earlier fourth until #1069 (2026-09-02) and names `transition-[transform]`,
for the §4.2-item-2 reason rather than the focus-ring one.

### 1.3 Keeping the exit animation alive: `keepMounted`

The mechanism that makes exit animations possible at all: Base UI's portal-based components
accept a `keepMounted` prop (default `false`) on the `Portal` (or equivalent) part. With it
set, the DOM node for a closed popup/dialog/etc. is **not removed** the instant `open`
becomes `false` — Base UI keeps it mounted, flips `data-ending-style`, waits for the CSS
transition/animation to actually finish (it listens for the real `transitionend`/
`animationend`, not a hardcoded timeout), and only then unmounts. Without `keepMounted`,
React would rip the node out of the DOM before your exit CSS ever gets to run, and every
"close" would hard-cut. If a surface still doesn't fade out today, this prop is almost
certainly why — check it first before writing more CSS.

### 1.4 Anchor-positioning CSS vars (transform-origin and friends)

Every floating/anchored primitive's `Positioner` part exposes these custom properties, live-
updated as the anchor moves or the popup flips sides to stay in the viewport:

- `--anchor-width`, `--anchor-height` — size of the trigger element being anchored to
- `--available-width`, `--available-height` — remaining viewport space in that direction (use
  for max-height/max-width so a long menu doesn't overflow the screen)
- `--positioner-width`, `--positioner-height`
- `--transform-origin` — **the coordinate pair to scale/rotate from**, so a popup opening
  near the bottom-right of the screen scales from its top-left corner (where the trigger
  is), not from dead center. This is exactly the "origin-aware transform" premium-motion
  principle in §3 — Base UI computes it for you, you just apply it:

```css
.Popup {
  transform-origin: var(--transform-origin);
}
```

This codebase's `anchoredPopup` fragment already does this via the Tailwind arbitrary
property syntax `origin-(--transform-origin)`. `modalPopup` deliberately omits it because
modals are centered/edge-docked, not anchor-scaled — correct call, don't "fix" that.

### 1.5 On `useTransitionStatus` / `useRenderElement` — don't cite these as public API

Two hooks show up when researching Base UI's internals; be precise about what they actually
are so nobody builds against the wrong contract:

- **`useTransitionStatus`** is a **Floating UI** hook (`@floating-ui/react`), not a Base UI
  public export. Base UI is built on Floating UI and almost certainly uses something
  equivalent internally, but it is not documented Base UI API. Don't import it expecting
  Base UI semantics — style off the documented data-attributes instead (§1.1).
- **`useRenderElement`** IS real and documented (`base-ui.com/react/utils/use-render`,
  the public export is actually named `useRender`) — it's the low-level utility Base UI's
  own primitives use to merge `render`-prop overrides, refs, and state-derived
  `data-*` attributes onto the final rendered element. You'd only reach for this if writing
  a **new custom headless primitive** in the `@orb/ui` `primitives/` layer that wants the
  same render-prop/polymorphism pattern Base UI uses. It is not something feature code
  should touch when just consuming an existing primitive.

Practical takeaway: **the animation work in this app happens in CSS/Tailwind against
data-attributes and CSS vars**, never in a React animation hook. No JS tween loop, no spring
library, no rAF-driven interpolation, no duration or easing computed in JS: every value an
animation interpolates over is authored in CSS from the three duration tokens and the one
curve.

**AMENDED 2026-09-02 (#1069) — the FLIP-inversion exception, which is a MEASUREMENT, not an
animation.** The rule above bans JS from producing animation VALUES. It does not ban JS from
supplying the one fact CSS cannot know: *where this element was before the layout it is now
in*. A FLIP (measure the previous box, apply the inverse, let CSS run it home) computes a
DELTA and hands the interpolation straight back to CSS — the transition's property, duration
and curve stay on the element's own classes. Two sites, and they are the whole exception class:

- `packages/client/src/features/app-shell/hooks/use-shell-track-flip.ts` — the shell's panel
  push. JS stamps `data-<track>-flip="in|out"` for each of the two tracks (and the
  reduced-motion `data-<track>-settle` twin); every distance is composed in `shell.css` from
  the two grid tracks, and the keyframes live there too, so CSS owns even the delta.
  **Prefer this shape whenever the distance is already a CSS value.** The file was
  `use-list-track-flip.ts` until #2463 — renamed once it stopped being list-only (#2456 gave
  the CONTEXT track its own arm), and renamed WITH this citation because `dangling-doc-cite`
  is hard-no-waiver.
- `glideIndicator` in `packages/ui/src/primitives/tabs/tabs.tsx` — the tabs indicator glide
  (§4.2 item 2). The delta is the difference between two runtime boxes, so no CSS value
  expresses it: JS writes the inverse `transform` inline, flushes, and drops it, and the
  slot's `transition-[transform]` runs it back to identity. It stays a TRANSITION rather than
  a JS-var keyframe precisely so a fast second switch retargets mid-flight (§1.2, §3.2).

Anything else that reaches for JS to move pixels is a defect, not a third member: read those
two files before writing a third, and if the delta can be spelled in CSS, the answer is the
shell's shape. **STRUCTURAL SINCE #1089** — this list is no longer prose-only: the
`no-unruled-flip-inversion` policy reds a transform write flushed by a forced layout read
anywhere in `@ui`/`@client`, and the one member that writes a transform is an exact row in
`tooling/src/verify/lib/reviewed-grants-no-unruled-flip-inversion.ts`. Amending this list and
that table is ONE edit, never two halves. Reduced motion needs no special arm in either — the globals.css floor
(`transition-property: none !important`) makes the inverse land instead of animate.

## 2. Motion taxonomy + where-to-place-it playbook

Six categories, each with a duration band and an easing default. Map these onto this app's
existing tokens (`--motion-fast` 130ms / `--motion-base` 220ms / `--motion-layout` 360ms /
`--ease-out-expo`) rather than inventing new numbers — the token set already covers the
right bands.

| Category | What it is | Duration | Easing | Existing token |
| - | - | - | - | - |
| **Micro-interaction** | button press, checkbox check, switch toggle, icon hover | 100–150ms | ease-out (snappy, no float) | `--motion-fast` |
| **State transition** | menu highlight, selected-item change, color/background swap | 150–220ms | ease-out | `--motion-fast`/`--motion-base` |
| **Overlay** | dialog, popover, menu, tooltip, select, drawer open/close | 130–220ms (anchored) / 220ms (modal) | ease-out on enter, can be same curve reversed on exit | `--motion-fast` (anchored) / `--motion-base` (modal) — **already correct, see §4** |
| **List & layout** | item add/remove/reorder, accordion/collapsible expand, tab indicator glide, drag reorder | 200–360ms | ease-out for expand, ease-in-out for reflow/reorder | `--motion-layout` |
| **Page / route / section** | rail-section switch, chat navigation | 200–360ms, or native cross-fade via View Transitions | browser default or ease-out-expo | view-transition (already wired) + `--motion-layout` |
| **Loading** | skeleton shimmer, spinner, indeterminate progress | continuous, not one-shot — 1200–1600ms loop | linear (shimmer) | `--motion-shimmer` (1300ms, already correct) |

### Category detail and placement rules

**Micro-interactions** — every pressable control acknowledges the press: `active:scale-95` or
a background-darken, 100–150ms ease-out (a slow press-feedback reads as lag). The button
primitive already does this (§4.2 item 4).

**State transitions** — value/selection changes that don't open/close a surface: a selected
row, an active nav item, a checked control. `transition-colors` at `--motion-fast`.

**Overlays** — covered by `OVERLAY_MOTION` (§4.1). Optional-only addition: directional slide
for Select/Combobox popups keyed off `data-side` instead of a symmetric scale — polish, not
required.

**List & layout** — two distinct techniques:

1. **Enter/exit of individual items.** Base UI's `keepMounted` does NOT apply to plain
   `.map()`-rendered lists; the chat transcript is a windowed virtualizer, so arrival is
   decided in item space, not mount space (§4.2 item 1).
2. **Reflow of siblings** on height-change/re-sort: accept native reflow for short lists, or
   use `document.startViewTransition` for same-document DOM mutations (it auto-generates a
   FLIP-style cross-fade+move for whatever the callback changes) — not just page nav.

**Page/route/section** — wired via `withViewTransition` + TanStack Router
`defaultViewTransition: true` (native View Transitions API, not a hand-rolled crossfade).

**Loading** — shimmer is continuous `linear` (a shimmer that "settles" reads as glitchy). The
loading→content cross-fade was considered and decided-against (§4.2 item 5).

## 3. House principles

Numbering is STABLE — code comments cite `guide §3.7` and `guide §3.9` by number; keep all ten
in order.

1. **Exit matters as much as entrance.** Entrance-only motion is the #1 tell of unfinished
   work. Any enter animation wants a paired exit — UNLESS there is no honest exit phase to
   animate (a deleted chat row has no unmount phase; §4.2 item 1).

2. **Interruptibility.** A mid-open close reverses smoothly from its current position, not
   snap/restart. This is why CSS transitions beat `@keyframes` for togglables (§1.2), and why
   springs beat tweens for gesture-interruptible surfaces (drag, repeated taps).

3. **Origin-aware transforms.** Things emerge from where they were triggered, not from
   dead-center. Base UI's `--transform-origin` (§1.4) solves this on every anchored popup —
   never override it with a static `center`.

4. **Motion answers causality/hierarchy/continuity — never decoration.** "What just happened,
   what changed, where did this come from, what can I do next" — not "look cool." Prefer
   quick, precise motion over expressive.

5. **Sane defaults: ~150–250ms, ease-out for entrances, ease-in-out for on-screen movement,
   linear for continuous loops.** The three-tier token set already encodes this taxonomy
   (`--motion-fast` 130ms micro / `--motion-base` 220ms small-surface / `--motion-layout`
   360ms layout-scale). Do NOT add a 4th interaction duration token or a 2nd easing curve.
   The continuous/ambient tokens (`--motion-shimmer`/`breathe`/`precip`/`transit`/`ambient`)
   serve loops and environmental effects — a separate class, never a substitute for the
   three-tier interaction taxonomy.

6. **Spring vs. tween — springs for gesture-driven/interruptible, tweens for programmatic.**
   A finger-dragged drawer settles with a spring; a click-opened menu is pure tween (a spring
   would be try-hard). Programmatic motion in this app is fixed-duration + `--ease-out-expo`.

7. **Compositor-only is a correctness constraint.** Animate `transform`/`opacity` (and the
   Tailwind v4 standalone `scale`/`translate` properties) only — they don't trigger
   layout/paint. Base UI ships `--accordion-panel-height` / `--collapsible-panel-height` as
   *measured* vars so you can transition `height` without a measure-loop, but that IS a layout
   property — scope it to occasional expand/collapse, never anything high-frequency.

   **AMENDED 2026-08-22 (owner ruling, #456) — the interactive-state colour carve-out.**
   A **paint-only colour** transition whose trigger is an interactive STATE — `hover` / `active`
   / `focus` — is ALLOWED: `color`, `fill`, `stroke` and any `*-color` longhand
   (`background-color`, `border-*-color`, `outline-color`, …). It repaints; it never moves
   geometry, and it is the most conventional affordance feedback there is. **Everything that
   moves geometry stays under the paragraph above** — `transform`/`opacity`
   (+ standalone `scale`/`translate`) remain the whole permitted set for anything that moves,
   whatever triggers it, and a colour animation the user did NOT trigger (mount, a data change,
   a poll landing) is still a §3.7 violation. This closes the collision between §3.7's
   unqualified "transform/opacity only" and §2/§4.2 item 9, which have always prescribed
   `transition-colors` for state changes. **What forced it:** the ONE core Card primitive's
   `hover:bg-accent` (`packages/ui/src/primitives/card/variants.ts`) made the app's own `[anim]`
   flagger print `animating non-compositor backgroundColor (guide §3.7) · OVER BUDGET` on every
   interactive-card hover, app-wide — a live instrument accusing ratified behaviour
   (side-eye 2026-08-22, P3-2).

   The enforcing flagger is `packages/client/src/lib/motion-flaggers.ts` (`[anim]`), and its
   predicate is **narrower than this text by construction**: an animation event carries a
   property name and a target, never the CSS rule that fired it, so the flagger reads the
   property set plus a live `Element.matches(":hover, :active, :focus, :focus-visible,
   :focus-within")` on the element itself. Its stated blind spots — self-only (a `group-hover:`
   descendant still fires), the latch that keeps the hover-OUT leg silent, and the sampler
   (`__orb.animations()`) it deliberately does not touch — are documented at that carve-out's
   own comment. Read them before treating a flagger verdict as this law's verdict.

   **AMENDED 2026-09-02 (#1069) — the ratified-lifecycle allowance has ONE home.** §4.2 item 3's
   accordion/collapsible panel height is BUILT and sanctioned by this section's own text, yet the
   `[anim]` channel convicted it on every first open, because the allowance minted with #953 had
   landed only on the former motion CLI's pull half of the shared vocabulary. The predicate now
   lives in `@orb/kit/motion-allowance` and BOTH instruments read it — the push side prints the
   raise without a budget verdict, the pull side keeps re-judging the raw facts under it. It
   sanctions a Base UI transition bound to one `data-starting-style`/`data-ending-style` phase,
   never the word "height": an application-authored height animation is still a §3.7 violation.

8. **When NOT to animate.** Litmus: seen 100+ times daily → don't animate (keystroke feedback,
   every row a power user scrolls past). Also: motion the user did NOT cause (another user's
   message arriving) gets a subtler cue than motion their own click triggered, or none.

9. **`prefers-reduced-motion` is REMOVE, not shorten.** Parallax, auto-playing motion, and
   large-scale transforms are removed outright, not sped up. The CSS floor does this
   (`animation-duration: 0.01ms !important` + `transition-property: none !important`, OS `@media` +
   shell-stamped `[data-reduced-motion="true"]`, both unlayered — `ui/src/styles/globals.css`);
   the JS hook `usePrefersReducedMotion` degrades `useSmoothText` to full passthrough. New
   motion replicates this — no "reduced but still animated" middle ground. **Transitions are
   REMOVED, so `transitionend` never fires under reduced motion** — any component that unmounts
   or cleans up on that event owes an explicit reduced-motion arm (`CrossfadeImage`, `WeaveVeil`,
   `flashAnchor`). The transition floor was a `0.01ms` duration clamp until #257, where it was
   measured turning every element in the document into `transition: all` and firing 1,064 bogus
   `scrollbar-color` transitions per room open.

10. **Staggering communicates grouping.** A small stagger (20–50ms/item, capped ~5-6) reads as
    "one group arriving." Never stagger removals — a deleted item leaves immediately.

## 4. Orbweaver motion inventory

### 4.1 Overlay + nav motion — built, don't touch

`OVERLAY_MOTION` (`packages/ui/src/lib/overlay-motion.ts`) is the one source for overlay
transition classes: anchor-scaled `transform-origin` for floats (`anchoredPopup`, 130ms) vs.
centered scale for modals (`modalPopup`, 220ms), the scrim `backdropFade` — transitions (not
keyframes) throughout for interruptibility. Select/menu/popover/dialog all compose from it
(their `variants.ts` import `OVERLAY_MOTION`, backdrops included) — a per-seal drift is
structurally impossible.

View-transitions on rail-section + chat nav (`withViewTransition` +
`document.startViewTransition`, gated on `prefers-reduced-motion` once in
`packages/client/src/lib/view-transition.ts`; router `defaultViewTransition: true`) — native
browser API, not a hand-rolled crossfade. The capture is CONTENT-ONLY, so the swap animates nothing
about a float: an open dialog/popover keeps painting over the new content, and which floats may do that
is the declared lifetime rule in UI-Arch §4a (`MODAL_CONTENT_LIFETIME` + `withContentSwap`, #1795) —
a motion question with a state answer, never a second `view-transition-name`.

#### 4.1.1 Sealed Select entrance audit input (#374)

The 50ms blocking ceiling and unconditional style/layout rule still govern ordinary LoAFs. Clean-host
4x controls showed that Base UI Select's normal anchored entrance/positioning work spans first and
natural repeat opens; Base UI Menu and Radix Select showed the same headless-library shape, while a
minimal one-state React portal was clean. The calibrated input is deliberately narrower than that
cross-library cause: only this repo's sealed Select entrance qualifies.

`packages/client/src/lib/select-entrance-evidence.ts` starts provisionally on a trusted pointer or
opening-key action at `[data-slot="select-trigger"]`. It confirms only when that trigger's ARIA-related
`[data-slot="select-positioner"]` mounts or reactivates, and ends after the two measured
"PRESENTED_PARTIAL" cleanup frames following the popup's real opacity/scale transition, with a 300ms
post-confirmation hard cap. The cap is
post-confirmation because the first render can itself consume much of the pre-confirmation interval;
it is not a free grace window. `motion-stats.ts` attaches that same confirmed range to
each overlapping LoAF. A first page-lifetime entrance may subtract 140ms from exactly one primary
confirmation LoAF before the unchanged 50ms blocking ceiling; the allowance is consumed once and every
later/concurrent frame plus every repeat receives zero subtraction. Recognizable app or unrelated-module
script attribution vetoes both the allowance and style/layout classification for that LoAF. Empty
attribution and production hashed bundles are unknown, not positive library attribution. Style/layout is
otherwise classified only on overlapping confirmed entrance frames. Reports retain raw, classified, and
budgeted totals.

The same helper emits paired User Timing start/confirmed/end marks. `pnpm snap --motion [selector]` pairs those with real
CDP `PipelineReporter` begin/end intervals and excludes only overlapping frames from its budgeted dropped
numerator and denominator; raw counts stay visible. Missing marks, unpaired frames, non-Select portals,
work outside the entrance, residual blocking, CLS, and dirty animations remain ordinary inputs. The
probe resolves Playwright actionability geometry before its checkpoint and sends a native mouse click
after crossing a frame boundary, so its own layout reads are not mistaken for product work. Do not
replace this with `keepMounted`, pre-mounting, a call-site marker, or a broader portal exemption.

The end mark remains the measured two-PRESENTED_PARTIAL-frame handoff; do not widen its frame count or
window. Chrome cannot causally separate unrelated work inside the identical browser frame, so those two
frames are a bounded owner-accepted risk, not a claim of perfect attribution. Separate frames and
recognizably app-attributed LoAF work remain ordinary red inputs.

During that measured CDP window only, Snap's motion arm asks the dev bridge to suspend the duplicate
in-page `[drop]` lifetime collector. The pause returns before CSS-event, WAAPI-target, map, and report
work, and is always released in `finally`; ordinary dev `[drop]`, `[anim]`, LoAF/CLS, `[css]`, and
`[space]` remain unchanged. CDP `PipelineReporter` is the dropped-frame owner inside the audit window.
Its report is nested under `args.frame_reporter`; paired trace end events have empty `args` and are not
frames (#389). Parser controls must use that real Chrome payload shape and retain a planted dropped-frame
red outside the Select entrance.

#### 4.1.2 The bounded input-dispatch layout-frame exemption (#1647, #1316's proposal)

`loaf-style-layout-count 0` is unmeetable for a click that resizes a grid track (the list-collapse
toggle): that IS real style/layout work, and it must happen in the click's own frame. #380's
context-pane ruling ("one unavoidable grid-layout LoAF") is the precedent this codifies as DATA, in
`tooling/src/motion-audit/lib/verdicts.ts`'s `isBoundedInputDispatchLayoutFrame` (an instrument rule,
not a gate — motion-audit has no gate half). ALL FOUR conditions must hold or the frame still counts
against the budget: (a) a script in the frame IS the measured input's own dispatch
(`sourceFunctionName === "dispatchDiscreteEvent"`); (b) every script reports
`forcedStyleAndLayoutDuration === 0`; (c) `styleAndLayoutStart` falls at/after the frame's own script
span (the render-phase tail, approximated as `styleAndLayoutStart >= Σ scripts[].duration` — the exact
LoAF-spec `renderStart` field is not yet plumbed through `packages/client/src/lib/motion-stats.ts`); and
(d) it is the ONLY frame in the window whose `styleAndLayoutStart > 0`. `loafTotals()` reports
`boundedInputDispatchExempt` alongside `budgetedStyleLayout` so a clean `0` count can be told apart from
"nothing happened" — a consuming report NAMES the exemption rather than reading a bare zero as
unqualified.

### 4.2 The motion inventory (what's built, where; item numbers are stable)

Item 1's number is cited from code (`use-enter-motion.ts` → `guide §4.2 item 1`) — keep the
ordering. Every item is BUILT or DECIDED-AGAINST.

**1. List-item enter (chat transcript).** BUILT (enter) / DECIDED-AGAINST (exit). The chat
list is a TanStack virtualizer (`@orb/ui/message-list`) whose rows mount/unmount on every
scrollback, so a mount-keyed enter would replay constantly (violates §3.8). Arrival is decided
in **item space**: an id-keyed diff (`packages/client/src/features/chat/lib/new-arrivals.ts`
— seen/fresh sets, appended-only, ghost-aware) names the keys that genuinely arrived; the row
latches that verdict at mount and runs a rAF-flip enter
(`packages/client/src/features/chat/hooks/use-enter-motion.ts` — `opacity` + the standalone
`translate` property, `--motion-base`/`ease-out-expo`, reduced-motion REMOVED per §3.9).
Scrolled-in rows, chat-open, history prepends, and the ghost→committed settle never animate.
**Exit is deliberately NOT animated:** a deleted row leaves canon and the virtualizer in the
same render — no unmount phase to attach a transition to, and the honest visual is a height
collapse §3.7 forbids animating (full reasoning in `new-arrivals.ts`'s header).

**2. Tabs indicator glide.** BUILT. `packages/ui/src/primitives/tabs/tabs.tsx` renders
`Tabs.Indicator`; the bar's REST box is layout off Base UI's runtime `--active-tab-left/width`
vars, and the MOVE is a transform-only FLIP (`glideIndicator` — §1.5's exception class —
transitioned back to identity at `--motion-base`/`ease-out-expo`).
**MECHANISM CHANGED 2026-09-02 (#1069):** it was `transition-all` on `left`/`width` until then,
i.e. a layout animation that relayouts the list every frame, which the app's own `[anim]`
flagger convicted under §3.7 on the first switch of every tab surface. The obvious pure-CSS
transform spelling is illegal here — `scaleX(width/base)` never rests at identity, so every
selected tab would be a rest state carrying a non-identity scale (`rest-transform-grid`,
integer-line-boxes §9 Law 2) and the 2px bar's `rounded-full` caps would be permanently
stretched. Pinned by `tests/ui/primitives/tabs/tabs.ct.tsx` (the launched property set, the
resting transition contract, and the settled landing on the new tab's box).

**3. Accordion / Collapsible height.** BUILT. Both panels transition
`h-(--accordion-panel-height)` / `h-(--collapsible-panel-height)` from/to
`data-starting-style:h-0`/`data-ending-style:h-0` at `--motion-layout`
(`packages/ui/src/primitives/accordion/variants.ts`, `collapsible/variants.ts`).

**4. Button press feedback.** BUILT. `packages/ui/src/primitives/button/variants.ts` —
`active:scale-95`, with the transition explicitly NAMING `scale` (a Tailwind v4 standalone
property, not the `transform` matrix) at `--motion-fast`.

**5. Loading → content cross-fade.** DECIDED-AGAINST. `<Activity>` keeps visited panes warm
so a revisit never flashes a fallback (`features/app-shell/surfaces/app-shell.tsx`,
`components/section-content.tsx`); a first-visit mount legitimately shows its skeleton (the
suspense fallback IS a skeleton, never a spinner flash —
`packages/client/src/components/query-boundary.tsx`), and React's `startTransition` can't suppress
an initial-mount fallback anyway. No cross-fade to wire.

**6. Success/save confirmation.** DECIDED-AGAINST (as a shared keyframe). The portrait save
confirmation is a **static ring flash, no keyframe** (reduced-motion-safe by construction) —
see `HeroPortrait` in
`packages/client/src/features/character/components/character-hero-band.tsx`; autosave surfaces
confirm via their form-state chrome. No shared keyframe pattern is warranted.

**7. Toasts.** BUILT. `packages/ui/src/primitives/toast/variants.ts` — enter/exit on
`data-starting-style`/`data-ending-style` (fade + `translate-y-full`), swipe tracked 1:1 via
the Base UI swipe vars with `data-swiping:transition-none`.

**8. Drag / sortable.** BUILT. `packages/ui/src/primitives/sortable/sortable.tsx` — dnd-kit
transform-only reorder, reduced-motion gated (`usePrefersReducedMotion` →
`Feedback.configure({ dropAnimation: null })`).

**9. Selection/checked state.** BUILT. `checkbox/variants.ts`, `radio-group/variants.ts` (and
siblings) carry `transition-colors duration-(--motion-fast) ease-out-expo`.

**10. Streamed-word reveal fade (chat ghost row).** BUILT (#42, owner-ordered 2026-08-09 —
supersedes the old §4.3 "don't animate streaming text" bullet; design + measurements:
D168). Each newly revealed word of a streaming message fades in
(opacity-only keyframe `orb-word-reveal`, `--motion-base` + `--ease-out-expo`, `fill both`) via the
markdown seal's own rehype plugin (`ui/src/markdown/reveal-plugin.ts` → `[data-orb-reveal]` spans in
`ui/src/styles/globals.css`). Fade progress is anchored to the word's REVEAL TIME through a negative
`animation-delay`, so the hot-loop re-renders of a streaming block resume a mid-flight fade instead
of restarting or snapping it — that anchoring is what makes a per-word fade safe on a
high-frequency surface. Reduced-motion is REMOVE per §3.9 (no spans injected under the OS query;
the CSS floors collapse the rest). The streaming caret beside it is also seal-owned CSS (2px
primary bar on the last LEAF block — never Streamdown's `caret` prop, whose `::after` lands on the
per-block `dir` wrapper and drops to a new line).

### 4.3 What NOT to add

- No parallax, no scroll-jacking — nothing in the sources or the app's own restrained
  `--ease-out-expo`-only house style supports it.
- No bounce/elastic/spring-overshoot on anything programmatic (menus, dialogs, tabs) — save
  spring physics for genuinely gesture-driven surfaces only (drawer swipe, drag-reorder
  release).
- Don't animate high-frequency/hot-loop surfaces (every keystroke) — violates the "100+ times
  daily" litmus. (The old clause here also banned animating streamed token text; the owner
  superseded that 2026-08-09 — the streamed-word reveal fade is §4.2 item 10, and its reveal-time
  anchoring is the technique that makes a hot-loop fade correct.)
- Don't invent a 4th interaction duration token or a 2nd easing curve without a category that
  genuinely doesn't fit `fast`/`base`/`layout` + `ease-out-expo`. The existing 3-tier interaction
  system covers the full taxonomy in §2; continuous/ambient tokens (`shimmer`/`breathe`/`precip`/
  `transit`/`ambient`) serve loops and environmental effects and are a separate class.

## 5. The Base UI animation/styling contract (house law — #1088)

Three binding rules that complete §1's description as enforceable law. Each names its enforcer per
constitution §2 (a prose-only boundary is a wish). The instrument-side match tables (#1064/#1065) are
already locked; this section is the law + gate half.

### 5.1 Transitions over keyframes for lifecycle motion

**Rule:** every open/close/mount/unmount animation on a Base UI part MUST use CSS transitions keyed off
`data-starting-style`/`data-ending-style`, NOT `@keyframes` keyed off `data-open`/`data-closed`.

**Why:** a CSS transition can be smoothly cancelled and retargeted mid-flight (§1.2, §3.2
interruptibility); a `@keyframes` animation cannot — if state flips mid-animation it restarts or snaps.
Base UI's own handbook states this preference. Every built overlay in this app already uses transitions
(§4.1 `OVERLAY_MOTION`); the only `@keyframes` are continuous loops (shimmer, typing dots, weather
effects, the indeterminate hairline, the stream caret), multi-step sequences (shell FLIP push), and the
word-reveal fade (§4.2 item 10 — anchored animation-delay, a technique transitions cannot express).
Those are the §1.2-documented exceptions: effects a transition literally cannot express.

**Enforcer:** `rest-transform-grid` ARM C already classifies `@keyframes` blocks as ANIMATING (not
rest), so a `@keyframes`-only animation passes that gate more easily than a transition — the issue's
stated perverse incentive. The enforcement gap is that no gate currently REDs a lifecycle `@keyframes`
on a Base UI popup part when a transition could express the same effect. The structural fix is a
ui-audit rule or gate that flags `animation`/`animation-name` declarations on elements carrying
`data-open`/`data-closed` when the animated properties (`opacity`, `transform`, `scale`) are
transition-expressible. Until that gate ships, this rule is REVIEW-ENFORCED — a `@keyframes`
lifecycle animation on a Base UI part in a PR review is a finding.

**Allowlist (the `@keyframes` that stay):** any continuous/looping animation (`animation-iteration-count:
infinite`); any multi-step sequence (>2 stops); the `orb-word-reveal` anchored fade (§4.2 item 10); the
shell FLIP push keyframes (`shell.css`). Each has a reason a transition cannot express it.

### 5.2 Completion-detectability: exit animation on the part, not a child

**Rule:** an exit animation MUST target the Base UI part element itself (the element carrying
`data-ending-style`), never solely a descendant.

**Why:** Base UI unmounts via `element.getAnimations()` on the popup element. An exit animated only on a
CHILD means `getAnimations()` returns an empty array on the part, Base UI concludes the transition is
already done, and it unmounts instantly — eating the exit animation. The user sees a hard cut instead of
a fade-out.

**Enforcer:** statically detectable — `data-ending-style` styles targeting a descendant selector with no
`data-ending-style` on the part itself is the defect pattern. Until a dedicated gate ships, this is
REVIEW-ENFORCED. The structural detection shape: a Tailwind `data-ending-style:` variant on a child
element inside a Base UI popup, with no `data-ending-style:` variant on the popup's own root. The
`baseui-state-data-attributes` gate owns the adjacent concern (styling through Base UI's own data attrs
rather than parallel React state) and is the natural home for this check.

**Practical consequence:** always put at least `opacity: 0` on `[data-ending-style]` of the popup root
itself, even if most of the exit visual is on a child. `OVERLAY_MOTION.anchoredPopup` and
`OVERLAY_MOTION.modalPopup` already do this — both apply `data-ending-style:opacity-0` plus
`data-ending-style:scale-95`/`scale-98` on the popup root.

### 5.3 Lifecycle data-attributes are the ONLY sanctioned styling hooks

**Rule:** the four lifecycle attributes — `data-starting-style`, `data-ending-style`, `data-open`,
`data-closed` — plus the per-primitive state attributes enumerated in §1.1 are the ONLY hooks for
styling a Base UI part's open/close/transition state. Ad-hoc class toggles via React state, imperative
className manipulation, or parallel boolean flags for the same state are prohibited.

**Why:** Base UI publishes each part's state as `data-*` attributes and keeps them synchronized with
the component's internal lifecycle (§1.1). A parallel React `useState` boolean disagrees with the
data-attribute for the full duration of a closing animation (Base UI keeps `data-open` through the exit;
a React boolean flips on the first event). Styling off the boolean creates a second source of truth —
the component visually snaps while the animation is still running.

**Enforcer:** `baseui-state-data-attributes` gate (LIVE — `Core-Enforcement-Active-Gates.md`). It reads
the committed Base UI surface manifest per part and REDs a seal that holds local React state mirroring
a state key Base UI already stamps on the DOM. Minted at zero live violations.

**The closed set:** `data-starting-style` (one frame, enter "from") · `data-ending-style` (exit "to") ·
`data-open` (while open) · `data-closed` (while closed, if `keepMounted`) · `data-disabled` ·
`data-instant` (no-transition). Per-primitive additions: §1.1's table. `data-slot` is a LOCATOR, not a
state hook — it names the part for CT selectors, never for conditional styling.

## 6. Base UI reference

The external contract behind §1 (`@base-ui/react`, current 1.x). Code homes for the
app's own motion are cited inline in §1/§3/§4; the inspiration synthesis behind §3 is in the
archaeology record.

- Animation handbook — <https://base-ui.com/react/handbook/animation>
- Styling handbook (data-attributes, CSS variables) — <https://base-ui.com/react/handbook/styling>
- `useRender` utility — <https://base-ui.com/react/utils/use-render>
- Popover (anchor CSS vars, `keepMounted`) — <https://base-ui.com/react/components/popover>
- Accordion (`--accordion-panel-height`) — <https://base-ui.com/react/components/accordion>
- Collapsible (`--collapsible-panel-height`) — <https://base-ui.com/react/components/collapsible>
- Tabs (`--active-tab-*` indicator vars) — <https://base-ui.com/react/components/tabs>
- Drawer (swipe CSS vars, `data-swipe-*`) — <https://base-ui.com/react/components/drawer>
- Floating UI `useTransitionStatus` (NOT Base UI public API — §1.5) — <https://floating-ui.com/docs/usetransition>
