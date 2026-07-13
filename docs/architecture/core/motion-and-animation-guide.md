---
kind: law
status: active
updated: 2026-07-13
---

# Motion & Animation Guide

Promoted proposed/ → core/ under D66 (2026-07-13) — this is the motion law. This is a reference
for where and how to add motion, grounded in Base UI's actual current API (v1.6.0) and 2026
motion-design consensus. It builds ON the existing token/overlay system — it does not
replace it.

Owner ask: the app has few animations today; add tasteful, modern motion without turning it
into a slop parade of easing curves and bounce.

---

## 0. TL;DR for anyone who won't read the whole thing

- We already have the hard infra right: DTCG duration tokens (`--motion-fast` 130ms,
  `--motion-base` 220ms, `--motion-layout` 360ms), one easing curve (`--ease-out-expo`),
  a shared `OVERLAY_MOTION` fragment set, view-transitions on nav, and a reduced-motion
  hook wired in five places. That's more motion discipline than most production apps ship
  with. Don't rebuild any of it.
- What's missing isn't infrastructure, it's **coverage**. Overlays animate; almost nothing
  else does. Lists pop in/out with no transition, tab/rail switches have no indicator
  motion, buttons don't acknowledge presses, nothing confirms success, toasts (if/when
  added) need the same file this guide describes.
- The single highest-leverage fix: give **exit** animations to things that currently only
  animate in (or don't animate at all) — list items, toasts, success states. Entrance-only
  motion is the #1 tell of unfinished motion work.
- Second highest-leverage fix: animate the **Tabs indicator** and **Accordion/Collapsible
  height** — Base UI ships the exact CSS variables for both (`--active-tab-left/width`,
  `--accordion-panel-height`) and today nothing in the codebase appears to consume them for
  animation (scout found the primitives imported but no evidence of the indicator-glide or
  height-transition CSS being written yet).

---

## 1. Base UI animation mechanics cheat-sheet

Base UI (`base-ui.com`, package `@base-ui-components/react`, current major 1.x) is a
headless/unstyled primitives library — floating-ui + Radix-adjacent lineage (built by the
Radix/Floating UI/MUI team). It does not ship any CSS or animation itself; it exposes
**data-attributes and CSS custom properties** that describe component state, and you attach
transitions/keyframes to them yourself. Everything below is verified against the current
docs (fetched 2026-07), not memorized from an older version.

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

Per-primitive additions actually used in this codebase's primitives (confirmed against docs):

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
- **Drawer**: `data-swiping`, `data-swipe-direction`, `data-swipe-dismiss`, plus
  `--drawer-swipe-movement-x/-y`, `--drawer-snap-point-offset`, `--drawer-swipe-progress`,
  `--drawer-swipe-strength` (0.1–1 scalar for scaling the release-transition duration to
  gesture velocity — this is the "fling" feel).

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
sequences, shimmer sweeps, spinner rotation, or the shake/attention-getters in §2.

This app's existing `OVERLAY_MOTION` fragments already made this exact call — they're
`transition-all` + `data-starting-style:`/`data-ending-style:` Tailwind arbitrary-variant
classes, not `@keyframes`. That's the correct default; keep it.

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

Practical takeaway: **100% of the animation work in this app happens in CSS/Tailwind
against data-attributes and CSS vars**, never in a React animation hook. That matches what
the codebase already does.

---

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

**Micro-interactions** — the most numerous and most invisible when done right. Every
pressable control should acknowledge the press: a `scale(0.97)` or background-darken on
`:active`/Base UI's pressed state, released on pointerup. Keep these fast (100–150ms) and
ease-out — a slow press-feedback reads as lag, not polish. This is the single most
under-built category in the current app (see §4).

**State transitions** — anything that changes value/selection without opening/closing a
surface: a selected list row, an active nav item, a checked checkbox. `transition-colors`/
`transition-transform` at `--motion-fast`. Cheap to add everywhere; almost zero risk.

**Overlays** — already well-covered by `OVERLAY_MOTION` (§4.1 confirms it matches best
practice). The only categorical addition worth considering: **directional slide for
Select/Combobox popups**, using the `data-side` attribute to pick a slide direction that
matches which edge the popup opened from, rather than a symmetric scale for every side.
Optional polish, not a gap.

**List & layout** — the biggest real gap (§4). Two different techniques apply:

1. **Enter/exit of individual items** (add/remove a row): CSS transitions on the item
   itself keyed off mount/unmount — needs `AnimatePresence`-equivalent (Base UI's
   `keepMounted` pattern doesn't apply to plain `.map()`-rendered lists; see §4.2 for the
   concrete approach without pulling in a library).
2. **Reflow of siblings** when an item's height changes or the list re-sorts: this is a FLOR
   / FLIP problem (see §3) — either accept the native reflow (fine for short lists) or use
   the CSS `transition: grid-template-rows`/`transition-behavior: allow-discrete` trick, or
   reach for the browser's native **View Transitions for DOM updates** (not just page nav —
   `document.startViewTransition` also works for same-document DOM mutations and
   auto-generates a FLIP-style cross-fade+move for anything the callback changes).

