// A gate family test never writes with a raw fs verb; it writes through the scratch writers. The ban runs through
// the non-suppressible native profile, so no inline directive can excuse a raw write that blinds a gate.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint } from "eslint";
import { FS_SPECIFIERS, FS_WRITE_VERBS } from "../../../../tooling/src/verify/contract/fs-write-verbs.ts";
import { scaledBudget } from "../../_load-budget.ts";

const RULE = "orb/no-raw-fs-write-in-gate-tests";
const GATE_TEST = "tests/tooling/verify/gates/probe.test.ts";
const HARD_CONFIG = "eslint-hard.config.js";

async function lint(repoRoot: string, path: string, source: string): Promise<ESLint.LintResult | undefined> {
  const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: join(repoRoot, HARD_CONFIG), allowInlineConfig: false });
  const [result] = await eslint.lintText(source, { filePath: join(repoRoot, path) });
  return result;
}

const flagged: readonly { readonly name: string; readonly source: string; readonly errors: number }[] = [
  ...FS_WRITE_VERBS.map((verb) => ({
    name: `named import of ${verb}`,
    source: FS_SPECIFIERS.map(
      (specifier, index) => `import { ${verb} as w${index} } from ${JSON.stringify(specifier)};\nexport const x${index} = w${index};\n`,
    ).join(""),
    errors: FS_SPECIFIERS.length,
  })),
  { name: "namespace import", source: 'import * as fs from "node:fs";\nexport const x = fs;\n', errors: 1 },
  { name: "default import", source: 'import fs from "fs-extra";\nexport const x = fs;\n', errors: 1 },
  { name: "re-export of a verb", source: 'export { writeFileSync } from "node:fs";\n', errors: 1 },
  { name: "re-export of the whole door", source: 'export * from "node:fs/promises";\n', errors: 1 },
  { name: "dynamic import", source: 'export const x = await import("node:fs");\n', errors: 1 },
  { name: "require", source: 'declare const require: (id: string) => unknown;\nexport const x = require("fs");\n', errors: 1 },
  {
    name: "two imports are two findings",
    source: 'import { writeFileSync } from "node:fs";\nimport { rm } from "node:fs/promises";\nexport const x = [writeFileSync, rm];\n',
    errors: 2,
  },
  {
    name: "inline disable cannot suppress the hard rule",
    source: `// eslint-disable-next-line ${RULE} -- Attempted hard bypass.\nimport { writeFileSync } from "node:fs";\nexport const x = writeFileSync;\n`,
    errors: 1,
  },
];

const passing: readonly { readonly name: string; readonly source: string; readonly path?: string }[] = [
  {
    name: "read verbs",
    source:
      'import { createReadStream, existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs";\nimport { readFile, readdir, stat } from "node:fs/promises";\nexport const x = [createReadStream, existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync, readFile, readdir, stat];\n',
  },
  {
    name: "the scratch writers",
    source:
      'import { plantFile, plantLink, removePlanted, test } from "@orb/testkit/node/tool-fixtures.ts";\nexport const x = [plantFile, plantLink, removePlanted, test];\n',
  },
  { name: "unrelated node modules", source: 'import { join } from "node:path";\nimport { tmpdir } from "node:os";\nexport const x = [join, tmpdir];\n' },
  {
    name: "a local function with a verb's name",
    source: "function writeFileSync(path: string): string {\n  return path;\n}\nexport const x = writeFileSync;\n",
  },
  {
    name: "a gate test source string that spells an import is only text",
    source: "export const planted = 'import { writeFileSync } from \"node:fs\";';\n",
  },
  {
    name: "tests outside the gate family are outside the ban",
    path: "tests/tooling/verify/ops/probe.test.ts",
    source: 'import { writeFileSync } from "node:fs";\nexport const x = writeFileSync;\n',
  },
];

test.for(flagged)("native hard gate-test fs ban flags $name", { timeout: scaledBudget(60_000) }, async (row, { repoRoot }) => {
  const result = await lint(repoRoot, GATE_TEST, row.source);
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages).toHaveLength(row.errors);
  expect(result?.messages.every(({ ruleId }) => ruleId === RULE)).toBe(true);
});

test.for(passing)("native hard gate-test fs ban passes $name", { timeout: scaledBudget(60_000) }, async (row, { repoRoot }) => {
  const result = await lint(repoRoot, row.path ?? GATE_TEST, row.source);
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages).toEqual([]);
});

test("the rule is hard-only: the ordinary profile never enables it", { timeout: scaledBudget(60_000) }, async ({ repoRoot }) => {
  const path = join(repoRoot, GATE_TEST);
  const ordinary = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(path);
  const hard = await new ESLint({ cwd: repoRoot, overrideConfigFile: join(repoRoot, HARD_CONFIG), allowInlineConfig: false }).calculateConfigForFile(path);
  expect(ordinary?.rules?.[RULE]).toBeUndefined();
  expect(hard?.rules?.[RULE]).toEqual([2]);
});

test("every banned verb is a real fs export, and every sync verb sits beside its async twin", async () => {
  const exported = new Set([...Object.keys(await import("node:fs")), ...Object.keys(await import("node:fs/promises"))]);
  expect(FS_WRITE_VERBS.filter((verb) => !exported.has(verb))).toEqual([]);
  const verbs = new Set<string>(FS_WRITE_VERBS);
  const missingTwin = FS_WRITE_VERBS.filter((verb) => verb.endsWith("Sync") && !verbs.has(verb.slice(0, -"Sync".length)));
  expect(missingTwin).toEqual([]);
});
