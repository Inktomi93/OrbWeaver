// Conversion from e9d9fd232: shared dispatch collects imports, callbacks and returns; no private AST walk.
// All six legacy proofs retained. The legacy lexical import/tag vocabulary and same-file alias fence
// remain explicit limits. Composed differential, authority and population checks are deferred.
// Gate: list-row-adoption (client-architecture-lockdown.md §14/§16 G6) — a LIST-region surface file (one
// importing LibrarySurfaceShell/LibraryListLayout/createCollectionSurface) whose `.map()` callback OR
// renderItem/renderRow prop returns interactive JSX (onClick/role/href) must root that JSX in
// ListRow/LibraryRow/an allowlisted composite (a virtualized list's renderItem/renderRow is the same row
// render as a `.map()` — scanning only the literal `.map()` form misses it).
//
// NO EXEMPTION ARTIFACT (authority census C1, #1922; deleted 2026-09-12). This gate carried an
// `ExemptionTable<RootRow>` of per-file legal composite roots plus a `finalize` stale arm that red an
// unused row. The table had been EMPTY since it landed — every current LIST-surface row already roots in
// ListRow/LibraryRow — so the stale arm was VACUOUS (it iterated nothing) and the ALLOWLIST lookup in
// `visitFile` could never match. Both are gone, and with them the `begin`/`finalize` hooks, the
// module-level `seenAllowlistEntries` accumulator and the real-tree anchor that existed only to keep the
// vacuous arm off conformance's synthetic projects. A genuine future exemption is a central reviewed
// grant, never a resurrected gate-local table.
// BINDING RESOLUTION (#2163): a `renderItem={renderRow}` alias resolves through the shared
// `resolveStableExpression` reader, then this policy retains its same-file callback fence.
import type { ReturnStatement, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveStableExpression } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";

const LIST_SURFACE_IMPORTS: ReadonlySet<string> = new Set(["LibrarySurfaceShell", "LibraryListLayout", "createCollectionSurface"]);

/** The composite root names a LIST-surface `.map()`/renderItem/renderRow row may legally return — this
 *  gate's own SUBJECT VOCABULARY, the sibling of `LIST_SURFACE_IMPORTS` and `RENDER_PROP_NAMES` below, and
 *  not an exemption artifact of any kind: it has no per-file rows, licenses no site, and nothing in it can
 *  go stale.
 *
 *  IT WAS SPELLED `ALLOWED_ROOTS` UNTIL 2026-09-13 (#2268), AND THE SPELLING WAS THE DEFECT. `b5490a02a`
 *  deleted this module's genuinely empty `ALLOWLIST` together with its stale arm (correctly — the arm was
 *  vacuous), and `gate-modernization` arm B, whose identity test is the const NAME, then accused this
 *  vocabulary set as a one-sided exemption table: measured with the gate's own predicates,
 *  `hasStaleArm` went true → false and the accusation list went `[]` → `["ALLOWED_ROOTS"]`. A NEW
 *  standing corpus red introduced by a commit that deleted the right thing.
 *
 *  THE ARM IS NOT THE DEFECT AND WAS NOT TOUCHED. Arm B's identity test is a NAME test BY DESIGN and it
 *  says so at its own vocabulary — *"Deliberately NARROW … The name is the signal: if a collection is
 *  scope, name it scope"* — and its `fix` string names this exact remedy: *"if the collection is a
 *  scan-SCOPE decision rather than an exemption, rename it out of the exemption vocabulary."* Widening it
 *  to read a collection's NATURE is not available: a two-member `ReadonlySet<string>` of vocabulary is
 *  structurally identical to a two-row allowlist, so a nature test would have to guess where the name is
 *  a declaration. The ruling survives; its INPUT changed. */
const ROW_ROOT_NAMES: ReadonlySet<string> = new Set(["ListRow", "LibraryRow"]);

/** JSX prop names a virtualized/collection list uses to render each row — the non-`.map()` row form. */
const RENDER_PROP_NAMES: ReadonlySet<string> = new Set(["renderItem", "renderRow"]);

/** A JSX element/self-closing element's opening-tag attribute list, or `[]` for anything else. */
function jsxAttributes(node: Node): readonly Node[] {
  if (Node.isJsxSelfClosingElement(node)) {
    return node.getAttributes();
  }
  if (Node.isJsxElement(node)) {
    return node.getOpeningElement().getAttributes();
  }
  return [];
}

