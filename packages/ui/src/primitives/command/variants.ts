import { FOCUS_RING_WITHIN_INSET, tv } from "#lib";

/**
 * Slot classes for the command seal (ui-package-design §9 command chunk). `root` is a
 * self-contained popover-skinned panel (Command has no Positioner of its own — it is dropped
 * inside whatever surface the caller supplies, e.g. `<Dialog>`/`<Popover>` for an omni-bar, or
 * rendered inline). Items reuse the Menu item shape but target cmdk's `data-selected`/
 * `data-disabled` STRING attributes (`"true"`/`"false"`, always present) via the
 * `data-[attr=true]` arbitrary-value form — cmdk does not use Base UI's boolean-presence
 * `data-highlighted` convention.
 *
 * ── THE ROOT CARRIES THE FOCUS RING (side-eye 2026-08-19, refinery P2) ───────────────────────────────
 * The search box had ZERO rest→focus delta: cmdk's input is `bg-transparent outline-none` inside a
 * wrapper whose only mark is a bottom hairline, so on all six picker consumers (+ ⌘K) a keyboard user
 * could not see where the caret was. The ring goes on the ROOT under `:focus-within` rather than on the
 * input, because the input is where focus LIVES for the whole widget — cmdk's rows never take DOM focus
 * (they rove by `data-selected`), so "focus is inside this panel" and "the box is focused" are the same
 * state. `FOCUS_RING_WITHIN_INSET`, not the offset `_WITHIN`: see that constant's own note — this panel
 * is dropped into a Popover, a Dialog and a plain Card, and no single offset tone is right for all three.
 *
 * ── THE ROWS ARE RENDER-SKIPPED OFF-SCREEN (`orb-skip-offscreen`) ────────────────────────────────────
 * The character picker mounts the whole walked page (101 options / 503 nodes at the measured mount), and
 * the door's INP was 216ms. It cannot be VIRTUALIZED: cmdk resolves every keyboard move, its filter sort
 * and Enter through `querySelectorAll('[cmdk-item=""]')` over the MOUNTED rows (cmdk 1.1.1's dist,
 * `V()`/`Q()`/`z()`), and it re-`appendChild`s items to sort them — so unmounting the off-screen rows
 * would break arrow-roving and fight a virtualizer's positioning at the same time. `content-visibility`
 * skips their LAYOUT AND PAINT while every row stays in the DOM and in the a11y tree, which is where the
 * cost is and which leaves all three of those mechanisms untouched.
 */
export const commandVariants = tv({
  slots: {
    root: `flex flex-col overflow-hidden rounded-card border border-border bg-popover text-popover-foreground ${FOCUS_RING_WITHIN_INSET}`,
    // The coarse-pointer arm is the 44px tap floor (side-eye: the picker's input measured 43px on a
    // phone). `control-sm` already varies by pointer (2.75rem coarse / 2rem fine, theme.css) but only
    // via the `pointer: fine` media query, not Tailwind's `pointer-coarse:` variant — spelling the
    // floor here keeps the tap target explicit rather than relying on that CSS-var-only coincidence.
    inputWrapper: "flex h-control-sm items-center gap-row border-b border-border px-row pointer-coarse:h-touch-target",
    input:
      "h-full w-full min-w-0 flex-1 bg-transparent text-body leading-body text-foreground outline-none placeholder:text-muted-foreground pointer-coarse:h-touch-target",
    list: "relative flex flex-col gap-field overflow-y-auto overscroll-contain p-field",
    // Fill a bounded list's content box so a miss reads as an intentional empty surface, not one line
    // stranded above a giant dead cavity. In an auto-sized list, percentage height resolves to auto.
    empty: "flex h-full items-center justify-center px-row text-center text-body leading-body text-muted-foreground",
    group: "flex flex-col",
    groupHeading: "px-row py-field text-label leading-label text-muted-foreground",
    item: "orb-skip-offscreen flex min-h-control-sm cursor-default items-center gap-row rounded-control px-row text-body leading-body outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
    separator: "my-field border-t border-border",
    // A COLUMN, so its child STRETCHES: cmdk wraps the children in an unstyled aria-hidden div, and in a
    // centered row that div shrinks to its content — skeleton bars sized `w-full` then measure 0px wide.
    loading: "flex flex-col justify-center py-block text-center text-body leading-body text-muted-foreground",
    // The SR live region (mirrors autocomplete's `status` slot) — visually collapsed, must stay
    // mounted (only its text changes) so a screen reader keeps hearing count updates.
    status: "sr-only",
  },
  variants: {
    listSize: {
      content: { list: "" },
      // A stable compact viewport keeps filtering from moving its containing dialog without reserving
      // the giant empty cavity the old full-height palette left behind.
      compact: { list: "h-48 [&_[cmdk-list-sizer]]:h-full" },
      // Sized to its rows up to the compact step: a three-model list is three rows tall, not a 192px box.
      capped: { list: "max-h-48" },
    },
  },
  defaultVariants: { listSize: "content" },
});