**Page/route/section** — already wired via `withViewTransition` + TanStack Router's
`defaultViewTransition: true`. This is the modern-correct approach (native View Transitions
API), not a hand-rolled crossfade. Nothing to add here structurally; see §4 for polish.

**Loading** — shimmer already exists and is correct (continuous, `linear`, no
ease-in-out — a shimmer that "settles" reads as glitchy). The gap: **loading→content
transition**. When a skeleton resolves to real content, the swap should cross-fade
(\~150ms opacity) rather than hard-cut, or the shimmer's abrupt disappearance reads as a
flash. See §4.

---

## 3. Secret-sauce principles (what separates premium motion from amateur)

Synthesized from Emil Kowalski's [Great Animations](https://emilkowal.ski/ui/great-animations),
Material 3 motion, Apple HIG motion, NN/g, and IBM Carbon (sources in §5). These are the
principles that actually distinguish good motion, not generic "add transitions" advice:

1. **Exit matters as much as entrance.** The #1 tell of unfinished motion work is
   animations that only play on the way in. Real interfaces don't teleport out of existence
   — Kowalski: *"nothing in the world around us disappears or appears instantly."* Every
   enter animation in this guide's punch list (§4) needs a paired exit, not just a mount
   transition.

2. **Interruptibility.** If a user closes something mid-open, the animation should reverse
   smoothly from its current position, not snap or restart from frame zero. This is why
   CSS transitions beat `@keyframes` for anything togglable (§1.2), and why spring physics
   (when used) beat fixed-duration tweens for anything the user can interrupt by
   re-triggering the same gesture rapidly (drag, repeated taps).

3. **Origin-aware transforms.** Things should visually emerge from where they were
   triggered, not materialize from the void at dead-center. Base UI's `--transform-origin`
   var (§1.4) is this principle already solved for you on every anchored popup — the only
   sin would be to override it with a static `center`.

4. **Causality, hierarchy, continuity — never decoration.** Every one of the reviewed
   sources (NN/g, Apple HIG, Material 3) converges on the same warning: animation exists to
   answer "what just happened, what changed, where did this come from, what can I do next" —
   not to look cool. Apple HIG: prefer *"quick, precise animations... brevity and precision
   tend to feel more lightweight and less intrusive."* NN/g: *"gratuitous, purposeless
   animations... needlessly waste precious time"* and should be judged by whether they
   "draw attention, explain a change, or add meaning" — not vibes.

5. **Sane defaults: \~150–250ms, ease-out for entrances, ease-in-out for on-screen movement,
   linear-ish for continuous loops.** This app's `--motion-fast` (130ms) / `--motion-base`
   (220ms) already sit in the correct band. Material 3's token scale (`short` 50–200ms,
   `medium` 250–400ms, `long` 450–600ms+) confirms 130–220ms is squarely "micro-interaction
   / small-surface" territory and 360ms (`--motion-layout`) is squarely "medium, layout-
   scale" territory — the existing three-tier token system already encodes exactly this
   taxonomy without anyone having designed it that way on purpose. Don't add a fourth or
   fifth duration token without a real category that doesn't fit the existing three.

