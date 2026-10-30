import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { VirtualList } from "@orb/ui/virtual-list";
import type { ReactElement, ReactNode } from "react";
import { Component, useState } from "react";

const ROW_HEIGHT_PX = 40;
const WINDOW_HEIGHT_PX = 200;
const MANY_ROWS = 300;

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

class Catcher extends Component<{ readonly children: ReactNode }, { readonly caught: string | null }> {
  override state = { caught: null as string | null };
  static getDerivedStateFromError(error: Error): { caught: string } {
    return { caught: error.message };
  }
  override render(): ReactNode {
    return this.state.caught === null ? this.props.children : <p data-slot="caught">{this.state.caught}</p>;
  }
}

/** The same list with NO bounded host: its scroll element grows to its content. */
export function UnboundedStory({ count }: { readonly count: number }): ReactElement {
  return (
    <CtIsolation subject="VirtualList" isolates="The unbounded-window tripwire at mount, behind an error boundary">
      <Catcher>
        <List count={count} />
      </Catcher>
    </CtIsolation>
  );
}
