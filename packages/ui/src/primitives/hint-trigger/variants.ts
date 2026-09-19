import { tv } from "#lib";

// The hint-trigger skin — an info-icon ghost button that opens a Tooltip (§16, 2026-08-09 report card).
// Fine pointers keep Field's dense inline icon box. At a coarse pointer the BUTTON ITSELF owns the
// touch-target square: the prior layout-neutral Button pseudo measured 44px but left a 12px DOM box,
// which made adjacent targets impossible to prove non-overlapping. The coarse box spends the vertical
// room a finger needs while the fine row remains byte-identical.
export const hintTriggerVariants = tv({
  slots: {
    trigger: "shrink-0 pointer-coarse:size-touch-target",
    // The hint's at-rest DESCRIPTION (#2443): `aria-describedby` on the trigger pointed only at the
    // tooltip popup, which is unmounted while closed, so the description resolved to nothing until a
    // hover opened it. `sr-only` is `position:absolute`, so this copy is out of flow — it is not a flex
    // item in the label/heading row and costs it no gap.
    description: "sr-only",
  },
});
