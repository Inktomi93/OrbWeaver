import { tv } from "tailwind-variants";

// The labeled-form-row skin — slots for the multi-part composition (ui-package-design §5).
export const fieldVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field",
    label: "text-label font-medium leading-label text-foreground data-disabled:opacity-50",
    description: "text-label leading-label text-muted-foreground",
    error: "text-label leading-label text-destructive",
  },
});
