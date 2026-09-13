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
//      EVERY SPELLING OF A REFERENCE COUNTS, and the tree climb is what makes that true: self-closing
//      (`<Story />`), PAIRED (`<Story>…</Story>`, whose identifier is a child of `JsxOpeningElement`) and
//      attribute-embedded (`<Wrap slot={<Story />}>`) are one defect with three syntaxes. See
//      `JSX_TREE_KINDS` for why the climb is over the JSX node FAMILY; until 2026-09-12 it listed three
//      element kinds and this `hard` gate returned 0 findings on both paired shapes.
//
// Pure AST — comment-SAFE (subscribes to import specifiers + array-literal elements, reads no file text).
// Population is CT-scoped: `.ct.tsx` files and `_ct-stories.tsx` story modules (both are eval'd by the same
// playwright-ct bundler and can carry either shape).
// DECLARED LIMIT: non-component imports and repeated non-JSX references are not rewrite sites.
//
// FAMILY DECISION (gate-runtime-standardization.md): singleton family. No sibling gate in this migration
// lane (`ct-no-oneshot-live-read-assert`, `ct-poll-schedule-and-paint`) shares this identifier-scope
// bookkeeping; each implements an unrelated predicate over the same CT file class, which is not a shared
// computation or reader.
//
// AUTHORITY: `hard`. The legacy descriptor carried no escape mechanism at all — a genuine double-declare
// always breaks the Playwright bundle at eval, so there is no legitimate "provably fine" arm to waive.
//
// SHAPE NOTE: the legacy `visitFile` hook called `sf.getDescendantsOfKind` three times (import
// declarations, array literals, JSX elements) — a private descendant walk the final contract forbids
// (`SourceFile#getDescendants*`). Import declarations are read through the direct `getImportDeclarations()`
// accessor in `visitFile` (not a descendant walk); array-literal and JSX-element identity now come through
// the shared kind-indexed `visitors`, with the "second-and-later occurrence" judgment deferred to
// `evaluate` because it needs every occurrence in a scope collected before deciding which nodes to flag.
//
// POPULATION PORT: BYTE-IDENTICAL. Legacy `scanRoot: (p) => /(\.ct\.tsx|_ct-stories\.tsx)$/u.test(p)` is
// exactly `{ in: ["@tests"], named: ["*.ct.tsx", "*_ct-stories.tsx"] }`.
// Re-derived 2026-09-12 by applying the legacy predicate and this declaration to the SAME 7,537-path
// compiler-source candidate set: 528 admitted on both sides, symmetric difference ZERO in both directions.
// LEGACY SHA: (47c35b61c^) — the conversion's parent.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `ct-story-single-import` descriptor at bd56189bacbd0b4c79103fc10fe94d5499d9f3fd, the parent of the conversion
// `47c35b61c` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,360 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 528 and final `population` admits 528. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `tests/client/a11y/__cbbhr_in__ct-stories.tsx` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { ArrayLiteralExpression, ImportDeclaration, SourceFile, Node as TsNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

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

interface Occurrence {
  readonly scope: TsNode;
  readonly name: string;
  readonly node: TsNode;
}

/** Every occurrence beyond the FIRST, per (scope, name) group — the "second declare site" this whole gate
 *  exists to name. Grouping is a pure reduction over already-collected occurrences, so it lives outside
 *  `evaluate` purely to keep that hook's own cognitive complexity under the file's cap. */
function repeatedOccurrences(occurrences: readonly Occurrence[]): Occurrence[] {
  const byScope = new Map<TsNode, Map<string, Occurrence[]>>();
  for (const occurrence of occurrences) {
    const scopeHits = byScope.get(occurrence.scope) ?? new Map<string, Occurrence[]>();
    byScope.set(occurrence.scope, scopeHits);
    const grouped = scopeHits.get(occurrence.name) ?? [];
    grouped.push(occurrence);
    scopeHits.set(occurrence.name, grouped);
  }
  return [...byScope.values()].flatMap((scopeHits) => [...scopeHits.values()].flatMap((grouped) => grouped.slice(1)));
}

