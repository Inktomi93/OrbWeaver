// Native byte and candidate-index contracts run independently of policy analysis.
import { chmodSync, copyFileSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { sep } from "node:path";
import process from "node:process";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, fixturePath, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import type { Selection } from "@orb/tooling/verify";
import { REGISTRY, runGitTextSafety, stagesForTier } from "@orb/tooling/verify";
import { vi } from "vitest";

const VERB = "git-text-safety";
const STAGE = "lint:git-text-safety";

async function repository(plantedTree: ToolFixtures["plantedTree"], files: Readonly<Record<string, string>>): Promise<string> {
  const root = await plantedTree({
    "packages/anchor.txt": "clean",
    "tooling/anchor.txt": "clean",
    "tests/anchor.txt": "clean",
    "scripts/anchor.txt": "clean",
    "docs/anchor.txt": "clean",
    ...files,
  });
  execFixtureGit(root, ["init", "--quiet"]);
  execFixtureGit(root, ["add", "."]);
  return root;
}

test("native CLI blocks raw NUL bytes without policy dispatch", async ({ plantedTree, runCli }) => {
  const root = await repository(plantedTree, { "docs/source.md": "a\u0000b\u0000c\n" });
  const result = await runCli("verify", [VERB], { cwd: root });
  await expect(result).toExitWith(1);
  expect(result.stdout.match(/docs\/source\.md:1:1/gu)).toHaveLength(2);
});

test("native CLI blocks candidate-index executable tests without relying on disk mode", async ({ plantedTree, runCli }) => {
  const root = await repository(plantedTree, { "tests/example.test.ts": "export const example = true;\n" });
  execFixtureGit(root, ["update-index", "--chmod=+x", "--", "tests/example.test.ts"]);
  const result = await runCli("verify", [VERB], { cwd: root });
  await expect(result).toExitWith(1);
  expect(result.stdout).toContain("tests/example.test.ts:1:1");
  expect(result.stdout).toContain("100755");
});

test("native safety remains static/application/changed while commit stage admission stays unchanged", () => {
  const row = REGISTRY.find(({ name }) => name === STAGE);
  expect(row?.argv).toEqual(["node", "tooling/src/verify/cli.ts", VERB]);
  expect(row?.applicationArgv).toEqual(["node", "tooling/src/verify/cli.ts", VERB, "--application"]);
  for (const tier of ["changed", "static", "push", "full", "product", "weekly"] as const) {
    expect(stagesForTier(tier).some(({ name }) => name === STAGE)).toBe(true);
  }
  const selection: Selection = {
    kind: "staged",
    label: "staged safety controls",
    paths: ["docs/source.md"],
    existingPaths: ["docs/source.md"],
    runtimeSubjects: [],
    eslintPaths: [],
    depcruisePaths: [],
    docsPaths: ["docs/source.md"],
    tsconfigs: [],
    ct: { mode: "skip", targets: [] },
    checkScopeArgv: ["node", "tooling/src/verify/cli.ts", "scoped"],
    gitRef: undefined,
  };
  expect(row?.scopedArgv?.(selection)).toEqual(["node", "tooling/src/verify/cli.ts", VERB, "docs/source.md"]);
  expect(stagesForTier("static", selection).map(({ name }) => name)).toEqual(["lint:biome", "types:native"]);
});

async function verdict(root: string, args: readonly string[] = []): Promise<{ readonly code: number; readonly output: string }> {
  const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const code = await runGitTextSafety(root, args);
    return { code, output: output.mock.calls.map(([chunk]) => String(chunk)).join("") };
  } finally {
    output.mockRestore();
  }
}

test("raw-byte subjects include hidden, ignored and untracked authored text with occurrence lines", async ({ plantedTree }) => {
  const root = await repository(plantedTree, { ".gitignore": "docs/ignored.md\n" });
  for (const path of ["docs/ignored.md", "docs/.hidden.md", "docs/untracked.md"]) {
    writeFileSync(fixturePath(root, path), "é\n\u0000x\u0000\n");
  }
  mkdirSync(fixturePath(root, "docs/.hidden"));
  writeFileSync(fixturePath(root, "docs/.hidden/child.txt"), "\u0000");
  const result = await verdict(root);
  expect(result.code).toBe(1);
  expect(result.output.match(/:2:1 raw NUL/gu)).toHaveLength(6);
  expect(result.output).toContain("docs/.hidden/child.txt:1:1");
});

