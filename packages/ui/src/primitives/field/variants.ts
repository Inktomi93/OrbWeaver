import { tv } from "#lib";

export const fieldVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field",
    label: "text-label font-medium leading-label text-foreground data-disabled:opacity-50",
    // The label + hint-icon pairing (§ hint prop) — inline-flex so the trigger sits on the label's
    // baseline instead of dropping to its own line.
    labelRow: "inline-flex items-center gap-field",
    hintTrigger: "text-muted-foreground hover:text-foreground",
    description: "text-label leading-label text-muted-foreground",
    error: "text-label leading-label text-destructive",
  },
});
