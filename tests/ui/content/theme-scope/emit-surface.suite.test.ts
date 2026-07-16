// The ThemeScope emit-COMPLETENESS gate (WS0) — drift-proofs the theme override API surface. The
// generated TOKENS map (packages/ui/src/tokens/index.ts, derived from tokens.json) is the single
// source of truth for what's themeable; this test proves `clampThemeTokens` can never emit a
// stale/typo'd `--*` custom property that doesn't trace back to a real token.
import { TOKENS } from "@orb/ui/tokens";
import { clampThemeTokens, THEME_SCOPE_EMIT_VARS } from "../../../../packages/ui/src/content/theme-scope/clamp";
import { expect, test } from "../../../support/fixtures";

const LEADING_DASHES_RE = /^--/u;

/** `--color-user-bubble-foreground` -> `color.user-bubble-foreground` (the TOKENS map's key shape). */
function cssVarToTokenPath(cssVar: string): string {
  const stripped = cssVar.replace(LEADING_DASHES_RE, "");
  const dashIndex = stripped.indexOf("-");
  return `${stripped.slice(0, dashIndex)}.${stripped.slice(dashIndex + 1)}`;
}

test("THEME_SCOPE_EMIT_VARS matches what clampThemeTokens ACTUALLY emits when every field is set", () => {
  // A fully-populated, all-legal override — every schema field gets a value that clears the clamp, so
  // the output is the full emit surface (not a subset short-circuited by a dropped field).
  const { vars } = clampThemeTokens({
    accent: "oklch(0.7 0.1 60)",
    userBubble: { bg: "oklch(0.3 0.01 60)", fg: "oklch(0.9 0.01 60)" },
    aiBubble: { bg: "oklch(0.25 0.01 60)", fg: "oklch(0.9 0.01 60)" },
    systemBubble: { bg: "oklch(0.28 0.01 60)", fg: "oklch(0.7 0.01 60)" },
    speaker: "oklch(0.72 0.175 52)",
    dialogueColor: "oklch(0.9 0.01 70)",
    narrationColor: "oklch(0.78 0.02 70)",
    bodyColor: "oklch(0.9 0.008 72)",
    font: "Geist",
    radius: "control",
    background: "oklch(0.158 0.006 60)",
    borderColor: "oklch(0.3 0.01 60)",
    chatStyle: "bubble",
    density: "compact",
  });
  expect(Object.keys(vars).sort()).toEqual([...THEME_SCOPE_EMIT_VARS].sort());
  // colorScheme is a struct axis (rides `color-scheme`, not a `--*` var) — it must NEVER appear in the
  // emit surface, or it would fail the round-trip-to-a-real-token assertion below.
  expect("colorScheme" in vars).toBe(false);
});

test.each(THEME_SCOPE_EMIT_VARS)("%s corresponds to a real token in the generated TOKENS map", (cssVar) => {
  const path = cssVarToTokenPath(cssVar);
  const token = TOKENS[path as keyof typeof TOKENS];
  expect(token, `${cssVar} -> TOKENS["${path}"] must exist`).toBeDefined();
  expect(token?.cssVar, `TOKENS["${path}"].cssVar must round-trip to ${cssVar}`).toBe(cssVar);
});
