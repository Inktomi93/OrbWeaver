// Gate: ct-story-single-import (memory: ct-story-double-import-identifier-collision, 2026-08-19; cost
// three CT runs) — playwright-ct rewrites a JSX-referenced component into a generated const AT EACH
// site it is referenced, so the same imported story/component identifier referenced twice in one CT
// file dies at eval with `SyntaxError: Identifier 'X' has already been declared`. A stale
// `playwright/.cache` clear does NOT fix it — it looks exactly like the cache phantom.
//
// TWO concrete shapes, both caught here (same underlying defect: one binding, two declare sites):
//   1. a literal duplicate import specifier — `import { X } from "./_ct-stories.tsx"` named twice in one
//      file's import declarations (covers "named in a SECOND `as const` tuple array" too, since that
//      re-imports the story under the same local name a second time in practice).
//   2. an imported PascalCase (component-shaped) identifier referenced as a DIRECT element of an
//      ArrayLiteralExpression at 2+ positions in the same file — the "component-in-array iteration"
//      shape (`for (const [label, Story] of [[..., StoryA], [..., StoryA]])`), which ct rewrites into a
//      duplicate generated const.
//
// Pure AST — comment-SAFE (subscribes to import specifiers + array-literal elements, reads no file text).
// scanRoot is CT-scoped: `.ct.tsx` files and `_ct-stories.tsx` story modules (both are eval'd by the same
// playwright-ct bundler and can carry either shape).
import type { ArrayLiteralExpression, ImportDeclaration, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";

const CT_SCOPE_RE = /(\.ct\.tsx|_ct-stories\.tsx)$/u;
const PASCAL_CASE = /^[A-Z]/;

const MESSAGE =
  "a CT story/component identifier is declared into this file's scope TWICE — playwright-ct rewrites each " +
  "JSX/array reference of an imported component into a generated const, so a second binding of the same " +
  "name fails the whole bundle at eval with `SyntaxError: Identifier already declared` (memory: " +
  "ct-story-double-import-identifier-collision, 2026-08-19 — looks exactly like the stale-cache phantom, " +
  "but `rm -rf playwright/.cache` does not fix it). One import site per story name; never reference the " +
  "same story component as more than one array element in a tuple/loop table (core/Spine-Testing.md §7).";
const FIX =
  "import the story/component exactly ONCE, and if it is iterated, pass it via a helper taking the mounted " +
  "Locator instead of listing the component itself as a repeated array value (core/Spine-Testing.md §7).";

/** The local (post-`as`) binding name of every named/default import specifier on one declaration. */
function importedLocalNames(decl: ImportDeclaration): { readonly name: string; readonly node: Node }[] {
  const out: { readonly name: string; readonly node: Node }[] = [];
  for (const spec of decl.getNamedImports()) {
    out.push({ name: spec.getAliasNode()?.getText() ?? spec.getNameNode().getText(), node: spec });
  }
  const def = decl.getDefaultImport();
  if (def !== undefined) {
    out.push({ name: def.getText(), node: def });
  }
  return out;
}

/** The identifiers that are DIRECT elements of `arr` (not nested one level deeper in a tuple) — NOT
 *  recursive: `sf.getDescendantsOfKind(ArrayLiteralExpression)` already visits every nested array literal
 *  as its own node, so recursing here would double-count a tuple element once from its own array AND once
 *  from its parent's walk (a real false positive: `[["a", X], ["b", Y]]` each has X/Y appearing exactly
 *  once as ITS tuple's direct element — counting the outer array too would see X and Y "twice"). */
function directIdentifierElements(arr: ArrayLiteralExpression): Node[] {
  return arr.getElements().filter((el) => Node.isIdentifier(el));
}

/** Shape 1: the same local name bound by TWO separate import specifiers in this file. */
function reportDuplicateImports(sf: SourceFile, ctx: GateRunCtx): Set<string> {
  const seen = new Map<string, Node>();
  const components = new Set<string>();
  for (const decl of sf.getImportDeclarations()) {
    for (const { name, node } of importedLocalNames(decl)) {
      if (PASCAL_CASE.test(name)) {
        components.add(name);
      }
      const prior = seen.get(name);
      if (prior !== undefined) {
        ctx.report(node, { token: name, offset: 0 });
      } else {
        seen.set(name, node);
      }
    }
  }
  return components;
}

/** Shape 2: an imported, component-shaped identifier referenced as a direct array element at 2+
 *  positions — the component-in-array-iteration double-declare shape. */
function reportRepeatedArrayComponents(sf: SourceFile, ctx: GateRunCtx, importedComponents: ReadonlySet<string>): void {
  const arrayHits = new Map<string, Node[]>();
  for (const arr of sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)) {
    for (const id of directIdentifierElements(arr)) {
      const name = id.getText();
      if (!importedComponents.has(name)) {
        continue;
      }
      const list = arrayHits.get(name) ?? [];
      list.push(id);
      arrayHits.set(name, list);
    }
  }
  for (const [name, hits] of arrayHits) {
    if (hits.length < 2) {
      continue;
    }
    for (const hit of hits.slice(1)) {
      ctx.report(hit, { token: name, offset: 0 });
    }
  }
}

