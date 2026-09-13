import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as seedThemeInkContrast } from "../../../../tooling/src/verify/gates/seed-theme-ink-contrast.ts";
import { collectCssFacts } from "../../../../tooling/src/verify/lib/css-resource-facts.ts";
import { parseCssStylesheet } from "../../../../tooling/src/verify/lib/css-rules.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { readSeedPalettes } from "../../../../tooling/src/verify/lib/seed-theme-ink.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("seed-theme-ink-contrast keeps its three-arm proofs", () => {
  expect(verifyPolicyProofs([seedThemeInkContrast])).toEqual([]);
});

/** THE NESTING ADJUDICATION (#2293 leg 2) — three cases, three verdicts, decided rather than inherited.
 *
 *  The fold onto the shared declaration facts replaced a balanced-body TEXT scan, and the shared reader
 *  assigns a declaration to its INNERMOST block. So a `--color-*` nested one level down inside `@theme` or
 *  inside a seed vanished from the palette: measured against the frozen pre-fold reader, case (a) lost
 *  `--color-y` and case (b) lost `--color-z`. Restoring the old behaviour wholesale was the WRONG repair —
 *  it also counted case (c), a declaration on a DESCENDANT element that never was the seed's palette.
 *
 *  The adjudication, held here because it is a claim about CSS semantics and no proof row can see a
 *  palette:
 *    (a)+(b) a conditional at-rule is an ARM of its palette — `<palette> @ <prelude>` — so BOTH the
 *            unconditional and the conditional value are judged, and the arm inherits the palette's
 *            polarity unless it declares its own;
 *    (c)     a nested PLAIN SELECTOR is NOT the palette, deliberately — the twin below is what makes that
 *            exclusion an assertion rather than an accident.
 *  A control with no nesting pins that the ordinary sheet is untouched. */
function palettesOf(text: string): readonly { readonly name: string; readonly scheme: string; readonly vars: readonly string[] }[] {
  const path = "packages/ui/src/styles/theme.css";
  const parsed = parseCssStylesheet(text);
  const file = { path, text, rules: parsed.rules, atRules: parsed.atRules, statements: parsed.statements };
  const facts = collectCssFacts([file]);
  return readSeedPalettes(
    file,
    facts.declarations.filter((declaration) => declaration.file === path),
  ).map((palette) => ({ name: palette.name, scheme: palette.scheme, vars: [...palette.vars.keys()].toSorted() }));
}

const BASE = "@theme {\n  --color-x: oklch(0.5 0.1 50);\n";

test("a conditional at-rule inside @theme is an ARM of the base palette, not a lost declaration", () => {
  const palettes = palettesOf(`${BASE}  @supports (color: oklch(0 0 0)) {\n    --color-y: oklch(0.6 0.1 50);\n  }\n}\n`);

  expect(palettes).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-x"] },
    { name: "hearth @ @supports (color: oklch(0 0 0))", scheme: "dark", vars: ["--color-x", "--color-y"] },
  ]);
});

test("a conditional at-rule inside a SEED is an arm of that seed, and INHERITS its polarity", () => {
  const palettes = palettesOf(
    `${BASE}}\n[data-theme="dusk"] {\n  color-scheme: light;\n  @media (prefers-contrast: more) {\n    --color-z: oklch(0.7 0.1 50);\n  }\n}\n`,
  );

  // `scheme: "light"` is the load-bearing cell: the arm takes the SEED's polarity, not the base's, so a
  // `light-dark()` value inside it collapses to the arm a reader on that seed actually sees.
  expect(palettes).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-x"] },
    { name: "dusk", scheme: "light", vars: ["--color-x"] },
    { name: "dusk @ @media (prefers-contrast: more)", scheme: "light", vars: ["--color-x", "--color-z"] },
  ]);
});

test("a nested PLAIN SELECTOR inside a seed is EXCLUDED on purpose — the twin of the two arms above", () => {
  const palettes = palettesOf(`${BASE}}\n[data-theme="dusk"] {\n  color-scheme: light;\n  & .x {\n    --color-w: oklch(0.8 0.1 50);\n  }\n}\n`);

  // NO third palette and NO `--color-w` anywhere: its subject is a descendant element, so a `text-<token>`
  // resting on the seed never resolves against it. The retired text scan counted it; that was the defect.
  expect(palettes).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-x"] },
    { name: "dusk", scheme: "light", vars: ["--color-x"] },
  ]);
});

