// The actual verifier doors must resolve context utility identity through native facts, not syntax-carrier checkers.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import { vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate } from "../../../../tooling/src/verify/gates/no-context-returntype.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const SERVER = "packages/server/src/domain/chat/context.ts";
const BROWSER = "packages/client/src/features/chat/context.ts";

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [] };
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: [SERVER, "node-reflection.ts", "browser-reflection.ts"] }));
  write("tsconfig.tests-dom.json", JSON.stringify({ compilerOptions: { ...compilerOptions, customConditions: ["browser"] }, files: [BROWSER] }));
  write(
    "package.json",
    JSON.stringify({
      name: "native-context-fixture",
      type: "module",
      imports: {
        "#reflection": { browser: "./browser-reflection.ts", default: "./node-reflection.ts" },
      },
    }),
  );
  write("node-reflection.ts", "export type Other<T> = { readonly node: T };\n");
  write("browser-reflection.ts", "export type ReturnType<T> = { readonly browser: T };\n");
  write(SERVER, "declare function build(): {value:number};\nexport type Ctx = ReturnType<typeof build>;\nexport const invalid = ReturnType;\n");
  write(BROWSER, 'import type { ReturnType } from "#reflection";\nexport type Foreign = ReturnType<() => string>;\n');
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: [`src/verify/gates/${gate.id}.ts`] }));
  write(
    `tooling/src/verify/gates/${gate.id}.ts`,
    `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${gate.id}.ts`)).href)};`,
  );
  execFixtureGit(root, ["init", "-q"]);
}

function poisonSyntax(project: Project): Disposable {
  const readType = Node.prototype.getType;
  const readSymbol = Node.prototype.getSymbol;
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary context utility Type read");
    }
    return readType.call(this);
  });
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary context utility Symbol read");
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

test(
  "actual structure and scoped doors preserve ambient, unreadable and browser-import meanings with poisoned syntax",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
    const context = projectCtx(scratch);
    const getContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
    using _poison = poisonSyntax(context.project);
    try {
      const exits = [await runStructure(scratch, [`--check=${gate.id}`]), await runScopedCli(scratch, ["--scope", `${SERVER},${BROWSER}`])];
      expect(exits).toEqual([1, 1]);
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        policies: [gate],
        knownPolicies: [gate],
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.authority.withheldPolicyIds).toEqual([]);
      expect(result.authority.effectiveFindings.map(({ file, line, column, token }) => ({ file, line, column, token }))).toEqual([
        { file: SERVER, line: 2, column: 19, token: "ReturnType" },
        { file: SERVER, line: 3, column: 24, token: "ReturnType" },
      ]);
      expect(result.authority.effectiveFindings[1]?.message).toContain("CANNOT be established");
    } finally {
      getContext.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test("context utility identity retains its complete declared origins, limits and ordinary waiver controls", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("missing native context refuses instead of consulting the ordinary checker", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const context = projectCtx(scratch);
  using _poison = poisonSyntax(context.project);
  const result = runPolicyPass({ root: scratch, project: context.project, policies: [gate], knownPolicies: [gate], reviewedGrants: [], failOnWarnings: false });
  expect(result.authority.withheldPolicyIds).toEqual([gate.id]);
  expect(result.toolErrors).toMatchObject([{ policyId: gate.id, message: expect.stringContaining("native type fact context is unavailable") }]);
});
