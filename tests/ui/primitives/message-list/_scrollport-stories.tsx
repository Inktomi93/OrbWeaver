import type { ScrollMode } from "@orb/kit/scroll-mode";
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { LogViewer } from "@orb/ui/log-viewer";
import type { MessageListHandle } from "@orb/ui/message-list";
import { MessageList } from "@orb/ui/message-list";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

/** What a swapped row's id gains, so its key is new while its place is not. */
const SWAPPED_KEY_OFFSET = 1000;

export function MessageListScrollportStory({
  scrollMode = "follow",
  initialCount = 0,
  roving = false,
  target = 0,
  chrome = false,
  lateRow = null,
  remRows = false,
}: {
  readonly scrollMode?: ScrollMode;
  readonly initialCount?: number;
  readonly roving?: boolean;
  /** The row the Delete, Swap key and Restore buttons act on. */
  readonly target?: number;
  /** Leading chrome above the rows, so the Grow chrome button can start a reading-row hold. */
  readonly chrome?: boolean;
  /** A row that stays mounted above the reader, so the Grow late row button resizes it off screen, as a late image does. */
  readonly lateRow?: number | null;
  /** Rows sized in rem, so a root font-size change re-measures them all, as a text-scale change does. */
  readonly remRows?: boolean;
}): ReactElement {
  const [count, setCount] = useState(initialCount);
  const [tailHeight, setTailHeight] = useState(60);
  const [height, setHeight] = useState(240);
  const [chromeHeight, setChromeHeight] = useState(40);
  const [lateHeight, setLateHeight] = useState(60);
  // A row id's replacement; null removes the row. A swapped row keeps its place under a new key.
  const [changes, setChanges] = useState<ReadonlyMap<number, number | null>>(new Map());
  const handle = useRef<MessageListHandle>(null);
  const items = Array.from({ length: count }, (_, index) => index).flatMap((index) => {
    const replacement = changes.get(index);
    return replacement === null ? [] : [replacement ?? index];
  });
  const change = (to: number | null | undefined): void =>
    setChanges((previous) => {
      const next = new Map(previous);
      if (to === undefined) {
        next.delete(target);
      } else {
        next.set(target, to);
      }
      return next;
    });
  return (
    <CtIsolation subject="MessageList" isolates="Native row measurement, scrollport observation and reader anchors need no application services.">
      <Button onClick={(): void => setCount((previous) => previous + 20)}>Append rows</Button>
      <Button onClick={(): void => setTailHeight((previous) => previous + 180)}>Grow tail</Button>
      <Button onClick={(): void => setTailHeight((previous) => previous + 30)}>Stream tail</Button>
      <Button onClick={(): void => setTailHeight(60)}>Collapse tail</Button>
      <Button onClick={(): void => setHeight(160)}>Shrink scrollport</Button>
      <Button onClick={(): void => setHeight(400)}>Grow scrollport</Button>
      <Button onClick={(): void => handle.current?.pinToIndex(count - 1)}>Pin last row</Button>
      <Button onClick={(): void => setChromeHeight((previous) => previous + 80)}>Grow chrome</Button>
      <Button onClick={(): void => setLateHeight((previous) => previous + 200)}>Grow late row</Button>
      <Button onClick={(): void => change(null)}>Delete target row</Button>
      <Button onClick={(): void => change(target + SWAPPED_KEY_OFFSET)}>Swap target row key</Button>
      <Button onClick={(): void => change(undefined)}>Restore target row</Button>
      <div style={{ width: 400, height, display: "flex" }}>
        <MessageList
          ariaLabel="Scrollport lifecycle"
          ref={handle}
          {...(chrome ? { leading: <div style={{ height: chromeHeight }}>Room chrome</div> } : {})}
          scrollMode={scrollMode}
          rowNavigation={roving ? "roving" : "none"}
          className="flex-1"
          items={items}
          getItemKey={(item): number => item}
          estimateSize={(): number => 60}
          keepMounted={(item): boolean => item === count - 1 || item === lateRow}
          renderItem={(item): ReactElement => {
            const rowPx = item === lateRow ? lateHeight : 60;
            const plain = remRows ? "3.75rem" : rowPx;
            return <div style={{ height: item === count - 1 ? tailHeight : plain }}>Row {item}</div>;
          }}
        />
      </div>
    </CtIsolation>
  );
}

export function LogViewerScrollportStory(): ReactElement {
  const [count, setCount] = useState(260);
  return (
    <CtIsolation subject="LogViewer" isolates="The virtualized caller's own append and reader-anchor policy needs no application services.">
      <Button onClick={(): void => setCount((previous) => previous + 1)}>Append log line</Button>
      <div style={{ width: 400, height: 240, display: "flex" }}>
        <LogViewer className="flex-1" lines={Array.from({ length: count }, (_, index) => `Log line ${index}`)} maxLines={240} />
      </div>
    </CtIsolation>
  );
}
