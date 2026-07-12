import { FOCUS_RING, tv } from "#lib";

// The list-row skin — the slot-based entity row every list surface composes (library, presets,
// rules, plugins, databank docs, rosters — ui-package-design §12 Wave-3-C). `body` is the ONE
// clickable/selected/disabled surface (a `group` parent so title/subtitle can flip color off
// `data-selected`); `actions` is a plain sibling slot that never inherits those states — trailing
// actions stay visually inline without borrowing the row's a11y (the load-bearing "not nested
// interactive content" constraint lives in list-row.tsx, not here).
export const listRowVariants = tv({
  slots: {
    // `@container/list-row` establishes a NAMED container on the row so a consumer's `actions` can COLLAPSE
    // responsively to the ROW's own width (e.g. the character card folds its Star/Chat buttons into the ···
    // kebab via `@max-*/list-row` when the row is tight) — the overflow→kebab mechanism the redesign needs,
    // measured, not guessed. The name scopes the query so a nested container ancestor can't capture it.
    root: "@container/list-row flex w-full min-w-0 items-center gap-row",
    // The body drops `min-w-0` so it RESPECTS `content`'s min-width floor (below) — the title column can
    // never be starved to 0 by a wide `actions` slot (the reveal-cluster regression: opacity-0 content in
    // `actions` still claims its intrinsic width). The body is the flex-1 winner; `actions` must yield.
    body: [
      "group flex flex-1 items-center gap-row rounded-control outline-none",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "data-selected:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50",
    ],
    leading: "flex shrink-0 items-center justify-center text-muted-foreground",
    // `min-w-24` is the TITLE-COLUMN FLOOR (the load-bearing invariant): the name/subtitle never collapse
    // below a readable width, so `actions` yields (shrinks + clips) instead of starving them. It still
    // truncates — the floor only bounds how far the column shrinks, never the ellipsis.
    content: "flex min-w-24 flex-1 flex-col",
    // `block` is load-bearing now the title/subtitle are <span>s (phrasing content, valid inside the
    // native <button> body) rather than <p>s — truncate needs a block/inline-block box.
    title:
      "block truncate text-left text-body font-medium leading-body text-foreground group-data-[selected]:text-accent-foreground",
    subtitle:
      "block truncate text-left text-label leading-label text-muted-foreground group-data-[selected]:text-accent-foreground",
    // The hover/:focus-within metadata reveal — a display-SWAP of the subtitle in the SAME content-column
    // line (a wide metadata span must never contend with the trailing `actions` buttons for width). Hidden
    // at rest; on hover/focus the subtitle hides and this shows in its place (no layout shift, same line).
    // Mono (data accent, §13); truncates within the protected content column, so it stays legible.
    subtitleReveal:
      "hidden truncate text-left font-mono text-label leading-label text-muted-foreground group-focus-within:block group-hover:block group-data-[selected]:text-accent-foreground",
    // `actions` is `shrink-0`: its controls keep their INTRINSIC width and are NEVER squeezed below the
    // fine-pointer 32px tap-target floor (`--spacing-control-sm`, D62) — the side-eye P1 + owner-reported
    // bug the old `min-w-0 overflow-hidden` caused (3 revealed buttons clipped to 24–26px). The title never
    // reflows: the body's own `min-w-24` floor + `truncate` (above) absorb the squeeze, and the WIDE
    // hover-metadata that once forced `actions` to yield now rides the `subtitleReveal` slot in the CONTENT
    // column (never `actions`), so a wide trailing cluster can no longer starve the title — the exact
    // regression the old `overflow-hidden` guarded against is structurally gone. When even intrinsic actions
    // don't fit a narrow row, the CONSUMER collapses its secondary actions into a kebab via the row's
    // `@container/list-row` (`@max-*/list-row` classes) — a real measured fold, not a clip.
    actions: "flex shrink-0 items-center justify-end gap-field",
  },
  variants: {
    density: {
      default: { body: "min-h-control-md px-row py-field" },
      compact: { body: "min-h-control-sm px-field py-field" },
    },
    clickable: {
      true: {
        body: `cursor-pointer hover:bg-accent active:bg-accent/80 ${FOCUS_RING}`,
      },
      false: {},
    },
  },
  defaultVariants: { density: "default", clickable: false },
});
