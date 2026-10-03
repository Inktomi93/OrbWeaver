import { ActionBar } from "@orb/ui/action-bar";
import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useRef, useState } from "react";

function PrimaryCounter(): ReactElement {
  const [count, setCount] = useState(0);
  return (
    <Button aria-label={`Primary ${count}`} intent="ghost" size="icon" onClick={(): void => setCount(count + 1)}>
      P
    </Button>
  );
}

export function ActionBarFixture(): ReactElement {
  const [extra, setExtra] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [refSlot, setRefSlot] = useState("");
  const root = useRef<HTMLDivElement>(null);
  return (
    <div>
      <button type="button" onClick={(): void => setExtra(!extra)}>
        Toggle extra
      </button>
      <button type="button" onClick={(): void => setPlaced(!placed)}>
        Toggle placed
      </button>
      <button type="button" onClick={(): void => setRefSlot(root.current?.dataset["slot"] ?? "missing")}>
        Read ref
      </button>
      <output aria-label="Ref slot">{refSlot}</output>
      <div data-slot="action-bar-host" style={{ width: 400 }}>
        <ActionBar
          ref={root}
          leading={
            <Row gap="field">
              <Button aria-label="Options" intent="ghost" size="icon">
                O
              </Button>
              <Button aria-label="Tools" intent="ghost" size="icon">
                T
              </Button>
            </Row>
          }
          primary={
            <Row gap="field">
              <PrimaryCounter />
              <Button aria-label="Swipe" intent="ghost" size="icon">
                S
              </Button>
              <Button aria-label="Reply" intent="ghost" size="icon">
                R
              </Button>
              <Button aria-label="Continue" intent="ghost" size="icon">
                C
              </Button>
              {extra ? (
                <Button aria-label="Stop draft" intent="ghost" size="icon">
                  X
                </Button>
              ) : null}
            </Row>
          }
          fill={
            placed ? (
              <Row aria-label="Placed actions" className="flex-1" gap="field" role="group">
                <Button aria-label="Placed" intent="ghost" size="icon">
                  A
                </Button>
              </Row>
            ) : null
          }
          trailing={
            <Button aria-label="Send" intent="primary" size="icon">
              S
            </Button>
          }
        />
      </div>
    </div>
  );
}
