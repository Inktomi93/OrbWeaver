// Fixtures for the MediaTileGrid CT (a CT mounts ONLY from a non-test module). Every fixture pins the grid at
// a FIXED container width with `overflow: visible`: the grid's column count is a CONTAINER query, so a
// content-sized mount root would agree with whatever the tiles happened to want and the responsive pin would
// measure nothing.

import type { MediaTileAspect, MediaTileItem } from "@orb/ui/media-tile-grid";
import { MediaTileGrid, MediaTileGridSkeleton } from "@orb/ui/media-tile-grid";
import type { ReactElement } from "react";
import { useState } from "react";

/** A 1x1 transparent PNG — a REAL decodable image, so a cover's reserved box is measured against bytes that
 *  actually land rather than against a broken-image glyph. */
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function items(count: number, withCover: boolean): MediaTileItem[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `t${index}`,
    title: `Tile ${index}`,
    subtitle: `by author ${index}`,
    ...(withCover ? { imageUrl: PIXEL, alt: `cover ${index}` } : {}),
  }));
}

export function BasicTileGrid({
  widthPx,
  count = 6,
  aspect = "portrait",
  withCover = true,
}: {
  readonly widthPx: number;
  readonly count?: number;
  readonly aspect?: MediaTileAspect;
  readonly withCover?: boolean;
}): ReactElement {
  return (
    <div style={{ overflow: "visible", width: widthPx }}>
      <MediaTileGrid aspect={aspect} items={items(count, withCover)} />
    </div>
  );
}

/** A grid whose tiles are REAL controls — records which tile id the handler received. */
export function ActivatableTileGrid({ widthPx }: { readonly widthPx: number }): ReactElement {
  const [picked, setPicked] = useState<string>("none");
  return (
    <div style={{ overflow: "visible", width: widthPx }}>
      <MediaTileGrid items={items(3, true)} onActivate={setPicked} />
      <p data-testid="picked">{picked}</p>
    </div>
  );
}

/** A MIXED grid — one tile with a cover, one without — for the reserved-box pin. */
export function MixedTileGrid({ widthPx }: { readonly widthPx: number }): ReactElement {
  return (
    <div style={{ overflow: "visible", width: widthPx }}>
      <MediaTileGrid
        items={[
          { id: "has", title: "Has cover", imageUrl: PIXEL, alt: "a cover" },
          { id: "none", title: "No cover" },
        ]}
      />
    </div>
  );
}

/** A TAGGED interactive grid — one tile with tag chips, one without (hub v1.2: chips + the a11y name). */
export function TaggedTileGrid({ widthPx }: { readonly widthPx: number }): ReactElement {
  return (
    <div style={{ overflow: "visible", width: widthPx }}>
      <MediaTileGrid
        items={[
          { id: "tagged", title: "World RP", subtitle: "rickrocka · 7.4k↓", tags: ["fantasy", "vampire"] },
          { id: "bare", title: "Bare", subtitle: "nobody" },
        ]}
        onActivate={(): void => undefined}
      />
    </div>
  );
}

/** A BADGED interactive grid — one owned tile, one not (#1698: the badge is a STATE and must be in the name).
 *  The strings are the Card Atlas hub's own, because that is the surface the finding was measured on. */
export function BadgedTileGrid({ widthPx }: { readonly widthPx: number }): ReactElement {
  return (
    <div style={{ overflow: "visible", width: widthPx }}>
      <MediaTileGrid
        items={[
          { id: "owned", title: "Illyria", subtitle: "damagecontrol \u00b7 2.8k\u2193", badge: "in your library" },
          { id: "unowned", title: "Rebecca", subtitle: "paradigme \u00b7 1.1k\u2193" },
        ]}
        onActivate={(): void => undefined}
      />
    </div>
  );
}

/** The shape-matched loading state, at the SAME width + aspect as its real grid. */
export function TileGridSkeleton({ widthPx, aspect = "portrait" }: { readonly widthPx: number; readonly aspect?: MediaTileAspect }): ReactElement {
  return (
    <div style={{ overflow: "visible", width: widthPx }}>
      <MediaTileGridSkeleton aspect={aspect} count={2} />
    </div>
  );
}
