import { createContext } from "react";
import type { InputBorderFallback } from "./derive-vars.ts";

/** Receives the D159 form-control edge fallback a scope took (`ClampedTheme.inputBorderFallback`), once per scope and edge. */
export const InputBorderFallbackReporterContext = createContext<((fallback: InputBorderFallback) => void) | null>(null);
InputBorderFallbackReporterContext.displayName = "InputBorderFallbackReporterContext";
