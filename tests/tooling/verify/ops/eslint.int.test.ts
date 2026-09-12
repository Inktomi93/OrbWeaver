import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import type { CompilerProgram } from "@orb/tooling/verify";
import { ESLint } from "eslint";
import { eslintConfiguredPaths } from "../../../../tooling/src/verify/ops/config-snapshot.ts";
import { parsedDiscovery, partitionEslintFiles, readDiscoveredPopulation } from "../../../../tooling/src/verify/ops/eslint.ts";
import { discoverEslintFiles } from "../../../../tooling/src/verify/ops/eslint-discovery.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function program(id: string, files: readonly string[]): CompilerProgram {
  return { id, config: id, files, references: [], configPaths: [id], commandLine: {} as CompilerProgram["commandLine"] };
}

test("discovery filenames equal native dot semantics across ignored, untracked, dotfile, and symlink arms", async () => {
  const root = mkdtempSync(join(tmpdir(), "orb-eslint-discovery-"));
  try {
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(root, ".gitignore"), "gitignored.js\n");
    writeFileSync(join(root, "eslint.config.js"), 'export default [{ ignores: ["ignored/**"] }, { files: ["**/*.{js,ts}"] }];\n');
    writeFileSync(join(root, ".hidden.js"), "export const hidden = true;\n");
    writeFileSync(join(root, "gitignored.js"), "export const ignoredByGitOnly = true;\n");
    writeFileSync(join(root, "untracked.ts"), "export const untracked = true;\n");
    writeFileSync(join(root, "target.js"), "export const target = true;\n");
    mkdirSync(join(root, "ignored"));
    writeFileSync(join(root, "ignored", "excluded.js"), "throw new Error();\n");
    symlinkSync("target.js", join(root, "linked.js"));

    const native = await new ESLint({ cwd: root }).lintFiles(["."]);
    const nativePaths = native.map(({ filePath }) => relative(root, filePath).split(sep).join("/")).toSorted();
    const discovered = await discoverEslintFiles(root);
    expect(discovered).toEqual(nativePaths);
    expect(await eslintConfiguredPaths(root, "eslint.config.js", [...discovered, "ignored/excluded.js"])).toEqual(discovered);
    expect(discovered).toEqual(expect.arrayContaining([".hidden.js", "gitignored.js", "untracked.ts", "target.js"]));
    expect(discovered).not.toContain("ignored/excluded.js");
    expect(discovered.includes("linked.js")).toBe(nativePaths.includes("linked.js"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discovery refuses a malformed native config instead of emitting an empty population", async () => {
  const root = mkdtempSync(join(tmpdir(), "orb-eslint-discovery-broken-"));
  try {
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(root, "eslint.config.js"), "export default [{ files: [ ;\n");
    await expect(discoverEslintFiles(root)).rejects.toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("partition uses one native compiler owner, keeps untyped residuals, and refuses unowned typed files", () => {
  const programs = [program("tsconfig.json", ["root.ts"]), program("packages/ui/tsconfig.json", ["packages/ui/src/x.ts"])] as const;
  expect(Object.fromEntries(partitionEslintFiles(["root.ts", "packages/ui/src/x.ts", "tool.js"], programs))).toEqual({
    "<untyped>": ["tool.js"],
    "packages/ui/tsconfig.json": ["packages/ui/src/x.ts"],
    "tsconfig.json": ["root.ts"],
  });
  expect(() => partitionEslintFiles(["missing.ts"], programs)).toThrow("no native compiler owner");
  expect(() => partitionEslintFiles([], programs)).toThrow("empty population");
  expect(() => partitionEslintFiles(["root.ts", "root.ts"], programs)).toThrow("duplicate file identities");
});
/** A minimal root the discovery child can actually enumerate: its own config, a package manifest, and three
 *  admitted files. Small on purpose — the ceiling arm below must blow a TINY ceiling, not a real one. */
function discoveryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "orb-eslint-ceiling-"));
  writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(root, "eslint.config.js"), 'export default [{ files: ["**/*.{js,ts}"] }];\n');
  for (const name of ["a.js", "b.js", "c.ts"]) {
    writeFileSync(join(root, name), "export const x = true;\n");
  }
  return root;
}

test("the discovery population is COMPLETE, not merely delivered — the child's own count is checked (#2212)", async () => {
  const root = discoveryRoot();
  try {
    // THE COMPLETION CONTROL. #2211 replaced a KILLED child with a raised ceiling; the failure that fix must
    // not introduce is a SILENTLY TRUNCATED list, and "the call returned" cannot tell those two apart. So the
    // child states the count it enumerated and the reader checks the delivered list against it.
    const delivered = readDiscoveredPopulation(root);
    expect([...delivered].toSorted()).toEqual([...(await discoverEslintFiles(root))].toSorted());
    expect(delivered.length).toBeGreaterThan(0);

    // …and the check BITES: a well-formed envelope whose list is one row short is refused BY NAME, not
    // accepted as a shorter population. This is the arm that separates a completion control from a
    // did-not-throw control, so it is asserted on the message an operator would actually read.
    const short = JSON.stringify({ count: delivered.length, files: delivered.slice(0, -1) });
    expect(() => parsedDiscovery(short)).toThrow("TRUNCATED in transit");
    expect(() => parsedDiscovery(JSON.stringify({ files: delivered }))).toThrow("no usable population count");
    expect(() => parsedDiscovery(JSON.stringify(delivered))).toThrow("malformed population envelope");
    // The honest pair: the exact envelope the child emits must PASS, or the control above proves only that
    // the reader is strict, never that the producer satisfies it.
    expect(parsedDiscovery(JSON.stringify({ count: delivered.length, files: delivered }))).toEqual(delivered);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a blown stdout ceiling refuses LOUDLY and names the site, rather than returning a short list (#2212)", () => {
  const root = discoveryRoot();
  try {
    // THE PLANTED CEILING ARM. A fuse nobody has watched blow is a fuse nobody knows is wired: the 64MiB
    // constant is driven down to a few bytes so the ENOBUFS path EXECUTES here, every run. node's own error
    // says "spawnSync nice ENOBUFS", which names the wrapper and not the population that outgrew it — #2211
    // cost a barrier tail plus a stack frame to attribute, so the door's translation is what is asserted.
    expect(() => readDiscoveredPopulation(root, 8)).toThrow("ESLint discovery outgrew its 8-byte stdout ceiling");
    expect(() => readDiscoveredPopulation(root, 8)).toThrow("tooling/src/verify/ops/eslint.ts");
    expect(() => readDiscoveredPopulation(root, 8)).toThrow("NO lint verdict exists for this run");
    // The counterfactual, so the arm above cannot pass by the door simply always throwing: the SAME call with
    // the real ceiling enumerates the same root cleanly.
    expect(readDiscoveredPopulation(root).length).toBeGreaterThan(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
