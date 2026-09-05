import type { ReactElement } from "react";
import { cn } from "#lib";
import { Badge } from "#primitives/badge";
import { Icon, Images } from "#primitives/icons";
import { Skeleton } from "#primitives/skeleton";
import { Text } from "#primitives/text";
import type { MediaTileAspect } from "./aspect.ts";
import { mediaTileGridVariants } from "./variants.ts";

/** One browse tile. Deliberately NOT generic over an entity: the whole point of this composite is that it takes
 *  a COVER and three strings, so any shelf can reach it without teaching it a domain. */
export interface MediaTileItem {
  /** Render key, and what `onActivate` receives. */
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string | undefined;
  /** A short status word rendered as a Badge over the cover's top-right. */
  readonly badge?: string | undefined;
  /** The cover image url. Absent ⇒ the placeholder, which occupies the SAME reserved box. */
  readonly imageUrl?: string | undefined;
  /** The cover's alt text. Absent ⇒ the cover is decorative and the tile's title carries the name. */
  readonly alt?: string | undefined;
  /** Short tag/genre words rendered as ONE clipped row of soft chips under the text — the browse genre's
   *  filter vocabulary, on the tile where the filtering decision is made. Absent/empty ⇒ no row. */
  readonly tags?: readonly string[] | undefined;
}

type TileSlots = ReturnType<typeof mediaTileGridVariants>;

/** ONE tile. Extracted rather than inlined in the map so the interactive/display fork is a single decision at
 *  one place and the map returns one keyed element. */
function MediaTile({
  item,
  slots,
  onActivate,
}: {
  readonly item: MediaTileItem;
  readonly slots: TileSlots;
  readonly onActivate?: ((id: string) => void) | undefined;
}): ReactElement {
  const body = (
    <>
      <span className={slots.cover()}>
        {item.imageUrl === undefined ? (
          <span className={slots.coverEmpty()}>
            <Icon icon={Images} size="md" />
          </span>
        ) : (
          // Decorative when the item supplies no `alt`: the tile's own title sits right below it, and a
          // duplicate accessible name is noise a screen-reader user walks past on every tile.
          <img alt={item.alt ?? ""} className={slots.image()} loading="lazy" src={item.imageUrl} />
        )}
        {item.badge === undefined ? null : (
          <span className={slots.badge()}>
            <Badge size="sm" tone="soft">
              {item.badge}
            </Badge>
          </span>
        )}
      </span>
      <Text lines={2} voice="promoted">
        {item.title}
      </Text>
      {item.subtitle === undefined ? null : (
        <Text lines={2} voice="gloss">
          {item.subtitle}
        </Text>
      )}
      {item.tags === undefined || item.tags.length === 0 ? null : (
        <span className={slots.tagRow()} data-slot="media-tile-tags">
          {item.tags.map((tag) => (
            <Badge key={tag} size="sm" tone="soft">
              {tag}
            </Badge>
          ))}
        </span>
      )}
    </>
  );
  if (onActivate === undefined) {
    return (
      <div className={slots.tile()} data-slot="media-tile">
        {body}
      </div>
    );
  }
  return (
    <button aria-label={tileName(item)} className={slots.tile()} data-slot="media-tile" onClick={(): void => onActivate(item.id)} type="button">
      {body}
    </button>
  );
}

/**
 * An interactive tile's EXPLICIT accessible name: identity, then state.
 *
 * WHY IT IS EXPLICIT AT ALL (side-eye 2026-08-29 P3, unreversed): content-derived naming runs the title and
 * the subtitle together with no boundary ("World RPrickrocka · 7.4k↓"). A comma keeps both halves in the
 * name, and distinct.
 *
 * WHY THE BADGE IS IN IT (#1698, side-eye 2026-09-05, the hub-ingested arm). An explicit name REPLACES the
 * node's content, so everything on the tile that is not title-or-subtitle fell silently outside it —
 * including the BADGE, which is the tile's only statement of STATE. Measured on the Card Atlas hub: every
 * result announced `Illyria, damagecontrol · 2.8k↓` whether or not it was already in the library, on the one
 * surface whose entire job is deciding what to add. The badge is a short status word by this part's own
 * contract, so it appends as a clause AFTER the identity — the reading a sighted user gets from a corner
 * badge (this thing, and by the way it is in this state), in the order a name should carry it.
 *
 * THE TAGS ARE DELIBERATELY NOT HERE. They are the browse genre's FILTER vocabulary, up to eight per tile,
 * and appending eight words to every name in a 30-tile grid is exactly the noise an explicit name exists to
 * avoid. They are painted, and they are not state.
 */
