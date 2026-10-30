import { createContext } from "react";
import type { ToneFallback } from "./clamp.ts";
import type { InputBorderFallback } from "./derive-vars.ts";

/**
 * Receives the D336 primary fallback a scope took (`ClampedTheme.toneFallback`), once per scope and fallback. The
 * app provides a development logger; with no provider a fallback stays silent, and the paint holds the floor either way.
 */
export const ToneFallbackReporterContext = createContext<((fallback: ToneFallback) => void) | null>(null);

/** Receives the D159 form-control edge fallback a scope took (`ClampedTheme.inputBorderFallback`), once per scope and edge. */
export const InputBorderFallbackReporterContext = createContext<((fallback: InputBorderFallback) => void) | null>(null);
