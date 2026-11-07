import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { MessageListHandle } from "@orb/ui/message-list";
import { MessageList } from "@orb/ui/message-list";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

const ROW_PX = 120;
const TALL_ROW_PX = 900;
/** The pinned plate's height; the test reads the plate's own box, never this number. */
const PLATE_PX = 88;
const ROWS = 40;
const TALL_ROW = 5;
/** A row that fits the port but not the port below the plate, so an `auto` placement would tuck its head under it. */
const MID_ROW = 8;
const MID_ROW_PX = 350;

function heightOf(item: number): number {
  if (item === TALL_ROW) {
    return TALL_ROW_PX;
  }
  return item === MID_ROW ? MID_ROW_PX : ROW_PX;
}

/** A transcript whose leading action stands pinned over the rows, as a history failure line does. */
export function MessageListPinnedFailureStory(): ReactElement {
  const handle = useRef<MessageListHandle>(null);
  return (
    <CtIsolation subject="MessageList" isolates="A pinned leading action over the rows needs no application services; the scrollport alone places a row.">
      <Button onClick={(): boolean | undefined => handle.current?.revealIndex(12)}>Reveal row 12</Button>
      <div style={{ width: 360, height: 400, display: "flex" }}>
        <MessageList
          ariaLabel="Pinned failure"
          ref={handle}
          className="flex-1"
          rowNavigation="roving"
          leadingAction={
            <div data-keep-in-view="" style={{ height: PLATE_PX }}>
              History failed
            </div>
          }
          items={Array.from({ length: ROWS }, (_, index) => index)}
          getItemKey={(item): number => item}
          estimateSize={heightOf}
          renderItem={(item): ReactElement => <div style={{ height: heightOf(item) }}>Row {item}</div>}
        />
      </div>
    </CtIsolation>
  );
}

/** A reader parked in the rows when the plate arrives, or when the regime flips under a standing plate: either starts a hold. */
export function MessageListHeldUnderPlateStory({ standing = false }: { readonly standing?: boolean }): ReactElement {
  const [failed, setFailed] = useState(standing);
  const [grown, setGrown] = useState(false);
  const rowPx = grown ? ROW_PX * 2 : ROW_PX;
  return (
    <CtIsolation subject="MessageList" isolates="A hold under a pinned leading action needs no application services; the scrollport alone places the row.">
      <Button onClick={(): void => setFailed(true)}>Fail the press</Button>
      <Button onClick={(): void => setGrown(true)}>Enlarge the text</Button>
      <div style={{ width: 360, height: 400, display: "flex" }}>
        <MessageList
          ariaLabel="Held under plate"
          className="flex-1"
          rowNavigation="roving"
          leading={<div style={{ height: grown ? 64 : 32 }}>Room chrome</div>}
          leadingAction={
            failed ? (
              <div data-keep-in-view="" style={{ height: PLATE_PX }}>
                History failed
              </div>
            ) : (
              <div style={{ height: 24 }}>Earlier messages</div>
            )
          }
          items={Array.from({ length: ROWS }, (_, index) => index)}
          getItemKey={(item): number => item}
          estimateSize={(): number => ROW_PX}
          renderItem={(item): ReactElement => <div style={{ height: rowPx }}>Row {item}</div>}
        />
      </div>
    </CtIsolation>
  );
}
