import { tv } from "tailwind-variants";

// The autocomplete skin — the input reuses the text-input token skin; the popup rides bg-popover +
// z-(--z-overlay) (the stacking contract), items meet the touch floor and highlight on bg-accent.
// --available-height/--anchor-width are Base UI Positioner-provided vars, not raw values.
export const autocomplete = tv({
  slots: {
    input: [
      "h-control-sm w-full min-w-0 rounded-control border border-border bg-input px-block text-body leading-body text-foreground",
      "placeholder:text-muted-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:pointer-events-none disabled:opacity-50",
    ],
    positioner: "z-(--z-overlay) outline-none",
    popup: [
      "z-(--z-overlay) max-h-(--available-height) w-(--anchor-width) overflow-y-auto rounded-card border border-border bg-popover p-field text-popover-foreground",
    ],
    list: "flex flex-col gap-field",
    item: [
      "flex min-h-touch-target cursor-pointer select-none items-center rounded-control px-block py-field text-body leading-body text-foreground outline-none",
      "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    empty: "px-block py-field text-body leading-body text-muted-foreground",
  },
});
