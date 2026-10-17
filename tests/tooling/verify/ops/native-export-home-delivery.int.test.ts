// Native child commands execute; in-process verdicts borrow pinned historical SQLite observations.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Project } from "ts-morph";
import { Node, SourceFile } from "ts-morph";
import { afterEach, beforeEach, vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as content } from "../../../../tooling/src/verify/gates/content-part-seam.ts";
import { gate as scrubberReferences } from "../../../../tooling/src/verify/gates/scrubber-home.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

const NODE_SOURCE = "packages/server/src/domain/chat/verbs/native-export.ts";
const BROWSER_SOURCE = "packages/client/src/features/chat/native-export.tsx";
const CONTENT_HOME = "packages/contracts/src/chat/bus.ts";
const SCRUBBER_HOME = "packages/kit/src/content/index.ts";
const POLICIES = [content];
const LOADED_POLICIES = [...POLICIES, scrubberReferences];

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [] };
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: [NODE_SOURCE, CONTENT_HOME, SCRUBBER_HOME, "foreign.ts"] }));
  write("tsconfig.tests-dom.json", JSON.stringify({ compilerOptions: { ...compilerOptions, customConditions: ["browser"] }, files: [BROWSER_SOURCE] }));
  write(
    "package.json",
    JSON.stringify({ name: "native-export-home-fixture", type: "module", imports: { "#part": { browser: "./foreign.ts", default: `./${CONTENT_HOME}` } } }),
  );
  write(CONTENT_HOME, "export type ChatContentPart={readonly type:string};\n");
  write(SCRUBBER_HOME, "export function createHiddenSpanStreamScrubber():null{return null;}\n");
  write("foreign.ts", "export type ChatContentPart={readonly foreign:true};\n");
  write(NODE_SOURCE, "import type {ChatContentPart as Part} from '#part';\nexport type Result=Part;\n");
  write(BROWSER_SOURCE, "import type * as parts from '#part';\nexport type Result=parts.ChatContentPart;\n");
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: LOADED_POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of LOADED_POLICIES) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
});
afterEach(() => vi.restoreAllMocks());

function poisonSyntax(project: Project): Disposable {
  const readExports = SourceFile.prototype.getExportedDeclarations;
  const readType = Node.prototype.getType;
  const readSymbol = Node.prototype.getSymbol;
  const exports = vi.spyOn(SourceFile.prototype, "getExportedDeclarations").mockImplementation(function (this: SourceFile) {
    if (this.getProject() === project) {
      throw new Error("ordinary export-home read");
    }
    return readExports.call(this);
  });
  const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary export-home Type read");
    }
    return readType.call(this);
  });
  const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
    if (this.getProject() === project) {
      throw new Error("ordinary export-home Symbol read");
    }
    return readSymbol.call(this);
  });
  return {
    [Symbol.dispose]: (): void => {
      exports.mockRestore();
      types.mockRestore();
      symbols.mockRestore();
    },
  };
}

test(
  "native export homes and references survive poisoned syntax through actual structure and scoped doors",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const context = projectCtx(scratch);
    using _poison = poisonSyntax(context.project);
    const syntaxReads: number[] = [];
    const workers: string[] = [];
    const observation = { forbidSyntax: true, syntaxReads, workers };
    const structure = await nativeVerifyFixture(scratch, "structure", [`--check=${content.id}`], observation);
    const scoped = await nativeVerifyFixture(scratch, "scoped", ["--scope", `${NODE_SOURCE},${BROWSER_SOURCE},${CONTENT_HOME},${SCRUBBER_HOME}`], observation);
    expect({ structure, scoped }).toEqual({ structure: 1, scoped: 1 });
    expect(syntaxReads).toEqual([0, 0]);
    expect(workers.length).toBeGreaterThan(0);
    const result = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      knownPolicies: LOADED_POLICIES,
      policies: POLICIES,
      requestedPaths: [NODE_SOURCE, BROWSER_SOURCE, CONTENT_HOME, SCRUBBER_HOME],
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(
      result.policies.map(({ id, findings }) => ({ id, findings: findings.map(({ file, line, column, token }) => ({ file, line, column, token })) })),
    ).toEqual([{ id: content.id, findings: [{ file: NODE_SOURCE, line: 1, column: 14, token: "ChatContentPart" }] }]);
    expect(result.policies.map(({ receipts }) => receipts)).toMatchObject([
      [{ kind: "population", source: "ChatContentPart declaration home", members: 1, unresolved: 0 }],
    ]);
  },
  scaledBudget(60_000),
);

test("the retained export-home policy proofs preserve their catch, pass and grant witnesses", () => {
  expect(verifyPolicyProofs(POLICIES)).toEqual([]);
});
