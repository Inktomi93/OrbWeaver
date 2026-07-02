import { tv } from "tailwind-variants";

// The tabs skin — segmented list on bg-muted; the active tab lifts to bg-background. Tabs ride
// h-control-sm (the ≥44px touch floor, §4b axis 3).
export const tabs = tv({
  slots: {
    root: "flex w-full flex-col gap-block",
    list: "inline-flex w-fit items-center gap-field rounded-control bg-muted p-field",
    tab: [
      "inline-flex h-control-sm cursor-pointer select-none items-center justify-center gap-field whitespace-nowrap rounded-control px-block text-label font-medium leading-label text-muted-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo hover:text-foreground",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "data-active:bg-background data-active:text-foreground",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    panel: "w-full text-body leading-body text-foreground",
  },
});
