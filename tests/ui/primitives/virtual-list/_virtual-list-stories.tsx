import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { UnboundedScrollHeightError } from "@orb/ui/lib";
import { VirtualList } from "@orb/ui/virtual-list";
import type { ReactElement, ReactNode } from "react";
import { Component, useState } from "react";
import { MANY_ROWS } from "./virtual-list-cases.ts";

const ROW_HEIGHT_PX = 40;
const WINDOW_HEIGHT_PX = 200;

function rowsOf(count: number): readonly { readonly id: string }[] {
  return Array.from({ length: count }, (_, index) => ({ id: `row-${String(index)}` }));
}

function List({ count, resetScrollKey, resetScrollReady, fadeEdge }: ListProps): ReactElement {
  return (
    <VirtualList
      aria-label="Sample list"
      className="block-full"
      estimateSize={(): number => ROW_HEIGHT_PX}
      fadeEdge={fadeEdge ?? false}
      getItemKey={(item): string => item.id}
      items={rowsOf(count)}
      renderItem={(item): ReactNode => <div style={{ height: ROW_HEIGHT_PX }}>{item.id}</div>}
      {...(resetScrollKey === undefined ? {} : { resetScrollKey })}
      {...(resetScrollReady === undefined ? {} : { resetScrollReady })}
    />
  );
}

interface ListProps {
  readonly count: number;
  readonly resetScrollKey?: string;
  readonly resetScrollReady?: boolean;
  readonly fadeEdge?: boolean;
}

/** The list inside a host with a bounded height, as every real call site gives it. */
function BoundedHost({ children }: { readonly children: ReactNode }): ReactElement {
  return <div style={{ height: WINDOW_HEIGHT_PX }}>{children}</div>;
}

/** A bounded window over many rows whose scope key and readiness the test drives with buttons. */
export function ResetHandshakeStory(): ReactElement {
  const [scope, setScope] = useState({ key: "scope-a", ready: true });
  return (
    <CtIsolation subject="VirtualList" isolates="The scope-reset handshake over a bounded window, without a data source">
      <Button onClick={(): void => setScope({ key: "scope-b", ready: false })}>Switch scope, rows pending</Button>
      <Button onClick={(): void => setScope((previous) => ({ ...previous, ready: true }))}>Rows arrived</Button>
      <Button onClick={(): void => setScope({ key: "scope-c", ready: true })}>Switch scope, rows ready</Button>
      <BoundedHost>
        <List count={MANY_ROWS} resetScrollKey={scope.key} resetScrollReady={scope.ready} />
      </BoundedHost>
    </CtIsolation>
  );
}

/** A bounded window with `fadeEdge`, over either more rows than the window or fewer. */
export function EdgeFadeStory({ count, fadeEdge }: { readonly count: number; readonly fadeEdge: boolean }): ReactElement {
  return (
    <CtIsolation subject="VirtualList" isolates="The bottom fade cue over a bounded window, without a data source">
      <BoundedHost>
        <List count={count} fadeEdge={fadeEdge} />
      </BoundedHost>
    </CtIsolation>
  );
}

const SHORT_HOST_PX = 240;
const CHROME_PX = 320;

/** A growing list under chrome taller than its scrolling parent: the parent's free space is nothing. */
export function ShortWindowStory({ count }: { readonly count: number }): ReactElement {
  return (
    <CtIsolation subject="VirtualList" isolates="A growing window under chrome that leaves its parent no free space">
      <div data-slot="short-host" style={{ display: "flex", flexDirection: "column", height: SHORT_HOST_PX, overflowY: "auto" }}>
        <div style={{ flexShrink: 0, height: CHROME_PX }}>Chrome</div>
        <VirtualList
          aria-label="Sample list"
          estimateSize={(): number => ROW_HEIGHT_PX}
          getItemKey={(item): string => item.id}
          grow={true}
          items={rowsOf(count)}
          renderItem={(item): ReactNode => (
            <button style={{ height: ROW_HEIGHT_PX }} type="button">
              {item.id}
            </button>
          )}
        />
      </div>
    </CtIsolation>
  );
}

class Catcher extends Component<{ readonly children: ReactNode }, { readonly caught: Error | null }> {
  override state = { caught: null as Error | null };
  static getDerivedStateFromError(error: Error): { caught: Error } {
    return { caught: error };
  }
  override render(): ReactNode {
    const { caught } = this.state;
    if (caught === null) {
      return this.props.children;
    }
    return (
      <p
        data-slot="caught"
        data-seal={caught instanceof UnboundedScrollHeightError ? caught.seal : undefined}
        data-tripwire={String(caught instanceof UnboundedScrollHeightError)}
      >
        caught
      </p>
    );
  }
}

function FailsToMount(): ReactElement {
  throw new Error("A mount failure that is not the tripwire");
}

/** The same list with NO bounded host, or (`unrelated`) a child whose mount fails for another reason: the control for the tripwire's identity. */
export function UnboundedStory({ count, unrelated = false }: { readonly count: number; readonly unrelated?: boolean }): ReactElement {
  return (
    <CtIsolation subject="VirtualList" isolates="The unbounded-window tripwire at mount, behind an error boundary">
      <Catcher>{unrelated ? <FailsToMount /> : <List count={count} />}</Catcher>
    </CtIsolation>
  );
}
