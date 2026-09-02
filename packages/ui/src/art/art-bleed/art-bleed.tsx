// ArtBleed — a DECORATIVE image that bleeds in from a surface's inline END and dissolves before it
// reaches the surface's prose (#205, the home hero's "the room gets its art" ruling).
//
// WHAT IT IS FOR, and what it is not. It gives a text-only island CHROMA without turning that island into
// a media card: the picture is never a datum, never named, never counted, and never announced — a caller
// that wants art a user can identify or act on wants `CrossfadeImage`/`Media` inside real layout, not
// this. It is `aria-hidden` and `pointer-events: none` unconditionally, so it cannot take a hit target
// from the host and cannot add a stop to the a11y tree, and there is no arm in which it can.
//
// THE READING-SURFACE GUARANTEE IS GEOMETRIC, NOT AESTHETIC. The band starts one `--reading-measure-min`
// (plus one `--spacing-section` of clearance for the host's own padding) in from the host's inline start,
// so a host that caps its content column at the same measure has NO INK OVER ART anywhere — which is why
// this needs none of the D144 reading-plate machinery: a plate backs text that sits on art, and by
// construction none does. The two halves must be read together; a host that adopts the band without
// capping its column has broken the guarantee, and only its own geometry test will say so.
//
// IT DISAPPEARS ON A NARROW SURFACE BY CONSTRUCTION, with no media query and no caller branch: `min(100%,
// …)` collapses the band to zero width the moment the host is narrower than the measure. That is what
// makes "desktop hierarchy only" a property of the recipe rather than a rule someone has to remember.
//
// …AND THAT SENTENCE WAS TRUE OF THE DESKTOP DEFAULT ITSELF (#1121, side-eye HOME 2026-09-02 H7). At the
// 75ch measure the recipe's own "narrow surface" arm swallowed the 1280x800 shipped default — the home
// hero's band measured ZERO pixels wide there and 33px at 1920, so the ruling the component exists to
// serve (#205, "the hero gets its room's art") fired at no width anyone runs. The clause survives; its
// INPUT changed. The measure is `--reading-measure-min` (65ch, the design law's own LOW reading bound)
// for BOTH the band's start and every host's column cap, which leaves the geometry identical and hands
// the band ~68px at 1280 and ~210px at 1920. A phone or a docked-narrow pane still collapses it to zero,
// which is what the clause was always for.
//
// Static (no transition, no animation) ⇒ reduced-motion-safe.

import type { ReactElement } from "react";
import { artBleedVariants } from "./variants.ts";

export interface ArtBleedProps {
  /** The image URL. There is no `null` arm on purpose: "this surface has no art" is the HOST's decision
   *  and it renders nothing at all, rather than this component painting an empty band where a picture
   *  was promised. */
  readonly src: string;
  readonly className?: string;
}

/** A decorative art band on the host's inline-end edge. The host must be a positioned box (the band is
 *  absolute) and should cap its own content column at `--reading-measure`. */
export function ArtBleed({ src, className }: ArtBleedProps): ReactElement {
  return <div aria-hidden={true} className={artBleedVariants({ className })} data-slot="art-bleed" style={{ backgroundImage: `url("${src}")` }} />;
}
