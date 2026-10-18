import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint } from "eslint";
import { beforeAll } from "vitest";
import { discoverEslintFiles } from "../../../../tooling/src/verify/ops/eslint-discovery.ts";

const PARSER_CALLS = "parser-calls.txt";
const PROCESSOR_CALLS = "processor-calls.txt";
const RULE_CALLS = "rule-calls.txt";
const RULE = "no-debugger";

beforeAll(async () => {
  const root = join(import.meta.dirname, "../../../..");
  await import(pathToFileURL(join(root, "eslint.config.js")).href);
  await new ESLint({ cwd: root }).calculateConfigForFile(join(root, "packages/client/src/a-first.ts"));
});

async function fixture(plantedTree: ToolFixtures["plantedTree"], repoRoot: string): Promise<string> {
  const root = await plantedTree({
    "package.json": '{"type":"module"}',
    ".gitignore": "gitignored.js\n",
    [PARSER_CALLS]: "",
    [PROCESSOR_CALLS]: "",
    [RULE_CALLS]: "",
    "plain.js": "debugger;",
    "common.cjs": "debugger;",
    "module.mjs": "debugger;",
    ".hidden.js": "debugger;",
    "gitignored.js": "debugger;",
    "dir/component.tsx": "debugger;export const component=<span/>;",
    "dir/value.ts": "debugger;export const value:number=1;",
    "dir/helper.mts": "debugger;export const value:number=1;",
    "dir/helper.cts": "debugger;export const value:number=1;",
    "dir/helper.jsx": "debugger;export const component=<span/>;",
    "fragment.note": "debugger;",
    "unsupported.txt": "not JavaScript",
    "ignored/excluded.ts": "debugger;",
    "eslint.config.js": `import tseslint from "typescript-eslint";
import {appendFileSync} from "node:fs";
import {join} from "node:path";
export default [
  {ignores:["node_modules/**","ignored/**"]},
  {files:["**/*.{js,cjs,mjs,jsx,ts,tsx,mts,cts}"],
    languageOptions:{parser:{meta:tseslint.parser.meta,parseForESLint(code,options){
      appendFileSync(join(import.meta.dirname,${JSON.stringify(PARSER_CALLS)}),"parse\\n");
      return tseslint.parser.parseForESLint(code,options);
    }}},plugins:{proof:{rules:{observe:{create(){
      appendFileSync(join(import.meta.dirname,${JSON.stringify(RULE_CALLS)}),"rule\\n");
      return {};
    }}}}},rules:{${JSON.stringify(RULE)}:"error","proof/observe":"error"}},
  {files:["**/*.note"],processor:{
    preprocess(text){
      appendFileSync(join(import.meta.dirname,${JSON.stringify(PROCESSOR_CALLS)}),"preprocess\\n");
      return [{text,filename:"inside.ts"}];
    },postprocess(messages){return messages.flat();}
  }}
];`,
  });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  return root;
}

test("discovery preserves native filename admission without parsing source or executing configured processors and rules", async ({ plantedTree, repoRoot }) => {
  const root = await fixture(plantedTree, repoRoot);
  let whole: readonly string[] = [];
  for (const { patterns, linted, processed } of [
    { patterns: ["."], linted: true, processed: true },
    { patterns: ["dir"], linted: true, processed: false },
    { patterns: ["plain.js", "dir", "ignored/excluded.ts"], linted: true, processed: false },
    { patterns: ["dir/**/*.{ts,tsx,mts,cts,jsx}", "fragment.note"], linted: true, processed: true },
    { patterns: ["ignored/excluded.ts"], linted: false, processed: false },
  ]) {
    writeFileSync(join(root, PARSER_CALLS), "");
    writeFileSync(join(root, PROCESSOR_CALLS), "");
    writeFileSync(join(root, RULE_CALLS), "");
    const discovered = await discoverEslintFiles(root, patterns);
    expect(readFileSync(join(root, PARSER_CALLS), "utf8"), patterns.join(" ")).toBe("");
    expect(readFileSync(join(root, PROCESSOR_CALLS), "utf8"), patterns.join(" ")).toBe("");
    expect(readFileSync(join(root, RULE_CALLS), "utf8"), patterns.join(" ")).toBe("");

    const native = await new ESLint({ cwd: root, warnIgnored: false }).lintFiles(patterns);
    expect(discovered).toEqual(native.map(({ filePath }) => relative(root, filePath).split(sep).join("/")).toSorted());
    expect(readFileSync(join(root, PARSER_CALLS), "utf8") !== "").toBe(linted);
    expect(readFileSync(join(root, RULE_CALLS), "utf8") !== "").toBe(linted);
    expect(native.flatMap(({ messages }) => messages).some(({ ruleId }) => ruleId === RULE)).toBe(linted);
    expect(readFileSync(join(root, PROCESSOR_CALLS), "utf8") !== "").toBe(processed);
    if (patterns.includes(".")) {
      whole = discovered;
    }
  }
  expect(whole).toEqual(
    expect.arrayContaining([".hidden.js", "gitignored.js", "dir/component.tsx", "dir/value.ts", "common.cjs", "module.mjs", "fragment.note"]),
  );
  expect(whole).not.toContain("unsupported.txt");
  expect(whole).not.toContain("ignored/excluded.ts");
});

