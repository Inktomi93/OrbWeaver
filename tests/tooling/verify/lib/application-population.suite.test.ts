// Exercise application subject dispatch with real resource acquisition and full fact/authority inputs.
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { defineGate, executePolicyPlan, planPolicyArgv } from "@orb/tooling/verify";
import { ModuleKind, ModuleResolutionKind, Project } from "ts-morph";
import { gate as legacyMarkers } from "../../../../tooling/src/verify/gates/gate-ignore-inventory.ts";
import { gate as compilerHealth } from "../../../../tooling/src/verify/gates/no-manual-memo-compiler-health.ts";
import { gate as schemaShapes } from "../../../../tooling/src/verify/gates/schema-banned-shapes.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyPassExitCode } from "../../../../tooling/src/verify/lib/policy-plan.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { policy } from "./_policy-plan-fixture.ts";

const APP = "packages/client/src/view.ts";
const TOOL = "tooling/src/snap/lib/unrelated.ts";
const HEALTH = "tooling/src/verify/gates/no-manual-memo-compiler-health.ts";

test.for([
  {
    name: "retired application grant",
    proof: compilerHealth.mustFlag[0],
    exit: 1,
    owner: "success",
    findings: [{ policyId: compilerHealth.id, file: HEALTH, token: "react-compiler" }],
    error: /^$/u,
    sources: [HEALTH],
    unresolved: 0,
  },
  {
    name: "live application grant",
    proof: compilerHealth.mustPass[0],
    exit: 0,
    owner: "success",
    findings: [],
    error: /^$/u,
    sources: [HEALTH],
    unresolved: 0,
  },
  {
    name: "unreadable application grant input",
    proof: compilerHealth.mustRefuse[0],
    exit: 2,
    owner: "incomplete",
    findings: [],
    error: /react-compiler/u,
    sources: [HEALTH],
    unresolved: 1,
  },
])("application compiler grant health: $name", async ({ proof, exit, owner, findings, error, sources, unresolved }, { plantedTree }) => {
  const scratch = await plantedTree(proof.files);
  execFixtureGit(scratch, ["init", "--quiet", "--template="]);
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFileAtPath(join(scratch, HEALTH));
  project.createSourceFile(join(scratch, APP), "export const app = true;\n");
  const result = runPolicyPass({
    knownPolicies: [compilerHealth],
    policies: [compilerHealth],
    root: scratch,
    project,
    applicationPaths: [APP],
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(policyPassExitCode(result)).toBe(exit);
  expect(result.policies[0]?.owner.status).toBe(owner);
  expect(result.authority.effectiveFindings.map(({ policyId, file, token }) => ({ policyId, file, token }))).toEqual(findings);
  expect(result.toolErrors.map(({ message }) => message).join("\n")).toMatch(error);
  expect(result.policies[0]?.population.effectiveSourcePaths).toEqual(sources);
  expect(result.policies[0]?.receipts.filter(({ kind }) => kind === "resource")).toEqual([expect.objectContaining({ unresolved })]);
});

test("application suppression residue rejects app markers without judging an unrelated tool marker, while the full fact remains complete", () => {
  const root = "/application-marker-proof";
  const project = new Project({ useInMemoryFileSystem: true });
  const source = "// @orb-gate-ignore retired: no authority\nexport const value = true;\n";
  const app = project.createSourceFile(`${root}/${APP}`, "export const value = true;\n");
  project.createSourceFile(`${root}/${TOOL}`, source);
  const run = (): ReturnType<typeof runPolicyPass> =>
    runPolicyPass({
      knownPolicies: [legacyMarkers],
      policies: [legacyMarkers],
      root,
      project,
      applicationPaths: [APP],
      reviewedGrants: [],
      failOnWarnings: false,
    });
  const clean = run();
  expect(policyPassExitCode(clean)).toBe(0);
  expect(clean.facts[0]?.population.effectiveSourcePaths).toEqual([APP, TOOL]);
  app.replaceWithText(source);
  const dirty = run();
  expect(policyPassExitCode(dirty)).toBe(1);
  expect(dirty.authority.effectiveFindings.map(({ file }) => file)).toEqual([APP]);
});

test.for([
  { proof: schemaShapes.mustFlag[0], exit: 1, tokens: ["activePresetId"] },
  { proof: schemaShapes.mustPass[0], exit: 0, tokens: [] },
])("application schema enforcement keeps the real compiler-resolved Drizzle shape", async ({ proof, exit, tokens }, { plantedTree, repoRoot }) => {
  const scratch = await plantedTree({ ...proof.files, "package.json": '{"type":"module"}\n' });
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({
    compilerOptions: { module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
    skipAddingFilesFromTsConfig: true,
  });
  const paths = Object.keys(proof.files);
  for (const path of paths) {
    project.addSourceFileAtPath(join(scratch, path));
  }
  const result = runPolicyPass({
    knownPolicies: [schemaShapes],
    policies: [schemaShapes],
    root: scratch,
    project,
    applicationPaths: paths,
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(policyPassExitCode(result), JSON.stringify(result.toolErrors)).toBe(exit);
  expect(result.authority.effectiveFindings.map(({ token }) => token)).toEqual(tokens);
  expect(result.facts[0]?.status).toBe("success");
});

test("application policy plan and execution agree before evaluation, retaining whole-source owners and refusing empty subjects", async ({ plantedTree }) => {
  const root = await plantedTree({ [APP]: "export const app = true;\n", [TOOL]: "export const tool = true;\n" });
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${root}/${APP}`, "export const app = true;\n");
  project.createSourceFile(`${root}/${TOOL}`, "export const tool = true;\n");
  const selected = policy("app-subject", {
    population: ["@client", "@tooling"],
    execution: "entire-population",
    create: (ctx) => ({
      evaluate: () => {
        for (const file of ctx.files) {
          ctx.report.node(file, { token: "export", offset: 0 });
        }
      },
    }),
  });
  const implementation = defineGate({
    ...policy("self-subject"),
    application: "implementation",
    create: () => {
      throw new Error("implementation-only evaluator ran");
    },
  });
  const corpus = { gates: [selected, implementation], families: [selected.family, implementation.family] };
  const options = { applicationPaths: [APP], wholeWorkspacePaths: () => [APP, TOOL], executionWorkspacePaths: () => [APP, TOOL] };
  const plan = planPolicyArgv(root, ["--application"], corpus, options);
  if (!plan.ok || plan.plan.mode !== "run") {
    throw new Error(JSON.stringify(plan));
  }
  expect(plan.plan.policies.map(({ policyId, mode }) => ({ policyId, mode }))).toEqual([
    { policyId: "app-subject", mode: "run" },
    { policyId: "self-subject", mode: "skipped" },
  ]);
  const result = executePolicyPlan({ root, project, corpus, plan: plan.plan, reviewedGrants: [] });
  expect(result).toMatchObject({ ok: true, exitCode: 1, pass: { authority: { effectiveFindings: [{ file: APP }] } } });
  expect(planPolicyArgv(root, ["--application"], corpus, { ...options, applicationPaths: [] })).toMatchObject({ ok: false, exitCode: 2 });
  expect(() =>
    runPolicyPass({ knownPolicies: [selected], policies: [selected], root, project, applicationPaths: [], reviewedGrants: [], failOnWarnings: false }),
  ).toThrow("nonempty subject population");
});
