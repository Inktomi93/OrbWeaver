import { CtIsolation } from "@orb/testkit/browser";
import type { MediaGridItem } from "@orb/ui/media-grid";
import { MediaGrid } from "@orb/ui/media-grid";
import type { ReactElement } from "react";

const ITEMS: readonly MediaGridItem[] = Array.from({ length: 6 }, (_, index) => ({ id: index, alt: `Image ${String(index + 1)}` }));

export function MediaGridSpotlightStory(): ReactElement {
  return (
    <CtIsolation subject="MediaGrid" isolates="The pointer-follow spotlight is written by the primitive itself and needs no application services.">
      <MediaGrid items={ITEMS} ariaLabel="Spotlight images" className="max-block-(--height-scroll-md)" />
    </CtIsolation>
  );
}
