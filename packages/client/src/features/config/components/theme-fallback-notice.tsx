// Tells the person editing a theme which contrast bound its own colours made the app relax (D336, D159). The notice reads
// the same fallback reports ThemeScope delivers to the app shell, from a childless scope that judges the draft theme.
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { InputBorderFallback, ThemeScopeTokens, ToneFallback } from "@orb/ui/theme-scope";
import { InputBorderFallbackReporterContext, ThemeScope, ToneFallbackReporterContext } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { useState } from "react";

/** The fallbacks reported for one draft, keyed by the draft they judged: a scope reports a fallback, never its absence. */
interface DraftReports {
  readonly draft: string;
  readonly tone?: ToneFallback;
  readonly edge?: InputBorderFallback;
}

/**
 * The draft fields a fallback depends on: the D336 primary solve reads the accent over the background, and the D159 edge
 * solve reads the background and the accent's ring. Every other field leaves both reports unchanged.
 */
export interface FallbackDraft {
  readonly background: string | undefined;
  readonly accent: string | undefined;
}

/** The relaxed-bound notice for the theme being edited; its status region stays mounted and empty while every bound holds. */
export function ThemeFallbackNotice({ background, accent }: FallbackDraft): ReactElement {
  const tokens: ThemeScopeTokens = { ...(background === undefined ? {} : { background }), ...(accent === undefined ? {} : { accent }) };
  const draft = JSON.stringify(tokens);
  const [reports, setReports] = useState<DraftReports>({ draft });
  if (reports.draft !== draft) {
    setReports({ draft });
  }
  // Stable identities, as the shell's reporters are: a new function per render would redeliver the same fallback.
  const [reportTone] = useState(
    () =>
      (tone: ToneFallback): void =>
        setReports((previous) => ({ ...previous, tone })),
  );
  const [reportEdge] = useState(
    () =>
      (edge: InputBorderFallback): void =>
        setReports((previous) => ({ ...previous, edge })),
  );
  return (
    <>
      <ToneFallbackReporterContext value={reportTone}>
        <InputBorderFallbackReporterContext value={reportEdge}>
          {/* Keyed by the draft, so a changed theme mounts a fresh scope whose reports replace the reset ones. */}
          <ThemeScope key={draft} className="hidden" tokens={tokens}>
            {null}
          </ThemeScope>
        </InputBorderFallbackReporterContext>
      </ToneFallbackReporterContext>
      {/* A live region announces only content added after it mounts, so it stays rendered while empty; out of flow
          while empty, it adds no gap to the section. */}
      <Stack className="empty:absolute" data-slot="theme-fallback-notice" gap="field" role="status">
        {reports.tone === undefined ? null : (
          <Text data-fallback="tone" tone="warning" voice="gloss">
            {`No one label colour reads on this accent and its hover and pressed shades, so buttons deepen those shades to ${reports.tone.hover}% and ${reports.tone.active}% of the accent.`}
          </Text>
        )}
        {reports.edge === undefined ? null : (
          <Text data-fallback="input-border" tone="warning" voice="gloss">
            {reports.edge.floorMet
              ? "Form-field edges hold 3:1 contrast on this background, but the focus ring cannot stand out above them."
              : "Form-field edges cannot reach 3:1 contrast on every panel of this background."}
          </Text>
        )}
      </Stack>
    </>
  );
}
