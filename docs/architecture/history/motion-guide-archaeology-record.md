---
kind: history
status: superseded
updated: 2026-07-13
---

# Motion Guide — Archaeology Record

> Frozen 2026-07-13, extracted from `motion-and-animation-guide.md` when that doc was
> de-archaeologized on promotion proposed/ → core/ (D66). This file holds the parts that were
> musing, inspiration synthesis, pre-build gap analysis, or reference code SKETCHES that never
> shipped verbatim. It is history — do NOT quote it as law. The current motion law (verified
> against code) is `../core/motion-and-animation-guide.md`. Where a principle here is still
> load-bearing, its terse rule survives in that doc (the essay behind it did not).

## Origin framing (pre-build)

The guide opened as a proposal, before any of the coverage below was built:

> Owner ask: the app has few animations today; add tasteful, modern motion without turning it
> into a slop parade of easing curves and bounce.

## Pre-build gap analysis (the old §0 "TL;DR")

This was a snapshot of the motion coverage gap BEFORE the 2026-07-12 build closed it. Every
"missing / highest-leverage fix" below is now built or deliberately decided-against (see the
current doc §4). Preserved as the record of what the build was aiming at:

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
  animation.

## Secret-sauce principles — the inspiration essay (old §3)

The current doc keeps the ten principles as terse house rules (the numbering is stable —
code comments cite `guide §3.7` and `guide §3.9`). What was cut and frozen here is the
sourced synthesis and the design-writing quotes that motivated them. Synthesized from Emil
Kowalski's [Great Animations](https://emilkowal.ski/ui/great-animations), Material 3 motion,
Apple HIG motion, NN/g, and IBM Carbon:

1. **Exit matters as much as entrance.** Kowalski: *"nothing in the world around us
   disappears or appears instantly."* The #1 tell of unfinished motion work is animations
   that only play on the way in.
2. **Interruptibility.** If a user closes something mid-open, the animation should reverse
   smoothly from its current position, not snap or restart. This is why CSS transitions beat
   `@keyframes` for togglables, and why springs beat fixed-duration tweens for anything the
   user can interrupt by re-triggering the same gesture.
3. **Origin-aware transforms.** Things should visually emerge from where they were triggered,
   not materialize from the void at dead-center. Base UI's `--transform-origin` var solves
   this on every anchored popup.
4. **Causality, hierarchy, continuity — never decoration.** Every reviewed source (NN/g,
   Apple HIG, Material 3) converges: animation answers "what just happened, what changed,
   where did this come from, what can I do next" — not "look cool." Apple HIG: prefer
   *"quick, precise animations... brevity and precision tend to feel more lightweight and
   less intrusive."* NN/g: *"gratuitous, purposeless animations... needlessly waste precious
   time"* — judge by whether they "draw attention, explain a change, or add meaning."
5. **Sane defaults: \~150–250ms, ease-out for entrances, ease-in-out for on-screen movement,
   linear-ish for continuous loops.** Material 3's token scale (`short` 50–200ms, `medium`
   250–400ms, `long` 450–600ms+) confirms 130–220ms is "micro-interaction / small-surface"
   territory and 360ms is "medium, layout-scale" — the existing three-tier token system
   already encodes exactly this taxonomy.
6. **Spring vs. tween — springs for anything gesture-driven or interruptible, tweens for
   anything programmatic.** A drawer dragged by a finger should settle with a spring; a menu
   opening because you clicked a button is pure tween territory and a spring would be
   try-hard. (Note: the codebase drawer does NOT consume a velocity-scalar var; the
   `--drawer-swipe-strength` "fling feel" described here was Base-UI-capability aspiration,
   never wired.)
7. **Performance is a correctness constraint.** Animate `transform` and `opacity` only —
   compositor-only properties that don't trigger layout/paint. Kowalski:
   *"hardware-accelerated animations will remain smooth, no matter how busy the main thread
   is."* Base UI ships `--accordion-panel-height` / `--collapsible-panel-height` as measured
   vars so you can transition `height` without a measure-loop, but that's still a layout
   property — scope it to occasional interactions.
8. **When NOT to animate.** Kowalski's litmus: *"will users see this 100+ times daily? Don't
   animate it."* Also: don't animate things the user didn't cause — another user's message
   arriving deserves a subtler cue than the user's own click.
9. **`prefers-reduced-motion` is REMOVE, not shorten.** Every authoritative 2026 source
   agrees shortening a duration is insufficient — parallax, auto-playing motion, and
   large-scale transforms are removed outright, not sped up.
10. **Staggering communicates grouping.** A small stagger (20–50ms per item, capped at \~5-6)
    tells the eye "these are one group arriving." Never stagger removals.

## Reference pattern sketches (proposals — NOT what shipped)

The old §4 "punch list" carried reference code sketches. The real shipped forms diverged (a
windowed message list, a static ring flash, `active:scale-95`, etc. — see the current doc
§4.2 for the code homes). Frozen here so nobody mistakes a sketch for the shipped pattern.

**List item enter (sketched as a plain `.map()` list; shipped as a windowed-list, item-space
arrival diff):**

```tsx
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

**List item exit (`useExitDelay` — never built; exit is deliberately not animated, see the
current doc §4.2 item 1):**

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

**Tabs indicator glide (sketched as raw CSS; shipped as Tailwind classes in
`tabs/variants.ts`):**

```css
.TabIndicator {
  position: absolute;
  left: var(--active-tab-left);
  width: var(--active-tab-width);
  transition: left var(--motion-base) var(--ease-out-expo),
              width var(--motion-base) var(--ease-out-expo);
}
```

**Button press (sketched `scale(0.97)`; shipped `active:scale-95` in `button/variants.ts`):**

```css
.Button {
  transition: transform var(--motion-fast) ease-out, background-color var(--motion-fast);
}
.Button:active {
  transform: scale(0.97);
}
```

## Inspiration source list

Backed the essay above. Not law — the current doc keeps only the Base UI mechanics links.

- Emil Kowalski, "Great Animations" — <https://emilkowal.ski/ui/great-animations>
- Material Design 3, Motion overview — <https://m3.material.io/styles/motion/overview/how-it-works>
- Material Design 3, Easing and duration tokens — <https://m3.material.io/styles/motion/easing-and-duration/tokens-specs>
- Apple Human Interface Guidelines, Motion — <https://developer.apple.com/design/human-interface-guidelines/motion>
- Nielsen Norman Group, "Animation for Attention and Comprehension" — <https://www.nngroup.com/articles/animation-usability/>
- IBM Carbon Design System, Motion guidelines — <https://carbondesignsystem.com/guidelines/motion/overview/> </content>

</invoke>
