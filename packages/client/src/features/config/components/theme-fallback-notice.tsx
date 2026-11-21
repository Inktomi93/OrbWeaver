// Tells the person editing a theme which contrast bound its own colours made the app relax (D159). The notice reads
// the same fallback report ThemeScope delivers to the app shell, from a childless scope that judges the draft theme.
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { InputBorderFallback, ThemeScopeTokens } from "@orb/ui/theme-scope";
import { InputBorderFallbackReporterContext, ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { useState } from "react";

/** The fallback reported for one draft, keyed by the draft it judged: a scope reports a fallback, never its absence. */
interface DraftReports {
  readonly draft: string;
  readonly edge?: InputBorderFallback;
}

/** The draft fields a fallback depends on: the D159 edge solve reads the background and the accent's ring. Every other field leaves the report unchanged. */
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
  // Stable identity, as the shell's reporter is: a new function per render would redeliver the same fallback.
  const [reportEdge] = useState(
    () =>
      (edge: InputBorderFallback): void =>
        setReports((previous) => ({ ...previous, edge })),
  );
  return (
    <>
      <InputBorderFallbackReporterContext value={reportEdge}>
        {/* Keyed by the draft, so a changed theme mounts a fresh scope whose report replaces the reset one. */}
        <ThemeScope key={draft} box="hidden" tokens={tokens}>
          {null}
        </ThemeScope>
      </InputBorderFallbackReporterContext>
      {/* A live region announces only content added after it mounts, so it stays rendered while empty; out of flow
          while empty, it adds no gap to the section. */}
      <Stack data-slot="theme-fallback-notice" gap="field" placed="outWhileEmpty" role="status">
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
