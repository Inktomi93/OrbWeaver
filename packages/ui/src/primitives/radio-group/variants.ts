import { tv } from "tailwind-variants";

// The radio-group skin — a vertical stack of labeled options (rpg-design/11 §16, "who runs the
// game"). Each item is a circle: bg-input/border-border at rest, primary fill + a light dot when
// selected; the ::before pseudo lifts the hit area to the touch floor (§4b axis 3).
export const radioGroupVariants = tv({
  slots: {
    root: "flex flex-col gap-row",
    label: "inline-flex cursor-pointer items-center gap-row text-body leading-body text-foreground",
    item: [
      "relative inline-flex size-section shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-input",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "data-checked:border-primary data-checked:bg-primary",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      "before:absolute before:top-1/2 before:left-1/2 before:size-touch-target before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
    ],
    indicator: "size-field rounded-full bg-primary-foreground",
  },
});
