import { MessageList } from "@orb/ui/message-list";
import type { ReactElement } from "react";

const ROW_HEIGHT = 800;
const ROWS = Array.from({ length: 24 }, (_, index) => index);

export function JumpingStickyList(): ReactElement {
  return (
    <div style={{ width: 360, background: "white" }}>
      <div style={{ background: "#181818", color: "white", fontSize: 18 }}>
        <span data-testid="contrast-control">Speaker control</span>
      </div>
      <MessageList
        items={ROWS}
        getItemKey={(item): number => item}
        estimateSize={(): number => ROW_HEIGHT}
        followTail={false}
        gapToken="block"
        className="h-[400px]"
        renderItem={(item): ReactElement => (
          <div style={{ height: ROW_HEIGHT, background: "#181818", color: "white" }}>
            <div data-sticky="" style={{ position: "sticky", top: 0, height: 32, background: "#181818", fontSize: 18 }}>
              <span data-testid={`speaker-${item}`}>Speaker {item}</span>
            </div>
            <p>Conversation passage {item}</p>
          </div>
        )}
      />
    </div>
  );
}
