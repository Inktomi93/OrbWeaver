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
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";

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

/** A file "is" a LIST-region surface when it imports one of the three list-surface primitives. */
function isListSurfaceFile(sf: SourceFile): boolean {
  for (const imp of sf.getImportDeclarations()) {
    for (const named of imp.getNamedImports()) {
      if (LIST_SURFACE_IMPORTS.has(named.getName())) {
        return true;
      }
    }
  }
  return false;
}

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
function firstReturnExpression(callback: Node): Node | undefined {
  const ret = callback.getDescendantsOfKind(SyntaxKind.ReturnStatement).find((r) => r.getExpression() !== undefined);
  const expr = ret?.getExpression();
  return expr === undefined ? undefined : unwrapParens(expr);
}

/** The root JSX element of a `.map()` callback's returned expression (arrow-expression body or a single
 *  top-level `return`), or undefined when the callback doesn't return JSX at all (a plain data transform
 *  — `.map((p) => ({...}))` — is out of scope: G6 is about ROW RENDERING, not any `.map()`). */
function mapReturnRoot(callback: Node): Node | undefined {
  const candidate = Node.isArrowFunction(callback) ? unwrapParens(callback.getBody()) : firstReturnExpression(callback);
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
  const arrowDef = expr
    .getDefinitionNodes()
    .filter(Node.isVariableDeclaration)
    .map((def) => def.getInitializer())
    .filter((init) => init !== undefined)
    .map(unwrapParens)
    .find(Node.isArrowFunction);
  return arrowDef;
}

/** Every `renderItem={…}`/`renderRow={…}` JSX attribute's value expression in the file. */
function renderPropCallbacks(sf: SourceFile): Node[] {
  const callbacks: Node[] = [];
  for (const attr of sf.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    if (!RENDER_PROP_NAMES.has(attr.getNameNode().getText())) {
      continue;
    }
    const init = attr.getInitializer();
    if (!Node.isJsxExpression(init)) {
      continue;
    }
    const value = init.getExpression();
    if (value === undefined) {
      continue;
    }
    const callback = resolveRenderCallback(value);
    if (callback !== undefined) {
      callbacks.push(callback);
    }
  }
  return callbacks;
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

export const gate: GateDescriptor = {
  name: "list-row-adoption",
  docRow: "client-architecture-lockdown.md §14/§16 G6",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "a LIST-region surface file's `.map()` callback or renderItem/renderRow prop returns interactive JSX " +
    "(onClick/role/href) not rooted in ListRow/LibraryRow/an allowlisted composite " +
    "(client-architecture-lockdown.md §14 — the row primitive law).",
  fix: "root the row in @orb/ui's ListRow or the tier-2 LibraryRow (RowActionsMenu composes the row's actions).",
  scanRoot: (p) => p.includes("packages/client/src/") && p.endsWith(".tsx"),
  visitFile: (sf, ctx) => {
    if (!isListSurfaceFile(sf)) {
      return;
    }
    const checkCallback = (callback: Node): void => {
      const jsxRoot = mapReturnRoot(callback);
      if (jsxRoot === undefined || !isInteractiveJsx(jsxRoot)) {
        return;
      }
      const rootName = jsxElementName(jsxRoot);
      if (ROW_ROOT_NAMES.has(rootName)) {
        return;
      }
      ctx.report(jsxRoot, { token: rootName, offset: 0 });
    };
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      if (!Node.isPropertyAccessExpression(expr) || expr.getName() !== "map") {
        continue;
      }
      const [callback] = call.getArguments();
      if (callback !== undefined) {
        checkCallback(callback);
      }
    }
    for (const callback of renderPropCallbacks(sf)) {
      checkCallback(callback);
    }
  },
  mustFlag: [
    {
      files:
        'import { LibrarySurfaceShell } from "#components";\n' +
        "export const X = () => (\n" +
        "  <LibrarySurfaceShell>\n" +
        "    {items.map((item) => <div key={item.id} onClick={() => select(item)}>{item.name}</div>)}\n" +
        "  </LibrarySurfaceShell>\n" +
        ");\n",
      at: "packages/client/src/features/demo/surfaces/demo-library-surface.tsx",
      why: "a LIST-surface file's `.map()` row rooted in a plain `<div onClick>` — not ListRow/LibraryRow, flags",
    },
    {
      files:
        'import { LibraryListLayout } from "#components";\n' +
        'import { VirtualList } from "@orb/ui/virtual-list";\n' +
        "const renderRow = (item) => <div key={item.id} onClick={() => select(item)}>{item.name}</div>;\n" +
        "export const X = () => (\n" +
        "  <LibraryListLayout>\n" +
        "    <VirtualList items={items} renderItem={renderRow} getItemKey={(i) => i.id} estimateSize={() => 40} />\n" +
        "  </LibraryListLayout>\n" +
        ");\n",
      at: "packages/client/src/features/demo/surfaces/demo-virtual-surface.tsx",
      why: "a LIST-surface file's `renderItem` prop resolves to a local `renderRow` rooted in a plain `<div onClick>` — the renderItem/renderRow hole, flags",
    },
  ],
  mustPass: [
    {
      files:
        'import { LibraryRow } from "#components";\n' +
        'import { LibraryListLayout } from "#components";\n' +
        "export const X = () => (\n" +
        "  <LibraryListLayout>\n" +
        "    {items.map((item) => <LibraryRow key={item.id} title={item.name} onClick={() => select(item)} />)}\n" +
        "  </LibraryListLayout>\n" +
        ");\n",
      at: "packages/client/src/features/demo/surfaces/demo-library-surface.tsx",
      why: "a `.map()` row rooted in LibraryRow — the legal composite, passes",
    },
    {
      files:
        'import { LibraryRow } from "#components";\n' +
        'import { LibraryListLayout } from "#components";\n' +
        'import { VirtualList } from "@orb/ui/virtual-list";\n' +
        "const renderRow = (item) => <LibraryRow key={item.id} title={item.name} onClick={() => select(item)} />;\n" +
        "export const X = () => (\n" +
        "  <LibraryListLayout>\n" +
        "    <VirtualList items={items} renderItem={renderRow} getItemKey={(i) => i.id} estimateSize={() => 40} />\n" +
        "  </LibraryListLayout>\n" +
        ");\n",
      at: "packages/client/src/features/demo/surfaces/demo-virtual-surface.tsx",
      why: "a `renderItem` prop resolving to a local `renderRow` rooted in LibraryRow — the legal composite, passes",
    },
    {
      files:
        "export const X = () => (\n" +
        "  <div>\n" +
        "    {items.map((item) => <div key={item.id} onClick={() => select(item)}>{item.name}</div>)}\n" +
        "  </div>\n" +
        ");\n",
      at: "packages/client/src/features/demo/surfaces/demo-plain-list.tsx",
      why: "a hand-rolled interactive `.map()` row, but the file imports none of the 3 list-surface primitives — not a LIST-surface file, passes",
    },
    {
      files:
        'import { createCollectionSurface } from "#data";\n' +
        "export const useX = createCollectionSurface({});\n" +
        "export const X = () => (\n" +
        '  <div data-slot="setting-row" onClick={() => toggle()}>{label}</div>\n' +
        ");\n",
      at: "packages/client/src/features/settings/components/theme-setting-row.tsx",
      why: "a settings *-row.tsx: a bare interactive div, but NO `.map()` at all in this file — the carve-out species pass (message/facet/setting rows use none of the 3 primitives in a list rendering loop)",
    },
  ],
};
