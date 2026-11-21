import { InputBorderFallbackReporterContext } from "@orb/ui/theme-scope";
import type { ReactElement, ReactNode } from "react";
import { INPUT_BORDER_FALLBACK_REPORTER } from "../lib/theme-fallback-log.ts";

/** Provides the ThemeScope fallback reporter to every scope below it. */
export function ThemeFallbackReporters({ children }: { readonly children: ReactNode }): ReactElement {
  return <InputBorderFallbackReporterContext value={INPUT_BORDER_FALLBACK_REPORTER}>{children}</InputBorderFallbackReporterContext>;
}
