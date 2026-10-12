// ArtBleed CT stories (Spine-Testing §7 — CT mounts only from a non-test module). The band is absolutely
// positioned and sized ENTIRELY by its host, so every story supplies a real positioned box; the two
// stories are the two arms the recipe's geometry decides between — a host wider than the reading measure
// (the band exists) and one narrower than it (the band collapses, which is how "desktop only" is spelled).

import { ArtBleed } from "@orb/ui/art-bleed";
import type { ReactElement } from "react";

/** A 1px transparent GIF — the band paints a background-image, and a data URL keeps the story off the
 *  network so a slow fetch can never be mistaken for a collapsed band. */
const ART = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function Host({ width }: { readonly width: number }): ReactElement {
  return (
    <div data-testid="host" style={{ position: "relative", inlineSize: width, blockSize: 200, background: "var(--color-card)" }}>
      <ArtBleed src={ART} />
    </div>
  );
}

/** Comfortably wider than `--reading-measure-min` (65ch) plus the section clearance. */
export function ArtBleedWideStory(): ReactElement {
  return <Host width={1200} />;
}

/** Narrower than the measure — the phone / docked-narrow arm. */
export function ArtBleedNarrowStory(): ReactElement {
  return <Host width={360} />;
}