test("source escapes, Unicode and excluded binary/generated inputs remain legal", async ({ plantedTree }) => {
  const files = Object.fromEntries(["node_modules", "dist", ".cache", "coverage", ".turbo", "generated"].map((dir) => [`docs/${dir}/bad.txt`, "\u0000"]));
  const root = await repository(plantedTree, { ...files, "docs/escaped.md": "é \\u0000 \\0", "docs/image.bin": "\u0000", "outside.txt": "\u0000" });
  expect((await verdict(root)).code).toBe(0);
});

test("requested subjects isolate findings without skipping required input acquisition", async ({ plantedTree }) => {
  const root = await repository(plantedTree, { "docs/bad.md": "\u0000", "docs/good.md": "clean" });
  expect((await verdict(root, ["docs/good.md"])).code).toBe(0);
  expect((await verdict(root, ["docs"])).code).toBe(1);
  symlinkSync("missing.txt", fixturePath(root, "tooling/broken.txt"));
  await expect(verdict(root, ["docs/good.md"])).rejects.toThrow("symbolic link");
});

for (const mode of ["missing", "empty", "file"] as const) {
  test(`required source roots refuse ${mode} even for a foreign selected subject`, async ({ plantedTree }) => {
    const root = await repository(plantedTree, {});
    rmSync(fixturePath(root, "docs"), { recursive: true });
    if (mode === "empty") {
      mkdirSync(fixturePath(root, "docs"));
    }
    if (mode === "file") {
      writeFileSync(fixturePath(root, "docs"), "not a directory");
    }
    await expect(verdict(root, ["packages/anchor.txt"])).rejects.toThrow();
  });
}

test("native candidate index ignores disk execute bits and non-test executable entries", async ({ plantedTree }) => {
  const root = await repository(plantedTree, { "tests/example.ts": "test", "scripts/example.sh": "script" });
  chmodSync(fixturePath(root, "tests/example.ts"), 0o755);
  execFixtureGit(root, ["update-index", "--chmod=+x", "--", "scripts/example.sh"]);
  expect((await verdict(root)).code).toBe(0);
  execFixtureGit(root, ["update-index", "--chmod=+x", "--", "tests/example.ts"]);
  expect((await verdict(root, ["docs"])).code).toBe(0);
  expect((await verdict(root, ["tests"])).output).toContain("tests/example.ts:1:1 candidate-index");
});

test("actual CLI honors a candidate alternate index at its invocation root", async ({ plantedTree, runCli }) => {
  const root = await repository(plantedTree, { "tests/example.ts": "test" });
  const alternate = fixturePath(root, ".git/alternate-index");
  execFixtureGit(root, ["update-index", "--chmod=+x", "--", "tests/example.ts"]);
  copyFileSync(fixturePath(root, ".git/index"), alternate);
  execFixtureGit(root, ["update-index", "--chmod=-x", "--", "tests/example.ts"]);
  expect((await verdict(root)).code).toBe(0);
  const result = await runCli("verify", [VERB], { cwd: root, env: { ...inheritedProcessEnv(), ["GIT_INDEX_FILE"]: alternate } });
  await expect(result).toExitWith(1);
  expect(result.stdout).toContain("100755");
});

test("native CLI refuses index absence and invalid view arguments", async ({ plantedTree, runCli }) => {
  const root = await plantedTree({ "docs/anchor.txt": "clean" });
  const missing = await runCli("verify", [VERB], { cwd: root });
  await expect(missing).toExitWith(2);
  for (const args of [["--unknown"], ["--application", "docs"], ["../outside"]]) {
    await expect(verdict(root, args)).rejects.toThrow();
  }
});

test("unreadable eligible siblings refuse but excluded binary bytes need not be acquired", async ({ plantedTree }) => {
  const root = await repository(plantedTree, { "docs/eligible.txt": "clean", "docs/binary.bin": "binary" });
  const eligible = fixturePath(root, "docs/eligible.txt");
  const binary = fixturePath(root, "docs/binary.bin");
  chmodSync(binary, 0o000);
  try {
    expect((await verdict(root)).code).toBe(0);
    chmodSync(eligible, 0o000);
    await expect(verdict(root, ["packages/anchor.txt"])).rejects.toThrow("EACCES");
  } finally {
    chmodSync(eligible, 0o644);
    chmodSync(binary, 0o644);
  }
});

