// The theme-emit PAIRING gate (enforcement half of task #16 — the audit lane extends this test).
// Every `--color-*-foreground` (and its paired-chrome `-border` twin, e.g. `--color-sidebar-border`)
// custom property CONSUMED anywhere in packages/{ui,client}/src (a Tailwind utility class like
// `text-primary-foreground` OR a raw `var(--color-*-foreground)`/`var(--color-*-border)`) must be
// either part of ThemeScope's dynamic emit surface (THEME_SCOPE_EMIT_VARS, clamp.ts) or explicitly
// allowlisted below as a STATIC base token (defined once in theme.css, never user-overridden). A
// consumed token in neither bucket is a silent gap: a user overrides the surface it pairs with but the
// paired foreground/border never re-derives — the exact defect class D44 §12.1 exists to prevent.
//
// Homed per the token freshness-test precedent (tests/ui/tokens/index.test.ts) — a token-SURFACE
// invariant, not a component behavior test.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { THEME_SCOPE_EMIT_VARS } from "../../../packages/ui/src/content/theme-scope/clamp";
import { expect, test } from "../../support/fixtures";

const ROOTS = ["packages/ui/src", "packages/client/src"];
const SCAN_EXT_RE = /\.(?:tsx|ts|css)$/u;

// Custom-property text: `var(--color-<name>-foreground)` / `var(--color-<name>-border)`.
const VAR_RE = /--color-[a-z0-9-]+-(?:foreground|border)/gu;
// Tailwind utility classes over the same suffix: `text-primary-foreground`, `bg-sidebar-border`, etc.
const UTILITY_RE = /\b(?:text|bg|border|ring|fill|stroke)-([a-z0-9-]+-(?:foreground|border))\b/gu;

/** Every `--color-*-(foreground|border)` name a single file's text consumes. */
function scanFile(abs: string, found: Set<string>): void {
  const text = readFileSync(abs, "utf8");
  for (const m of text.matchAll(VAR_RE)) {
    found.add(m[0]);
  }
  for (const m of text.matchAll(UTILITY_RE)) {
    const suffix = m[1];
    if (suffix !== undefined) {
      found.add(`--color-${suffix}`);
    }
  }
}

/** Every consumed `--color-*-(foreground|border)` custom-property name, deduped, across ROOTS. */
function walkDir(dir: string, found: Set<string>): void {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      walkDir(abs, found);
      continue;
    }
    if (SCAN_EXT_RE.test(entry)) {
      scanFile(abs, found);
    }
  }
}

function scanConsumedVars(): Set<string> {
  const found = new Set<string>();
  for (const root of ROOTS) {
    walkDir(root, found);
  }
  return found;
}

/** STATIC base tokens: consumed but not part of ThemeScope's dynamic emit surface — each is defined
 *  once in theme.css and never re-derived from a user override. #16 AUDITED this list: `accent`- and
 *  `primary`-foreground graduated to the dynamic emit surface (clamp.ts now derives them — the accent
 *  surface joined the neutral ramp, and primary-foreground flips off the picked accent). The 2026-07-09
 *  chrome-theming lane graduated `secondary`-foreground too — `--color-secondary` joined the derived
 *  neutral ramp (alongside `muted` + `sidebar-accent`), so its fg now derives with it. The FOUR that
 *  remain are audited-static by construction — each pairs with a SEMANTIC-INTENT surface (destructive /
 *  success / warning / highlight), and NONE of those bases is in the ThemeScope override subset (D44
 *  §12.1: the subset is accent + per-role bubbles + name + RP prose + font/radius/background — no
 *  semantic-intent tokens). A base that can never be overridden needs no derived foreground: the fg/bg
 *  pair stays internally consistent under every theme. (AA of each pair is proven by the seed-palette-
 *  contrast enforcement test, not asserted here.) */
const DOCUMENTED_STATIC = new Map<string, string>([
  [
    "--color-destructive-foreground",
    "audited-static (#16) — the destructive semantic surface is outside the ThemeScope override subset (§12.1); a fixed base needs no derived fg. Pair is a deliberately-accepted 3.65:1 solid button (UIP-101, treated at the 3:1 UI floor).",
  ],
  [
    "--color-highlight-foreground",
    "audited-static (#16) — the highlight (search-match) semantic surface is outside the ThemeScope override subset (§12.1); a fixed base needs no derived fg.",
  ],
  [
    "--color-success-foreground",
    "audited-static (#16) — the success semantic surface is outside the ThemeScope override subset (§12.1); a fixed base needs no derived fg.",
  ],
  [
    "--color-warning-foreground",
    "audited-static (#16) — the warning semantic surface is outside the ThemeScope override subset (§12.1); a fixed base needs no derived fg.",
  ],
]);

test("every consumed --color-*-foreground/-border custom property is emitted by ThemeScope or documented as static (#16)", () => {
  const emitted = new Set<string>(THEME_SCOPE_EMIT_VARS);
  const consumed = scanConsumedVars();
  const unaccounted = [...consumed]
    .filter((name) => !(emitted.has(name) || DOCUMENTED_STATIC.has(name)))
    .sort();
  expect(
    unaccounted,
    "consumed but neither emitted by ThemeScope (clamp.ts THEME_SCOPE_EMIT_VARS) nor documented in " +
      "DOCUMENTED_STATIC (tests/ui/tokens/theme-emit-pairing.test.ts) — a token that pairs with a " +
      "themeable surface but never re-derives is the D44 §12.1 gap class",
  ).toEqual([]);
});

test("DOCUMENTED_STATIC entries are all still actually consumed (no stale rows)", () => {
  const consumed = scanConsumedVars();
  const stale = [...DOCUMENTED_STATIC.keys()].filter((name) => !consumed.has(name)).sort();
  expect(stale, "DOCUMENTED_STATIC entry no longer consumed — delete the stale row").toEqual([]);
});

test("DOCUMENTED_STATIC entries are NOT already covered by THEME_SCOPE_EMIT_VARS (no dead allowlist rows)", () => {
  const emitted = new Set<string>(THEME_SCOPE_EMIT_VARS);
  const redundant = [...DOCUMENTED_STATIC.keys()].filter((name) => emitted.has(name));
  expect(redundant, "DOCUMENTED_STATIC entry already emitted by ThemeScope — delete it").toEqual(
    [],
  );
});
