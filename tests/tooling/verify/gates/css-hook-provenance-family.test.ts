import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as directClientMechanism } from "../../../../tooling/src/verify/gates/css-family-direct-client-mechanism.ts";
import { gate as familyOwnership } from "../../../../tooling/src/verify/gates/css-family-ownership.ts";
import { gate as familyOwnershipHealth } from "../../../../tooling/src/verify/gates/css-family-ownership-health.ts";
import { gate as selectorWriter } from "../../../../tooling/src/verify/gates/css-selector-has-a-writer.ts";
import { gate as selectorWriterHealth } from "../../../../tooling/src/verify/gates/css-selector-has-a-writer-health.ts";
import { cssHookProvenanceFact } from "../../../../tooling/src/verify/lib/css-family-source-provenance.ts";
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

/** THE CONSUMER COUNT, HELD TWO-SIDED — #2305, `v-css-family-2026-09-13.md` ledger row 5.
 *
 *  Four prose homes said the `css-hook-provenance` fact had FIVE consumers by counting the FAMILY: both
 *  `-health` siblings declare `facts: []` and never call `ctx.fact`, so the real number is THREE. A prose
 *  count nothing holds is a §5b item-5 defect, and it recurs — so this pins BOTH halves and requires them to
 *  agree:
 *
 *    - the DECLARED half, off the loaded descriptors (`policy.facts`), which is what the runtime binds; and
 *    - the CALL half, a literal census of `ctx.fact(cssHookProvenanceFact)` over the whole gates directory,
 *      which is what the prose describes.
 *
 *  Either side moving without the other reds. The census carries its own PLANTED CONTROL in the same
 *  invocation — a bare zero from a text sweep is "I could not measure", never "it is not there". */
const GATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../tooling/src/verify/gates");
const CONSUMERS = ["css-family-direct-client-mechanism", "css-family-ownership", "css-selector-has-a-writer"];

test("the css-hook-provenance fact has exactly THREE consumers, declared and called, held two-sided", () => {
  // Typed as the CONTRACT rather than as the five literal descriptors: tsc narrows a `-health` module's
  // `facts` to `readonly []`, and `includes` on that takes `never` — the identity check is the point, so the
  // widening is where it belongs.
  const family: readonly GatePolicy[] = [familyOwnership, familyOwnershipHealth, directClientMechanism, selectorWriter, selectorWriterHealth];
  const declared = family
    .filter((policy) => policy.facts.includes(cssHookProvenanceFact))
    .map((policy) => policy.id)
    .toSorted((left, right) => left.localeCompare(right));

  expect(declared).toEqual(CONSUMERS);

  const modules = readdirSync(GATES_DIR).filter((name) => name.endsWith(".ts"));
  const called = modules
    .filter((name) => readFileSync(join(GATES_DIR, name), "utf8").includes("ctx.fact(cssHookProvenanceFact)"))
    .map((name) => name.replace(/\.ts$/u, ""))
    .toSorted((left, right) => left.localeCompare(right));
  // PLANTED POSITIVE CONTROL, same invocation: the sweep can see a `ctx.fact(` call at all.
  const anyFactCall = modules.filter((name) => readFileSync(join(GATES_DIR, name), "utf8").includes("ctx.fact(")).length;

  expect(modules.length).toBeGreaterThan(200);
  expect(anyFactCall).toBeGreaterThan(CONSUMERS.length);
  expect(called).toEqual(CONSUMERS);
});

/** Both `-health` siblings read the CSS identity ALONE — the half the overstated prose kept getting wrong. */
test("neither -health sibling declares the fact", () => {
  expect(familyOwnershipHealth.facts).toEqual([]);
  expect(selectorWriterHealth.facts).toEqual([]);
});
