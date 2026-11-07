import type { ClassValue } from "tailwind-variants";
import { TOUCH_TARGET_PSEUDO_STRETCH, tv } from "#lib";
import type { BUTTON_BOX_STEPS } from "../button/box-hit-area.ts";

// A datum or a line of prose that is also the click target (a tracker value, a beat line, a roster name): no control
// box, text-height, start-aligned and at the regular weight, so it reads as the text it stands in for and a
// click-to-edit swap is pixel-stable. It sets no padding: the call site is the only place that knows what the datum
// sits in. The box is ~18px tall, so it carries the touch-target hit area on a layout-neutral `::before` stretched to
// its own width (`::after` is the CTA ring's).
function inlineBox(typeStep: string): string[] {
  return ["relative block-auto min-block-0 justify-start font-normal", typeStep, TOUCH_TARGET_PSEUDO_STRETCH];
}

export const inlineActionVariants = tv({
  variants: {
    // The type step of the run it sits in: a label line, or a recovery action inside body prose.
    step: {
      label: inlineBox("text-label leading-label"),
      body: inlineBox("text-body leading-body"),
    } satisfies Record<(typeof BUTTON_BOX_STEPS.inlineAction)[number], ClassValue>,
  },
});