/** The local (post-`as`) binding name of every named/default import specifier on one declaration. */
function importedLocalNames(decl: ImportDeclaration): { readonly name: string; readonly node: TsNode }[] {
  const out: { readonly name: string; readonly node: TsNode }[] = [];
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
 *  recursive: the shared walk already visits every nested array literal as its own node, so recursing here
 *  would double-count a tuple element once from its own array AND once from its parent's walk (a real false
 *  positive: `[["a", X], ["b", Y]]` each has X/Y appearing exactly once as ITS tuple's direct element —
 *  counting the outer array too would see X and Y "twice"). */
function directIdentifierElements(arr: ArrayLiteralExpression): TsNode[] {
  return arr.getElements().filter((el) => Node.isIdentifier(el));
}

/** The generated declaration scope: playwright-ct may reuse a story in another test callback, but two
 *  rewrite sites in the SAME function (or at module top-level) collide. */
function rewriteScope(node: TsNode, sf: SourceFile): TsNode {
  return (
    node.getFirstAncestor((ancestor) => Node.isArrowFunction(ancestor) || Node.isFunctionDeclaration(ancestor) || Node.isFunctionExpression(ancestor)) ?? sf
  );
}

/** The JSX node FAMILY, not the three element kinds a reader first thinks of. A tag identifier reaches its
 *  enclosing tree only through the rungs that actually sit between them, and a hand-listed subset of them is
 *  a FALSE CLEAN on a `hard` gate: a PAIRED tag's identifier is a child of `JsxOpeningElement`, and an
 *  attribute-embedded element reaches its tree through `JsxExpression` → `JsxAttribute` → `JsxAttributes` →
 *  `JsxOpeningElement`. Omitting any rung breaks the climb at that ancestor and makes the tag its own unique
 *  scope, so two references can never group and the gate reports nothing (measured 2026-09-12,
 *  cb-v-unaudited-finals L1; `mustFlag[3]`/`[4]`/`[5]` are the three spellings that returned 0).
 *
 *  The four remaining JSX kinds are deliberately ABSENT rather than listed for symmetry: `JsxClosingElement`,
 *  `JsxOpeningFragment` and `JsxClosingFragment` hold no occurrence node this policy ever collects (the JSX
 *  visitor subscribes to opening and self-closing elements only), and a `JsxSpreadAttribute` reaches its
 *  element through an `ObjectLiteralExpression`, which stops the climb one rung earlier whatever is listed
 *  here. A rung no fixture can reach is dead code, not coverage. */
const JSX_TREE_KINDS: ReadonlySet<SyntaxKind> = new Set<SyntaxKind>([
  SyntaxKind.JsxElement,
  SyntaxKind.JsxFragment,
  SyntaxKind.JsxSelfClosingElement,
  SyntaxKind.JsxOpeningElement,
  SyntaxKind.JsxAttributes,
  SyntaxKind.JsxAttribute,
  SyntaxKind.JsxExpression,
]);

/** The outer JSX tree containing a tag. Separate `mount(<Story />)` calls are separate rewrites and may
 *  reuse the import; two references inside ONE tree ask the transform for the binding twice. */
function jsxTreeRoot(node: TsNode): TsNode {
  let root = node;
  for (const ancestor of node.getAncestors()) {
    if (!JSX_TREE_KINDS.has(ancestor.getKind())) {
      break;
    }
    root = ancestor;
  }
  return root;
}

