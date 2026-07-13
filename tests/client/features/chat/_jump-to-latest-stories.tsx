// CT stories for the jump-to-latest pill — kept in their OWN non-test module (Spine-Testing §7: CT
// mounts from a non-test module) DELIBERATELY separate from `_ct-stories.tsx`, so these stories pull
// in ONLY the pill + its hook + the message-list seal, never the whole chat surface graph.

import type { MessageListHandle } from "@orb/ui/message-list";
import { MessageList } from "@orb/ui/message-list";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { JumpToLatestPill } from "../../../../packages/client/src/features/chat/components/jump-to-latest-pill";
import { useJumpToLatest } from "../../../../packages/client/src/features/chat/hooks/use-jump-to-latest";

/** A harness around `<JumpToLatestPill>` alone: buttons drive `visible`/`count`, and `onJump` bumps a
 *  readout so the CT can assert the chrome/a11y — click AND keyboard (Enter/Space on the real
 *  `<button>`) — plus the held-count. No seal, no scroll: pure prop-driven pill. */
export function JumpToLatestPillStory(): ReactElement {
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(0);
  const [jumps, setJumps] = useState(0);
  return (
    <div style={{ position: "relative", height: 120 }}>
      <button type="button" data-testid="ctl-toggle" onClick={(): void => setVisible((v) => !v)}>
        toggle visible
      </button>
      <button type="button" data-testid="ctl-inc" onClick={(): void => setCount((c) => c + 1)}>
        inc count
      </button>
      <button type="button" data-testid="ctl-zero" onClick={(): void => setCount(0)}>
        zero count
      </button>
      <output data-testid="jumps">{jumps}</output>
      <JumpToLatestPill
        count={count}
        visible={visible}
        onJump={(): void => setJumps((j) => j + 1)}
      />
    </div>
  );
}

interface RegressionItem {
  readonly id: string;
  readonly label: string;
}

const REGRESSION_ROW_PX = 40;
const REGRESSION_INITIAL = 60;

/** The REAL integration path: a live `<MessageList>` seal + `useJumpToLatest` (geometry-sampled) +
 *  the pill, in a bounded box. "arrive" appends a message (canon grows); "read dist" snapshots the
 *  handle's `getDistanceFromEnd()` into a readout. This is the fixture behind the two P0 acceptance
 *  tests: scrolled-away + arrival must keep the pill shown with the count; a click must jump to the
 *  tail AND hide the pill — driven off the reader's ACTUAL scroll position, not the follow intent. */
export function JumpToLatestRegressionStory(): ReactElement {
  const [count, setCount] = useState(REGRESSION_INITIAL);
  // `live` is driven SEPARATELY from `count` so a test can reproduce the P0#1 cross-source commit
  // ordering: flip `live` false (a `toggle-live` click) in one commit, THEN bump `count` (an `arrive`
  // click) in the next — the exact turn-settle race where the turn-phase store beats the canon query.
  const [live, setLive] = useState(false);
  const listHandleRef = useRef<MessageListHandle>(null);
  const jump = useJumpToLatest({ messagesCount: count, live, listHandleRef });
  const [dist, setDist] = useState<string>("unread");
  const items: readonly RegressionItem[] = Array.from({ length: count }, (_, i) => ({
    id: `m-${i}`,
    label: `Message ${i}`,
  }));
  return (
    <div>
      {/* Controls in normal flow ABOVE the list box (kept on-screen so the CT can click them). The
          `at-tail` readout lets the CT wait for the settle debounce deterministically (poll until
          "false") before triggering an arrival, without a fixed timeout. */}
      <div>
        <button type="button" data-testid="arrive" onClick={(): void => setCount((c) => c + 1)}>
          arrive
        </button>
        <button type="button" data-testid="toggle-live" onClick={(): void => setLive((v) => !v)}>
          toggle live
        </button>
        <button
          type="button"
          data-testid="read-dist"
          onClick={(): void => {
            const handle = listHandleRef.current;
            setDist(
              handle === null ? "no-handle" : String(Math.round(handle.getDistanceFromEnd())),
            );
          }}
        >
          read dist
        </button>
        <output data-testid="dist">{dist}</output>
        <output data-testid="at-tail">{String(jump.atTail)}</output>
      </div>
      <div style={{ position: "relative", height: 300 }}>
        <MessageList
          ref={listHandleRef}
          items={items}
          getItemKey={(item): string => item.id}
          estimateSize={(): number => REGRESSION_ROW_PX}
          scrollContainerRef={jump.scrollContainerRef}
          renderItem={(item): ReactElement => (
            <div style={{ height: REGRESSION_ROW_PX }}>{item.label}</div>
          )}
          className="h-full"
        />
        <JumpToLatestPill count={jump.count} visible={jump.visible} onJump={jump.onJump} />
      </div>
    </div>
  );
}