test("valid empty candidate index refuses rather than claiming clean", async ({ plantedTree }) => {
  const root = await repository(plantedTree, {});
  execFixtureGit(root, ["read-tree", "--empty"]);
  await expect(verdict(root)).rejects.toThrow("candidate index is empty");
});

for (const operand of ["dot", "absolute"] as const) {
  test(`root ${operand} operand judges both native contracts instead of an empty view`, async ({ plantedTree }) => {
    const root = await repository(plantedTree, { "docs/bad.md": "\u0000", "tests/bad.ts": "test" });
    execFixtureGit(root, ["update-index", "--chmod=+x", "--", "tests/bad.ts"]);
    const result = await verdict(root, [operand === "dot" ? "." : root]);
    expect(result.code).toBe(1);
    expect(result.output).toContain("docs/bad.md:1:1");
    expect(result.output).toContain("tests/bad.ts:1:1");
  });
}

test("directory selection includes descendants but not neighboring prefixes", async ({ plantedTree }) => {
  const root = await repository(plantedTree, { "docs/part/bad.md": "\u0000", "docs/partial/bad.md": "\u0000" });
  const result = await verdict(root, ["docs/part"]);
  expect(result.code).toBe(1);
  expect(result.output).toContain("docs/part/bad.md:1:1");
  expect(result.output).not.toContain("docs/partial/bad.md:1:1");
});

test.skipIf(sep !== "/")("POSIX selection preserves a literal backslash filename instead of selecting its slash neighbor", async ({ plantedTree }) => {
  const root = await repository(plantedTree, { "docs/literal/name.txt": "clean" });
  writeFileSync(fixturePath(root, "docs/literal\\name.txt"), "\u0000");
  expect((await verdict(root, ["docs/literal\\name.txt"])).output).toContain("docs/literal\\name.txt:1:1");
  expect((await verdict(root, ["docs/literal/name.txt"])).code).toBe(0);
});

test("Windows native relative selection matches POSIX source and candidate-index paths", async ({ plantedTree }) => {
  const root = await repository(plantedTree, { "docs/bad.md": "\u0000", "tests/bad.ts": "test" });
  execFixtureGit(root, ["update-index", "--chmod=+x", "--", "tests/bad.ts"]);
  // Use Node's actual Windows path projection while the fixture's filesystem operations remain native.
  vi.doMock("node:path", async () => {
    const actual = await vi.importActual<typeof import("node:path")>("node:path");
    return { ...actual, relative: actual.win32.relative, sep: actual.win32.sep };
  });
  vi.resetModules();
  const output = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const { runGitTextSafety: windowsOperation } = await import("../../../../tooling/src/verify/ops/git-text-safety.ts");
    expect(await windowsOperation(root, ["docs/bad.md", "tests/bad.ts"])).toBe(1);
    const text = output.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(text).toContain("docs/bad.md:1:1");
    expect(text).toContain("tests/bad.ts:1:1");
  } finally {
    output.mockRestore();
    vi.doUnmock("node:path");
    vi.resetModules();
  }
});

test("all five authored roots preserve raw TypeScript comments/templates and tooling-self source coverage", async ({ plantedTree }) => {
  const root = await repository(plantedTree, {
    "packages/raw.ts": "// comment\u0000\nexport const raw = `a\u0000b`;\n",
    "tooling/src/verify/gates/self.ts": 'export const self = "\u0000";\n',
    "tests/raw.ts": 'export const raw = "\u0000";\n',
    "scripts/raw.sh": "# comment\u0000\n",
    "docs/raw.md": "prose\u0000\n",
  });
  const result = await verdict(root);
  expect(result.code).toBe(1);
  expect(result.output.match(/raw NUL source byte/gu)).toHaveLength(6);
  for (const location of [
    "packages/raw.ts:1:1",
    "packages/raw.ts:2:1",
    "tooling/src/verify/gates/self.ts:1:1",
    "tests/raw.ts:1:1",
    "scripts/raw.sh:1:1",
    "docs/raw.md:1:1",
  ]) {
    expect(result.output).toContain(location);
  }
});