export const gate = defineGate({
  id: "ct-story-single-import",
  family: "ct-story-single-import",
  authority: "hard",
  severity: "error",
  population: { in: ["@tests"], named: ["*.ct.tsx", "*_ct-stories.tsx"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const importedComponentsBySource = new WeakMap<SourceFile, ReadonlySet<string>>();
    const arrayOccurrences: Occurrence[] = [];
    const jsxOccurrences: Occurrence[] = [];
    return {
      // Import declarations are the SourceFile's own direct children — read through `getImportDeclarations()`,
      // never a descendant walk. Duplicate import specifiers are a self-contained per-file judgment and are
      // reported here immediately.
      visitFile: (sf) => {
        const seen = new Map<string, TsNode>();
        const components = new Set<string>();
        for (const decl of sf.getImportDeclarations()) {
          for (const { name, node } of importedLocalNames(decl)) {
            if (PASCAL_CASE.test(name) && STORY_MODULE_RE.test(decl.getModuleSpecifierValue())) {
              components.add(name);
            }
            const prior = seen.get(name);
            if (prior !== undefined) {
              ctx.report.node(node, { token: name, offset: 0 });
            } else {
              seen.set(name, node);
            }
          }
        }
        importedComponentsBySource.set(sf, components);
      },
      visitors: [
        {
          kinds: [SyntaxKind.ArrayLiteralExpression],
          visit: (node, sf) => {
            if (!Node.isArrayLiteralExpression(node)) {
              return;
            }
            const components = importedComponentsBySource.get(sf) ?? new Set<string>();
            const scope = rewriteScope(node, sf);
            for (const id of directIdentifierElements(node)) {
              const name = id.getText();
              if (components.has(name)) {
                arrayOccurrences.push({ scope, name, node: id });
              }
            }
          },
        },
        {
          kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
          visit: (node, sf) => {
            const tag = Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node) ? node.getTagNameNode() : undefined;
            if (tag === undefined || !Node.isIdentifier(tag)) {
              return;
            }
            const components = importedComponentsBySource.get(sf) ?? new Set<string>();
            if (!components.has(tag.getText())) {
              return;
            }
            jsxOccurrences.push({ scope: jsxTreeRoot(tag), name: tag.getText(), node: tag });
          },
        },
      ],
      // Deferred to evaluate: which occurrence is "the second one" in a scope is only knowable once every
      // occurrence in that scope has been collected across the whole file's single walk.
      evaluate: () => {
        for (const occurrence of [...repeatedOccurrences(arrayOccurrences), ...repeatedOccurrences(jsxOccurrences)]) {
          ctx.report.node(occurrence.node, { token: occurrence.name, offset: 0 });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: { "tests/ui/charts/x.ct.tsx": 'import { StoryA } from "./_ct-stories.tsx";\nimport { StoryA as StoryA } from "./_ct-stories.tsx";\nStoryA;\n' },
      expect: { count: 1, token: "StoryA" },
      why: "the literal duplicate-named-import shape — the same local name bound by two import specifiers",
    },
    {
      mode: "source",
      files: {
        "tests/ui/charts/y.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { StoryA } from "./_ct-stories.tsx";\nconst rows: readonly [string, typeof StoryA][] = [\n  ["a", StoryA],\n  ["b", StoryA],\n];\ntest("x", () => {\n  rows;\n});\n',
      },
      expect: { count: 1, token: "StoryA" },
      why: "the component-in-array-iteration shape — the same imported story referenced as two tuple values, the third spelling from the 2026-08-19 incident",
    },
    {
      mode: "source",
      files: {
        "tests/ui/story.ct.tsx": 'import { Story } from "./_ct-stories.tsx";\nexport const Cases = () => <>\n  <Story />\n  <Story />\n</>;\n',
      },
      expect: { count: 1, token: "Story" },
      why: "two JSX rewrite sites collide even when no array carries the component",
    },
    {
      mode: "source",
      files: {
        "tests/ui/paired.ct.tsx":
          'import { Story } from "./_ct-stories.tsx";\nexport const Cases = () => <>\n  <Story>one</Story>\n  <Story>two</Story>\n</>;\n',
      },
      expect: { count: 1, token: "Story" },
      why: "THE PAIRED SPELLING, and the row that reds without the opening-element rung of `JSX_TREE_KINDS`: a paired tag's identifier sits under a `JsxOpeningElement`, so a climb listing only element/fragment kinds breaks at the FIRST ancestor and makes every paired reference its own scope — two of them can then never group. The eval-time SyntaxError does not care which spelling was used (measured 2026-09-12, cb-v-unaudited-finals L1: this exact fixture returned 0 findings on a `hard` gate)",
    },
    {
      mode: "source",
      files: {
        "tests/ui/mixed.ct.tsx": 'import { Story } from "./_ct-stories.tsx";\nexport const Cases = () => <>\n  <Story>one</Story>\n  <Story />\n</>;\n',
      },
      expect: { count: 1, token: "Story" },
      why: "one paired and one self-closing reference in ONE tree are still two rewrite sites for one binding — the mixed spelling, which the pre-fix climb also missed because only the self-closing half reached the fragment",
    },
    {
      mode: "source",
      files: {
        "tests/ui/attribute.ct.tsx":
          'import { Story } from "./_ct-stories.tsx";\nconst Wrap = (props: { readonly slot: unknown; readonly children?: unknown }): unknown => props;\nexport const Cases = () => <Wrap slot={<Story />}>\n  <Story />\n</Wrap>;\n',
      },
      expect: { count: 1, token: "Story" },
      why: "the ATTRIBUTE spelling: a reference nested in a JSX attribute expression is in the SAME tree as its sibling child, so it is the same generated scope. It reaches the enclosing `JsxElement` only through the attribute rungs (`JsxExpression` → `JsxAttribute` → `JsxAttributes` → `JsxOpeningElement`), which is why `JSX_TREE_KINDS` is the JSX node FAMILY and not the three element kinds a reader first thinks of",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tests/ui/charts/z.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { StoryA } from "./_ct-stories.tsx";\nimport { StoryB } from "./_ct-stories.tsx";\nconst rows: readonly [string, unknown][] = [\n  ["a", StoryA],\n  ["b", StoryB],\n];\ntest("x", () => {\n  rows;\n});\n',
      },
      why: "two DIFFERENT stories, each imported and referenced exactly once — no collision",
    },
    {
      mode: "source",
      files: { "tests/ui/charts/single.ct.tsx": 'import { StoryA } from "./_ct-stories.tsx";\nStoryA;\n' },
      why: "a single import, single reference — the ordinary case",
    },
    {
      mode: "source",
      files: {
        "tests/ui/charts/reuse.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { StoryA } from "./_ct-stories.tsx";\ntest("a", () => <StoryA />);\ntest("b", () => <StoryA />);\n',
      },
      why: "the same story rendered across two SEPARATE test() bodies — generated declarations live in separate scopes",
    },
    {
      mode: "source",
      files: {
        "tests/ui/charts/remount.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { StoryA } from "./_ct-stories.tsx";\ntest("a", async ({ mount }) => {\n  await mount(<StoryA />);\n  await mount(<StoryA />);\n});\n',
      },
      why: "separate mount JSX trees in one test are separate rewrites and may reuse the same story import",
    },
    {
      mode: "source",
      files: {
        "tests/ui/charts/primitive.ct.tsx":
          'import { Button } from "@orb/ui/button";\nexport const Pair = () => <>\n  <Button>One</Button>\n  <Button>Two</Button>\n</>;\n',
      },
      why: "THE SPECIFIER FENCE: ordinary UI primitives may repeat in one rendered tree; only imported CT story modules are rewritten as story bindings. Widening `STORY_MODULE_RE` to `true` reds this row with one finding, so the row dies WITHOUT the fence. Until 2026-09-12 it did not: the pair is PAIRED, and the pre-L1 `jsxTreeRoot` could not group two paired references at all, so this row passed for a reason that had nothing to do with the specifier (cb-v-unaudited-finals L2 — a false pin riding L1). The paired spelling is kept deliberately: it is the same fixture that was lying, and it now proves the fence for real",
    },
    {
      mode: "source",
      files: {
        "tests/ui/charts/lowercase.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { storyRow } from "./_ct-stories.tsx";\nconst rows: readonly unknown[] = [storyRow, storyRow];\ntest("x", () => {\n  rows;\n});\n',
      },
      why: "THE COMPONENT-NAME FENCE: a lowercase export from a story module is DATA, not a component playwright-ct rewrites, so repeating it is not a collision. Widening `PASCAL_CASE` to `true` reds this row — the row dies without that fence",
    },
    {
      mode: "source",
      files: {
        "tests/ui/charts/scopes.ct.tsx":
          'import { test } from "@playwright/experimental-ct-react";\nimport { StoryA } from "./_ct-stories.tsx";\ntest("a", () => {\n  const rows = [StoryA];\n  return rows;\n});\ntest("b", () => {\n  const rows = [StoryA];\n  return rows;\n});\n',
      },
      why: "THE ARRAY REWRITE-SCOPE FENCE: one array reference per test callback is two SEPARATE generated scopes, exactly as `reuse.ct.tsx` pins for the JSX half. Replacing `rewriteScope`'s ancestor walk with the SourceFile reds this row — the row dies without that fence",
    },
    {
      mode: "source",
      files: { "tests/ui/charts/_ct-stories.tsx": "export function StoryA() {\n  return null;\n}\n" },
      why: "a story MODULE itself defines the export, it does not import it — out of scope for both shapes",
    },
  ],
});
