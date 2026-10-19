// Exercise application subject dispatch with real resource acquisition and full fact/authority inputs.
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { defineFact, defineGate, executePolicyPlan, planPolicyArgv } from "@orb/tooling/verify";
import { ModuleKind, ModuleResolutionKind, Project } from "ts-morph";
import { gate as schemaBranding } from "../../../../tooling/src/verify/gates/schema-branding.ts";
import { gate as artifactSlot } from "../../../../tooling/src/verify/gates/tooling-artifact-run-slot.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyPassExitCode } from "../../../../tooling/src/verify/lib/policy-plan.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { policy } from "./_policy-plan-fixture.ts";

const APP = "packages/client/src/view.ts";
const TOOL = "tooling/src/snap/lib/unrelated.ts";

test("application helper reach does not synthesize an instrument lifecycle, while global ownership still rejects an unslotted tool", () => {
  const root = "/application-artifact-subject";
  for (const [proof, globalExit] of [
    [artifactSlot.mustPass[0], 0],
    [artifactSlot.mustFlag[0], 1],
  ] as const) {
    const project = new Project({ useInMemoryFileSystem: true });
    for (const [path, text] of Object.entries(proof.files)) {
      project.createSourceFile(`${root}/${path}`, text);
    }
    project.createSourceFile(`${root}/${APP}`, "export const app = true;\n");
    const input = {
      knownPolicies: [artifactSlot],
      policies: [artifactSlot],
      root,
      project,
      nativeTypeFacts: () => isolatedTypeFacts(project),
      reviewedGrants: [],
      failOnWarnings: false,
    };
    expect(policyPassExitCode(runPolicyPass(input))).toBe(globalExit);
    const helperReach = [APP, ...Object.keys(proof.files).filter((path) => !path.endsWith("/cli.ts"))];
    const application = runPolicyPass({ ...input, applicationPaths: helperReach });
    expect(application.toolErrors).toEqual([]);
    expect(policyPassExitCode(application)).toBe(0);
    expect(application.policies[0]?.owner.status).toBe("not-applicable");
  }
});

const RESIDUE = "residue-token";
const residueFact = defineFact({
  id: "application-residue-sites",
  population: ["@client", "@tooling"],
  analysis: "syntax",
  resources: [],
  create: (ctx) => {
    const sites: string[] = [];
    let members = 0;
    return {
      visitFile: (sourceFile) => {
        members += 1;
        if (sourceFile.getFullText().includes(RESIDUE)) {
          sites.push(ctx.relativePath(sourceFile));
        }
      },
      finish: () => {
        ctx.receipt({ kind: "population", source: "application-residue-sites", members });
        return { sites, members };
      },
    };
  },
});
const residueOwner = policy("application-residue", {
  population: ["@client", "@tooling"],
  execution: "entire-population",
  facts: [residueFact],
  create: (ctx) => ({
    evaluate: () => {
      const { sites, members } = ctx.fact(residueFact);
      ctx.receipt({ kind: "population", source: "application-residue-sites", members });
      for (const file of sites.filter((candidate) => ctx.includesSubject(candidate))) {
        ctx.report.file(file, { line: 1, column: 1, token: RESIDUE });
      }
    },
  }),
});

test("application fact residue rejects app sites without judging an unrelated tool site, while the full fact remains complete", () => {
  const root = "/application-marker-proof";
  const project = new Project({ useInMemoryFileSystem: true });
  const source = `// ${RESIDUE}\nexport const value = true;\n`;
  const app = project.createSourceFile(`${root}/${APP}`, "export const value = true;\n");
  project.createSourceFile(`${root}/${TOOL}`, source);
  const run = (): ReturnType<typeof runPolicyPass> =>
    runPolicyPass({
      knownPolicies: [residueOwner],
      policies: [residueOwner],
      root,
      project,
      applicationPaths: [APP],
      reviewedGrants: [],
      failOnWarnings: false,
    });
  const clean = run();
  expect(policyPassExitCode(clean), JSON.stringify(clean.toolErrors)).toBe(0);
  expect(clean.facts[0]?.population.effectiveSourcePaths).toEqual([APP, TOOL]);
  app.replaceWithText(source);
  const dirty = run();
  expect(policyPassExitCode(dirty)).toBe(1);
  expect(dirty.authority.effectiveFindings.map(({ file }) => file)).toEqual([APP]);
});

const UNBRANDED_PASS = {
  "packages/db/src/schema/x.ts":
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const things = sqliteTable("things", { name: text("name") });\n',
};

test.for([
  { files: schemaBranding.mustFlag[0].files, exit: 1, tokens: ["id"] },
  { files: UNBRANDED_PASS, exit: 0, tokens: [] },
])("application schema enforcement keeps the real compiler-resolved Drizzle shape", async ({ files, exit, tokens }, { plantedTree, repoRoot }) => {
  const scratch = await plantedTree({ ...files, "package.json": '{"type":"module"}\n' });
  symlinkSync(join(repoRoot, "node_modules"), join(scratch, "node_modules"), "dir");
  const project = new Project({
    compilerOptions: { module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext },
    skipAddingFilesFromTsConfig: true,
  });
  const paths = Object.keys(files);
  for (const path of paths) {
    project.addSourceFileAtPath(join(scratch, path));
  }
  const result = runPolicyPass({
    knownPolicies: [schemaBranding],
    policies: [schemaBranding],
    root: scratch,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
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
