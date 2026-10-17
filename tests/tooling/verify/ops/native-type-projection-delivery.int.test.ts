// The verifier's actual entrypoints must consume sealed native observations, never the syntax carrier's checker.
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import { vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as portal } from "../../../../tooling/src/verify/gates/baseui-portal-container-seam.ts";
import { gate as inference } from "../../../../tooling/src/verify/gates/domain-inference-dispatch.ts";
import { gate as routes } from "../../../../tooling/src/verify/gates/route-trpc-no-broad-spread.ts";
import { gate as sections } from "../../../../tooling/src/verify/gates/section-factory-contribution-bundle.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const COHORT = [routes, portal, sections, inference] as const;
const SECTION_SHADOW = "packages/client/src/native-section-shadow.ts";
const COMPANIONS = new Map<GatePolicy, string>([[sections, "section-registry-completeness"]]);

test(
  "the four native consumers preserve their complete declared rejection and acceptance controls",
  () => {
    expect(verifyPolicyProofs(COHORT)).toEqual([]);
  },
  scaledBudget(60_000),
);

function fixture(root: string, repoRoot: string, policy: GatePolicy): readonly string[] {
  const proof = policy.mustFlag[0];
  if (proof === undefined) {
    throw new Error(`native type projection control is missing for ${policy.id}`);
  }
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const files = Object.keys(proof.files);
  if (policy === sections) {
    files.push(SECTION_SHADOW);
  }
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "preserve", strict: true, skipLibCheck: true, types: [] };
  write("tsconfig.json", JSON.stringify({ compilerOptions, files }));
  write("package.json", JSON.stringify({ name: "native-type-projection-fixture", type: "module" }));
  for (const [path, text] of Object.entries(proof.files)) {
    if (policy === sections && path === "packages/client/src/state/section-registry.ts") {
      const unexported = text
        .replace("export interface SectionDefinition", "interface SectionDefinition")
        .replace("export type SectionDefinition", "type SectionDefinition");
      if (unexported === text) {
        throw new Error("section export-list control did not replace its keyword export");
      }
      write(path, unexported + "\nexport type { SectionDefinition };\n");
    } else {
      write(path, text);
    }
  }
  if (policy === sections) {
    write(SECTION_SHADOW, "type SectionDefinition={readonly shadow:true};const local:SectionDefinition={shadow:true};export const marker=local;");
  }
  const companion = COMPANIONS.get(policy);
  const modules = companion === undefined ? [policy.id] : [policy.id, companion];
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: modules.map((id) => `src/verify/gates/${id}.ts`) }));
  for (const id of modules) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`,
    );
  }
  if (policy === portal) {
    const manifest = "tooling/src/verify/gates/baseui-surface.manifest.json";
    write(manifest, readFileSync(join(repoRoot, manifest), "utf8"));
  }
  execFixtureGit(root, ["init", "-q"]);
  return files;
}

function poisonSyntax(project: Project): Disposable {
  const readType = Node.prototype.getType;
  const readSymbol = Node.prototype.getSymbol;
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary type-projection Type read");
    }
    return readType.call(this);
  });
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary type-projection Symbol read");
    }
    return readSymbol.call(this);
  });
  return {
    [Symbol.dispose]: (): void => {
      symbols.mockRestore();
      types.mockRestore();
    },
  };
}

for (const policy of COHORT) {
  test(
    `${policy.id} retains actual structure/scoped findings with poisoned ordinary type access`,
    async ({ scratch, repoRoot }) => {
      const files = fixture(scratch, repoRoot, policy);
      const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
      const context = projectCtx(scratch);
      const run = (): ReturnType<typeof runPolicyPass> =>
        runPolicyPass({
          root: scratch,
          project: context.project,
          ...nativeTypeFactOptions(context),
          policies: [policy],
          knownPolicies: [policy],
          reviewedGrants: [],
          failOnWarnings: false,
        });
      const baseline = run();
      expect(baseline.toolErrors).toEqual([]);
      expect(baseline.authority.effectiveFindings).toHaveLength(policy.mustFlag[0].expect.count);
      const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
      using _poison = poisonSyntax(context.project);
      try {
        expect([await runStructure(scratch, [`--check=${policy.id}`]), await runScopedCli(scratch, ["--scope", files.join(",")])]).toEqual([1, 1]);
        const result = run();
        expect(result.toolErrors).toEqual([]);
        expect(result.authority.withheldPolicyIds).toEqual([]);
        expect(result.authority.effectiveFindings).toEqual(baseline.authority.effectiveFindings);
      } finally {
        getContext.mockRestore();
      }
    },
    scaledBudget(60_000),
  );
}