test("an ordinary flat sheet is untouched by the ancestry read — the control", () => {
  const palettes = palettesOf(`${BASE}}\n[data-theme="dusk"] {\n  color-scheme: light;\n  --color-x: oklch(0.9 0.1 50);\n}\n`);

  expect(palettes).toEqual([
    { name: "hearth", scheme: "dark", vars: ["--color-x"] },
    { name: "dusk", scheme: "light", vars: ["--color-x"] },
  ]);
});

/** THE §4.3 GRANT-IDENTITY ARM, which a proof row cannot express: `runPolicyPass` inside a module's own rows
 *  pins `reviewedGrants: []`, so a reviewed-grant policy can prove nothing about consumption there.
 *
 *  This is the arm the conversion OWES, because the nine decorative-stroke rows were a gate-owned
 *  `ExemptionTable` until #2183 and §12.5 bans one. What the migration must not lose is the table's two-sided
 *  ratchet: the row licenses exactly the ink it names, and a row whose ink stopped being painted goes STALE
 *  rather than sitting forever. Both directions are asserted below, plus the wrong-operation control that
 *  says the identity is the (carrier, ink) PAIR and not the file. */
const SEEDS =
  "@theme {\n--color-background: oklch(0.98 0.004 75);\n--color-card: oklch(0.995 0.003 75);\n--color-popover: oklch(0.995 0.003 75);\n--color-surface-raised: oklch(0.965 0.005 75);\n--color-sidebar: oklch(0.955 0.006 72);\n--color-muted: oklch(0.95 0.006 70);\n--color-secondary: oklch(0.94 0.008 70);\n--color-accent: oklch(0.93 0.01 70);\n--color-track-1: oklch(0.93 0.02 145);\n}\n:root { color-scheme: light; }\n";
const CARRIER = "packages/ui/src/charts/meter/variants.ts";
const OVERLAY = {
  "packages/ui/src/styles/theme.css": SEEDS,
  "packages/ui/src/styles/globals.css": "@layer base {}\n",
  "packages/ui/src/styles/tiers.css": "@layer utilities {}\n",
  "packages/client/src/styles/globals.css": "@layer base {}\n",
  "packages/client/src/features/app-shell/surfaces/shell.css": ".shell {}\n",
  [CARRIER]: "import { tv } from 'tailwind-variants';\nexport const meter = tv({ base: 'text-track-1' });",
} as const;

function grant(subject: string, operation: string): ReviewedGateGrant {
  return {
    // The id is DERIVED from the identity, never a shared literal: two rows sharing an id reconcile as one
    // and the stale arm below reads clean (measured — that is how this test first passed for the wrong
    // reason).
    id: `seed-theme-ink-contrast:probe:${subject}:${operation}`,
    policyId: "seed-theme-ink-contrast",
    subject,
    operation,
    why: "probe row",
    endsWhen: "the probe ends",
  };
}

function pass(scratch: string, grants: readonly ReviewedGateGrant[]): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.createSourceFile(`${scratch}/${CARRIER}`, OVERLAY[CARRIER], { overwrite: true });
  return runPolicyPass({
    knownPolicies: [seedThemeInkContrast],
    policies: [seedThemeInkContrast],
    root: scratch,
    project,
    resourceOptions: { overlay: OVERLAY },
    reviewedGrants: grants,
    failOnWarnings: false,
  });
}

test("the exact (carrier, ink) grant consumes the decorative candidate once and leaves no alarm", ({ scratch }) => {
  const result = pass(scratch, [grant(CARRIER, "ink:track-1")]);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("a grant naming the FILE but the wrong ink licenses nothing, and stales — the identity is the pair", ({ scratch }) => {
  const result = pass(scratch, [grant(CARRIER, "ink:track-9")]);

  expect(result.authority.effectiveFindings.map(({ operation }) => operation)).toEqual(["ink:track-1"]);
  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["stale-reviewed-grant"]);
});

test("a grant whose ink stopped being painted is STALE — the two-sided ratchet the retired table owned by hand", ({ scratch }) => {
  const result = pass(scratch, [grant(CARRIER, "ink:track-1"), grant("packages/ui/src/primitives/switch/variants.ts", "ink:background")]);

  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["stale-reviewed-grant"]);
});

/** The nine migrated rows, held two-sided against the module they license. A row added for a policy that
 *  cannot report its identity shape would pass every other check in the tree. */
test("every seed-theme-ink grant names an ink operation on a ui carrier", () => {
  const rows = REVIEWED_GRANTS.filter(({ policyId }) => policyId === "seed-theme-ink-contrast");

  expect(rows).toHaveLength(9);
  expect(rows.every(({ operation }) => operation.startsWith("ink:"))).toBe(true);
  expect(rows.every(({ subject }) => subject.startsWith("packages/ui/src/"))).toBe(true);
});
