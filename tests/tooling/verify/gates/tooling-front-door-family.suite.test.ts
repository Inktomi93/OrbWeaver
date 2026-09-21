// The standing family floor for the two tooling front-door families converted in #1950 group 2:
//
//   `tooling-front-door`      → `tooling-front-door` (ordinary import boundary) + `tooling-root-config-import`
//                                (reviewed relative-escape grant) — family `tooling-front-door`.
//   `tooling-argv-front-door` → `tooling-argv-front-door` (reviewed argv reader) + `tooling-argv-front-door-health`
//                                (hard blindness tripwire) — family `tooling-argv-front-door`.
//
// What a declared row structurally cannot express lives here:
//   §4.2 — the ordinary policy's identity arm, all three assertions, alarms first.
//   §4.3 — grant identity for the reviewed argv policy with a REAL row from `lib/reviewed-grants.ts`:
//          the intended row is consumed exactly once; a row keyed on the wrong operation licenses nothing;
//          a row whose subject no longer performs the act is STALE after a complete run. The root-config
//          policy has no real grant after prodonly stopped importing knip.ts; its exact synthetic-grant
//          binding remains in its declared conformance row.
//   §4.5 — every `entire-population` policy DEFERS a narrowed request instead of adjudicating a row its
//          scope cannot see — the successor of the legacy int test's scoped-run defect pin (2026-08-30).
//   §4.6 — the two split differentials against the frozen legacy descriptors (`1f5e25c00`, `4097be20d`):
//          every legacy example replayed through the legacy `runPass` and through the UNION of the two
//          final policies, differences CLASSIFIED rather than averaged, and the legacy-side coverage of every
//          moved arm asserted. Classified for the import family: (1) POSITION — the finding moved from the
//          whole ImportDeclaration (legacy `token: spec, offset: 0`, not even an exact slice) to the quoted
//          specifier literal; (2) the historical root-config row is a FINDING in the final policy where
//          legacy passed it through its table; (3) the legacy escape example's
//          `../../../packages/...` resolved INSIDE `tooling/` — legacy called any non-`tooling/src/` path an
//          escape and so does the final policy. For the argv family: (4) POSITION of the element-access
//          spelling — legacy normalized `process["argv"]` to `process.argv`; (5) the six entry rows are
//          FINDINGS licensed by grants where legacy passed them through its table, and the two-sided stale
//          example is a stale-grant pin here, not a finding; (6) the blindness arm anchors on the anchor
//          file, not the gate module; (7) the ambient `process` spelling is UNREADABLE in a project without
//          `@types/node`, so it is reported fail-closed under the unreadable text where legacy matched text
//          (count identical, message differs) — the planted-types rows in the module pin the precise branch.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as argvFrontDoor } from "../../../../tooling/src/verify/gates/tooling-argv-front-door.ts";
import { gate as argvHealth } from "../../../../tooling/src/verify/gates/tooling-argv-front-door-health.ts";
import { gate as frontDoor } from "../../../../tooling/src/verify/gates/tooling-front-door.ts";
import { gate as rootConfigImport } from "../../../../tooling/src/verify/gates/tooling-root-config-import.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/tooling-front-door-family";
const IMPORT_FAMILY: readonly GatePolicy[] = [frontDoor, rootConfigImport];
const ARGV_FAMILY: readonly GatePolicy[] = [argvFrontDoor, argvHealth];
const ALL: readonly GatePolicy[] = [...IMPORT_FAMILY, ...ARGV_FAMILY];
const ANCHOR = "tooling/src/_shared/exit-contract.ts";
const ANCHOR_SOURCE = "export const EXIT = { clean: 0 } as const;\n";
const ENGINES_GRANT_ID = "tooling-argv-front-door:stack-engines";
const ENGINES = "tooling/src/stack/ops/engines.ts";
const ENGINES_READ = 'import process from "node:process";\nexport const g = process.argv.includes("--detach");\n';

function grantOf(id: string): ReviewedGateGrant {
  const grant = REVIEWED_GRANTS.find((row) => row.id === id);
  if (grant === undefined) {
    throw new Error(`grant ${id} is not in the central table`);
  }
  return grant;
}

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

interface PassOptions {
  readonly grants?: readonly ReviewedGateGrant[];
  readonly requestedPaths?: readonly string[];
}

function passOf(policies: readonly GatePolicy[], files: Readonly<Record<string, string>>, options: PassOptions = {}): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: ALL,
    policies,
    root: ROOT,
    project: projectOf(files),
    ...(options.requestedPaths === undefined ? {} : { requestedPaths: options.requestedPaths }),
    reviewedGrants: options.grants ?? [],
    failOnWarnings: false,
  });
}

test("all four front-door policies preserve their founding fixtures", () => {
  expect(verifyPolicyProofs(ALL)).toEqual([]);
});

