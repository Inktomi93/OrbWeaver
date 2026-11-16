import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Markdown } from "@orb/ui/markdown";
import type { ReactElement } from "react";
import { useLayoutEffect, useState } from "react";

interface OversizedBodyProps {
  /** The body is this unit repeated `repeat` times, built in the page so the mount carries no megabytes. */
  readonly unit: string;
  readonly repeat: number;
  readonly drawLabel: string;
  /** The root dataset key the commit's clock reading goes into. */
  readonly drawnKey: string;
}

function Drawn({ body, drawnKey }: { readonly body: string; readonly drawnKey: string }): ReactElement {
  useLayoutEffect(() => {
    document.documentElement.dataset[drawnKey] = String(performance.now());
  }, [drawnKey]);
  return (
    <Markdown trust="untrusted" mode="static">
      {body}
    </Markdown>
  );
}

/** The untrusted Markdown door drawing one long body when the control is pressed; the commit records its clock. */
export function OversizedBodyStory({ unit, repeat, drawLabel, drawnKey }: OversizedBodyProps): ReactElement {
  const [body, setBody] = useState<string | null>(null);
  return (
    <CtIsolation subject="Markdown oversized body" isolates="The Markdown renderer alone, without a message row or a room">
      <Button onClick={(): void => setBody(unit.repeat(repeat))}>{drawLabel}</Button>
      {body === null ? null : <Drawn body={body} drawnKey={drawnKey} />}
    </CtIsolation>
  );
}