6. **Spring vs. tween — use springs for anything gesture-driven or interruptible, tweens
   (fixed-duration + easing curve) for anything programmatic.** A drawer being dragged by a
   finger/cursor should settle with a spring (the drawer's `--drawer-swipe-strength`, §1.1,
   exists exactly to let the release transition feel velocity-aware — a fast fling should
   snap away faster than a slow release). A menu opening because you clicked a button is
   pure tween territory — there's no physical gesture to be physically consistent with, so
   a fixed 150ms ease-out is correct and a spring would be try-hard.

7. **Performance is a correctness constraint, not an optimization.** Animate `transform` and
   `opacity` only — these are compositor-only properties that don't trigger layout/paint.
   Kowalski: *"hardware-accelerated animations will remain smooth, no matter how busy the
   main thread is."* Animating `height`/`width`/`top`/`left` directly forces layout on every
   frame; that's exactly why Base UI ships `--accordion-panel-height` /
   `--collapsible-panel-height` as *measured* CSS vars — so you can transition to a `height`
   value without a layout thrash loop measuring it yourself, but you're still transitioning
   a layout property when you do this, so scope it to genuinely occasional interactions
   (expand/collapse), never anything continuous or high-frequency.

8. **When NOT to animate.** Kowalski's litmus: *"will users see this 100+ times daily? Don't
   animate it."* Apply this to: keystroke-level feedback in a text input, every single
   character of a list a power user scrolls past constantly, anything in a hot loop. Also:
   don't animate things the user didn't cause — an animation on data that changed because
   of someone *else's* action (e.g. another user's message arriving) should be much more
   restrained than an animation the user's own click triggered, or skip motion for it
   entirely and rely on a subtler cue (a highlight flash, not a slide).

9. **`prefers-reduced-motion` is REMOVE, not shorten.** Every authoritative 2026 source
   agrees shortening a duration is not sufficient — parallax, auto-playing motion, and
   large-scale transform animations should be removed outright for reduced-motion users,
   not sped up. This app's implementation is already doing the right thing at the CSS floor
   (`animation-duration: 0.01ms !important` — effectively instant, not "fast") and the JS
   hook degrades `useSmoothText` to full passthrough rather than a quicker reveal. That's
   the correct pattern; replicate it, don't invent a "reduced but still animated" middle
   ground for new motion.

10. **Staggering communicates grouping, not just delight.** When multiple items enter
    together (a list populating, a set of cards), a small stagger (20–50ms per item, capped
    at \~5-6 items before it becomes a queue) tells the eye "these are one group arriving,"
    which a simultaneous pop does not. Never stagger removals the same way — an item you
    just deleted should leave immediately, not wait in a queue behind other items' exits.

---

## 4. Orbweaver-specific "add motion HERE" punch list

### 4.1 Verdict on current overlay/nav motion: matches best practice, don't touch

The scout audit confirms `OVERLAY_MOTION` (`packages/ui/src/lib/overlay-motion.ts`) already
implements the two things that separate professional overlay motion from a generic fade:
anchor-scaled `transform-origin` for floats (`anchoredPopup`) vs. centered scale for modals
(`modalPopup`), transitions (not keyframes) for interruptibility, and duration tiers that
match the surface's weight (130ms anchored / 220ms modal). The one drift the fragments'
own comment calls out — select's backdrop shipping with no transition classes at all,
hard-cutting while siblings fade — is a bug in a consumer, not a design problem; worth a
quick fix but out of scope for this guide (flagging, not fixing, per scope).

View-transitions on rail-section + chat nav (`withViewTransition` +
`document.startViewTransition`, gated on `prefers-reduced-motion`) is the modern-correct
choice — native browser API, not a hand-rolled crossfade library. No change needed.

