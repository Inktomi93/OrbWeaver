// The standing family floor for `union-axis` — the #1584 conversion of the legacy `no-inline-union-redecl`
// descriptor into ONE ordinary policy reading `lib/union-axis.ts`. What a declared proof row structurally
// cannot express lives here:
//
//   §4.2 — the ordinary identity arm, ALL THREE assertions (`effectiveFindings []`, `waivedFindings 1`,
//          `authorityAlarms []`), once per ARM, because the two arms anchor differently: arm A on the
//          ALIAS NAME, arm B on the inline SET's own source text. A `mustPass` row asserts only the first.
//   §4.5 — the policy is `entire-population` and that is the whole reason the field exists here: arm B
//          matches a re-spell in one package against a tuple homed in ANOTHER, so a request admitting only
//          the re-speller would "prove" the axis has no home and report nothing. A proper subset must
//          DEFER, not partially run.
//   §4.6 — the conversion differential against the frozen legacy descriptor at 2030ab180, replayed over
//          each legacy example's OWN file map. Legacy-side coverage is stated per example rather than
//          averaged: 5 of the 10 legacy examples flag, covering both arms and all three legacy token
//          sub-kinds, so the replay is evidence rather than a vacuous zero-vs-zero. ONE classified
//          difference: POSITION/TOKEN. Every legacy token was a synthetic discriminator label (`union
//          Mode`, `re-spell AXIS`, `z.enum re-spell MODE`) that appears in no source file and THROWS under
//          `report.node`'s exact-slice validation; each becomes an authored slice, and arm B's z.enum
//          sub-kind additionally moves from the CALL to its ARRAY argument (a call's text carries parens,
//          which the marker grammar's `[^()\r\n]+` position group cannot hold).
import { Project } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as unionRedecl } from "../../../../tooling/src/verify/gates/no-inline-union-redecl.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/union-axis-family";
const FAMILY: readonly GatePolicy[] = [unionRedecl];
const HOME = "packages/contracts/src/axis-home.ts";
const RESPELL = "packages/server/src/axis-respell.ts";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(files: Readonly<Record<string, string>>, requestedPaths?: readonly string[]): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: FAMILY,
    policies: FAMILY,
    root: ROOT,
    project: projectOf(files),
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("the union-axis policy preserves its founding fixtures", () => {
  expect(verifyPolicyProofs(FAMILY)).toEqual([]);
});

// ─── §4.2 ORDINARY IDENTITY, ONE ARM EACH ───────────────────────────────────────────────────────────────
test("an arm-A waiver binds to the exact policy and the ALIAS NAME the report supplies", () => {
  const waived = passOf({
    "packages/contracts/src/alias.ts":
      "// @orb-waive no-inline-union-redecl(Mode): the proof's stand-in reason; ends when this fixture stops flagging.\nexport type Mode = 'a' | 'b' | 'c';\n",
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

test("an arm-B waiver binds to the inline SET's own source text, spacing included", () => {
  const waived = passOf({
    [HOME]: "export const AXIS = ['a', 'b', 'c'] as const;\n",
    [RESPELL]:
      "// @orb-waive no-inline-union-redecl('a' | 'b' | 'c'): the proof's stand-in reason; ends when this fixture stops flagging.\nexport interface T { mode: 'a' | 'b' | 'c' }\n",
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

// ─── §4.5 DEFERRAL ──────────────────────────────────────────────────────────────────────────────────────
test("a request admitting only the re-speller DEFERS instead of declaring the axis unhomed", () => {
  const files = {
    [HOME]: "export const AXIS = ['a', 'b', 'c'] as const;\n",
    [RESPELL]: "export interface T { mode: 'a' | 'b' | 'c' }\n",
  };
  const whole = passOf(files);
  expect(whole.toolErrors).toEqual([]);
  expect(whole.authority.effectiveFindings).toHaveLength(1);

  const narrowed = passOf(files, [RESPELL]);
  expect(narrowed.toolErrors).toEqual([]);
  expect(narrowed.policies[0]?.owner).toMatchObject({ status: "not-applicable", population: "complete" });
  // The point of the pin: the narrowed run must produce NO verdict, not a silent clean one. Without the
  // deferral the same request would run arm B against a tuple map the selection never let it collect.
  expect(narrowed.authority.effectiveFindings).toEqual([]);
});
