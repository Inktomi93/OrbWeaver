import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { createSemanticWorkspace } from "@orb/tooling/_shared/ts-workspace";
import { buildLiveness, collectOrphanCandidates } from "@orb/tooling/ast";
import { Node } from "ts-morph";
import { expect, test } from "../../support/tool-fixtures.ts";

function write(root: string, path: string, text: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

function initializeWorldFixture(root: string): void {
  write(
    root,
    "tsconfig.base.json",
    '{"compilerOptions":{"strict":true,"target":"ES2022","module":"ESNext","moduleResolution":"Bundler","types":[]},"files":[]}\n',
  );
  write(root, "packages/contracts/tsconfig.json", '{"extends":"../../tsconfig.base.json","compilerOptions":{"lib":["ES2022"]},"files":["src/index.ts"]}\n');
  write(root, "packages/server/tsconfig.json", '{"extends":"../../tsconfig.base.json","compilerOptions":{"lib":["ES2022"]},"files":["src/node.ts"]}\n');
  write(
    root,
    "packages/client/tsconfig.json",
    '{"extends":"../../tsconfig.base.json","compilerOptions":{"lib":["ES2022","DOM"]},"files":["src/browser.ts"]}\n',
  );
  write(root, "tsconfig.scan.json", '{"extends":"./tsconfig.base.json","compilerOptions":{"lib":["ES2022","DOM"]},"include":["**/*.ts"]}\n');
  write(
    root,
    "packages/contracts/src/index.ts",
    "export const token = 'shared';\nexport const unused = 'unused';\nexport const common = 'common';\nexport const commonUse = common;\nexport const schema = { value: 'shape' } as const;\n",
  );
  write(root, "packages/server/src/node.ts", "export const nodeValue = 'node';\nexport const wrongWorld = document.createElement('button');\n");
  write(
    root,
    "packages/client/src/browser.ts",
    "import { schema, token } from '../../contracts/src/index.js';\nexport const browserValue = token;\nexport type BrowserShape = typeof schema;\nexport const button = document.createElement('button');\n",
  );
  write(root, ".gitignore", ".claude/worktrees/\nnode_modules/\n");
  write(root, ".claude/worktrees/decoy/packages/client/src/browser.ts", "export const decoy = document.createElement('button');\n");
  write(root, "node_modules/decoy/index.ts", "export const dependencyDecoy = true;\n");
  const initialized = runNicedSync("git", ["init", "-q"], { cwd: root });
  if (initialized.status !== 0) {
    throw new Error(initialized.stderr);
  }
}

test("semantic workspace preserves native browser and node worlds", ({ scratch }) => {
  initializeWorldFixture(scratch);
  const workspace = createSemanticWorkspace({ root: scratch });
  const browser = workspace.program("packages/client/tsconfig.json");
  const node = workspace.program("packages/server/tsconfig.json");
  expect(browser).toBeDefined();
  expect(node).toBeDefined();
  if (node === undefined) {
    throw new Error("server semantic program was not loaded");
  }

  const button = browser?.sourceFile("packages/client/src/browser.ts")?.getVariableDeclarationOrThrow("button");
  expect(button?.getType().getText()).toBe("HTMLButtonElement");
  expect(workspace.sourceCorpus().getSourceFile("packages/client/src/browser.ts")?.getVariableDeclarationOrThrow("button").getType().getText()).toBe(
    "HTMLButtonElement",
  );
  expect(
    node
      .project()
      .getPreEmitDiagnostics()
      .some((diagnostic) => diagnostic.getCode() === 2584),
  ).toBe(true);
});

test("semantic references union overlapping native programs by physical identity", ({ scratch }) => {
  initializeWorldFixture(scratch);
  const workspace = createSemanticWorkspace({ root: scratch });
  expect(workspace.rootOwners("packages/contracts/src/index.ts").map(({ descriptor }) => descriptor.config)).toEqual([
    "packages/contracts/tsconfig.json",
    "tsconfig.scan.json",
  ]);

  const declaration = workspace
    .program("packages/contracts/tsconfig.json")
    ?.sourceFile("packages/contracts/src/index.ts")
    ?.getVariableDeclarationOrThrow("token")
    .getNameNode();
  expect(declaration !== undefined && Node.isReferenceFindable(declaration)).toBe(true);
  const references = declaration === undefined ? [] : workspace.findReferences(declaration);
  expect(references.map(({ canonicalPath }) => canonicalPath.slice(scratch.length + 1))).toEqual([
    "packages/client/src/browser.ts",
    "packages/client/src/browser.ts",
  ]);

  const common = workspace
    .program("packages/contracts/tsconfig.json")
    ?.sourceFile("packages/contracts/src/index.ts")
    ?.getVariableDeclarationOrThrow("common")
    .getNameNode();
  const commonReferences = common === undefined ? [] : workspace.findReferences(common);
  expect(commonReferences.map(({ canonicalPath }) => canonicalPath.slice(scratch.length + 1))).toEqual(["packages/contracts/src/index.ts"]);

  const unused = workspace
    .program("packages/contracts/tsconfig.json")
    ?.sourceFile("packages/contracts/src/index.ts")
    ?.getVariableDeclarationOrThrow("unused")
    .getNameNode();
  expect(unused === undefined ? [] : workspace.findReferences(unused)).toEqual([]);

  const schema = workspace
    .program("packages/contracts/tsconfig.json")
    ?.sourceFile("packages/contracts/src/index.ts")
    ?.getVariableDeclarationOrThrow("schema")
    .getNameNode();
  expect(schema === undefined ? [] : workspace.findReferences(schema).map(({ canonicalPath }) => canonicalPath.slice(scratch.length + 1))).toEqual([
    "packages/client/src/browser.ts",
    "packages/client/src/browser.ts",
  ]);

  const live = buildLiveness(workspace.sourceCorpus());
  const orphanNames = collectOrphanCandidates(workspace.sourceCorpus(), live, () => true).map(({ name }) => name);
  expect(orphanNames).not.toContain("token");
  expect(orphanNames).toContain("unused");
});

test("authored source views exclude ignored worktrees and dependencies", ({ scratch }) => {
  initializeWorldFixture(scratch);
  const workspace = createSemanticWorkspace({ root: scratch });
  const roots = workspace.programs.flatMap(({ descriptor }) => descriptor.files);
  expect(roots).toContain("packages/client/src/browser.ts");
  expect(roots).not.toContain(".claude/worktrees/decoy/packages/client/src/browser.ts");
  expect(roots).not.toContain("node_modules/decoy/index.ts");
  expect(
    workspace
      .sourceCorpus()
      .getSourceFiles()
      .map((sourceFile) => sourceFile.getFilePath()),
  ).not.toEqual(expect.arrayContaining([expect.stringContaining("/.claude/worktrees/"), expect.stringContaining("/node_modules/decoy/")]));
});

function initializeZeroProgramRepository(scratch: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    write(scratch, path, text);
  }
  const initialized = runNicedSync("git", ["init", "-q"], { cwd: scratch });
  if (initialized.status !== 0) {
    throw new Error(initialized.stderr);
  }
}

test("semantic workspace refuses a repository with no config", ({ scratch }) => {
  initializeZeroProgramRepository(scratch, { "src/a.ts": "export const a = 1;\n" });
  expect(() => createSemanticWorkspace({ root: scratch })).toThrow(/no runnable TypeScript programs/u);
});

test("semantic workspace refuses a repository with only an empty template", ({ scratch }) => {
  initializeZeroProgramRepository(scratch, { "tsconfig.base.json": '{"files":[]}\n', "src/a.ts": "export const a = 1;\n" });
  expect(() => createSemanticWorkspace({ root: scratch })).toThrow(/no runnable TypeScript programs/u);
});
