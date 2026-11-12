// orb/prefer-to-sorted refuses a copy-then-sort whose copied operand the checker types as an array or a tuple in every
// union member, and passes the spread of a Set, an iterator or a string, which has no `toSorted` and so no shorter copy.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/prefer-to-sorted";
const PROBE = "packages/kit/src/probe/to-sorted-probe.ts";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, PROBE));
}, 120_000);

// The kit's own compiler options over one probe file, so the lib that declares `toSorted` is the real one.
function programFor(fileName: string, source: string): ts.Program {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(ROOT, "packages/kit/tsconfig.json"),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic): never => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    },
  );
  const options = { ...(parsed?.options ?? {}), noEmit: true };
  const host = ts.createCompilerHost(options, true);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, create): ts.SourceFile | undefined =>
    name === fileName ? ts.createSourceFile(name, source, version, true, ts.ScriptKind.TS) : read(name, version, onError, create);
  const exists = host.fileExists.bind(host);
  host.fileExists = (name): boolean => name === fileName || exists(name);
  return ts.createProgram([fileName], options, host);
}

const DECLARATIONS = [
  "declare const names: string[];",
  "declare const frozen: readonly string[];",
  "declare const pair: readonly [number, number];",
  "declare const either: number[] | readonly number[];",
  "declare const tags: Set<string>;",
  "declare const byId: Map<string, number>;",
  "declare const word: string;",
  "declare const mixed: number[] | Set<number>;",
].join("\n");

async function findings(body: string): Promise<readonly Linter.LintMessage[]> {
  const fileName = join(ROOT, PROBE);
  const source = `${DECLARATIONS}\n${body}\n`;
  const config = await resolvedConfig(eslint, fileName);
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.ts"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: [programFor(fileName, source)] } },
      rules: { [RULE]: config.rules[RULE] ?? "off" },
    },
    { filename: fileName },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    body,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

test.for([
  ["a spread of an array", "export const sorted = [...names].sort();"],
  ["a spread of a readonly array", "export const sorted = [...frozen].sort((a, b) => a.localeCompare(b));"],
  ["a spread of a tuple", "export const sorted = [...pair].sort((a, b) => a - b);"],
  ["a spread of a union of arrays", "export const sorted = [...either].sort((a, b) => a - b);"],
  ["a spread of an array-constrained type parameter", "export const sorted = <T extends readonly number[]>(xs: T) => [...xs].sort((a, b) => a - b);"],
  ["an empty slice of an array", "export const sorted = names.slice().sort();"],
  ["an Array.from of an array", "export const sorted = Array.from(names).sort();"],
  ["a computed sort member", 'export const sorted = [...names]["sort"]();'],
] as const)("refuses %s", async ([, body]) => {
  expect((await findings(body)).map(({ message }) => message)).toEqual([expect.stringContaining("toSorted")]);
});

test.for([
  ["a spread of a Set", "export const sorted = [...tags].sort();"],
  ["a spread of a Map iterator", "export const sorted = [...byId.keys()].sort();"],
  ["a spread of a string", "export const sorted = [...word].sort();"],
  ["a union with a non-array member", "export const sorted = [...mixed].sort((a, b) => a - b);"],
  ["an Array.from of a Set", "export const sorted = Array.from(tags).sort();"],
  ["a spread of two arrays", "export const sorted = [...names, ...frozen].sort();"],
  ["a slice with bounds", "export const sorted = names.slice(1).sort();"],
  ["an Array.from with a map function", "export const sorted = Array.from(names, (name) => name.trim()).sort();"],
  ["an in-place sort", "names.sort();"],
  ["the toSorted spelling", "export const sorted = names.toSorted();"],
] as const)("passes %s", async ([, body]) => {
  expect(await findings(body)).toEqual([]);
});
