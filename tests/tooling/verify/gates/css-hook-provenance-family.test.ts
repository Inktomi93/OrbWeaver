import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as directClientMechanism } from "../../../../tooling/src/verify/gates/css-family-direct-client-mechanism.ts";
import { gate as familyOwnership } from "../../../../tooling/src/verify/gates/css-family-ownership.ts";
import { gate as familyOwnershipHealth } from "../../../../tooling/src/verify/gates/css-family-ownership-health.ts";
import { gate as selectorWriter } from "../../../../tooling/src/verify/gates/css-selector-has-a-writer.ts";
import { gate as selectorWriterHealth } from "../../../../tooling/src/verify/gates/css-selector-has-a-writer-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** The five `mode: "resource"` policies each materialise a temp repository per row. Measured well over
 *  vitest's 5s default on a loaded box. */
const PROOF_BUDGET_MS = 120_000;

test(
  "the css-hook-provenance family keeps every declared proof arm",
  () => {
    expect(verifyPolicyProofs([familyOwnership, familyOwnershipHealth, directClientMechanism, selectorWriter, selectorWriterHealth])).toEqual([]);
  },
  PROOF_BUDGET_MS,
);

/** THE §4.3 GRANT-IDENTITY ARM, which a proof row cannot express: `runPolicyPass` inside a module's own rows
 *  pins `reviewedGrants: []`, so a reviewed-grant policy proves nothing about CONSUMPTION there.
 *
 *  This is the arm the conversion OWES, because the three bounded direct-skin recipes were
 *  `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS` — three hand-spelled COUNTS in `lib/css-family-census.ts` — until
 *  #2181, and §12.5 bans a count ratchet. What the migration must not lose is the count's two-sided ratchet:
 *  the row licenses exactly the recipe it names, and a recipe that stopped being painted goes STALE rather
 *  than sitting forever. Both directions are below, plus the wrong-operation control that says the identity
 *  is the (carrier, hook) PAIR and not the file. */
const CLIENT_GLOBALS = "packages/client/src/styles/globals.css";
const DIALOG = "packages/ui/src/primitives/dialog.tsx";
const OVERLAY = {
  "packages/ui/src/styles/theme.css": "@theme {\n  --color-background: black;\n}\n",
  "packages/ui/src/styles/globals.css": ":root { font-size: 100%; }\n",
  "packages/ui/src/styles/tiers.css": '[data-surface-tier="base"] { --spacing-x: 0; }\n',
  [CLIENT_GLOBALS]: 'html [data-slot="dialog-popup"] { border-radius: 1rem; }\n',
  "packages/client/src/features/app-shell/surfaces/shell.css": ":root { view-transition-name: none; }\n",
} as const;

function grant(subject: string, operation: string): ReviewedGateGrant {
  // The id is DERIVED from the identity, never a shared literal: two rows sharing an id reconcile as one and
  // the stale arm below reads clean.
  return {
    id: `css-family-direct-client-mechanism:probe:${subject}:${operation}`,
    policyId: "css-family-direct-client-mechanism",
    subject,
    operation,
    why: "probe row",
    endsWhen: "the probe ends",
  };
}

function pass(scratch: string, grants: readonly ReviewedGateGrant[]): PolicyPassResult {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.createSourceFile(`${scratch}/${DIALOG}`, 'export const dialog = <div data-slot="dialog-popup" />;\n', { overwrite: true });
  return runPolicyPass({
    knownPolicies: [directClientMechanism],
    policies: [directClientMechanism],
    root: scratch,
    project,
    resourceOptions: { overlay: OVERLAY },
    reviewedGrants: grants,
    failOnWarnings: false,
  });
}

test("the exact (carrier, hook) grant consumes the ruled recipe once and leaves no alarm", ({ scratch }) => {
  const result = pass(scratch, [grant(CLIENT_GLOBALS, "direct-client-mechanism:slot:dialog-popup")]);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
});

test("a grant naming the CARRIER but the wrong hook licenses nothing, and stales — the identity is the pair", ({ scratch }) => {
  const result = pass(scratch, [grant(CLIENT_GLOBALS, "direct-client-mechanism:slot:tooltip-popup")]);

  expect(result.authority.effectiveFindings.map(({ operation }) => operation)).toEqual(["direct-client-mechanism:slot:dialog-popup"]);
  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["stale-reviewed-grant"]);
});

test("a grant whose recipe stopped being painted is STALE — the two-sided ratchet the retired count owned by hand", ({ scratch }) => {
  const result = pass(scratch, [
    grant(CLIENT_GLOBALS, "direct-client-mechanism:slot:dialog-popup"),
    grant(CLIENT_GLOBALS, "direct-client-mechanism:slot:message-list-scroll"),
  ]);

  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["stale-reviewed-grant"]);
});

/** The three migrated rows, held two-sided against the policy they license. A row added for a policy that
 *  cannot report its identity shape would pass every other check in the tree. */
test("every direct-client-mechanism grant names a slot operation on the client globals carrier", () => {
  const rows = REVIEWED_GRANTS.filter(({ policyId }) => policyId === "css-family-direct-client-mechanism");

  expect(rows).toHaveLength(3);
  expect(rows.every(({ operation }) => operation.startsWith("direct-client-mechanism:slot:"))).toBe(true);
  expect(rows.every(({ subject }) => subject === CLIENT_GLOBALS)).toBe(true);
});
