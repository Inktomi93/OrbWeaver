// The fills a band or a page ground takes, shared by the layout boxes and the parts that are bands (a sticky
// header, a tab panel). A ground draws no edge and no radius: a box with an edge is a Card (UI-Density-Law.md §4.3).
import { MESSAGE_BUBBLE_GROUND } from "./message-bubble.ts";

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
  /** A band inside a message bubble (its pinned header, its foot): the bubble's own fill and paired ink, per role. */
  bubble: MESSAGE_BUBBLE_GROUND.assistant,
  userBubble: MESSAGE_BUBBLE_GROUND.user,
  systemBubble: MESSAGE_BUBBLE_GROUND.system,
  /** The reading plate at full strength and its ink: a band that must hide the prose scrolling under it. */
  readingBand: "bg-reading-band text-reading-plate-foreground",
} as const;

/** A pinned band's fill dissolving below its bottom edge over one block step, so the line passing under the edge fades
 *  instead of being cut. Out of flow, so it adds no box to the band or its ancestors; the band must be positioned. */
export const GROUND_FADE_BELOW =
  "after:pointer-events-none after:absolute after:inset-x-0 after:inset-bs-full after:block-block after:bg-linear-to-b after:to-transparent after:content-['']";

/** The fade's starting colour for each ground that can take it: the band's own fill. */
export const GROUND_FADE_FROM = {
  bubble: "after:from-ai-bubble",
  userBubble: "after:from-user-bubble",
  systemBubble: "after:from-system-bubble",
  readingBand: "after:from-reading-band",
} as const satisfies Partial<Record<keyof typeof GROUND, string>>;

const PLATE_ISLAND =
  "in-data-[has-bg-image]:bg-reading-plate in-data-[has-bg-image]:backdrop-blur-sm in-data-[has-bg-image]:rounded-card in-data-[has-bg-image]:text-reading-plate-foreground";

// The plates a band takes over a room's wallpaper (`data-has-bg-image` on an ancestor). Every arm is inert on a
// plain background, so a band that may sit over art carries one unconditionally.
export const WALLPAPER_PLATE = {
  /** A chrome band (the character bar): the reading plate and its ink. */
  band: "in-data-[has-bg-image]:bg-reading-plate in-data-[has-bg-image]:backdrop-blur-sm in-data-[has-bg-image]:text-reading-plate-foreground",
  /** A footer under a reply: the band plate as a rounded island with its own inset. */
  chrome: `${PLATE_ISLAND} in-data-[has-bg-image]:px-field in-data-[has-bg-image]:py-row`,
  /** The chrome island without its inset, for a box that already carries its own padding. */
  island: PLATE_ISLAND,
  /** A reading column with no fill of its own: the plate and the prose ink, so the text never lands on bare art. */
  reading: "in-data-[has-bg-image]:bg-reading-plate in-data-[has-bg-image]:backdrop-blur-sm in-data-[has-bg-image]:text-prose-body",
  /** A loading column: the plate as an island, with the skeleton sweep re-pointed to stops the plate can separate. */
  loading:
    "in-data-[has-bg-image]:bg-reading-plate in-data-[has-bg-image]:backdrop-blur-sm in-data-[has-bg-image]:rounded-card in-data-[has-bg-image]:[--orb-skeleton-sweep-base:var(--color-input)] in-data-[has-bg-image]:[--orb-skeleton-sweep-crest:color-mix(in_oklab,var(--color-foreground)_24%,transparent)] in-data-[has-bg-image]:[&_[data-slot=skeleton]]:bg-input",
  /** An error state with a control: the opaque card, because its muted ink is floored against the card fill. */
  error: "in-data-[has-bg-image]:bg-card in-data-[has-bg-image]:rounded-card",
  /** Small text whose contrast needs the opaque pair over art (a pager's count): the card fill and ink as an inset island. */
  card: "in-data-[has-bg-image]:bg-card in-data-[has-bg-image]:rounded-card in-data-[has-bg-image]:px-field in-data-[has-bg-image]:py-row in-data-[has-bg-image]:text-card-foreground",
} as const;
