// The web-weave art skins (tokens-only, §5). Two tv() configs — this dir is art-tier, not a
// primitives/ trio, so the one-tv-per-dir clause doesn't apply; the {camelName}Variants naming is
// kept anyway (greppability).
import { tv } from "#lib";

// The web is DECORATION (aria-hidden, pointer-transparent) that fills whatever box hosts it — the
// container decides the size (the §0 container model), never the art.
//
// `interactive` takes pointer events (the silk plucks under the cursor and the weaver comes to look).
// It does NOT un-hide the art from assistive tech: there is nothing to
// announce, no state to read and no keyboard path to the effect, so exposing a nameless canvas would
// promise an affordance that does not exist. Ornament that answers a cursor is still ornament.
export const webWeaveVariants = tv({
  slots: {
    root: "relative size-full overflow-hidden",
    // The ambient accent glow centered on the hub — the gradient itself lives in globals.css
    // (`.orb-weave-glow`) because a radial-gradient over color-mix'd tokens has no utility spelling.
    glow: "orb-weave-glow absolute inset-0",
    canvas: "absolute inset-0 size-full",
  },
  variants: {
    interactive: {
      false: { root: "pointer-events-none" },
      true: { root: "pointer-events-auto" },
    },
  },
  defaultVariants: { interactive: false },
});

// The boot/blocking veil: a fixed full-viewport layer above the app (--z-modal — it outranks the
// shell while boot is unresolved). ONE layer owns the whole dissolve (§9.4 tweak 1): opacity+filter
// transition, entered/ending driven by the component's own data attributes (the Base UI
// starting/ending idiom, hand-stamped since this is not a Base UI surface).
export const weaveVeilVariants = tv({
  slots: {
    // ONE state class drives BOTH directions (interruptible — a transition retargets mid-flight,
    // guide §3.2): base = soft-blurred + transparent; `data-entered` = sharp + opaque. Enter plays
    // base→entered; the exit simply removes `data-entered` and rides the same transition back.
    // (`data-ending` is stamped for introspection/CTs only — no style keys off it, so stylesheet
    // rule order can never fight the entered rules.)
    root: [
      "fixed inset-0 z-(--z-modal) bg-background text-foreground",
      "opacity-0 blur-(--blur-strength)",
      "transition-[opacity,filter] duration-(--motion-layout) ease-out-expo",
      "data-entered:opacity-100 data-entered:blur-none",
    ],
    content: "relative size-full",
  },
});
