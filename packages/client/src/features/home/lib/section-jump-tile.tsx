// The "Jump to" home tile — the ONE tile home itself owns, because it is SHELL-DERIVED content with no
// other owner (home-section-spec §3.4). Its rows are derived from the section registry by
// `SectionJumpGrid`; this file is only the contribution the door assembles.

import { LayoutGrid } from "@orb/ui/icons";
import type { HomeTileContribution } from "#lib";
import { SectionJumpGrid } from "../components/section-jump-grid";

const JUMP_TILE_ORDER = 40;

export const sectionJumpTile: HomeTileContribution = {
  id: "home.jump",
  title: "Jump to",
  icon: LayoutGrid,
  order: JUMP_TILE_ORDER,
  span: "full",
  body: () => <SectionJumpGrid />,
};
