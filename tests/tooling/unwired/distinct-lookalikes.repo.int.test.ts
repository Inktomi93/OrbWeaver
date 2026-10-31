// The distinct registry is the truth list of judged look-alikes with no flow between them; a pair a flow links is
// one concept and never belongs here (the census keeps a linked copy open whatever the registry says). Every shape
// it names must still be declared, so a renamed or deleted shape cannot keep a stale judgment alive.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import ts from "typescript";
import { DISTINCT_LOOKALIKES } from "../../../tooling/src/unwired/distinct-lookalikes.ts";

const ROOT = join(import.meta.dirname, "../../..");

// The names a file declares: its types, functions, classes and variables, and every interface or type-literal
// member, as the compiler parses them; a name that survives only in a comment or a string is no declaration.
function declaredNames(file: string): ReadonlySet<string> {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    const named =
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isPropertySignature(node) ||
      ts.isMethodSignature(node);
    if (named && node.name !== undefined && ts.isIdentifier(node.name)) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

// Each registry ref whose file is gone or no longer declares the name.
function staleRefs(root: string, refs: Iterable<string>): readonly string[] {
  return [...refs].filter((ref) => {
    const [file = "", name = ""] = ref.split("#");
    const path = join(root, file);
    return !(existsSync(path) && declaredNames(path).has(name));
  });
}

test("every shape the distinct registry names is declared where it says", () => {
  const refs = new Set(DISTINCT_LOOKALIKES.flatMap(({ shape, distinctFrom }) => [shape, ...distinctFrom]));
  expect(staleRefs(ROOT, refs)).toEqual([]);
});

test("a name that survives only in a comment or a string counts as gone", async ({ plantedTree }) => {
  const root = await plantedTree({
    "packages/a/src/views.ts": [
      "// AlphaView was folded into BetaView.",
      'export const label = "AlphaView";',
      "export interface BetaView { readonly id: string; readonly onOpen: () => void; }",
    ].join("\n"),
  });
  expect(
    staleRefs(root, [
      "packages/a/src/views.ts#AlphaView",
      "packages/a/src/views.ts#BetaView",
      "packages/a/src/views.ts#onOpen",
      "packages/a/src/gone.ts#BetaView",
    ]),
  ).toEqual(["packages/a/src/views.ts#AlphaView", "packages/a/src/gone.ts#BetaView"]);
});

test("the distinct registry records each pair once", () => {
  const pairs = DISTINCT_LOOKALIKES.flatMap(({ shape, distinctFrom }) => distinctFrom.map((other) => [shape, other].toSorted().join(" | ")));
  expect(pairs.filter((pair, index) => pairs.indexOf(pair) !== index)).toEqual([]);
});
