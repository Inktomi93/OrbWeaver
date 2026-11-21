import { CtIsolation } from "@orb/testkit/browser";
import type { InputBorderFallback } from "@orb/ui/theme-scope";
import { InputBorderFallbackReporterContext, ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { useState } from "react";

/** A carried scope whose edge cannot sit below any ring on the accent's hue (the D159 fallback), under the reporter context. Each delivery is logged as it lands. */
export function FallbackDeliveryStory({
  edgeBackground,
  edgeAmbientAccent,
}: {
  readonly edgeBackground: string;
  readonly edgeAmbientAccent: string;
}): ReactElement {
  const [edge, setEdge] = useState<readonly InputBorderFallback[]>([]);
  // Stable identity, as the app shell's module-level reporter is: a new function per render would redeliver.
  const [reportEdge] = useState(
    () =>
      (fallback: InputBorderFallback): void =>
        setEdge((previous) => [...previous, fallback]),
  );
  return (
    <CtIsolation subject="ThemeScope fallback reporter" isolates="Delivery of the D159 fallback to the reporter context a host provides">
      <InputBorderFallbackReporterContext value={reportEdge}>
        <ThemeScope ambientAccent={edgeAmbientAccent} tokens={{ background: edgeBackground }}>
          <p>Edge scope</p>
        </ThemeScope>
      </InputBorderFallbackReporterContext>
      <output data-slot="edge-log">{JSON.stringify(edge)}</output>
    </CtIsolation>
  );
}