/** True when a JSX element/self-closing element carries an interactivity signal (onClick/role/href). */
function isInteractiveJsx(node: Node): boolean {
  return jsxAttributes(node).some((a) => {
    if (!Node.isJsxAttribute(a)) {
      return false;
    }
    const name = a.getNameNode().getText();
    return name === "onClick" || name === "role" || name === "href";
  });
}

/** Unwraps a parenthesized expression to its inner expression (a no-op for anything else). */
function unwrapParens(node: Node): Node {
  return Node.isParenthesizedExpression(node) ? node.getExpression() : node;
}

/** The single top-level `return`'s expression inside a callback body, unwrapped — undefined if none. */
function firstReturnExpression(callback: Node, returns: readonly ReturnStatement[]): Node | undefined {
  const ret = returns.find(
    (r) =>
      r.getSourceFile() === callback.getSourceFile() &&
      r.getStart() >= callback.getStart() &&
      r.getEnd() <= callback.getEnd() &&
      r.getExpression() !== undefined,
  );
  const expr = ret?.getExpression();
  return expr === undefined ? undefined : unwrapParens(expr);
}

/** The root JSX element of a `.map()` callback's returned expression (arrow-expression body or a single
 *  top-level `return`), or undefined when the callback doesn't return JSX at all (a plain data transform
 *  — `.map((p) => ({...}))` — is out of scope: G6 is about ROW RENDERING, not any `.map()`). */
function mapReturnRoot(callback: Node, returns: readonly ReturnStatement[]): Node | undefined {
  const candidate = Node.isArrowFunction(callback) ? unwrapParens(callback.getBody()) : firstReturnExpression(callback, returns);
  if (candidate === undefined) {
    return;
  }
  return Node.isJsxElement(candidate) || Node.isJsxSelfClosingElement(candidate) ? candidate : undefined;
}

/** An arrow function directly, or an identifier resolved to a local `const x = (item) => …` declaration
 *  (the `renderRow={renderRow}` pattern — the prop rarely takes an inline arrow). Undefined for anything
 *  else (an imported/prop-passed render function is out of scope: its root lives in another file). */
function resolveRenderCallback(expr: Node): Node | undefined {
  if (Node.isArrowFunction(expr)) {
    return expr;
  }
  if (!Node.isIdentifier(expr)) {
    return;
  }
  const resolved = resolveStableExpression(expr);
  if (resolved.kind === "unresolved" || resolved.value.getSourceFile() !== expr.getSourceFile()) {
    return;
  }
  const callback = unwrapParens(resolved.value);
  return Node.isArrowFunction(callback) ? callback : undefined;
}

function jsxElementName(node: Node): string {
  if (Node.isJsxSelfClosingElement(node)) {
    return node.getTagNameNode().getText();
  }
  if (Node.isJsxElement(node)) {
    return node.getOpeningElement().getTagNameNode().getText();
  }
  return "";
}

const MESSAGE = "a LIST-region row render returns interactive JSX outside ListRow/LibraryRow; root the row in the shared row primitive.";

