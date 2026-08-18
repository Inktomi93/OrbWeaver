// TrailingArrow — the DECORATIVE "→" on a "go there" affordance ("All chats →", the hearth's "Resume →").
//
// It exists because the arrow is a GLYPH, not part of a name (side-eye rail sweep P3-14, 2026-08-17). Every
// one of these was plain text inside its control, so the accessible name was "All chats →" — an arrow read
// aloud by AT ("All chats right arrow"), unspeakable by voice control, and unmatchable by a name-based
// selector that a human would type. The visible label still ends in the arrow; the NAME stops at the words.
//
// Why a shared component rather than an `aria-hidden` span at each site: four call sites across two
// features render this one thing, and a `aria-hidden` that goes missing at one of them is invisible until a
// review reads that surface's a11y tree. Tier-2 composite (`components/` = cross-feature, no single owner).
//
// The `@orb/ui/icons` export list is a curated seal and this arrow deliberately does NOT join it: it is the
// same TEXT arrow the approved mock draws, at the label step of whatever voice wraps it.

import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface TrailingArrowProps {
  /** Extra classes for the arrow itself — a hover nudge (`group-hover:translate-x-tight`), nothing else. */
  readonly className?: string;
}

export function TrailingArrow({ className }: TrailingArrowProps): ReactElement {
  return (
    <Text aria-hidden={true} as="span" className={className} ink="inherit" voice="label">
      →
    </Text>
  );
}
