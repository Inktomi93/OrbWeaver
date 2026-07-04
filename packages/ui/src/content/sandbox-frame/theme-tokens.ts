// The Zod boundary clamp for SandboxFrame's `themeTokens` prop (D44 §12.2 last-line defense). A
// caller that bypasses `<ThemeScope>` (its own Zod clamp, `content/theme-scope/clamp.ts`) could
// otherwise smuggle CSS through `srcdoc.ts`'s bare `CSS_ESCAPE` filter — this makes the sandbox-frame
// boundary reuse the SAME `isSafeColor` predicate ThemeScope uses instead of re-deriving a second,
// weaker one. Per-field drop (a bad entry is silently omitted), never a whole-object reject — matching
// `clampThemeTokens`'s own drop-per-field behavior.
import { z } from "zod";
import { isSafeColor } from "#lib";

const CUSTOM_PROP_KEY = /^--[\w-]+$/u;

const rawThemeTokensSchema = z.record(z.string(), z.string());

/**
 * Parses `themeTokens` and keeps only entries whose key is a `--*` custom-property name AND whose
 * value passes `isSafeColor` — no value reaches the srcdoc without passing the same clamp ThemeScope
 * applies at ITS boundary.
 */
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
