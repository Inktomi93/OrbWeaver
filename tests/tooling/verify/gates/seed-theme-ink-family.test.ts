import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as seedThemeInkContrast } from "../../../../tooling/src/verify/gates/seed-theme-ink-contrast.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("seed-theme-ink-contrast keeps its three-arm proofs", () => {
  expect(verifyPolicyProofs([seedThemeInkContrast])).toEqual([]);
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
