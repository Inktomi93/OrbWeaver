// Retained operator-argv authority controls use the production policy runtime.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as argvFrontDoor } from "../../../../tooling/src/verify/gates/tooling-argv-front-door.ts";
import { gate as argvHealth } from "../../../../tooling/src/verify/gates/tooling-argv-front-door-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { REVIEWED_GRANTS } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/tooling-front-door-family";
const ARGV_FAMILY: readonly GatePolicy[] = [argvFrontDoor, argvHealth];
const ALL: readonly GatePolicy[] = ARGV_FAMILY;
const ANCHOR = "tooling/src/floor/cli/exit-contract.ts";
const ANCHOR_SOURCE = "export const EXIT = { clean: 0 } as const;\n";
const ENGINES_GRANT_ID = "tooling-argv-front-door:verify-config-snapshot-entry";
const ENGINES = "tooling/src/verify/ops/config-snapshot-entry.ts";
const ENGINES_READ = 'import process from "node:process";\nexport const g = process.argv.includes("--force");\n';

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

test("the retained front-door policies preserve their founding fixtures", () => {
  expect(verifyPolicyProofs(ALL)).toEqual([]);
});

// ─── §4.3 GRANT IDENTITY — a real central row ──────────────────────────────────────────────────────────
test("the config-snapshot-entry argv grant is consumed exactly once by the real entry", () => {
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

  const gone = passOf([argvFrontDoor], { "tooling/src/verify/ops/other.ts": "export const other = 1;\n" }, { grants: [grantOf(ENGINES_GRANT_ID)] });
  expect(gone.authority.effectiveFindings).toEqual([]);
  expect(gone.authority.authorityAlarms).toMatchObject([{ kind: "stale-reviewed-grant", grantId: ENGINES_GRANT_ID }]);
});

test("every argv grant row in the central table names a subject that exists on the tree and is not a cli.ts", ({ repoRoot }) => {
  const rows = REVIEWED_GRANTS.filter((grant) => grant.policyId === argvFrontDoor.id);
  // The literal is the pin: `floor/cli/entrypoint.ts`, `floor/process/niced-exec.ts` and
  // `verify/ops/config-snapshot-entry.ts`. A new reviewed argv reader bumps it here in the same change
  // as its grant row.
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(existsSync(join(repoRoot, row.subject)), row.id).toBe(true);
    expect(row.subject.endsWith("/cli.ts"), row.id).toBe(false);
    expect(row.operation).toBe("process-argv-read");
  }
});

// ─── §4.5 DEFERRAL ──────────────────────────────────────────────────────────────────────────────────────
test("a narrowed request judges the selected-files policies on the requested rows only, and DEFERS the whole-tree health policy", () => {
  const files = {
    [ANCHOR]: ANCHOR_SOURCE,
    "tooling/src/snap/cli.ts": 'import process from "node:process";\nexport const a = process.argv.slice(2);\n',
    "tooling/src/floor/cli/log.ts": "export const warn = 1;\n",
  };
  for (const policy of [argvFrontDoor]) {
    const narrowed = passOf([policy], files, { requestedPaths: ["tooling/src/floor/cli/log.ts"] });
    expect(narrowed.toolErrors, policy.id).toEqual([]);
    expect(narrowed.policies.find(({ id }) => id === policy.id)?.owner, policy.id).toMatchObject({ status: "success", population: "complete" });
    expect(narrowed.authority.effectiveFindings, policy.id).toEqual([]);
    expect(narrowed.authority.authorityAlarms, policy.id).toEqual([]);
  }
  const health = passOf([argvHealth], files, { requestedPaths: ["tooling/src/floor/cli/log.ts"] });
  expect(health.toolErrors).toEqual([]);
  expect(health.policies.find(({ id }) => id === argvHealth.id)?.owner).toMatchObject({ status: "not-applicable", population: "complete" });
});
