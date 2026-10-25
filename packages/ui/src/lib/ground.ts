// The fills a band or a page ground takes, shared by the layout boxes and the parts that are bands (a sticky
// header, a tab panel). A ground draws no edge and no radius: a box with an edge is a Card (UI-Density-Law.md §4.3).
export const GROUND = {
  /** The page ground and its ink: a whole page, or a preview of one. */
  background: "bg-background text-foreground",
  /** The page ground on a plain room only; over a room's wallpaper the art is the page and the reading plates carry the text. */
  backgroundUnlessArt: "not-in-data-has-bg-image:bg-background",
  /** The card fill and its ink: a sticky band over a scrolling card body. */
  card: "bg-card text-card-foreground",
  /** A band laid over the card at low strength, so it reads as part of the page it labels. */
  faint: "bg-card/40",
  /** The popover fill: a footer pinned inside a floating surface. */
  popover: "bg-popover text-popover-foreground",
  /** The raised step: the rail that holds the current selection. */
  raised: "bg-surface-raised",
  /** The sidebar fill, for a panel that must hide the rail's art behind it. */
  sidebar: "bg-sidebar",
} as const;

// The plates a band takes over a room's wallpaper (`data-has-bg-image` on an ancestor). Every arm is inert on a
// plain background, so a band that may sit over art carries one unconditionally.
export const WALLPAPER_PLATE = {
  /** A chrome band (the character bar): the reading plate and its ink. */
  band: "in-data-[has-bg-image]:bg-reading-plate in-data-[has-bg-image]:backdrop-blur-sm in-data-[has-bg-image]:text-reading-plate-foreground",
  /** A footer under a reply: the band plate as a rounded island with its own inset. */
  chrome:
    "in-data-[has-bg-image]:bg-reading-plate in-data-[has-bg-image]:backdrop-blur-sm in-data-[has-bg-image]:rounded-card in-data-[has-bg-image]:px-field in-data-[has-bg-image]:py-row in-data-[has-bg-image]:text-reading-plate-foreground",
  /** A loading column: the plate as an island, with the skeleton sweep re-pointed to stops the plate can separate. */
  loading:
    "in-data-[has-bg-image]:bg-reading-plate in-data-[has-bg-image]:backdrop-blur-sm in-data-[has-bg-image]:rounded-card in-data-[has-bg-image]:[--orb-skeleton-sweep-base:var(--color-input)] in-data-[has-bg-image]:[--orb-skeleton-sweep-crest:color-mix(in_oklab,var(--color-foreground)_24%,transparent)] in-data-[has-bg-image]:[&_[data-slot=skeleton]]:bg-input",
  /** An error state with a control: the opaque card, because its muted ink is floored against the card fill. */
  error: "in-data-[has-bg-image]:bg-card in-data-[has-bg-image]:rounded-card",
} as const;
