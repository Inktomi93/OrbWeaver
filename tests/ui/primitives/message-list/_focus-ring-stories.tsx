import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { MessageList } from "@orb/ui/message-list";
import type { ReactElement } from "react";

const SHORT_ROW_PX = 60;
const TALL_ROW_PX = 600;

/** Rows alternate short and tall, so a walk lands both on a row the port holds whole and on one taller than the port. */
export function MessageListFocusRingStory(): ReactElement {
  return (
    <CtIsolation subject="MessageList" isolates="The row focus ring is painted by the primitive's own recipe and clipped by its own scrollport.">
      <Button>Before the list</Button>
      <div style={{ width: 400, height: 240, display: "flex" }}>
        <MessageList
          ariaLabel="Focus ring"
          className="flex-1"
          rowNavigation="roving"
          items={Array.from({ length: 12 }, (_, index) => index)}
          getItemKey={(item): number => item}
          estimateSize={(item): number => (item % 2 === 0 ? SHORT_ROW_PX : TALL_ROW_PX)}
          renderItem={(item): ReactElement => <div style={{ height: item % 2 === 0 ? SHORT_ROW_PX : TALL_ROW_PX }}>Row {item}</div>}
        />
      </div>
    </CtIsolation>
  );
}