### 4.2 The actual gaps, ranked by leverage

> **Status (2026-07-12): the punch list is CLOSED.** 1–4 and 7–9 are built; 5 and 6 were
> deliberately decided against (reasoning lives in-code at the cited lines). Per-item
> status notes below; the pattern sketches are kept as reference.

**1. List item add/remove (chat message list, any `.map()`-rendered collection)** — HIGHEST
LEVERAGE. Today items almost certainly pop in/out with a hard cut (scout found no
list-item-level transition code). This is the most-seen surface in the whole app (every
chat is a list).

> **BUILT (enter) / DECIDED-AGAINST (exit), 2026-07-12.** The sketch below assumes a plain
> `.map()` list; the real chat list is a TanStack **virtualizer** (`@orb/ui/message-list`)
> where rows mount/unmount on every scrollback — so a mount-keyed enter (this pattern
> verbatim) would replay constantly, violating §3.8's own litmus. The shipped design detects
> arrival in **item space** instead: a pure id-keyed diff
> (`packages/client/src/features/chat/lib/new-arrivals.ts` — seen/fresh sets, appended-only,
> ghost-aware) decides which keys GENUINELY arrived; the row latches that verdict at mount
> and runs the rAF-flip enter (`features/chat/hooks/use-enter-motion.ts` —
> opacity+translate, `--motion-base`/ease-out-expo, reduced-motion = REMOVED per §3.9).
> Scrolled-in rows, chat-open, history prepends, and the ghost→committed settle (content the
> reader already watched stream in) never animate. **Exit is deliberately NOT animated** —
> a deleted row leaves canon and the virtualizer in the same render (no unmount phase;
> `keepMounted` pins live items, not gone ones), and the honest visual is a height collapse
> §3.7 forbids animating; full reasoning in `new-arrivals.ts`'s header (the
> `query-boundary.tsx` honesty precedent). `useExitDelay` below stays unbuilt.

Pattern (reference — the plain-list form, NOT what shipped; see the status note):

```tsx
// Item enters: mount already in the "from" state, then flip to resting state next frame
// so the transition has something to interpolate from. No library needed for enter.
function MessageRow({ message }: { message: Message }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className={cn(
        "transition-all duration-(--motion-base) ease-out-expo",
        entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
      )}
    >
      {/* message content */}
    </div>
  );
}
```

For **exit**, plain React can't animate an unmount — you need to keep the row mounted one
extra tick, same principle as Base UI's `keepMounted` (§1.3), just done by hand since this
is a bare list, not a Base UI primitive:

```tsx
function useExitDelay(isPresent: boolean, ms = 220): boolean {
  const [mounted, setMounted] = useState(isPresent);
  useEffect(() => {
    if (isPresent) { setMounted(true); return; }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [isPresent, ms]);
  return mounted;
}
```

If this pattern recurs 3+ times, it's worth promoting to a small `@orb/ui` primitive
(`<Presence>`), matching the DRY threshold in global preferences — not before.

**2. Tabs / rail-section indicator glide** — Base UI's `Tabs.Indicator` exists specifically
to solve this and ships the six position vars for free (§1.1).

> **BUILT.** `packages/ui/src/primitives/tabs/tabs.tsx` renders `Tabs.Indicator`;
> `tabs/variants.ts` glides it on the runtime `--active-tab-*` vars
> (`transition-all duration-(--motion-base) ease-out-expo`).

Confirm whichever primitive
wraps `@base-ui-components/react/tabs` in `packages/ui/src/primitives/tabs/` is actually
rendering `Tabs.Indicator` and transitioning it:

```css
.TabIndicator {
  position: absolute;
  left: var(--active-tab-left);
  width: var(--active-tab-width);
  transition: left var(--motion-base) var(--ease-out-expo),
              width var(--motion-base) var(--ease-out-expo);
}
```

