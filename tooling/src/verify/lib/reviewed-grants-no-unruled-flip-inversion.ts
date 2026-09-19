// Reviewed grants: no-unruled-flip-inversion (#1089).
// Split from reviewed-grants.ts — see that file for the central home comment.
//
// ONE row, and it is the RULING's second member made exact. `motion-and-animation-guide.md` §1.5 admits two
// sites as the whole FLIP-inversion exception class; only one of them writes a transform at all (the shell's
// push is CSS-owned and needs no permission), so the grant table carries one row and central liveness
// reports it stale the day `glideIndicator` stops taking this shape. Amending §1.5's list and this table is
// ONE edit, never two halves.
import type { ReviewedGateGrant } from "../contract/gate-authority.ts";

export const REVIEWED_GRANTS_NO_UNRULED_FLIP_INVERSION: readonly ReviewedGateGrant[] = [
  {
    id: "no-unruled-flip-inversion:tabs-glide-indicator",
    policyId: "no-unruled-flip-inversion",
    subject: "packages/ui/src/primitives/tabs/tabs.tsx",
    operation: "flip-inversion",
    why: "`glideIndicator` is the SECOND of the two sites motion-and-animation-guide.md §1.5 admits as the whole exception class (owner amendment 2026-09-02, #1069): the delta is the difference between two runtime boxes, so no CSS value expresses it — JS writes the inverse transform, flushes it with a forced read, and hands the interpolation back to the slot's own `transition-[transform]`.",
    endsWhen:
      "the tabs indicator stops inverting in JS (a CSS-expressible distance, the shell's data-attribute shape) or the site moves — central liveness then reports this row stale, which is the tripwire §1.5's prose list could not give.",
  },
];
