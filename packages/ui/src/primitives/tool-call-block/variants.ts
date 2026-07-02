import { tv } from "tailwind-variants";

/**
 * The tool-call-block skin (work order item 14 / D48) — a card-surface `<details>` disclosure.
 * `pre` is the plain monospace document box for arguments/result (no CodeMirror — that seal is for
 * editable code, not a read-only echo of a JSON document).
 */
export const toolCallBlockVariants = tv({
  slots: {
    root: "rounded-card border border-border bg-card text-card-foreground",
    summary:
      "flex cursor-pointer list-outside items-center gap-row px-block py-row text-body font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    name: "font-mono text-code",
    status: "contents",
    duration: "ml-auto text-label leading-label text-muted-foreground",
    body: "flex flex-col gap-block border-t border-border p-block",
    section: "flex flex-col gap-field",
    sectionLabel: "text-label leading-label font-medium text-muted-foreground",
    pre: "overflow-x-auto whitespace-pre-wrap rounded-control bg-muted p-block font-mono text-code text-foreground",
  },
});
