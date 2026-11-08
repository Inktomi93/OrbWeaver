import { CAPTION, FIELD_STACK, FOCUS_RING_WITHIN_INSET, MAX_HEIGHT, ROW_STRIP, tv } from "#lib";

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
    // In a short dialog the command box is a flex child that shares the room the dialog leaves; `overflow-hidden` lets it shrink below its list,
    // down to its search strip, and the dialog scrolls past that.
    root: `
      flex flex-col overflow-hidden rounded-card border border-border bg-popover text-popover-foreground tone-host-popover
      dialog-short:flex-auto dialog-short:min-block-(--height-command-strip)
      ${FOCUS_RING_WITHIN_INSET}
    `,
    // The coarse-pointer arm is the 44px tap floor (side-eye: the picker's input measured 43px on a
    // phone). `control-sm` already varies by pointer (2.75rem coarse / 2rem fine, theme.css) but only
    // via the `pointer: fine` media query, not Tailwind's `pointer-coarse:` variant — spelling the
    // floor here keeps the tap target explicit rather than relying on that CSS-var-only coincidence.
    inputWrapper: `${ROW_STRIP} border-be border-border px-row block-(--size-control-sm) pointer-coarse:block-(--size-touch-target)`,
    input: `
      flex-1 bg-transparent text-body leading-body text-foreground outline-none block-full inline-full min-inline-0
      placeholder:text-muted-foreground
      pointer-coarse:block-(--size-touch-target)
    `,
    list: `relative ${FIELD_STACK} overflow-y-auto overscroll-contain p-field`,
    // Fill a bounded list's content box so a miss reads as an intentional empty surface, not one line
    // stranded above a giant dead cavity. In an auto-sized list, percentage height resolves to auto.
    empty: "flex items-center justify-center px-row text-center text-body leading-body text-muted-foreground block-full",
    group: "flex flex-col",
    groupHeading: `px-row py-field ${CAPTION}`,
    item: `
      flex cursor-default items-center gap-row rounded-control px-row text-body leading-body orb-skip-offscreen outline-none select-none
      min-block-(--size-control-sm)
      data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-disabled
      data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground
    `,
    separator: "my-field border-bs border-border",
    // A COLUMN, so its child STRETCHES: cmdk wraps the children in an unstyled aria-hidden div, and in a
    // centered row that div shrinks to its content — skeleton bars sized `w-full` then measure 0px wide.
    loading: "flex flex-col justify-center py-block text-center text-body leading-body text-muted-foreground",
    // The SR live region (mirrors autocomplete's `status` slot) — visually collapsed, must stay
    // mounted (only its text changes) so a screen reader keeps hearing count updates.
    status: "sr-only",
  },
  variants: {
    // A palette that floats on its own (not inside a dialog that already lifts it) casts the overlay shadow.
    elevated: { true: { root: "shadow-overlay" } },
    // The palette takes its parent's whole block extent; in a short dialog it takes the room the dialog leaves, so its list is the box that scrolls.
    fill: { true: { root: "block-full dialog-short:block-auto" } },
    // The box is a picker window's frame and never outgrows it, so a footer inside takes room from the list; a short dialog lets it shrink with the dialog
    // instead, down to its search strip and one touch row.
    windowed: { true: { root: "max-block-(--height-picker-box) dialog-short:max-block-none dialog-short:min-block-(--height-picker-floor)" } },
    listSize: {
      content: { list: "" },
      // A stable compact viewport keeps filtering from moving its containing dialog without reserving
      // the giant empty cavity the old full-height palette left behind.
      // A short dialog lets it share the room the dialog leaves, like a picker window, so the dialog body is the only other box. It drops
      // its inset so the box's strip floor holds the whole box: an inset the list cannot shrink past would overflow the box and let a
      // highlighted row scroll the search field away.
      compact: {
        list: `
          block-(--height-scroll-sm)
          dialog-short:mx-(--border-width-rule) dialog-short:mbe-(--border-width-rule) dialog-short:flex-auto dialog-short:overscroll-auto dialog-short:p-0
          dialog-short:block-auto
          **:[[cmdk-list-sizer]]:block-full
        `,
      },
      // The model picker's list: tall enough to fill its box, still a fixed viewport so a narrowing search holds still.
      grow: { list: "block-(--height-scroll-lg) **:[[cmdk-list-sizer]]:block-full" },
      // A picker's window inside a dialog: it caps at the window step. A short dialog is one box with one scroller, so the
      // window stops guessing at the chrome around it: the command box and its list take what the dialog leaves, down to
      // one touch row, and the list drops the inset, the headings and the scroll chain so the rows keep the room.
      pickerWindow: {
        list: `
          max-block-(--height-picker-window)
          dialog-short:mx-(--border-width-rule) dialog-short:mbe-(--border-width-rule) dialog-short:flex-auto dialog-short:overflow-x-hidden
          dialog-short:overscroll-auto dialog-short:p-0 dialog-short:max-block-none dialog-short:min-block-(--height-scroll-short)
          dialog-short:**:[[cmdk-group-heading]]:hidden
        `,
      },
    },
  },
  defaultVariants: { listSize: "content" },
});

export const commandListBoxVariants = tv({
  variants: {
    maxHeight: MAX_HEIGHT,
  },
});
