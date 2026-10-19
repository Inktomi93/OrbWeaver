// The `surface-in-a-container` reader: what a `packages/client/src/features/*/surfaces/*.tsx` file DOES —
// does it establish raw structural layout, does it render an `@orb/ui/layout` container, and which exported
// declaration is its component.
//
// WHY A READER AND NOT PER-POLICY HELPERS. `gate:contract`'s `direct-walk` rule forbids
// `getDescendantsOfKind` inside a gate module regardless of receiver, and names "visitors, ctx.files, or a
// shared reader" as the alternatives.
//
// `renderedTagNames` is imported from `./baseui-read.ts` rather than re-spelled: it is the one home for "JSX
// tag names rendered in a file, both element spellings, each at its first line", and a self-closing-only
// reader is the lying-proof class that once shipped a confident false-positive factory.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { renderedTagNames } from "./baseui-read.ts";

/** The surface's own component: the FIRST exported function-valued declaration in the file, which is the
 *  node a surface-level verdict anchors on.
 *
 *  WHY THIS NODE. A surface-level verdict is about the FILE, and a file-anchored ORDINARY
 *  finding has no waiver door at all — `locateFinding` requires authored text at the finding's exact
 *  line/column, so it raises a binding failure instead (guide §2.1's authored-coordinate rule). The exported
 *  component's NAME is authored code, survives comment blanking, is stable across edits to the body, and is
 *  where a reader would look. Returning `undefined` for a surface file that exports no component is a
 *  DECLARED LIMIT rather than a silent pass: there is no position to waive, so there is no honest ordinary
 *  finding to report, and each consuming policy states it with a row. */
export function exportedComponentAnchor(sf: SourceFile): Node | undefined {
  let found: Node | undefined;
  for (const declaration of sf.getFunctions()) {
    if (declaration.isExported() && declaration.getNameNode() !== undefined) {
      found ??= declaration.getNameNode();
    }
  }
  for (const statement of sf.getVariableStatements()) {
    if (!statement.isExported()) {
      continue;
    }
    for (const declaration of statement.getDeclarations()) {
      const initializer = declaration.getInitializer();
      const name = declaration.getNameNode();
      const functionValued = initializer !== undefined && (initializer.isKind(SyntaxKind.ArrowFunction) || initializer.isKind(SyntaxKind.FunctionExpression));
      if (functionValued && name.isKind(SyntaxKind.Identifier)) {
        found ??= name;
      }
    }
  }
  return found;
}

/** A structural root worth containing — the surface establishes layout of its own. A surface that returns
 *  only text or a single composed child needs no container. */
const STRUCTURAL_TAGS = new Set(["div", "main", "section", "ul", "ol", "form", "Stack", "Row", "Grid", "Toolbar"]);

const LAYOUT_MODULE = "@orb/ui/layout";

/** Does this file render a raw structural root (a `div`/`ul`/`Stack`/… ) of its own? */
export function rendersStructuralRoot(sf: SourceFile): boolean {
  return [...renderedTagNames(sf).keys()].some((tag) => STRUCTURAL_TAGS.has(tag));
}

/** Local names bound to `@orb/ui/layout`'s `Container` and `Section` exports in this file. */
function layoutBindings(sf: SourceFile): { readonly containers: ReadonlySet<string>; readonly sections: ReadonlySet<string> } {
  const containers = new Set<string>();
  const sections = new Set<string>();
  for (const declaration of sf.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== LAYOUT_MODULE) {
      continue;
    }
    for (const specifier of declaration.getNamedImports()) {
      const local = specifier.getAliasNode()?.getText() ?? specifier.getName();
      if (specifier.getName() === "Container") {
        containers.add(local);
      } else if (specifier.getName() === "Section") {
        sections.add(local);
      }
    }
  }
  return { containers, sections };
}

/** Does this file render an `@orb/ui/layout` container — a `<Container>`, or a `<Section container>`?
 *  IDENTITY, not spelling: the tag must resolve to a named import of that exact module, so a local component
 *  called `Container` establishes nothing and is not mistaken for one, and an ALIASED import still counts. */
export function rendersLayoutContainer(sf: SourceFile): boolean {
  const bindings = layoutBindings(sf);
  if (bindings.containers.size === 0 && bindings.sections.size === 0) {
    return false;
  }
  const elements = [...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement), ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)];
  return elements.some((element) => {
    const tag = element.getTagNameNode().getText();
    if (bindings.containers.has(tag)) {
      return true;
    }
    return (
      bindings.sections.has(tag) &&
      element.getAttributes().some((attribute) => attribute.isKind(SyntaxKind.JsxAttribute) && attribute.getNameNode().getText() === "container")
    );
  });
}
