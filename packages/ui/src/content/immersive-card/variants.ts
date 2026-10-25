import { tv } from "#lib";

/**
 * The immersive-card chrome skin — a card-surface frame around the sandboxed render:
 * a header band (title + view-raw + expand + collapse) over the SandboxFrame / raw-source `pre`, the body
 * riding the Collapsible panel so the collapsed state is the bare title bar. The `pre` is the
 * plain monospace read-only echo (the tool-call-block precedent — no CodeMirror for a non-editable view).
 */
export const immersiveCardVariants = tv({
  slots: {
    root: "flex flex-col overflow-hidden rounded-card border border-border bg-card text-card-foreground inline-full",
    header: "flex items-center gap-row border-be border-border py-row ps-block pe-row",
    title: "flex-1 truncate text-label leading-label font-medium text-muted-foreground min-inline-0",
    origin: "text-label leading-label text-muted-foreground",
    pre: `
      relative m-0 overflow-auto overscroll-contain bg-muted p-block font-mono text-code leading-label-relaxed whitespace-pre-wrap text-foreground inline-full
    `,
    lightboxHeader: "flex items-center gap-row",
    lightboxTitle: "flex-1 truncate min-inline-0",
    lightboxBody: "flex flex-1 flex-col min-block-0",
  },
});

/**
 * The INERT-card skin — the Tier-A presentation of an `html-card` block (D44 §12.2: Tier A is the inert
 * sanitized allowlist, and it forbids `<style>`, so a card's own CSS cannot apply there).
 *
 * Deliberately the SAME frame as {@link immersiveCardVariants} (rounded-card / border / bg-card / header
 * band) so a downgraded card still reads as a CARD rather than as loose prose that wandered into the
 * message. The whole defect this exists for is that the Tier-A path rendered bare unstyled HTML with no
 * indication a card was ever involved — the content did not vanish, its IDENTITY did, which is
 * indistinguishable from the model having written nothing.
 */
export const inertCardVariants = tv({
  slots: {
    root: "flex flex-col overflow-hidden rounded-card border border-dashed border-border bg-card text-card-foreground inline-full",
    header: "flex items-center gap-row border-be border-dashed border-border py-row ps-block pe-row",
    title: "flex-1 truncate text-label leading-label font-medium text-muted-foreground min-inline-0",
    body: "p-block",
    hint: "border-bs border-dashed border-border px-block py-row text-label leading-label text-muted-foreground",
  },
});
