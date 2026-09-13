// The PERMANENT refusal pin for db-structure's authored schema evidence plane. The legacy descriptor
// performed its own readdirSync and once swallowed every failure into a clean verdict. The final split puts
// schema/module parity on the compiler population and producer-home parity on two runtime-owned authored
// trees. This test drives that production dispatcher boundary: an unreadable or absent schema tree makes
// the resource owner incomplete and withheld; neither state can become a clean policy verdict.

import type * as Fs from "node:fs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Project } from "ts-morph";
import { vi } from "vitest";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SCHEMA_DIR_SUFFIX = "packages/db/src/schema";
const fault = vi.hoisted(() => ({ kind: "" as "" | "eacces" | "enoent" }));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof Fs>();
  return {
    ...real,
    readdirSync: (path: Parameters<typeof real.readdirSync>[0], options: Parameters<typeof real.readdirSync>[1]) => {
      if (String(path).endsWith(SCHEMA_DIR_SUFFIX)) {
        if (fault.kind === "eacces") {
          throw Object.assign(new Error("planted EACCES: permission denied reading the schema dir"), { code: "EACCES" });
        }
        if (fault.kind === "enoent") {
          throw Object.assign(new Error("planted ENOENT: no such directory"), { code: "ENOENT" });
        }
      }
      return (real.readdirSync as (...args: unknown[]) => unknown)(path, options);
    },
  };
});

const [{ gate }, { runPolicyPass }] = await Promise.all([
  import("../../../../tooling/src/verify/gates/db-structure-producer-home.ts"),
  import("../../../../tooling/src/verify/lib/policy-pass.ts"),
]);

function runGate(root: string): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root,
    project: new Project({ useInMemoryFileSystem: true }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

function refusal(result: ReturnType<typeof runPolicyPass>): Record<string, unknown> {
  return {
    findings: result.authority.effectiveFindings,
    errors: result.toolErrors.map(({ policyId, phase, message }) => ({ policyId, phase, message })),
    owner: result.policies[0]?.owner.status,
    withheld: result.authority.withheldPolicyIds,
  };
}

test("an unreadable schema tree (EACCES) refuses at the final resource boundary, never false-cleans", ({ scratch }) => {
  mkdirSync(join(scratch, "packages/db/src/schema"), { recursive: true });
  mkdirSync(join(scratch, "packages/server/src/domain"), { recursive: true });
  fault.kind = "eacces";
  expect(refusal(runGate(scratch))).toEqual({
    findings: [],
    errors: [expect.objectContaining({ policyId: gate.id, phase: "population", message: expect.stringContaining("planted EACCES") })],
    owner: "incomplete",
    withheld: [gate.id],
  });
});

test("an absent schema tree (ENOENT) is a visible missing-resource refusal, never an empty verdict", ({ scratch }) => {
  mkdirSync(join(scratch, "packages/server/src/domain"), { recursive: true });
  fault.kind = "enoent";
  expect(refusal(runGate(scratch))).toEqual({
    findings: [],
    errors: [expect.objectContaining({ policyId: gate.id, phase: "population", message: expect.stringContaining("authored-tree:db-schema is missing") })],
    owner: "incomplete",
    withheld: [gate.id],
  });
});
