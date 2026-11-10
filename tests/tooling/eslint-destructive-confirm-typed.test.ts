// The typed arm of `orb/destructive-needs-confirm` and the `orb/confirmed-action-mint` guard behind it: a press whose
// handler is a `ConfirmedAction` proves a confirm upstream, and only a listed home may mint one. The planted program
// carries the shipped brand module, so both rules read the production brand.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { confirmedActionMintRule } from "../../tooling/src/eslint/confirmed-action-mint.ts";
import { destructiveNeedsConfirmRule } from "../../tooling/src/eslint/destructive-confirm.ts";

const ROOT = join(import.meta.dirname, "../..");
const CONFIRM = "orb/destructive-needs-confirm";
const MINT = "orb/confirmed-action-mint";
const BRAND = "packages/client/src/components/confirmed-action.ts";
const FILE = "packages/client/src/features/probe/components/probe.tsx";
const BRAND_FROM_FILE = relative(dirname(FILE), BRAND);

const preamble = [
  `import type { ConfirmedAction } from "${BRAND_FROM_FILE}";`,
  "declare global {",
  "  namespace JSX {",
  "    interface Element {}",
  "    interface IntrinsicElements {}",
  "  }",
  "}",
  "declare function Button(props: { readonly onClick?: () => void; readonly children?: string }): JSX.Element;",
  "declare function MenuItem(props: { readonly onClick?: () => void; readonly children?: string }): JSX.Element;",
  "declare function removeNow(): void;",
  "export type Brand = ConfirmedAction;",
].join("\n");

function lint(root: string, source: string, homes: Readonly<Record<string, string>> = {}): readonly Linter.LintMessage[] {
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
      plugins: { orb: { rules: { "destructive-needs-confirm": destructiveNeedsConfirmRule, "confirmed-action-mint": confirmedActionMintRule(homes) } } },
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { programs: [program], project: false, projectService: false, ecmaFeatures: { jsx: true } },
      },
      rules: { [CONFIRM]: "error", [MINT]: "error" },
    },
    { filename: join(root, FILE) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found;
}

const ruleIds = (found: readonly Linter.LintMessage[]): readonly (string | null)[] => found.map(({ ruleId }) => ruleId);

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
  expect(ruleIds(lint(scratch, source))).toEqual(Array.from({ length: found }, () => CONFIRM));
});

test("a ConfirmedAction does not prove a press that wraps it in more work", ({ scratch }) => {
  const source = [
    "export function Row({ onDelete }: { readonly onDelete: ConfirmedAction }): JSX.Element {",
    "  return <Button onClick={() => { removeNow(); onDelete(); }}>Remove</Button>;",
    "}",
  ].join("\n");
  expect(ruleIds(lint(scratch, source))).toEqual([CONFIRM]);
});

const DIRECT_MINT = [
  `import { confirmedAction } from "${BRAND_FROM_FILE}";`,
  "export const Row = (): JSX.Element => <Button onClick={confirmedAction((): void => removeNow())}>Delete</Button>;",
].join("\n");

test("a direct destroy minted outside a home is refused at its import and its call", ({ scratch }) => {
  expect(ruleIds(lint(scratch, DIRECT_MINT))).toEqual([MINT, MINT]);
});

test("a listed home may mint", ({ scratch }) => {
  expect(lint(scratch, DIRECT_MINT, { [FILE]: "the probe renders the confirm its opener reveals" })).toEqual([]);
});

test("an aliased import of the mint is still the mint", ({ scratch }) => {
  const source = [
    `import { confirmedAction as mark } from "${BRAND_FROM_FILE}";`,
    "export const Row = (): JSX.Element => <Button onClick={mark((): void => removeNow())}>Delete</Button>;",
  ].join("\n");
  expect(ruleIds(lint(scratch, source))).toEqual([MINT]);
});

test.for([
  { name: "a direct cast", forge: "((): void => removeNow()) as ConfirmedAction", found: [MINT] },
  // The inner `as unknown` adds no brand; the outer cast is the forgery.
  { name: "a cast through unknown", forge: "((): void => removeNow()) as unknown as ConfirmedAction", found: [MINT] },
])("a ConfirmedAction forged by $name is refused, even in a home", ({ forge, found }, { scratch }) => {
  const source = [`const forged = ${forge};`, "export const Row = (): JSX.Element => <Button onClick={forged}>Delete</Button>;"].join("\n");
  expect(ruleIds(lint(scratch, source, { [FILE]: "a home still may not cast" }))).toEqual(found);
});