function tileName(item: MediaTileItem): string {
  const identity = item.subtitle === undefined ? item.title : `${item.title}, ${item.subtitle}`;
  return item.badge === undefined ? identity : `${identity}, ${item.badge}`;
}

export interface MediaTileGridProps {
  readonly items: readonly MediaTileItem[];
  /** @defaultValue "portrait" — the card/cover ratio the browse genre defaults to. */
  readonly aspect?: MediaTileAspect;
  /** Absent ⇒ the tiles are display-only (no focus behaviour at all, not a disabled control). */
  readonly onActivate?: (id: string) => void;
  readonly className?: string;
}

/**
 * MediaTileGrid — the house MEDIA-FORWARD BROWSE GRID: a responsive grid of cover-first tiles with a title, an
 * optional subtitle and an optional badge.
 *
 * WHY IT EXISTS AS A SHELF MEMBER. The shelf already had `ListRow` (an entity-management row) and `MediaGrid`
 * (a square-thumbnail asset gallery with selection), and nothing in between — so every browse surface over a
 * VISUAL medium reached for `ListRow` because it was the nearest thing, and rendered card art as a small avatar
 * beside a compressed meta string. That is a recorded failure of this repo's own purged hub browser, and it is
 * a SHELF gap rather than a surface mistake: the path of least resistance produced it. This composite is the
 * missing rung, so the media-forward shape is now the cheap one.
 *
 * INTERACTIVITY IS DECIDED BY `onActivate`, not by a prop pair that can disagree: with a handler each tile is a
 * real `<button>` (keyboard-reachable, one tab stop per tile, the house focus ring); without one the tiles are
 * plain boxes with no focus behaviour — a display grid that traps tab stops is worse than no grid.
 *
 * NAMING THE REGION IS THE CALLER'S JOB, deliberately: this is a grid of things, not a semantic list, and a
 * `role="list"` invented here would announce a structure the surface may not mean. Wrap it in the labelled
 * region the surface already owns.
 */
export function MediaTileGrid({ items, aspect = "portrait", onActivate, className }: MediaTileGridProps): ReactElement {
  const slots = mediaTileGridVariants({ aspect, interactive: onActivate !== undefined });
  return (
    <div className={cn(slots.root(), className)} data-slot="media-tile-grid">
      <div className={slots.tracks()}>
        {items.map((item) => (
          <MediaTile item={item} key={item.id} onActivate={onActivate} slots={slots} />
        ))}
      </div>
    </div>
  );
}

export interface MediaTileGridSkeletonProps {
  /** How many placeholder tiles to draw. @defaultValue 8 */
  readonly count?: number;
  /** @defaultValue "portrait" — MUST match the real grid's aspect or the rows shift on arrival. */
  readonly aspect?: MediaTileAspect;
}

/**
 * The SHAPE-MATCHED loading state for a {@link MediaTileGrid} — cover box + title line + subtitle line, at the
 * same ratio and in the same grid. The three-states law asks for a skeleton that matches the final shape; the
 * failure it prevents here is specific and was measured on the purged hub surface, which drew LINE-shaped
 * skeleton rows under a media feed and then reflowed the whole viewport when the tiles arrived.
 */
export function MediaTileGridSkeleton({ count = 8, aspect = "portrait" }: MediaTileGridSkeletonProps): ReactElement {
  const slots = mediaTileGridVariants({ aspect });
  // Named placeholder keys rather than the index: a suppression here would be a lint budget spent on a
  // placeholder, and the id IS the identity the renderer wants anyway.
  const placeholders = Array.from({ length: count }, (_unused, index) => `tile-${index}`);
  return (
    <div aria-busy={true} className={slots.root()} data-slot="media-tile-grid-skeleton">
      <div className={slots.tracks()}>
        {placeholders.map((id) => (
          <div className={slots.tile()} key={id}>
            <Skeleton className={slots.cover()} />
            <Skeleton variant="text" />
            <Skeleton variant="text" />
          </div>
        ))}
      </div>
    </div>
  );
}
