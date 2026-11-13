// `orb/viewer-visibility-parameter-checked`: a function that takes a viewer visibility answer from its caller runs the
// registry's identity and chat check on it before any other use, or only forwards it to a read that does. The planted
// program declares the brand and the check at their production paths, because the rule keys on those declarations.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { VISIBILITY_CHECK_SITE, viewerVisibilityParameterRule } from "../../tooling/src/eslint/viewer-visibility.ts";
import { levelOf, resolvedConfig } from "./_eslint-config.ts";

const RULE = "orb/viewer-visibility-parameter-checked";
const BRAND = "packages/contracts/src/chat/owner-ops.ts";
const REGISTRY = VISIBILITY_CHECK_SITE.path;
const FILE = "packages/server/src/domain/chat/persistence/probe.ts";
const from = (file: string, target: string): string => relative(dirname(file), target);

// The brand as the contracts module declares it: a unique-symbol key the rule finds by its declaration.
const BRAND_SOURCE = [
  "declare const viewerVisibilityBrand: unique symbol;",
  "export interface ViewerVisibility {",
  "  readonly [viewerVisibilityBrand]: true;",
  "  readonly chatId: string;",
  "  readonly historyFloorSeq: number;",
  "  readonly readsHidden: boolean;",
  "}",
].join("\n");

const REGISTRY_SOURCE = [
  `import type { ViewerVisibility } from "${from(REGISTRY, BRAND)}";`,
  "export function assertResolvedVisibility(visibility: ViewerVisibility, chatId: string): void {",
  "  if (visibility.chatId !== chatId) {",
  '    throw new Error("another chat");',
  "  }",
  "}",
].join("\n");

const PREAMBLE = [
  `import type { ViewerVisibility } from "${from(FILE, BRAND)}";`,
  `import { assertResolvedVisibility } from "${from(FILE, REGISTRY)}";`,
  "declare function readRows(floor: number): number;",
  "declare function forwardTo(chatId: string, opts: { readonly visibility: ViewerVisibility }): number;",
  "declare function keep(value: unknown): number;",
  "export type Answer = ViewerVisibility;",
  "export const check = assertResolvedVisibility;",
].join("\n");

