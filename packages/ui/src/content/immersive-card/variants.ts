import { tv } from "#lib";

/**
 * The immersive-card chrome skin (parity-plus §4.7) — a card-surface frame around the sandboxed render:
 * a header band (title + view-raw + expand + collapse) over the SandboxFrame / raw-source `pre`, the body
 * riding the Collapsible panel so the collapsed state is the bare title bar. The `pre` is the
 * plain monospace read-only echo (the tool-call-block precedent — no CodeMirror for a non-editable view).
 */
export const immersiveCardVariants = tv({
  slots: {
    root: "flex w-full flex-col overflow-hidden rounded-card border border-border bg-card text-card-foreground",
    header: "flex items-center gap-row border-b border-border ps-block pe-row py-row",
    title: "min-w-0 flex-1 truncate text-label leading-label font-medium text-muted-foreground",
    origin: "text-label leading-label text-muted-foreground",
    pre: "m-0 w-full overflow-auto whitespace-pre-wrap bg-muted p-block font-mono text-code text-foreground",
    lightboxHeader: "flex items-center gap-row",
    lightboxTitle: "min-w-0 flex-1 truncate",
    lightboxBody: "flex min-h-0 flex-1 flex-col",
  },
});
