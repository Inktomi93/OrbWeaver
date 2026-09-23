// The "Elsewhere in the house" home tile — the ONE tile home itself owns, because it is SHELL-DERIVED
// content with no other owner. Its pills are derived from the section registry
// by `SectionJumpRail`; this file is only the contribution the door assembles.
//
// It sits in the HEARTH column (2026-08-16, #102): the doors OUT of the rooms belong under the rooms,
// not on the shelf you reach into. Its title is the mockup's approved band copy — "Jump to" named the
// mechanism, this names the place.

import { LayoutGrid } from "@orb/ui/icons";
import type { HomeTileContribution } from "#state";
import { SectionJumpRail } from "../components/section-jump-rail.tsx";

const JUMP_TILE_ORDER = 40;

/**
 * The jump tile is a FACTORY over its SIBLING tiles (`makeSectionJumpTile(siblings)`, the
 * `makeHomeSection` posture) because its rows now depend on them: a section whose tile declares
 * `sectionId` has its jump row dropped, so one destination is not two doors ten pixels apart (side-eye
 * 2026-08-08 P2-c). It takes the sibling ARRAY rather than the registry it is itself a member of — the
 * registry cannot exist before its own members do. Home still reads no feature: the claim travels with the
 * tile that makes it, never through a second "which sections have tiles" list (which is the parallel map
 * G2 bans).
 */
export function makeSectionJumpTile(siblings: readonly HomeTileContribution[]): HomeTileContribution {
  return {
    id: "home.jump",
    title: "Elsewhere in the house",
    icon: LayoutGrid,
    order: JUMP_TILE_ORDER,
    region: "hearth",
    // A wrapping rail of pills, not a paged read: one row's worth of skeleton is the honest first-boot box.
    skeletonRows: 1,
    body: () => <SectionJumpRail siblings={siblings} />,
  };
}
