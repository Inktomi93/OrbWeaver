// Native child commands execute; in-process verdicts borrow pinned historical SQLite observations.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import { afterEach, beforeEach, vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate as routes } from "../../../../tooling/src/verify/gates/route-trpc-no-broad-spread.ts";
import { gate as sections } from "../../../../tooling/src/verify/gates/section-factory-contribution-bundle.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

const COHORT = [routes, sections] as const;
const SECTION_SHADOW = "packages/client/src/native-section-shadow.ts";

beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
});
afterEach(() => vi.restoreAllMocks());

test(
  "the retained native consumers preserve their complete declared rejection and acceptance controls",
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
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: [`src/verify/gates/${policy.id}.ts`] }));
  write(
    `tooling/src/verify/gates/${policy.id}.ts`,
    `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${policy.id}.ts`, import.meta.url).href)};`,
  );
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
      const syntaxReads: number[] = [];
      const workers: string[] = [];
      const observation = { forbidSyntax: true, syntaxReads, workers };
      expect([
        await nativeVerifyFixture(scratch, "structure", [`--check=${policy.id}`], observation),
        await nativeVerifyFixture(scratch, "scoped", ["--scope", files.join(",")], observation),
      ]).toEqual([1, 1]);
      expect(syntaxReads).toEqual([0, 0]);
      expect(workers.length).toBeGreaterThan(0);
      const baseline = run();
      expect(baseline.toolErrors).toEqual([]);
      expect(baseline.authority.effectiveFindings).toHaveLength(policy.mustFlag[0].expect.count);
      using _poison = poisonSyntax(context.project);
      const result = run();
      expect(result.toolErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
      expect(result.authority.effectiveFindings).toEqual(baseline.authority.effectiveFindings);
    },
    scaledBudget(60_000),
  );
}
