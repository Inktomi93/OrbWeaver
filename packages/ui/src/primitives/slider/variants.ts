import { tv } from "tailwind-variants";

// The slider skin. The control row is h-control-sm so the drag surface meets the ≥44px touch
// floor (§4b axis 3); the visible track stays h-field. Base UI positions Indicator/Thumb inline.
export const slider = tv({
  slots: {
    root: "w-full data-disabled:pointer-events-none data-disabled:opacity-50",
    control: "flex h-control-sm w-full touch-none select-none items-center",
    track: "relative h-field w-full grow overflow-hidden rounded-full bg-input",
    indicator: "rounded-full bg-primary",
    thumb: [
      "size-section rounded-full border border-border bg-foreground",
      "transition-shadow duration-(--motion-fast) ease-out-expo",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    ],
  },
});