test("discovery retains native missing and wholly ignored glob refusals even beside a populated operand", async ({ plantedTree, repoRoot }) => {
  const root = await fixture(plantedTree, repoRoot);
  for (const patterns of [["missing.ts"], ["dir", "missing*.ts"], ["ignored/**/*.ts"]]) {
    let nativeError = "";
    try {
      await new ESLint({ cwd: root, warnIgnored: false }).lintFiles(patterns);
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      nativeError = error.message;
    }
    expect(nativeError).not.toBe("");
    await expect(discoverEslintFiles(root, patterns)).rejects.toThrow(nativeError);
  }
});

for (const [label, processor] of [
  ["unknown", '"missing/processor"'],
  ["malformed", '{preprocess:"not-a-function",postprocess(){return [];}}'],
] as const) {
  test(`discovery retains the original ${label} processor configuration refusal`, async ({ plantedTree }) => {
    const root = await plantedTree({
      "package.json": '{"type":"module"}',
      "subject.ts": "debugger;",
      "eslint.config.js": `export default [{files:["**/*.ts"],processor:${processor}}];`,
    });
    await expect(new ESLint({ cwd: root }).calculateConfigForFile(join(root, "subject.ts"))).rejects.toThrow();
    await expect(discoverEslintFiles(root, ["subject.ts"])).rejects.toThrow();
  });
}

for (const profile of ["default", "hardConfig"] as const) {
  for (const [label, invalid] of [
    ["unknown processor", 'processor:"missing/processor"'],
    ["malformed processor", 'processor:{preprocess:"invalid",postprocess(){return [];}}'],
    ["unknown rule", 'rules:{"missing-rule":"error"}'],
    ["invalid rule options", 'rules:{"no-restricted-syntax":["error",{selector:42}]}'],
  ] as const) {
    test(`discovery preserves ${profile} ${label} refusal on a non-first file`, async ({ plantedTree, repoRoot }) => {
      const first = "packages/client/src/a-first.ts";
      const second = "packages/client/src/z-second.ts";
      const config = pathToFileURL(join(repoRoot, "eslint.config.js")).href;
      const root = await plantedTree({
        "package.json": '{"type":"module"}',
        [first]: "export const first=1;",
        [second]: "export const second=2;",
        "eslint.config.js": `import {${profile} as rows} from ${JSON.stringify(config)};export default [...rows,{files:[${JSON.stringify(second)}],${invalid}}];`,
      });
      const eslint = new ESLint({ cwd: root });
      expect(await eslint.calculateConfigForFile(join(root, first))).toBeDefined();
      let nativeMessage = "";
      try {
        await eslint.calculateConfigForFile(join(root, second));
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
        nativeMessage = error.message;
      }
      expect(nativeMessage).not.toBe("");
      let discoveryMessage = "";
      try {
        await discoverEslintFiles(root, [first, second]);
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
        discoveryMessage = error.message;
      }
      expect(discoveryMessage).toBe(nativeMessage);
    });
  }
}
