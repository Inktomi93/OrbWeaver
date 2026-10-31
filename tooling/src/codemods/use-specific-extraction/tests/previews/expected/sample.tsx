import { Card } from "@orb/ui/card";
import { ThemePreviewPane } from "@orb/ui/theme-swatch";
import { FloatingChip } from "@orb/ui/floating-chip";
import { RoomIsland } from "@orb/ui/room-island";
import type { ReactElement } from "react";

// The preview panes keep the card's edge and fill under their own, so they move with no default to guard. A pill chip
// paints its own fill over Card's unnamed `variant`, and a float island paints Card's own defaults.
export function Sample(): ReactElement {
  return (
    <div>
      <ThemePreviewPane fill="sidebar" shape="row" padding="none" className="flex">
        row
      </ThemePreviewPane>
      <ThemePreviewPane className="flex-1" padding="none" fill="sidebarEdge" lifted={true} shape="inset" />
      <ThemePreviewPane fill="background">island</ThemePreviewPane>
      <FloatingChip className="flex items-center" presence="shown">
        chip
      </FloatingChip>
      <RoomIsland ownSlot="band">
        float
      </RoomIsland>
      <Card tone="warning" variant="soft">
        untouched
      </Card>
    </div>
  );
}