export const gate = defineGate({
  id: "list-row-adoption",
  family: "list-row-adoption",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"], ext: ["tsx"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "root the row in @orb/ui ListRow or LibraryRow; RowActionsMenu composes its actions. A deliberate " +
    "exception is waived with `// @orb-waive list-row-adoption(<tag>): <reason>` immediately above the " +
    "`.map()`/renderItem/renderRow callback, where <tag> is the reported root JSX element name, e.g. `div`.",
  create: (ctx) => {
    const surfaces = new Set<SourceFile>();
    const callbacks: Node[] = [];
    const returns: ReturnStatement[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.ImportDeclaration],
          visit: (node) => {
            if (Node.isImportDeclaration(node) && node.getNamedImports().some((named) => LIST_SURFACE_IMPORTS.has(named.getName()))) {
              surfaces.add(node.getSourceFile());
            }
          },
        },
        {
          kinds: [SyntaxKind.ReturnStatement],
          visit: (node) => {
            if (Node.isReturnStatement(node)) {
              returns.push(node);
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node) => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const expr = node.getExpression();
            if (Node.isPropertyAccessExpression(expr) && expr.getName() === "map") {
              const [callback] = node.getArguments();
              if (callback !== undefined) {
                callbacks.push(callback);
              }
            }
          },
        },
        {
          kinds: [SyntaxKind.JsxAttribute],
          visit: (node) => {
            if (!(Node.isJsxAttribute(node) && RENDER_PROP_NAMES.has(node.getNameNode().getText()))) {
              return;
            }
            const init = node.getInitializer();
            const value = Node.isJsxExpression(init) ? init.getExpression() : undefined;
            const callback = value === undefined ? undefined : resolveRenderCallback(value);
            if (callback !== undefined) {
              callbacks.push(callback);
            }
          },
        },
      ],
      evaluate: () => {
        for (const callback of callbacks) {
          if (!surfaces.has(callback.getSourceFile())) {
            continue;
          }
          const root = mapReturnRoot(callback, returns);
          if (root === undefined || !isInteractiveJsx(root)) {
            continue;
          }
          const name = jsxElementName(root);
          if (!ROW_ROOT_NAMES.has(name)) {
            ctx.report.node(root, { token: name, offset: 1, message: MESSAGE });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/demo/surfaces/demo-library-surface.tsx":
          'import { LibrarySurfaceShell } from "#components";\n' +
          "export const X = () => (\n" +
          "  <LibrarySurfaceShell>\n" +
          "    {items.map((item) => <div key={item.id} onClick={() => select(item)}>{item.name}</div>)}\n" +
          "  </LibrarySurfaceShell>\n" +
          ");\n",
      },
      expect: { count: 1, token: "div" },
      why: "a LIST-surface file's `.map()` row rooted in a plain `<div onClick>` — not ListRow/LibraryRow, flags",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/demo/surfaces/demo-virtual-surface.tsx":
          'import { LibraryListLayout } from "#components";\n' +
          'import { VirtualList } from "@orb/ui/virtual-list";\n' +
          "const renderRow = (item) => <div key={item.id} onClick={() => select(item)}>{item.name}</div>;\n" +
          "export const X = () => (\n" +
          "  <LibraryListLayout>\n" +
          "    <VirtualList items={items} renderItem={renderRow} getItemKey={(i) => i.id} estimateSize={() => 40} />\n" +
          "  </LibraryListLayout>\n" +
          ");\n",
      },
      expect: { count: 1, token: "div" },
      why: "a LIST-surface file's `renderItem` prop resolves to a local `renderRow` rooted in a plain `<div onClick>` — the renderItem/renderRow hole, flags",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/demo/surfaces/demo-library-surface.tsx":
          'import { LibraryRow } from "#components";\n' +
          'import { LibraryListLayout } from "#components";\n' +
          "export const X = () => (\n" +
          "  <LibraryListLayout>\n" +
          "    {items.map((item) => <LibraryRow key={item.id} title={item.name} onClick={() => select(item)} />)}\n" +
          "  </LibraryListLayout>\n" +
          ");\n",
      },
      why: "a `.map()` row rooted in LibraryRow — the legal composite, passes",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/demo/surfaces/demo-virtual-surface.tsx":
          'import { LibraryRow } from "#components";\n' +
          'import { LibraryListLayout } from "#components";\n' +
          'import { VirtualList } from "@orb/ui/virtual-list";\n' +
          "const renderRow = (item) => <LibraryRow key={item.id} title={item.name} onClick={() => select(item)} />;\n" +
          "export const X = () => (\n" +
          "  <LibraryListLayout>\n" +
          "    <VirtualList items={items} renderItem={renderRow} getItemKey={(i) => i.id} estimateSize={() => 40} />\n" +
          "  </LibraryListLayout>\n" +
          ");\n",
      },
      why: "a `renderItem` prop resolving to a local `renderRow` rooted in LibraryRow — the legal composite, passes",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/demo/surfaces/demo-plain-list.tsx":
          "export const X = () => (\n" +
          "  <div>\n" +
          "    {items.map((item) => <div key={item.id} onClick={() => select(item)}>{item.name}</div>)}\n" +
          "  </div>\n" +
          ");\n",
      },
      why: "a hand-rolled interactive `.map()` row, but the file imports none of the 3 list-surface primitives — not a LIST-surface file, passes",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/settings/components/theme-setting-row.tsx":
          'import { createCollectionSurface } from "#data";\n' +
          "export const useX = createCollectionSurface({});\n" +
          "export const X = () => (\n" +
          '  <div data-slot="setting-row" onClick={() => toggle()}>{label}</div>\n' +
          ");\n",
      },
      why: "a settings *-row.tsx: a bare interactive div, but NO `.map()` at all in this file — the carve-out species pass (message/facet/setting rows use none of the 3 primitives in a list rendering loop)",
    },
  ],
});