function lint(root: string, file: string, text: string): readonly Linter.LintMessage[] {
  const files: readonly (readonly [path: string, body: string])[] = [
    [BRAND, BRAND_SOURCE],
    [REGISTRY, file === REGISTRY ? text : REGISTRY_SOURCE],
    ...(file === REGISTRY ? [] : [[file, text] as const]),
  ];
  for (const [path, body] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    noEmit: true,
    types: [],
  };
  const program = ts.createProgram({ rootNames: files.map(([path]) => join(root, path)), options });
  expect(
    program.getSemanticDiagnostics(program.getSourceFile(join(root, file))).map(({ messageText }) => ts.flattenDiagnosticMessageText(messageText, "\n")),
  ).toEqual([]);
  const found = new Linter({ cwd: root }).verify(
    text,
    {
      files: ["**/*.ts"],
      plugins: { orb: { rules: { "viewer-visibility-parameter-checked": viewerVisibilityParameterRule } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], project: false, projectService: false } },
      rules: { [RULE]: "error" },
    },
    { filename: join(root, file) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found;
}

const refusals = (found: readonly Linter.LintMessage[]): number => found.filter(({ ruleId }) => ruleId === RULE).length;

test.for([
  {
    name: "an answer read unchecked",
    source: "export function read(chatId: string, visibility: ViewerVisibility): number {\n  return readRows(visibility.historyFloorSeq);\n}",
    found: 1,
  },
  {
    name: "an answer checked first",
    source:
      "export function read(chatId: string, visibility: ViewerVisibility): number {\n  assertResolvedVisibility(visibility, chatId);\n  return readRows(visibility.historyFloorSeq);\n}",
    found: 0,
  },
  {
    name: "an options bag read unchecked",
    source:
      "export function read(chatId: string, opts: { readonly limit?: number; readonly visibility: ViewerVisibility }): number {\n  return readRows(opts.visibility.historyFloorSeq);\n}",
    found: 1,
  },
  {
    name: "an options bag checked first, its other property read before the check",
    source:
      "export function read(chatId: string, opts: { readonly limit?: number; readonly visibility: ViewerVisibility }): number {\n  const limit = opts.limit ?? 1;\n  assertResolvedVisibility(opts.visibility, chatId);\n  return readRows(opts.visibility.historyFloorSeq + limit);\n}",
    found: 0,
  },
  {
    name: "a copy taken before the check",
    source:
      "export function read(chatId: string, visibility: ViewerVisibility): number {\n  const copy = { ...visibility };\n  assertResolvedVisibility(visibility, chatId);\n  return readRows(copy.historyFloorSeq);\n}",
    found: 1,
  },
  {
    name: "a check that one branch skips",
    source:
      "export function read(chatId: string, visibility: ViewerVisibility, strict: boolean): number {\n  if (strict) {\n    assertResolvedVisibility(visibility, chatId);\n  }\n  return readRows(visibility.historyFloorSeq);\n}",
    found: 1,
  },
  {
    name: "a check of another answer",
    source:
      "export function read(chatId: string, visibility: ViewerVisibility, other: ViewerVisibility): number {\n  assertResolvedVisibility(other, chatId);\n  return readRows(visibility.historyFloorSeq + other.historyFloorSeq);\n}",
    found: 1,
  },
  {
    name: "an options bag forwarded whole to a read that is judged in turn",
    source: "export function read(chatId: string, opts: { readonly visibility: ViewerVisibility }): number {\n  return forwardTo(chatId, opts);\n}",
    found: 0,
  },
  {
    name: "an answer handed to a parameter that does not carry one",
    source: "export function read(visibility: ViewerVisibility): number {\n  return keep(visibility);\n}",
    found: 1,
  },
  {
    name: "a nullable answer read unchecked",
    source: "export function read(visibility: ViewerVisibility | null): boolean {\n  return visibility?.readsHidden ?? false;\n}",
    found: 1,
  },
  {
    name: "a destructured answer read unchecked",
    source: "export function read({ visibility }: { readonly visibility: ViewerVisibility }): number {\n  return readRows(visibility.historyFloorSeq);\n}",
    found: 1,
  },
  {
    name: "a destructured answer checked first",
    source:
      "export function read(chatId: string, { visibility }: { readonly visibility: ViewerVisibility }): number {\n  assertResolvedVisibility(visibility, chatId);\n  return readRows(visibility.historyFloorSeq);\n}",
    found: 0,
  },
  {
    name: "a nested pattern the rule cannot follow",
    source:
      "export function read({ visibility: { historyFloorSeq } }: { readonly visibility: ViewerVisibility }): number {\n  return readRows(historyFloorSeq);\n}",
    found: 1,
  },
  {
    name: "an arrow whose answer parameter is typed by its context",
    source:
      "export const reads: { readonly list: (visibility: ViewerVisibility) => number } = {\n  list: (visibility) => readRows(visibility.historyFloorSeq),\n};",
    found: 1,
  },
  {
    name: "the check under an import alias",
    source: [
      `import { assertResolvedVisibility as checkAnswer } from "${from(FILE, REGISTRY)}";`,
      "export function read(chatId: string, visibility: ViewerVisibility): number {\n  checkAnswer(visibility, chatId);\n  return readRows(visibility.historyFloorSeq);\n}",
    ].join("\n"),
    found: 0,
  },
  {
    name: "a local function that shares the check's name",
    source: [
      "function assertResolvedVisibilityHere(visibility: unknown, chatId: string): void {\n  void visibility;\n  void chatId;\n}",
      "export function read(chatId: string, visibility: ViewerVisibility): number {\n  assertResolvedVisibilityHere(visibility, chatId);\n  return readRows(visibility.historyFloorSeq);\n}",
    ].join("\n"),
    found: 1,
  },
  {
    name: "a look-alike brand declared outside contracts",
    source: [
      "declare const viewerVisibilityBrand: unique symbol;",
      "interface Lookalike {\n  readonly [viewerVisibilityBrand]: true;\n  readonly historyFloorSeq: number;\n}",
      "export function read(visibility: Lookalike): number {\n  return readRows(visibility.historyFloorSeq);\n}",
    ].join("\n"),
    found: 0,
  },
])("the visibility parameter rule judges $name", ({ source, found }, { scratch }) => {
  expect(refusals(lint(scratch, FILE, `${PREAMBLE}\n${source}`))).toBe(found);
});

test("the check itself is exempt; another function in the registry that takes an answer unchecked is not", ({ scratch }) => {
  const source = `${REGISTRY_SOURCE}\nexport function floorOf(visibility: ViewerVisibility): number {\n  return visibility.historyFloorSeq;\n}`;
  const found = lint(scratch, REGISTRY, source);
  expect(found.map(({ ruleId, line }) => [ruleId, line])).toEqual([[RULE, source.split("\n").length - 2]]);
});

test("the repository config turns the rule on for server sources", async ({ repoRoot }) => {
  const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: repoRoot });
  const { rules } = await resolvedConfig(eslint, join(repoRoot, "packages/server/src/domain/rpg/verbs/read/list-journal.ts"));
  expect(levelOf(rules[RULE])).toBe(2);
});