This one CSS block is the single most recognizable "modern app" motion signature (it's the
segmented-control glide from iOS, the underline-slide from Material tabs) and Base UI has
already done the hard measurement work.

**3. Accordion / Collapsible height** — same story: `--accordion-panel-height` /
`--collapsible-panel-height` exist, confirm they're wired to an actual `transition: height`
or `@keyframes` (§1.1 shows the exact pattern). If any settings/disclosure section in the
app collapses instantly today, this is a two-line CSS fix riding an existing primitive.

> **BUILT.** Both panels transition `h-(--…-panel-height)` from/to
> `data-starting-style:h-0`/`data-ending-style:h-0` at `--motion-layout`
> (`packages/ui/src/primitives/accordion/variants.ts`, `collapsible/variants.ts`).

**4. Button press feedback** — micro-interaction category, near-zero cost, high perceived-
polish payoff. Add to the shared button primitive if not already present:

> **BUILT.** `packages/ui/src/primitives/button/variants.ts` — `active:scale-95` with the
> transition NAMING `scale` (Tailwind v4 standalone property) at `--motion-fast`.

```css
.Button {
  transition: transform var(--motion-fast) ease-out, background-color var(--motion-fast);
}
.Button:active {
  transform: scale(0.97);
}
```

**5. Loading → content cross-fade.** The shimmer (`orb-skeleton-shimmer`) is correct in
isolation, but confirm the swap from skeleton to real content cross-fades rather than hard-
cutting — wrap the swap point in the same enter-transition pattern as #1 above
(`opacity-0` → `opacity-100` at `--motion-fast`), so the shimmer doesn't just vanish.

> **DECIDED-AGAINST.** `packages/client/src/data/query-boundary.tsx:7-11` reasons it out
> in-code: pane REVISITS never flash a fallback (`<Activity>` keeps visited panes warm), a
> first-visit mount legitimately shows its skeleton, and React's `startTransition` can't
> suppress an initial-mount fallback anyway — the prior guide claim documented a policy
> nobody could wire.

