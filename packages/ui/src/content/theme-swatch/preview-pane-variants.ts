import { tv } from "#lib";

// A pane in a picture of the app's shell or palette. It keeps the card's edge and fill under its own fill, so a fill that
// names no edge (the page ground, the accent) still draws the card's.
export const themePreviewPaneVariants = tv({
  base: "border border-tone-edge bg-card text-card-foreground",
  variants: {
    // The shell surface the pane stands for.
    fill: {
      background: "bg-background",
      accent: "bg-accent text-accent-foreground",
      // The rail's own fill and edge.
      sidebar: "border-sidebar-border bg-sidebar text-sidebar-foreground",
      // The card fill with the rail's edge: a pane in a preview of the shell.
      sidebarEdge: "border-sidebar-border",
      // The reading plate: the fill and ink a line takes over a wallpaper or art.
      translucent: "bg-reading-plate text-reading-plate-foreground",
    },
    // `island` is grouped content, whose inset and radius `tiers.css` resolves from the surface's tier. `row` is one
    // mini row drawn as its own box, and `inset` a sub-control mark.
    shape: { island: "rounded-base p-block", row: "rounded-control p-block", inset: "rounded-inset p-block" },
    padding: { tier: "", none: "p-0" },
    // The pane floats on the shell's own overlay shadow.
    lifted: { true: "shadow-overlay", false: "" },
  },
  defaultVariants: { shape: "island", padding: "tier", lifted: false },
});
