import { tv } from "#lib";

// The grouped-controls skin — a reset <fieldset> (native border/padding/margin stripped) with a
// Legend styled like the field label (ui-package-design §5).
export const fieldsetVariants = tv({
  slots: {
    root: "m-0 flex flex-col gap-field border-0 p-0 inline-full min-inline-0",
    legend: "text-label leading-label font-medium text-foreground data-disabled:opacity-50",
  },
});
