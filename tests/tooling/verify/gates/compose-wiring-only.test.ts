import { join } from "node:path";
import type { RealCorpusLivenessArm } from "@orb/testkit/node/real-corpus-liveness.ts";
import { assertArmVerdict, openRealCorpusLiveness } from "@orb/testkit/node/real-corpus-liveness.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/compose-wiring-only.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { ALL_ARMS } from "./_liveness/runner.ts";

const ROOT = "/compose-wiring-only";
const SUBJECT = "packages/server/src/entry/compose/x.ts";
const OP = 'export function build(load: (id: string) => string) {\n  MARKER\n  return { read: (id: string) => (id.length > 0 ? load(id) : "") };\n}\n';

function drive(source: string): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/${SUBJECT}`, source);
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], project, root: ROOT, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  return result;
}

test("every declared row holds through production conformance", { timeout: 30_000 }, () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the baseline waiver binds at the reported op name and nowhere else", () => {
  const raw = drive(OP.replace("MARKER", ""));
  expect(raw.authority.effectiveFindings.map((finding) => finding.token)).toEqual(["read"]);

  const waived = drive(OP.replace("MARKER", "// @orb-waive compose-wiring-only(read): baselined; burn-down item 964."));
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);

  const deadPosition = drive(OP.replace("MARKER", "// @orb-waive compose-wiring-only(load): baselined; burn-down item 964."));
  expect(deadPosition.authority.waivedFindings).toEqual([]);
  expect(deadPosition.authority.effectiveFindings).toHaveLength(1);
  expect(deadPosition.authority.authorityAlarms.length).toBeGreaterThan(0);
});

test("the actual native transport-policy owner is separate from compose-supplied business operations", { timeout: 30_000 }, ({ repoRoot }) => {
  const project = new Project({ tsConfigFilePath: join(repoRoot, "packages/server/tsconfig.json"), skipAddingFilesFromTsConfig: true });
  const owner = project.addSourceFileAtPath(join(repoRoot, "packages/server/src/entry/rate-limit-gate.ts"));
  const original = owner.getFullText();
  const carrier = project.createSourceFile(
    join(repoRoot, "packages/server/src/entry/compose/__policy-carrier.ts"),
    'import { createRateLimitGate as createGate } from "../rate-limit-gate.ts";\nexport function build(deps: Parameters<typeof createGate>[0]) { return createGate(deps); }',
  );
  project.resolveSourceFileDependencies();
  const run = (): ReturnType<typeof runPolicyPass> => {
    const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], project, root: repoRoot, reviewedGrants: [], failOnWarnings: false });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    return result;
  };
  expect(run().authority.effectiveFindings).toEqual([]);
  carrier.replaceWithText(
    'import { createRateLimitGate as createGate } from "../rate-limit-gate.ts";\nexport function build(deps: Parameters<typeof createGate>[0]) { return createGate({ ...deps, resolveRateLimits: () => deps.now() > 1 ? deps.resolveRateLimits() : deps.resolveRateLimits() }); }',
  );
  expect(run().authority.effectiveFindings.map((finding) => finding.token)).toEqual(["resolveRateLimits"]);
  carrier.replaceWithText(
    'import { users } from "@orb/db";\nimport { createRateLimitGate } from "../rate-limit-gate.ts";\nexport function build(deps: Parameters<typeof createRateLimitGate>[0]) { return createRateLimitGate({ ...deps, resolveRateLimits: () => { deps.db.select().from(users); return deps.resolveRateLimits(); } }); }',
  );
  const query = run().authority.effectiveFindings;
  expect(query.map((finding) => finding.token)).toEqual(["resolveRateLimits"]);
  expect(query[0]?.message).toContain("runs a Drizzle query");
  carrier.replaceWithText(
    'import { createRateLimitGate } from "../rate-limit-gate.ts";\nexport function build(deps: Parameters<typeof createRateLimitGate>[0]) { return createRateLimitGate(deps); }',
  );
  owner.replaceWithText(original.replace('from "../transport/rate-limit.ts"', 'from "./lookalike-limiter.ts"'));
  project.createSourceFile(
    join(repoRoot, "packages/server/src/entry/lookalike-limiter.ts"),
    "export function createRateLimiter(..._args: readonly object[]) { return { consume: async (_id: string): Promise<void> => {} }; }",
  );
  expect(run().authority.effectiveFindings.map((finding) => finding.token)).toEqual(["isAiTurnPath", "enforce"]);
  owner.replaceWithText(original.replace('from "../transport/trpc/index.ts"', 'from "./unresolved-port.ts"'));
  expect(run().authority.effectiveFindings.map((finding) => finding.token)).toEqual(["isAiTurnPath", "enforce"]);
  owner.replaceWithText(original.replace("const userId = decision.principal.userId;", "deps.now(); const userId = decision.principal.userId;"));
  expect(run().authority.effectiveFindings.map((finding) => finding.token)).toEqual(["isAiTurnPath", "enforce"]);
  owner.replaceWithText(original.replace("createRateLimiter }", "createRateLimiter as makeLimiter }").replaceAll("= createRateLimiter(", "= makeLimiter("));
  expect(run().authority.effectiveFindings).toEqual([]);
  const foreign = project.createSourceFile(
    join(repoRoot, "packages/server/src/entry/http/neighbor.ts"),
    original.replaceAll('from "../transport/', 'from "../../transport/'),
  );
  carrier.replaceWithText(
    'import { createRateLimitGate } from "../http/neighbor.ts";\nexport function build(deps: Parameters<typeof createRateLimitGate>[0]) { return createRateLimitGate(deps); }',
  );
  expect(
    run()
      .authority.effectiveFindings.filter((finding) => finding.file.endsWith("/http/neighbor.ts"))
      .map((finding) => finding.token),
  ).toEqual(["isAiTurnPath", "enforce"]);
  project.removeSourceFile(foreign);
});

test("the real canonical mint is admitted while a reached admission helper beside it remains detectable", { timeout: 120_000 }, ({ repoRoot }) => {
  const bridge = "return async (userId: UserId): Promise<Principal> => principalFromRow(userId, await sessions.loadUserById(userId));";
  const arm: RealCorpusLivenessArm = {
    policy: gate,
    reportsAt: ["packages/server/src/entry/auth/seam.ts"],
    overlays: [
      {
        kind: "edit",
        path: "packages/server/src/entry/auth/seam.ts",
        replace: [
          bridge,
          "function composeAdmission(fields: UserPrincipalFields | null): boolean { return fields?.enabled === true; }\n  return async (userId: UserId): Promise<Principal> => { const fields = await sessions.loadUserById(userId); composeAdmission(fields); return principalFromRow(userId, fields); };",
        ],
      },
    ],
    messageIncludes: "=== true",
  };
  const runner = openRealCorpusLiveness(repoRoot, [arm], [...ALL_ARMS.filter((known) => known.policy.id !== gate.id), arm]);
  expect(runner.assertBaseline()).toEqual([gate.id]);
  expect(assertArmVerdict(arm, runner.verdict(arm))).toHaveLength(1);
});
