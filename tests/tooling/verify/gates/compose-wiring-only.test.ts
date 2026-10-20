import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/compose-wiring-only.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/compose-wiring-only";
const SUBJECT = "packages/server/src/entry/compose/x.ts";
const OP = 'export function build(load: (id: string) => string) {\n  MARKER\n  return { read: (id: string) => (id.length > 0 ? load(id) : "") };\n}\n';

/** One pass over `project` with the isolated proof adapter standing in for the importing native world. */
function judge(project: Project, root: string): ReturnType<typeof runPolicyPass> {
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    project,
    root,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  return result;
}

function drive(source: string): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/${SUBJECT}`, source);
  return judge(project, ROOT);
}

test("an absent native world refuses instead of reading the syntax carrier", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/${SUBJECT}`, OP.replace("MARKER", ""));
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], project, root: ROOT, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors.map(({ policyId }) => policyId)).toEqual([gate.id]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([gate.id]);
});

test("an un-nominated question is an explicit unknown at its own site and other compose files stay judged", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const disposable = '/// <reference lib="esnext.disposable" />\n';
  project.createSourceFile(
    `${ROOT}/packages/server/src/domain/x/owner.ts`,
    `${disposable}export const owner = { [Symbol.asyncDispose]: (): number => (Date.now() > 1 ? 1 : 0) };\n`,
  );
  project.createSourceFile(
    `${ROOT}/${SUBJECT}`,
    `${disposable}import { owner } from "../../domain/x/owner.ts";\nexport function build() { const s = new AsyncDisposableStack(); s.defer(owner[Symbol.asyncDispose]); return s; }\n`,
  );
  project.createSourceFile(`${ROOT}/packages/server/src/entry/compose/y.ts`, OP.replace("MARKER", ""));
  const result = judge(project, ROOT);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ file, token }) => ({ file, token }))).toEqual([
    { file: "packages/server/src/entry/compose/y.ts", token: "read" },
  ]);
  expect(result.policies.flatMap(({ analysis }) => analysis?.unknown ?? [])).toEqual([
    expect.objectContaining({ file: SUBJECT, reason: expect.stringContaining("native compose demand did not nominate the reference write question") }),
  ]);
});

test("every declared row holds through production conformance", { timeout: scaledBudget(30_000) }, () => {
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

test("the actual native transport-policy owner is separate from compose-supplied business operations", { timeout: scaledBudget(30_000) }, ({ repoRoot }) => {
  const project = new Project({ tsConfigFilePath: join(repoRoot, "packages/server/tsconfig.json"), skipAddingFilesFromTsConfig: true });
  const owner = project.addSourceFileAtPath(join(repoRoot, "packages/server/src/entry/rate-limit-gate.ts"));
  const original = owner.getFullText();
  const carrier = project.createSourceFile(
    join(repoRoot, "packages/server/src/entry/compose/__policy-carrier.ts"),
    'import { createRateLimitGate as createGate } from "../rate-limit-gate.ts";\nexport function build(deps: Parameters<typeof createGate>[0]) { return createGate(deps); }',
  );
  project.resolveSourceFileDependencies();
  const run = (): ReturnType<typeof runPolicyPass> => judge(project, repoRoot);
  expect(run().authority.effectiveFindings).toEqual([]);
  // Each transparent-wrapper spelling of the owned policy keeps its Tier-5 ownership.
  const wrapped = [
    ["  return {\n    enforce:", "  return ({\n    enforce:"],
    ["      await authedGeneral.consume(userId);\n    },\n  };\n}", "      await authedGeneral.consume(userId);\n    },\n  });\n}"],
    ["enforce: async (decision: RateLimitDecision): Promise<void> => {", "enforce: (async (decision: RateLimitDecision): Promise<void> => {"],
    ["      await authedGeneral.consume(userId);\n    },\n  };", "      await authedGeneral.consume(userId);\n    }),\n  };"],
    ["await aiTurn.consume(userId);", "await aiTurn!.consume(userId);"],
    ["if (isAiTurnPath(decision.path))", "if ((isAiTurnPath)(decision.path))"],
    ["const restart = createRateLimiter(", "const restart = (createRateLimiter)("],
  ] as const;
  const spellings = [[wrapped[0], wrapped[1]], [wrapped[2], wrapped[3]], [wrapped[4]], [wrapped[5]], [wrapped[6]]];
  for (const edits of spellings) {
    const text = edits.reduce((current, [from, to]) => {
      expect(current.split(from)).toHaveLength(2);
      return current.replace(from, to);
    }, original);
    owner.replaceWithText(text);
    expect.soft(run().authority.effectiveFindings, edits.map(([, to]) => to).join(" / ")).toEqual([]);
  }
  owner.replaceWithText(original);
  carrier.replaceWithText(
    'import { createRateLimitGate as createGate } from "../rate-limit-gate.ts";\nexport function build(deps: Parameters<typeof createGate>[0]) { return createGate({ ...deps, resolveRateLimits: () => deps.now() > 1 ? deps.resolveRateLimits() : deps.resolveRateLimits() }); }',
  );
  expect(run().authority.effectiveFindings.map((finding) => finding.token)).toEqual(["resolveRateLimits"]);
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

test("the real canonical mint is admitted while a reached admission helper beside it remains detectable", { timeout: scaledBudget(120_000) }, ({
  repoRoot,
}) => {
  const bridge = "return async (userId: UserId): Promise<Principal> => principalFromRow(userId, await sessions.loadUserById(userId));";
  const admission =
    "function composeAdmission(fields: UserPrincipalFields | null): boolean { return fields?.enabled === true; }\n  return async (userId: UserId): Promise<Principal> => { const fields = await sessions.loadUserById(userId); composeAdmission(fields); return principalFromRow(userId, fields); };";
  // The real entry population under the server world's own options, judged in its importing world.
  const project = new Project({ tsConfigFilePath: join(repoRoot, "packages/server/tsconfig.json"), skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths(join(repoRoot, "packages/server/src/entry/**/*.ts"));
  project.resolveSourceFileDependencies();
  const seam = project.getSourceFileOrThrow(join(repoRoot, "packages/server/src/entry/auth/seam.ts"));
  const original = seam.getFullText();
  expect(judge(project, repoRoot).authority.effectiveFindings).toEqual([]);
  expect(original.split(bridge)).toHaveLength(2);
  seam.replaceWithText(original.replace(bridge, admission));
  const findings = judge(project, repoRoot).authority.effectiveFindings;
  expect(findings.map(({ file, token }) => ({ file, token }))).toEqual([{ file: "packages/server/src/entry/auth/seam.ts", token: "composeAdmission" }]);
  expect(findings[0]?.message).toContain("=== true");
});
