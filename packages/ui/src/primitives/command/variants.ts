import { tv } from "#lib";

/**
 * Slot classes for the command seal (ui-package-design §9 command chunk). `root` is a
 * self-contained popover-skinned panel (Command has no Positioner of its own — it is dropped
 * inside whatever surface the caller supplies, e.g. `<Dialog>`/`<Popover>` for an omni-bar, or
 * rendered inline). Items reuse the Menu item shape but target cmdk's `data-selected`/
 * `data-disabled` STRING attributes (`"true"`/`"false"`, always present) via the
 * `data-[attr=true]` arbitrary-value form — cmdk does not use Base UI's boolean-presence
 * `data-highlighted` convention.
 */
export const commandVariants = tv({
  slots: {
    root: "flex flex-col overflow-hidden rounded-card border border-border bg-popover text-popover-foreground",
    inputWrapper: "flex h-control-sm items-center gap-row border-b border-border px-row",
    input:
      "h-full w-full min-w-0 flex-1 bg-transparent text-body leading-body text-foreground outline-none placeholder:text-muted-foreground",
    list: "flex flex-col gap-field overflow-y-auto p-field",
    empty: "px-row py-block text-center text-body leading-body text-muted-foreground",
    group: "flex flex-col",
    groupHeading: "px-row py-field text-label leading-label text-muted-foreground",
    item: "flex min-h-control-sm cursor-default items-center gap-row rounded-control px-row text-body leading-body outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
    separator: "my-field border-t border-border",
    loading:
      "flex items-center justify-center py-block text-body leading-body text-muted-foreground",
    // The SR live region (mirrors autocomplete's `status` slot) — visually collapsed, must stay
    // mounted (only its text changes) so a screen reader keeps hearing count updates.
    status: "sr-only",
  },
});
