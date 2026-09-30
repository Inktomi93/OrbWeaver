// The selected state of a two-state control (a pressed Toggle, an included filter chip): the opaque
// `selection-quiet` pair and no ring, so keyboard focus owns the only ember ring. Two literals because a
// Toggle keys on `data-pressed` and Button's `selection` axis is a static arm; Tailwind never assembles names.

/**
 * The selected fill for a `data-pressed` carrier (Toggle).
 *
 * @remarks An ember inset ring beside the ember focus ring made a selected control read as focused. A plain
 * `bg-accent` fill sits too close to a group's `bg-muted` to carry the state alone; `selection-quiet` is
 * opaque, clears 3:1 against every chrome ground, and its ink clears 4.5:1 on it in every seed.
 */
export const SELECTED_FILL_PRESSED = "data-pressed:bg-selection-quiet data-pressed:text-selection-quiet-foreground";

/** {@link SELECTED_FILL_PRESSED} as a static variant arm (Button's `selection` arms). Keep the two in step.
 *
 * @remarks It restates the pair under `hover:` because the resting intent's hover fill is a pseudo-class rule and would
 * otherwise outrank a static class, so a hovered chip would read as not selected. */
export const SELECTED_FILL = "bg-selection-quiet text-selection-quiet-foreground hover:bg-selection-quiet hover:text-selection-quiet-foreground";
