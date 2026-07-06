import { tv } from "#lib";

export const fieldVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field",
    label: "text-label font-medium leading-label text-foreground data-disabled:opacity-50",
    description: "text-label leading-label text-muted-foreground",
    error: "text-label leading-label text-destructive",
  },
});
