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
 *  once in theme.css and never re-derived from a user override. Seeded from CURRENT reality
 *  (2026-07-09); task #16's audit burns this list down (either wires the token into
 *  THEME_SCOPE_EMIT_VARS + clamp.ts, or confirms it's intentionally static and documents that in
 *  clamp.ts directly, removing the entry here). */
const DOCUMENTED_STATIC = new Map<string, string>([
  [
    "--color-accent-foreground",
    "static base token (theme.css) — accent surface itself isn't user-overridable via ThemeScope yet; pending #16 audit",
  ],
  [
    "--color-destructive-foreground",
    "static base token (theme.css) — semantic destructive surface isn't themeable via ThemeScope; pending #16 audit",
  ],
  [
    "--color-highlight-foreground",
    "static base token (theme.css) — highlight surface isn't themeable via ThemeScope; pending #16 audit",
  ],
  [
    "--color-primary-foreground",
    "static base token (theme.css) — the accent picker sets --color-primary but its derived foreground isn't re-derived by ThemeScope (unlike bubble/neutral foregrounds); pending #16 audit",
  ],
  [
    "--color-secondary-foreground",
    "static base token (theme.css) — semantic secondary surface isn't themeable via ThemeScope; pending #16 audit",
  ],
  [
    "--color-success-foreground",
    "static base token (theme.css) — semantic success surface isn't themeable via ThemeScope; pending #16 audit",
  ],
  [
    "--color-warning-foreground",
    "static base token (theme.css) — semantic warning surface isn't themeable via ThemeScope; pending #16 audit",
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
