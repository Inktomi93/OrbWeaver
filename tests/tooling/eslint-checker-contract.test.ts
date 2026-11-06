import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { resolvedConfig } from "./_eslint-config.ts";
import { programForSource } from "./_typescript-program.ts";

const ROOT = join(import.meta.dirname, "../..");
const FILE = join(ROOT, "packages/client/src/features/probe/checker-contract.tsx");
const config = await resolvedConfig(new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT }), FILE);

test("virtual lint Programs retain reset, platform and Node-world declarations without unrelated source roots", () => {
  const fileName = join(ROOT, "tests/tooling/ambient-program-probe.ts");
  const source = [
    'export const parsed = JSON.parse("{}");',
    'export const inserted = new Map<string, number>().getOrInsert("key", 1);',
    'export const headers: HeadersInit = { "X-Probe": "value" };',
    'export const credentials: RequestCredentials = "same-origin";',
    "export const runtime = process.versions.node;",
  ].join("\n");
  const program = programForSource(ROOT, "tsconfig.node.json", fileName, source);
  const subject = program.getSourceFile(fileName);
  if (subject === undefined) {
    throw new Error("The virtual source is missing from its owning Program");
  }
  const types = subject.statements.filter(ts.isVariableStatement).flatMap(({ declarationList }) => declarationList.declarations);
  const checker = program.getTypeChecker();
  expect(types.map((declaration) => checker.typeToString(checker.getTypeAtLocation(declaration.name))).slice(0, 2)).toEqual(["unknown", "number"]);
  expect(program.getSemanticDiagnostics(subject)).toEqual([]);
  expect(program.getRootFileNames()).toEqual(expect.arrayContaining([join(ROOT, "reset.d.ts"), join(ROOT, "platform.d.ts"), join(ROOT, "platform-node.d.ts")]));
  expect(program.getRootFileNames().filter((path) => !/\.d\.[cm]?ts$/u.test(path))).toEqual([fileName]);
});

test("a solution config cannot own a virtual lint Program", () => {
  expect(() => programForSource(ROOT, "tsconfig.json", FILE, "export const value = 1;")).toThrow(/no configured roots/u);
});

test.for([
  "derived-port-member",
  "no-unsafe-cast",
  "trpc-payload-declared-keys",
  "trpc-output-declared-keys",
  "no-raw-id",
  "browser-support",
  "browser-support-entry",
  "no-native-callback-narrowing",
  "no-overwritten-ref",
  "no-unresolved-style-spread",
  "ct-responder-reads-input",
  "surface-consumes-container",
  "anchor-provides-container",
  "no-off-token-inline-style",
  "no-static-style-prop",
  "no-use-promise",
  "no-native-title",
])("the registered %s rule refuses a parser without its owning Program", (id) => {
  expect(config.plugins["orb"]?.rules?.[id], id).toBeDefined();
  expect(() =>
    new Linter({ cwd: ROOT }).verify(
      "export const value = <span />;",
      {
        files: ["**/*.tsx"],
        plugins: config.plugins,
        languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false } },
        rules: { [`orb/${id}`]: "error" },
      },
      { filename: FILE },
    ),
  ).toThrow(/TypeScript Program/u);
});
