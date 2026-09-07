// D71: the 9 semantic-intent tokens (destructive/success/warning/info/highlight ± foregrounds) are ONE
// static `light-dark(<light-arm>, <dark-arm>)` string in TOKENS — the browser resolves the active arm per
// `color-scheme`, but the static TOKENS literal does not. A CT `toHaveCSS` assertion compares against the
// browser's RESOLVED `oklch(...)` — so a raw `TOKENS[path].value` can never match once a token goes
// light-dark. The CT harness renders the base (dark) scheme, so `resolvedTokenColor` returns the dark arm
// by default; plain (non-light-dark) token values pass through unchanged.
import type { TokenPath } from "@orb/ui/tokens";
import { TOKENS } from "@orb/ui/tokens";

/** Splits `light-dark(A, B)`'s two top-level args, respecting nested parens (oklch(...) has none that
 * matter here, but this is depth-counted rather than comma-split so it stays correct if that changes). */
function splitTopLevelArgs(inner: string): [string, string] {
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
    } else if (char === "," && depth === 0) {
      return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
    }
  }
  throw new Error(`resolvedTokenColor: no top-level comma found in "${inner}"`);
}

/** The browser-resolved color for a token: the requested `light-dark()` arm (default "dark", matching the
 * CT harness's base scheme), or the value unchanged for a plain (non-light-dark) token. */
export function resolvedTokenColor(path: TokenPath, scheme: "light" | "dark" = "dark"): string {
  const value = TOKENS[path].value;
  const prefix = "light-dark(";
  const isLightDark = value.startsWith(prefix) && value.endsWith(")");
  if (isLightDark === false) {
    return value;
  }
  const inner = value.slice(prefix.length, -1);
  const [lightArm, darkArm] = splitTopLevelArgs(inner);
  return scheme === "light" ? lightArm : darkArm;
}
