import { Card } from "@orb/ui/card";
import { MessageBubble } from "@orb/ui/message-bubble";
import type { ReactElement } from "react";

// A bubble tone paints its own fill over Card's unnamed `variant`, so the map's `overrides` lets each site move; a
// bubble shape with no tone leaves the unnamed `tone` to Card's neutral default and stays a hand edit.
export function Sample(): ReactElement {
  return (
    <div>
      <MessageBubble messageRole="assistant" shape="bubble">
        assistant
      </MessageBubble>
      <MessageBubble className="self-end" messageRole="user" shape="bubble">
        user
      </MessageBubble>
      <MessageBubble messageRole="system">system</MessageBubble>
      <Card shape="bubble">no role</Card>
      <Card tone="warning" variant="soft">
        untouched
      </Card>
    </div>
  );
}
