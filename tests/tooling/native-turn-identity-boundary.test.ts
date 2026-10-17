// The engine's lexical identity boundary uses the installed native configuration, not a semantic lookalike.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/turn-identity-name";
const ENGINE = "packages/server/src/domain/chat/engine/native-identity-probe.ts";
const eslint = new ESLint({ cwd: ROOT });

test.for([
  { name: "binding and use", source: "export function read(principal: { userId: string }) { return principal.userId; }", count: 2 },
  { name: "optional receiver", source: "export const read = (principal?: { userId: string }) => principal?.userId;", count: 2 },
  { name: "type property", source: "export interface Frame { readonly principal: string; }", count: 1 },
  { name: "unquoted property", source: "export const frame = { principal: 1 }; export const read = frame.principal;", count: 2 },
  { name: "computed identifier", source: "const principal = 'field'; export const frame = { [principal]: 1 };", count: 2 },
  { name: "shorthand property", source: "const principal = 1; export const frame = { principal };", count: 2 },
  { name: "shorthand destructuring", source: "const { principal } = frame;", count: 1 },
  { name: "unaliased import", source: "import { principal } from 'foreign';", count: 1 },
  { name: "aliased import", source: "import { principal as caller } from 'foreign';", count: 1 },
  { name: "unaliased export", source: "const principal = 1; export { principal };", count: 2 },
  { name: "renamed export", source: "const caller = 1; export { caller as principal };", count: 1 },
  { name: "label", source: "principal: for (;;) { break principal; }", count: 2 },
  { name: "private identifier", source: "class Frame { #principal = 1; read() { return this.#principal; } }", count: 0 },
  { name: "renamed destructuring", source: "const frame = { principal: 1 }; const { principal: caller } = frame; export { caller };", count: 2 },
  {
    name: "TSX identifier and attribute",
    path: ENGINE.replace(/\.ts$/u, ".tsx"),
    source: "export const render = (principal: { userId: string }) => <Panel principal={principal.userId} />;",
    count: 3,
  },
  { name: "generated engine source", path: ENGINE.replace(/\.ts$/u, ".gen.ts"), source: "export const principal = 1;", count: 1 },
  { name: "quoted key and access", source: 'export const frame = { "principal": 1 }; export const read = frame["principal"];', count: 0 },
  { name: "comments and strings", source: '// principal\nexport const text = "principal";', count: 0 },
  {
    name: "foreign uppercase type",
    source: "interface Principal { wireVersion: number; } export const read = (value: Principal) => value.wireVersion;",
    count: 0,
  },
  { name: "local uppercase property", source: "const frame = { Principal: 1 }; export const read = frame.Principal;", count: 0 },
  {
    name: "verb layer",
    path: "packages/server/src/domain/chat/verbs/native-identity-probe.ts",
    source: "export const read = (principal: object) => principal;",
    count: 0,
  },
] as const)("native turn identity judges $name", async (row) => {
  const path = "path" in row ? row.path : ENGINE;
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const rule = config.rules[RULE];
  const messages = new Linter().verify(
    row.source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      rules: rule === undefined ? {} : { [RULE]: rule },
    },
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    row.source,
  ).toEqual([]);
  expect(
    messages.map(({ ruleId }) => ruleId),
    row.source,
  ).toEqual(Array.from({ length: row.count }, () => RULE));
});
