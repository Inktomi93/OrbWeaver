import { tv } from "tailwind-variants";

// The dropzone skin. The native `<input type="file">` is the topmost element (absolutely
// positioned, opacity-0, covering the full box) so every click/keyboard/drop interaction lands on
// a REAL form control; `content` is the decorative icon/copy stack underneath (pointer-events-none
// — it never intercepts anything, the input already covers 100% of the box). The focus ring rides
// `has-[:focus-visible]` on the ROOT so it wraps the whole dashed box (not just the padded
// content), since the input itself is invisible and can't carry a visible ring.
export const fileDropzoneVariants = tv({
  slots: {
    root: [
      "relative flex flex-col items-center justify-center gap-field rounded-card border-2 border-dashed border-border bg-input/30 p-section text-center",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      "data-drag-over:border-primary data-drag-over:bg-accent/15",
    ],
    input: "absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed",
    content: "pointer-events-none flex flex-col items-center gap-field",
    icon: "text-muted-foreground",
    instructions: "text-body leading-body text-foreground",
    hint: "text-label leading-label text-muted-foreground",
    error: "flex items-center gap-field text-label leading-label text-destructive",
  },
});
