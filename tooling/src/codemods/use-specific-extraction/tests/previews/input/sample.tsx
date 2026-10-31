import { Card } from "@orb/ui/card";
import type { ReactElement } from "react";

// The preview panes keep the card's edge and fill under their own, so they move with no default to guard. A pill chip
// paints its own fill over Card's unnamed `variant`, and a float island paints Card's own defaults.
export function Sample(): ReactElement {
  return (
    <div>
      <Card tone="sidebar" shape="row" padding="none" className="flex">
        row
      </Card>
      <Card className="flex-1" padding="none" tone="sidebarEdge" shape="inset" shadow="overlay" />
      <Card tone="background">island</Card>
      <Card className="flex items-center" padding="none" presence="shown" tone="popover" shape="pill" shadow="overlay">
        chip
      </Card>
      <Card ownSlot="band" shape="float">
        float
      </Card>
      <Card tone="warning" variant="soft">
        untouched
      </Card>
    </div>
  );
}
