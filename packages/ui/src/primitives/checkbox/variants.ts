import { tv } from "tailwind-variants";

// The checkbox skin — bg-input/border-border at rest; checked and indeterminate both flip to the
// primary token with a glyph. The ::before pseudo lifts the hit area to the full touch-target
// square so the ≥44px floor holds without a giant visible box (§4b axis 3).
export const checkboxVariants = tv({
  slots: {
    root: [
      "relative inline-flex size-section shrink-0 cursor-pointer items-center justify-center rounded-control border border-border bg-input text-primary-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      "before:absolute before:top-1/2 before:left-1/2 before:size-touch-target before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
    ],
    indicator: "group flex items-center justify-center",
    check: "hidden text-current group-data-[checked]:block",
    dash: "hidden text-current group-data-[indeterminate]:block",
  },
});
