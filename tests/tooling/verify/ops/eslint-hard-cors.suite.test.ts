// D61's raw literal policy runs through the actual non-suppressible native profile.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint } from "eslint";

const SERVER = "packages/server/src/infra/network/probe.ts";
const INFERENCE = "packages/inference/src/probe.ts";
const CLIENT = "packages/client/src/features/probe.ts";
const HARD_CONFIG = "eslint-hard.config.js";

const cases = [
  { name: "founding string literal", source: 'export const proxy="https://corsproxy.io/?url=";', errors: 1 },
  { name: "template head", source: "export const proxy=(url:string)=>`https://corsproxy.io/?url=${url}`;", errors: 1 },
  { name: "no-substitution template", source: "export const proxy=`https://corsproxy.io/?url=`;", errors: 1 },
  { name: "template middle", source: "export const proxy=(scheme:string,url:string)=>`${scheme}://corsproxy.io/?url=${url}`;", errors: 1 },
  { name: "template tail", source: "export const proxy=(scheme:string)=>`${scheme}://corsproxy.io/?url=`;", errors: 1 },
  { name: "unrelated origin", source: 'export const origin="https://example.test/?url=";', errors: 0 },
  { name: "comment is outside the literal policy", source: "// corsproxy.io is forbidden as a literal.\nexport const proxy=null;", errors: 0 },
  { name: "client population fence", path: CLIENT, source: 'export const proxy="https://corsproxy.io/?url=";', errors: 0 },
  { name: "inference population", path: INFERENCE, source: 'export const proxy="corsproxy.io";', errors: 1 },
  { name: "generated server input", path: "packages/server/src/infra/network/probe.gen.ts", source: 'export const proxy="corsproxy.io";', errors: 1 },
  { name: "ambient declaration", path: "packages/server/src/infra/network/probe.d.ts", source: 'declare const proxy:"corsproxy.io";', errors: 1 },
  { name: "JSX attribute", path: "packages/server/src/infra/network/probe.tsx", source: 'export const node=<Widget label="corsproxy.io"/>;', errors: 1 },
  { name: "raw escapes remain raw", source: String.raw`export const proxy="corsproxy\u002eio";`, errors: 0 },
  { name: "case remains exact", source: 'export const proxy="CORSPROXY.IO";', errors: 0 },
  { name: "split spans are not a new string evaluator", source: 'export const proxy="cors"+"proxy.io";', errors: 0 },
  { name: "regular expression is not a string literal", source: "export const proxy=/corsproxy.io/;", errors: 0 },
  {
    name: "next-line disable",
    source: '// eslint-disable-next-line no-restricted-syntax -- Attempted hard bypass.\nexport const proxy="corsproxy.io";',
    errors: 1,
  },
  { name: "block disable", source: '/* eslint-disable no-restricted-syntax -- Attempted hard bypass. */\nexport const proxy="corsproxy.io";', errors: 1 },
  { name: "blanket disable", source: '/* eslint-disable -- Attempted hard bypass. */\nexport const proxy="corsproxy.io";', errors: 1 },
  {
    name: "configuration comment disabling target and guardians",
    source:
      '/* eslint "no-restricted-syntax":"off", "@eslint-community/eslint-comments/no-restricted-disable":"off", "@eslint-community/eslint-comments/no-use":"off" */\nexport const proxy="corsproxy.io";',
    errors: 1,
  },
];

test.for(cases)("native hard CORS preserves $name", async (row, { repoRoot }) => {
  const path = row.path ?? SERVER;
  const eslint = new ESLint({ cwd: repoRoot, overrideConfigFile: join(repoRoot, HARD_CONFIG), allowInlineConfig: false });
  const effective = await eslint.calculateConfigForFile(join(repoRoot, path));
  const ordinary = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(join(repoRoot, path));
  expect(effective, path).toBeDefined();
  expect(effective.languageOptions).toEqual({
    ...ordinary.languageOptions,
    parserOptions: { ...ordinary.languageOptions.parserOptions, project: false, projectService: false, programs: null },
  });
  expect(effective.settings).toEqual(ordinary.settings);
  expect(effective.processor).toBe(ordinary.processor);
  expect(effective.languageOptions.parserOptions).toMatchObject({ project: false, projectService: false, programs: null });
  expect(effective.linterOptions.noInlineConfig).toBe(true);
  const [result] = await eslint.lintText(row.source, { filePath: join(repoRoot, path) });
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.warningCount).toBe(0);
  expect(result?.messages).toHaveLength(row.errors);
  expect(result?.messages.every(({ ruleId, message }) => ruleId === "no-restricted-syntax" && message.startsWith("D61 B5a:"))).toBe(true);
});

test("the actual ordinary canonical producer exception stays live and cannot excuse another line", async ({ repoRoot }) => {
  const path = join(repoRoot, "packages/server/src/transport/trpc/chat-events-bus.ts");
  const source = readFileSync(path, "utf8");
  const directive =
    "// eslint-disable-next-line orb/firehose-import-allowlist -- Canonical compatibility declaration projects its own producer; this is not a firehose consumer.";
  expect(source.split(directive)).toHaveLength(2);
  const ordinary = await new ESLint({ cwd: repoRoot }).calculateConfigForFile(path);
  const eslint = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        plugins: ordinary.plugins,
        linterOptions: ordinary.linterOptions,
        languageOptions: {
          ...ordinary.languageOptions,
          parserOptions: { ...ordinary.languageOptions.parserOptions, project: false, projectService: false, programs: null },
        },
        rules: { "orb/firehose-import-allowlist": ordinary.rules["orb/firehose-import-allowlist"] },
      },
    ],
  });
  const [allowed] = await eslint.lintText(source, { filePath: path });
  expect(allowed?.messages).toEqual([]);
  expect(allowed?.suppressedMessages).toMatchObject([{ ruleId: "orb/firehose-import-allowlist" }]);
  const [unlicensed] = await eslint.lintText(source.replace(directive, ""), { filePath: path });
  expect(unlicensed?.messages).toMatchObject([{ ruleId: "orb/firehose-import-allowlist" }]);
});
