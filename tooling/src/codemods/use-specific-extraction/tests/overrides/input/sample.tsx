import { Card } from "@orb/ui/card";
import type { ReactElement } from "react";

// A bubble tone paints its own fill over Card's unnamed `variant`, so the map's `overrides` lets each site move; a
// bubble shape with no tone leaves the unnamed `tone` to Card's neutral default and stays a hand edit.
export function Sample(): ReactElement {
  return (
    <div>
      <Card tone="bubble" shape="bubble">
        assistant
      </Card>
      <Card className="self-end" tone="userBubble" shape="bubble">
        user
      </Card>
      <Card tone="systemBubble">system</Card>
      <Card shape="bubble">no role</Card>
      <Card tone="warning" variant="soft">
        untouched
      </Card>
    </div>
  );
}
