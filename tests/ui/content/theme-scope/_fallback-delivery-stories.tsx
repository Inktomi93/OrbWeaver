import { CtIsolation } from "@orb/testkit/browser";
import type { InputBorderFallback, ToneFallback } from "@orb/ui/theme-scope";
import { InputBorderFallbackReporterContext, ThemeScope, ToneFallbackReporterContext } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { useState } from "react";

/**
 * Two carried scopes under both reporter contexts: one whose accent shares no ink with its solid steps (the D336 fallback)
 * and one whose edge cannot sit below any ring on the accent's hue (the D159 fallback). Each delivery is logged as it lands.
 */
export function FallbackDeliveryStory({
  toneBackground,
  toneAccent,
  edgeBackground,
  edgeAmbientAccent,
}: {
  readonly toneBackground: string;
  readonly toneAccent: string;
  readonly edgeBackground: string;
  readonly edgeAmbientAccent: string;
}): ReactElement {
  const [tone, setTone] = useState<readonly ToneFallback[]>([]);
  const [edge, setEdge] = useState<readonly InputBorderFallback[]>([]);
  // Stable identities, as the app shell's module-level reporters are: a new function per render would redeliver.
  const [reportTone] = useState(
    () =>
      (fallback: ToneFallback): void =>
        setTone((previous) => [...previous, fallback]),
  );
  const [reportEdge] = useState(
    () =>
      (fallback: InputBorderFallback): void =>
        setEdge((previous) => [...previous, fallback]),
  );
  return (
    <CtIsolation subject="ThemeScope fallback reporters" isolates="Delivery of the D336 and D159 fallbacks to the reporter contexts a host provides">
      <ToneFallbackReporterContext value={reportTone}>
        <InputBorderFallbackReporterContext value={reportEdge}>
          <ThemeScope tokens={{ background: toneBackground, accent: toneAccent }}>
            <p>Tone scope</p>
          </ThemeScope>
          <ThemeScope ambientAccent={edgeAmbientAccent} tokens={{ background: edgeBackground }}>
            <p>Edge scope</p>
          </ThemeScope>
        </InputBorderFallbackReporterContext>
      </ToneFallbackReporterContext>
      <output data-slot="tone-log">{JSON.stringify(tone)}</output>
      <output data-slot="edge-log">{JSON.stringify(edge)}</output>
    </CtIsolation>
  );
}
