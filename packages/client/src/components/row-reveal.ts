// The config setting row's reveal. The shared row reveal is `HOVER_REVEAL.hover` in `@orb/ui/lib`.

/** The CONFIG SETTING ROW's reveal (#866 §3.4 row chrome) — `HOVER_REVEAL.hover`'s NAMED-GROUP cousin,
 *  keyed on `group/setting` because a settings row nests inside containers that may themselves carry the
 *  bare `group` class: the bare-`group` variant matches ANY ancestor's hover, so one hovered wrapper
 *  would reveal every row's menu at once. Same opacity-only law (a display/visibility swap under a hover
 *  key is a hit-test oscillator), same reserved box (zero layout shift is the owner's bar — the slot is
 *  permanently in flow, only its paint fades). `has-[[data-popup-open]]` pins the reveal while the menu
 *  it wraps is OPEN, so the trigger cannot fade out from under its own popup when the pointer leaves.
 *  NO coarse arm here — the config row's coarse posture is `HIDE_AT_COARSE` (pointer-variants.ts) composed by the
 *  consumer (the rider: touch reaches Reset through the teacher's About door, never a rest-invisible
 *  control), which is `display`-based and legal because a media state cannot oscillate. */
export const SETTING_ROW_REVEAL =
  "opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-hover/setting:opacity-100 group-focus-within/setting:opacity-100 has-[[data-popup-open]]:opacity-100";
