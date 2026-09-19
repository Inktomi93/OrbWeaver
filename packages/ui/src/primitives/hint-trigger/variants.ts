import { tv } from "#lib";

// The hint-trigger skin — an info-icon ghost button that opens a Tooltip (§16, 2026-08-09 report card).
// Fine pointers keep Field's dense inline icon box. At a coarse pointer the BUTTON ITSELF owns the
// touch-target square: the prior layout-neutral Button pseudo measured 44px but left a 12px DOM box,
// which made adjacent targets impossible to prove non-overlapping. The coarse box spends the vertical
// room a finger needs while the fine row remains byte-identical.
export const hintTriggerVariants = tv({
  slots: {
    // The at-rest DESCRIPTION slot #2443 minted here moved to the TOOLTIP SEAL in #2455 — one node per
    // `<Tooltip>` in the whole app rather than one per hint trigger.
    trigger: "shrink-0 pointer-coarse:size-touch-target",
  },
});
