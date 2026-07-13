// Boundary clamp for SandboxFrame's `themeTokens` prop, reusing the SAME `isSafeColor` predicate
// `<ThemeScope>` uses instead of re-deriving a second, weaker one. Per-field drop, never a whole-object reject.
import { z } from "zod";
import { isSafeColor } from "#lib";

const CUSTOM_PROP_KEY = /^--[\w-]+$/u;

const rawThemeTokensSchema = z.record(z.string(), z.string());

/** Keeps only entries whose key is a `--*` custom-property name and whose value passes `isSafeColor`. */
export function clampSandboxThemeTokens(raw: unknown): Readonly<Record<string, string>> {
  const parsed = rawThemeTokensSchema.safeParse(raw);
  if (!parsed.success) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (CUSTOM_PROP_KEY.test(key) && isSafeColor(value)) {
      out[key] = value;
    }
  }
  return out;
}