export const gate: GateDescriptor = {
  name: "ct-story-single-import",
  docRow: "core/Spine-Testing.md §7 (ct-story-double-import-identifier-collision, 2026-08-19)",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => CT_SCOPE_RE.test(p),
  visitFile: (sf: SourceFile, ctx) => {
    const importedComponents = reportDuplicateImports(sf, ctx);
    reportRepeatedArrayComponents(sf, ctx, importedComponents);
  },
  mustFlag: [
    {
      files: 'import { StoryA } from "./_ct-stories.tsx";\nimport { StoryA as StoryA } from "./_ct-stories.tsx";\nStoryA;\n',
      at: "tests/ui/charts/x.ct.tsx",
      expect: { messageIncludes: "TWICE", token: "StoryA" },
      why: "the literal duplicate-named-import shape — the same local name bound by two import specifiers",
    },
    {
      files:
        'import { test } from "@playwright/experimental-ct-react";\nimport { StoryA } from "./_ct-stories.tsx";\nconst rows: readonly [string, typeof StoryA][] = [\n  ["a", StoryA],\n  ["b", StoryA],\n];\ntest("x", () => {\n  rows;\n});\n',
      at: "tests/ui/charts/y.ct.tsx",
      expect: { messageIncludes: "TWICE", token: "StoryA" },
      why: "the component-in-array-iteration shape — the same imported story referenced as two tuple values, the third spelling from the 2026-08-19 incident",
    },
  ],
  mustPass: [
    {
      files:
        'import { test } from "@playwright/experimental-ct-react";\nimport { StoryA } from "./_ct-stories.tsx";\nimport { StoryB } from "./_ct-stories.tsx";\nconst rows: readonly [string, unknown][] = [\n  ["a", StoryA],\n  ["b", StoryB],\n];\ntest("x", () => {\n  rows;\n});\n',
      at: "tests/ui/charts/z.ct.tsx",
      why: "two DIFFERENT stories, each imported and referenced exactly once — no collision",
    },
    {
      files: 'import { StoryA } from "./_ct-stories.tsx";\nStoryA;\n',
      at: "tests/ui/charts/single.ct.tsx",
      why: "a single import, single reference — the ordinary case",
    },
    {
      files:
        'import { test } from "@playwright/experimental-ct-react";\nimport { StoryA } from "./_ct-stories.tsx";\ntest("a", () => {\n  StoryA;\n});\ntest("b", () => {\n  StoryA;\n});\n',
      at: "tests/ui/charts/reuse.ct.tsx",
      why: "the same story used across two SEPARATE test() bodies (not both as array elements) — not the array-declare shape",
    },
    {
      files: "export function StoryA() {\n  return null;\n}\n",
      at: "tests/ui/charts/_ct-stories.tsx",
      why: "a story MODULE itself defines the export, it does not import it — out of scope for both shapes",
    },
  ],
};
