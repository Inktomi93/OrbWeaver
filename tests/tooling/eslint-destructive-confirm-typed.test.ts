// The typed arm of `orb/destructive-needs-confirm`: a press whose handler is a `ConfirmedAction` proves a confirm
// upstream. The planted program carries the shipped brand module, so the rule reads the production brand.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { destructiveNeedsConfirmRule } from "../../tooling/src/eslint/destructive-confirm.ts";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/destructive-needs-confirm";
const BRAND = "packages/client/src/components/confirmed-action.ts";
const FILE = "packages/client/src/features/probe/components/probe.tsx";

const preamble = [
  `import type { ConfirmedAction } from "${relative(dirname(FILE), BRAND)}";`,
  "declare global {",
  "  namespace JSX {",
  "    interface Element {}",
  "    interface IntrinsicElements {}",
  "  }",
  "}",
  "declare function Button(props: { readonly onClick?: () => void; readonly children?: string }): JSX.Element;",
  "declare function MenuItem(props: { readonly onClick?: () => void; readonly children?: string }): JSX.Element;",
  "export type Brand = ConfirmedAction;",
].join("\n");

function lint(root: string, source: string): readonly Linter.LintMessage[] {
  const text = `${preamble}\n${source}`;
  for (const [path, body] of [
    [BRAND, readFileSync(join(ROOT, BRAND), "utf8")],
    [FILE, text],
  ] as const) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    jsx: ts.JsxEmit.Preserve,
    noEmit: true,
    types: [],
  };
  const program = ts.createProgram({ rootNames: [BRAND, FILE].map((path) => join(root, path)), options });
  const file = program.getSourceFile(join(root, FILE));
  expect(file).toBeDefined();
  expect(program.getSemanticDiagnostics(file)).toEqual([]);
  const found = new Linter({ cwd: root }).verify(
    text,
    {
      files: ["**/*.tsx"],
      plugins: { orb: { rules: { "destructive-needs-confirm": destructiveNeedsConfirmRule } } },
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { programs: [program], project: false, projectService: false, ecmaFeatures: { jsx: true } },
      },
      rules: { [RULE]: "error" },
    },
    { filename: join(root, FILE) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found;
}

test.for([
  { name: "a press that is a ConfirmedAction prop", handler: "ConfirmedAction", found: 0 },
  { name: "the same press on a plain handler prop", handler: "() => void", found: 1 },
  { name: "the same press on an untyped prop", handler: "any", found: 1 },
])("the destructive-confirm rule judges $name", ({ handler, found }, { scratch }) => {
  const source = [
    `export function Row({ onDelete }: { readonly onDelete: ${handler} }): JSX.Element {`,
    "  return <MenuItem onClick={onDelete}>Delete</MenuItem>;",
    "}",
  ].join("\n");
  expect(lint(scratch, source)).toHaveLength(found);
});

test("a ConfirmedAction does not prove a press that wraps it in more work", ({ scratch }) => {
  const source = [
    "declare function remove(): void;",
    "export function Row({ onDelete }: { readonly onDelete: ConfirmedAction }): JSX.Element {",
    "  return <Button onClick={() => { remove(); onDelete(); }}>Remove</Button>;",
    "}",
  ].join("\n");
  expect(lint(scratch, source)).toHaveLength(1);
});
