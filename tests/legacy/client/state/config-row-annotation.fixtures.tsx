// CT harness for the setting-row annotation seam (not a spec — Playwright CT needs mounted components in
// their own module, and biome forbids exporting a component from a `.ct.tsx`).
//
// The annotation carries a FUNCTION (`onHintClick`), which does not survive the CT prop wire, so the value
// is built HERE in the module that executes in the browser. The door's firing is mirrored into a marker so
// the spec asserts the HANDLER ran rather than a repaint.

import { ConfigRowAnnotationProvider, useConfigRowAnnotation } from "@orb/client/state";
import type { ReactElement } from "react";
import { useState } from "react";

/** One consumer, rendering what it can see — `none` when the ambient annotation is null — plus the DOOR,
 *  so the spec activates the real `onHintClick` off the context rather than a stand-in handler.
 *
 *  The `data-testid` is stamped by the CALLER as a LITERAL, never threaded through a prop: `testid-liveness`
 *  reads the tree statically, and an id it cannot see is an id it reports as dead. */
function Readout(): ReactElement {
  const annotation = useConfigRowAnnotation();
  if (annotation === null) {
    return <>none</>;
  }
  return (
    <>
      {annotation.gloss}|{annotation.hint}
    </>
  );
}

/** The DOOR, as its own element OUTSIDE the readout — a button nested inside the `<output>` would land in
 *  that element's text and make `toHaveText` assert the button's label too. */
function AnnotationDoor(): ReactElement | null {
  const annotation = useConfigRowAnnotation();
  return annotation === null ? null : (
    <button onClick={annotation.onHintClick} type="button">
      open the teacher
    </button>
  );
}

export interface ConfigRowAnnotationProbeProps {
  /** Wrap the inner consumers in a provider. @defaultValue false — the no-provider read. */
  readonly provide?: boolean;
}

/** An OUTER consumer (never under a provider), an INNER one (under it), and a NESTED one inside the `null`
 *  re-publish a composite row wraps its dependents in. */
export function ConfigRowAnnotationProbe({ provide = false }: ConfigRowAnnotationProbeProps): ReactElement {
  const [fired, setFired] = useState(0);
  const inner = (
    <>
      <output data-testid="annotation-inner">
        <Readout />
      </output>
      <AnnotationDoor />
      <ConfigRowAnnotationProvider value={null}>
        <output data-testid="annotation-nested">
          <Readout />
        </output>
      </ConfigRowAnnotationProvider>
    </>
  );
  return (
    <div>
      <output data-testid="annotation-outer">
        <Readout />
      </output>
      {provide ? (
        <ConfigRowAnnotationProvider
          value={{ gloss: "Tints quoted speech.", hint: "Affects quoted dialogue.", onHintClick: (): void => setFired((n) => n + 1) }}
        >
          {inner}
        </ConfigRowAnnotationProvider>
      ) : null}
      <output data-testid="door-fired">{String(fired)}</output>
    </div>
  );
}
