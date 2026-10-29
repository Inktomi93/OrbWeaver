import type { ScrollMode } from "@orb/kit/scroll-mode";
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { LogViewer } from "@orb/ui/log-viewer";
import type { MessageListHandle } from "@orb/ui/message-list";
import { MessageList } from "@orb/ui/message-list";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

export function MessageListScrollportStory({
  scrollMode = "follow",
  initialCount = 0,
}: {
  readonly scrollMode?: ScrollMode;
  readonly initialCount?: number;
}): ReactElement {
  const [count, setCount] = useState(initialCount);
  const [tailHeight, setTailHeight] = useState(60);
  const [height, setHeight] = useState(240);
  const handle = useRef<MessageListHandle>(null);
  const items = Array.from({ length: count }, (_, index) => index);
  return (
    <CtIsolation subject="MessageList" isolates="Native row measurement, scrollport observation and reader anchors need no application services.">
      <Button onClick={(): void => setCount((previous) => previous + 20)}>Append rows</Button>
      <Button onClick={(): void => setTailHeight((previous) => previous + 180)}>Grow tail</Button>
      <Button onClick={(): void => setHeight(160)}>Shrink scrollport</Button>
      <Button onClick={(): void => handle.current?.pinToIndex(count - 1)}>Pin last row</Button>
      <div style={{ width: 400, height, display: "flex" }}>
        <MessageList
          ariaLabel="Scrollport lifecycle"
          ref={handle}
          scrollMode={scrollMode}
          className="flex-1"
          items={items}
          getItemKey={(item): number => item}
          estimateSize={(): number => 60}
          keepMounted={(item): boolean => item === count - 1}
          renderItem={(item): ReactElement => <div style={{ height: item === count - 1 ? tailHeight : 60 }}>Row {item}</div>}
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
