import { InputBorderFallbackReporterContext, ToneFallbackReporterContext } from "@orb/ui/theme-scope";
import type { ReactElement, ReactNode } from "react";
import { INPUT_BORDER_FALLBACK_REPORTER, TONE_FALLBACK_REPORTER } from "../lib/tone-fallback-log.ts";

/** Provides both ThemeScope fallback reporters to every scope below it. */
export function ThemeFallbackReporters({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <ToneFallbackReporterContext value={TONE_FALLBACK_REPORTER}>
      <InputBorderFallbackReporterContext value={INPUT_BORDER_FALLBACK_REPORTER}>{children}</InputBorderFallbackReporterContext>
    </ToneFallbackReporterContext>
  );
}