// ─── §4.2 ORDINARY IDENTITY ─────────────────────────────────────────────────────────────────────────────
test("an ordinary waiver binds to the exact policy and the QUOTED-SPECIFIER position tooling-front-door reports", () => {
  const waived = passOf([frontDoor], {
    "tooling/src/aa/ops/x.ts":
      '// @orb-waive tooling-front-door("../../bb/ops/y.ts"): the proof\'s stand-in reason and its end condition.\nimport { y } from "../../bb/ops/y.ts";\nexport const x = y;\n',
    "tooling/src/bb/ops/y.ts": "export const y = 1;\n",
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

// ─── §4.3 GRANT IDENTITY — a real central row ──────────────────────────────────────────────────────────
test("the stack/engines argv grant is consumed exactly once by the real entry", () => {
  const granted = passOf([argvFrontDoor], { [ENGINES]: ENGINES_READ }, { grants: [grantOf(ENGINES_GRANT_ID)] });
  expect(granted.toolErrors).toEqual([]);
  expect(granted.authority.effectiveFindings).toEqual([]);
  expect(granted.authority.grantedFindings).toHaveLength(1);
  expect(granted.authority.reviewedGrantConsumption).toEqual([{ id: ENGINES_GRANT_ID, count: 1 }]);
  expect(granted.authority.authorityAlarms).toEqual([]);
});

test("an argv grant keyed on the WRONG operation licenses nothing", () => {
  const mismatched = passOf([argvFrontDoor], { [ENGINES]: ENGINES_READ }, { grants: [{ ...grantOf(ENGINES_GRANT_ID), operation: "process-env-read" }] });
  expect(mismatched.authority.effectiveFindings).toHaveLength(1);
  expect(mismatched.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: ENGINES_GRANT_ID }]);
});

test("an argv grant whose entry stopped reading argv is STALE after a complete run — both legacy staleness modes are this one alarm", () => {
  const stoppedReading = passOf([argvFrontDoor], { [ENGINES]: "export const g = false;\n" }, { grants: [grantOf(ENGINES_GRANT_ID)] });
  expect(stoppedReading.authority.effectiveFindings).toEqual([]);
  expect(stoppedReading.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: ENGINES_GRANT_ID }]);

  const gone = passOf([argvFrontDoor], { "tooling/src/stack/ops/other.ts": "export const other = 1;\n" }, { grants: [grantOf(ENGINES_GRANT_ID)] });
  expect(gone.authority.effectiveFindings).toEqual([]);
  expect(gone.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: ENGINES_GRANT_ID }]);
});

test("every argv grant row in the central table names a subject that exists on the tree and is not a cli.ts", ({ repoRoot }) => {
  const rows = REVIEWED_GRANTS.filter((grant) => grant.policyId === argvFrontDoor.id);
  // 6 at the conversion; 7 since `stack/ops/start-entry.ts` — the root `start` script's target, the one
  // launcher with no `.sh` in front of it because `pnpm start` must run where bash does not; 8 counting
  // `verify/ops/config-snapshot-entry.ts`, the private native-config-snapshot process boundary (#1351),
  // which the 6→7 bump miscounted past while this battery was dark (#2497).
  expect(rows).toHaveLength(8);
  for (const row of rows) {
    expect(existsSync(join(repoRoot, row.subject)), row.id).toBe(true);
    expect(row.subject.endsWith("/cli.ts"), row.id).toBe(false);
    expect(row.operation).toBe("process-argv-read");
  }
});

// ─── §4.5 DEFERRAL ──────────────────────────────────────────────────────────────────────────────────────
test("a narrowed request DEFERS every entire-population policy in both families instead of adjudicating a row its scope cannot see", () => {
  const files = {
    [ANCHOR]: ANCHOR_SOURCE,
    "tooling/src/aa/ops/root-config.ts": 'import knipConfig from "../../../../knip.ts";\nexport const globs = knipConfig;\n',
    "tooling/src/snap/cli.ts": 'import process from "node:process";\nexport const a = process.argv.slice(2);\n',
    "tooling/src/_shared/log.ts": "export const warn = 1;\n",
  };
  for (const policy of [rootConfigImport, argvFrontDoor, argvHealth]) {
    const narrowed = passOf([policy], files, { requestedPaths: ["tooling/src/_shared/log.ts"] });
    expect(narrowed.toolErrors, policy.id).toEqual([]);
    expect(narrowed.policies.find(({ id }) => id === policy.id)?.owner, policy.id).toMatchObject({ status: "not-applicable", population: "complete" });
    expect(narrowed.authority.effectiveFindings, policy.id).toEqual([]);
    expect(narrowed.authority.authorityAlarms, policy.id).toEqual([]);
  }
});
