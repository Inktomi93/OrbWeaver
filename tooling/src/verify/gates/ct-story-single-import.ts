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
//   2. an imported `_ct-stories` / `.fixtures` component referenced twice inside ONE JSX tree, or as a
//      DIRECT array element at 2+ positions in one function/module scope — both give playwright-ct
//      multiple rewrite sites for one story binding. Separate test callbacks and separate mount trees are
//      separate generated scopes and may reuse the same story.
//
// Pure AST — comment-SAFE (subscribes to import specifiers + array-literal elements, reads no file text).
// scanRoot is CT-scoped: `.ct.tsx` files and `_ct-stories.tsx` story modules (both are eval'd by the same
// playwright-ct bundler and can carry either shape).
// DECLARED LIMIT: non-component imports and repeated non-JSX references are not rewrite sites.
import type { ArrayLiteralExpression, ImportDeclaration, SourceFile, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";

const CT_SCOPE_RE = /(\.ct\.tsx|_ct-stories\.tsx)$/u;
const PASCAL_CASE = /^[A-Z]/;
const STORY_MODULE_RE = /(?:_ct-stories|\.fixtures)(?:\.tsx)?$/u;

const MESSAGE =
  "a CT story/component identifier is declared into this file's scope TWICE — playwright-ct rewrites each " +
  "same-tree JSX/array reference of an imported CT story into a generated const, so a second binding of the same " +
  "name fails the whole bundle at eval with `SyntaxError: Identifier already declared` (memory: " +
  "ct-story-double-import-identifier-collision, 2026-08-19 — looks exactly like the stale-cache phantom, " +
  "but `rm -rf playwright/.cache` does not fix it). One import site per story name; never reference the " +
  "same story component twice in one JSX tree or as more than one array element in a tuple/loop table " +
  "(core/Spine-Testing.md §7).";
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
      if (PASCAL_CASE.test(name) && STORY_MODULE_RE.test(decl.getModuleSpecifierValue())) {
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

/** The generated declaration scope: playwright-ct may reuse a story in another test callback, but two
 *  rewrite sites in the SAME function (or at module top-level) collide. */
function rewriteScope(node: TsNode, sf: SourceFile): TsNode {
  return (
    node.getFirstAncestor((ancestor) => Node.isArrowFunction(ancestor) || Node.isFunctionDeclaration(ancestor) || Node.isFunctionExpression(ancestor)) ?? sf
  );
}

function reportRepeatedHits(hits: ReadonlyMap<string, readonly Node[]>, ctx: GateRunCtx): void {
  for (const [name, nodes] of hits) {
    for (const node of nodes.slice(1)) {
      ctx.report(node, { token: name, offset: 0 });
    }
  }
}

/** Shape 2: an imported, component-shaped identifier referenced as a direct array element at 2+
 *  positions — the component-in-array-iteration double-declare shape. */
function reportRepeatedArrayComponents(sf: SourceFile, ctx: GateRunCtx, importedComponents: ReadonlySet<string>): void {
  const arrayHits = new Map<TsNode, Map<string, Node[]>>();
  for (const arr of sf.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)) {
    const scope = rewriteScope(arr, sf);
    const scopeHits = arrayHits.get(scope) ?? new Map<string, Node[]>();
    arrayHits.set(scope, scopeHits);
    for (const id of directIdentifierElements(arr)) {
      const name = id.getText();
      if (!importedComponents.has(name)) {
        continue;
      }
      const list = scopeHits.get(name) ?? [];
      list.push(id);
      scopeHits.set(name, list);
    }
  }
  for (const scopeHits of arrayHits.values()) {
    reportRepeatedHits(scopeHits, ctx);
  }
}

/** The outer JSX tree containing a tag. Separate `mount(<Story />)` calls are separate rewrites and may
 *  reuse the import; two references inside ONE tree ask the transform for the binding twice. */
function jsxTreeRoot(node: TsNode): TsNode {
  let root = node;
  for (const ancestor of node.getAncestors()) {
    if (Node.isJsxElement(ancestor) || Node.isJsxFragment(ancestor) || Node.isJsxSelfClosingElement(ancestor)) {
      root = ancestor;
      continue;
    }
    break;
  }
  return root;
}

/** Imported story JSX is rewritten per reference within a rendered tree; two sites in that tree collide. */
function reportRepeatedJsxComponents(sf: SourceFile, ctx: GateRunCtx, importedComponents: ReadonlySet<string>): void {
  const hits = new Map<TsNode, Map<string, Node[]>>();
  const elements = [...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement), ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)];
  for (const element of elements) {
    const tag = element.getTagNameNode();
    if (!(Node.isIdentifier(tag) && importedComponents.has(tag.getText()))) {
      continue;
    }
    const scope = jsxTreeRoot(tag);
    const scopeHits = hits.get(scope) ?? new Map<string, Node[]>();
    hits.set(scope, scopeHits);
    const list = scopeHits.get(tag.getText()) ?? [];
    list.push(tag);
    scopeHits.set(tag.getText(), list);
  }
  for (const scopeHits of hits.values()) {
    reportRepeatedHits(scopeHits, ctx);
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
    reportRepeatedJsxComponents(sf, ctx, importedComponents);
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
        'import { test } from "@playwright/experimental-ct-react";\nimport { StoryA } from "./_ct-stories.tsx";\ntest("a", () => <StoryA />);\ntest("b", () => <StoryA />);\n',
      at: "tests/ui/charts/reuse.ct.tsx",
      why: "the same story rendered across two SEPARATE test() bodies — generated declarations live in separate scopes",
    },
    {
      files:
        'import { test } from "@playwright/experimental-ct-react";\nimport { StoryA } from "./_ct-stories.tsx";\ntest("a", async ({ mount }) => {\n  await mount(<StoryA />);\n  await mount(<StoryA />);\n});\n',
      at: "tests/ui/charts/remount.ct.tsx",
      why: "separate mount JSX trees in one test are separate rewrites and may reuse the same story import",
    },
    {
      files: 'import { Button } from "@orb/ui/button";\nexport const Pair = () => <>\n  <Button>One</Button>\n  <Button>Two</Button>\n</>;\n',
      at: "tests/ui/charts/primitive.ct.tsx",
      why: "ordinary UI primitives may repeat in one rendered tree; only imported CT story modules are rewritten as story bindings",
    },
    {
      files: "export function StoryA() {\n  return null;\n}\n",
      at: "tests/ui/charts/_ct-stories.tsx",
      why: "a story MODULE itself defines the export, it does not import it — out of scope for both shapes",
    },
  ],
};
