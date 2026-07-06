import { tv } from "#lib";

// The status-chip skin — a layout wrapper around a composed Badge/Spinner/Button (contract §6.1
// item 7). Badge/Spinner already own their own token-color skins; this variant only sizes the
// summary/timestamp text to match the badge's own size scale (sm = text-label, md = text-body).
export const statusChipVariants = tv({
  slots: {
    root: "inline-flex flex-wrap items-center gap-field",
    summary: "text-muted-foreground",
    timestamp: "text-muted-foreground",
  },
  variants: {
    size: {
      sm: { summary: "text-label leading-label", timestamp: "text-label leading-label" },
      md: { summary: "text-body leading-body", timestamp: "text-body leading-body" },
    },
  },
  defaultVariants: { size: "sm" },
});
