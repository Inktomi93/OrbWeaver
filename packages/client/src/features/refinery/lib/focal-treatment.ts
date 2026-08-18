// The WORKBENCH's ONE focal treatment (CD3), as data — the speaker stripe and the rationed accent glow.
//
// WHY IT LEFT `rewrite-lane.tsx` (#158 item 5, 2026-08-17). The treatment was declared inside the rewrite
// island because the island WAS the focal, permanently. The owner's screenshot showed the cost of that:
// at round 0 the one emphasised box on the canvas was 2 · REWRITE, whose own body reads "nothing settled
// for rewrite yet", while 1 · SCORE — the step the pipeline's own teaching sends you to — sat in a plain
// rail. CD3 is "one focal, and it points where the user should go", so the focal has to be able to MOVE,
// and a treatment two lanes can wear is a treatment neither may declare privately. `workbench-lanes.ts`
// decides which lane wears it; this module is what they wear.
//
// THE CARRIERS ARE UNCHANGED, and both are load-bearing choices rather than styling:
//   • the STRIPE is the same three declarations the immersive chat rows and home's hearth paint
//     (`message-row-variants`' `STRIPE_LEFT`), inline because a border WIDTH from a non-spacing token has
//     no utility;
//   • the GLOW rides a `::before` layer, not the element's own box-shadow, because
//     `design-audit-checks.ts` classifies a chromatic glow on an element's OWN shadow as the generated-UI
//     tell — the pseudo-element is the sanctioned carrier, and at `-inset-px` it never sits behind reading
//     text. Every colour is a per-theme token: `--color-speaker` resolves differently under each built-in
//     theme and to the scope's own primary under an imported one.
//   • the RADIUS is the TIER'S (`--radius-base` from `tiers.css`), not `--radius-card`: the workbench is
//     an INSTRUMENT surface and this island does not float (D6). A halo drawn at a radius its host does
//     not have is a visible double edge.

import type { CSSProperties } from "react";

/** The focal lane's speaker stripe. */
export const FOCAL_STRIPE: CSSProperties = {
  borderInlineStartWidth: "var(--immersive-stripe-width)",
  borderInlineStartStyle: "solid",
  borderInlineStartColor: "var(--color-speaker)",
};

/** The focal lane's rationed accent glow, on the sanctioned `::before` carrier at the instrument radius. */
export const FOCAL_GLOW =
  "relative isolate before:pointer-events-none before:absolute before:-inset-px before:-z-10 before:rounded-(--radius-base) before:opacity-40 before:shadow-glow before:content-['']";
