import { tv } from "tailwind-variants";

// The grouped-controls skin — a reset <fieldset> (native border/padding/margin stripped) with a
// Legend styled like the field label (ui-package-design §5).
export const fieldsetVariants = tv({
  slots: {
    root: "m-0 flex w-full min-w-0 flex-col gap-field border-0 p-0",
    legend: "text-label font-medium leading-label text-foreground data-disabled:opacity-50",
  },
});