**6. Success/save confirmation.** No dedicated pattern found in the audit. When a save/
action completes, a brief acknowledgment (checkmark scale-in + fade, or a color pulse on
the triggering control) closes the causality loop the user's action opened — this is
exactly the "communicate causality" principle in §3.4. Keep it small and single-shot: a
`scale(0.8)→scale(1)` + opacity over `--motion-fast`, no loop, no bounce (bounce/elastic
easing is explicitly what `--ease-out-expo`'s own inline comment rules out — "no bounce, no
elastic" — stay consistent with that house style).

> **DECIDED-AGAINST (keyframe form).**
> `packages/client/src/features/character/components/character-hero-band.tsx:144` — the
> save confirmation shipped as a **static ring flash, no keyframe** (reduced-motion-safe by
> construction); autosave surfaces confirm via their form-state chrome instead. No shared
> keyframe pattern is warranted.

**7. Toasts (if/when added).** Whatever toast primitive lands should get enter (slide+fade
in from the edge it stacks from) AND exit (reverse, or a stagger-collapse if multiple toasts
are stacked and one in the middle dismisses) — this is the textbook case for spring-based
interruptibility (Sonner, Emil Kowalski's own library, is the reference implementation) since
toasts can be dismissed mid-animation by a second toast arriving or a manual swipe.

> **BUILT.** `packages/ui/src/primitives/toast/variants.ts` — enter/exit on
> `data-starting-style`/`data-ending-style` (fade + `translate-y-full`), swipe tracked 1:1
> via the Base UI swipe vars with `data-swiping:transition-none`.

**8. Drag / sortable.** Scout found `primitives/sortable/sortable.tsx` already gates on
`usePrefersReducedMotion` — confirm the actual reorder transition uses `transform`
(compositor-only, §3.7) rather than reflow-triggering properties; dnd-kit's default
`CSS.Transform.toString()` helper already does this correctly, so this is likely a
verify-not-build item.

> **BUILT (verified).** `packages/ui/src/primitives/sortable/sortable.tsx` — transform-only
> reorder, reduced-motion gated.

**9. Selection/checked state.** Cheap state-transition category — checkbox check, radio
select, menu-item highlight should all get `transition-colors` at `--motion-fast` if they
don't already have it via a shared control-token class. Lowest individual leverage but
broadest surface area (every form control in the app).

> **BUILT.** `checkbox/variants.ts`, `radio-group/variants.ts` (and siblings) carry
> `transition-colors duration-(--motion-fast) ease-out-expo`.

### 4.3 What NOT to add

- No parallax, no scroll-jacking — nothing in the sources or the app's own restrained
  `--ease-out-expo`-only house style supports it.
- No bounce/elastic/spring-overshoot on anything programmatic (menus, dialogs, tabs) — save
  spring physics for genuinely gesture-driven surfaces only (drawer swipe, drag-reorder
  release).
- Don't animate high-frequency/hot-loop surfaces (every keystroke, streaming token-by-token
  text beyond what `useSmoothText` already paces) — violates the "100+ times daily" litmus.
- Don't invent a 4th/5th duration token or a 2nd easing curve without a category that
  genuinely doesn't fit `fast`/`base`/`layout` + `ease-out-expo`. The existing 3-tier system
  already covers the full taxonomy in §2.

---

## 5. Sources

**Base UI (mechanics, fetched 2026-07, current v1.x docs):**

- Animation handbook — <https://base-ui.com/react/handbook/animation>
- Styling handbook (data-attributes, CSS variables) — <https://base-ui.com/react/handbook/styling>
- `useRender` utility — <https://base-ui.com/react/utils/use-render>
- Popover component (anchor CSS vars, `keepMounted`) — <https://base-ui.com/react/components/popover>
- Dialog component (`data-nested`, focus/scroll behavior) — <https://base-ui.com/react/components/dialog>
- Accordion component (`--accordion-panel-height`) — <https://base-ui.com/react/components/accordion>
- Collapsible component (`--collapsible-panel-height`) — <https://base-ui.com/react/components/collapsible>
- Tabs component (`--active-tab-*` indicator vars) — <https://base-ui.com/react/components/tabs>
- Drawer component (swipe CSS vars, `data-swipe-*`) — <https://base-ui.com/react/components/drawer>
- Floating UI `useTransitionStatus` (confirmed NOT Base UI public API) — <https://floating-ui.com/docs/usetransition>

**Modern motion best practice (2026):**

- Emil Kowalski, "Great Animations" — <https://emilkowal.ski/ui/great-animations>
- Material Design 3, Motion overview — <https://m3.material.io/styles/motion/overview/how-it-works>
- Material Design 3, Easing and duration tokens — <https://m3.material.io/styles/motion/easing-and-duration/tokens-specs>
- Apple Human Interface Guidelines, Motion — <https://developer.apple.com/design/human-interface-guidelines/motion>
- Nielsen Norman Group, "Animation for Attention and Comprehension" — <https://www.nngroup.com/articles/animation-usability/>
- IBM Carbon Design System, Motion guidelines — <https://carbondesignsystem.com/guidelines/motion/overview/>

**This app's existing motion infrastructure (audited 2026-07-12):**

- `packages/ui/src/tokens/tokens.json` (DTCG duration/easing tokens)
- `packages/ui/src/styles/theme.css` (generated `@theme` block)
- `packages/ui/src/lib/overlay-motion.ts` (`OVERLAY_MOTION` fragments)
- `packages/ui/src/lib/use-prefers-reduced-motion.ts` (`usePrefersReducedMotion` hook)
- `packages/ui/src/stream/use-smooth-text.ts` (streaming-text reveal pacer)
- `packages/client/src/lib/view-transition.ts` (`withViewTransition` wrapper)
- `packages/client/src/routes/router.tsx` (TanStack Router `defaultViewTransition`)
- `packages/ui/src/styles/globals.css` (reduced-motion CSS floor, skeleton shimmer)
