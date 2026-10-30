// Containment rules judge the primitive a JSX name resolves to, never the name as written. A static import chain is
// followed (alias, namespace member, destructured namespace); where a file has type information, a re-export through
// another module is followed to the symbol's declaration. A render path is not followed.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import { importedSymbol } from "./static-values.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { restrictionRule } from "./syntax.ts";
import { nativeOf } from "./test-routes.ts";
import { SURFACE_SELECTORS } from "./ui-feature-policy.ts";

const LAYOUT_DOOR = /^@orb\/ui\/layout(?:\/|$)/u;
const MODAL_ROOT_DOOR = /^@orb\/ui\/(?:dialog|alert-dialog|drawer)$/u;
const MODAL_ROOTS = new Set(["Dialog", "AlertDialog", "Drawer"]);
// Where the sealed primitives are declared, for a name that reaches a feature through a re-export.
const LAYOUT_HOME = /\/packages\/ui\/src\/layout\/[^/]+\.tsx$/u;
const MODAL_HOME = /\/packages\/ui\/src\/primitives\/(?:dialog|alert-dialog|drawer)\/[^/]+\.tsx$/u;
// A name can only be a re-export when it comes from a feature or client module, never from a package door.
const LOCAL_SOURCE = /^(?:\.{1,2}\/|#)/u;
// The dialog boxes an anchor can mount: a sealed @orb/ui modal, the shared client composites, or a sibling anchor file (linted by this same rule).
const DIALOG_BOX_DOOR = /^(?:@orb\/ui\/(?:dialog|alert-dialog|drawer)|#components|\.{1,2}\/.+)$/u;
const DIALOG_BOX_NAME = /(?:Dialog|Drawer)$/u;
const CONTAINER_PROP = "container";

type Attribute = TSESTree.JSXOpeningElement["attributes"][number];

const isContainerProp = (attribute: Attribute): attribute is TSESTree.JSXAttribute =>
  attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier" && attribute.name.name === CONTAINER_PROP;

const isFalseLiteral = (node: TSESTree.Node | null | undefined): boolean => node?.type === "Literal" && node.value === false;

/** `container={false}` turns containment off, so it neither declares nor provides one. */
const containerPropOn = (element: TSESTree.JSXOpeningElement): TSESTree.JSXAttribute | undefined =>
  element.attributes.find(
    (attribute): attribute is TSESTree.JSXAttribute =>
      isContainerProp(attribute) && !isFalseLiteral(attribute.value?.type === "JSXExpressionContainer" ? attribute.value.expression : null),
  );

/** The name a JSX tag's symbol is declared under, when the checker traces it through re-exports to a file matching `home`. */
function declaredName(context: OrbRuleContext, name: TSESTree.JSXTagNameExpression, home: RegExp): string | undefined {
  const native = nativeOf(context);
  if (native === undefined || name.type === "JSXNamespacedName") {
    return undefined;
  }
  const tag = native.toTs(name);
  const reference = ts.isPropertyAccessExpression(tag) ? tag.name : tag;
  let symbol = native.checker.getSymbolAtLocation(reference);
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
  if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    symbol = native.checker.getAliasedSymbol(symbol);
  }
  const file = symbol?.declarations?.[0]?.getSourceFile().fileName;
  return file !== undefined && home.test(file) ? symbol?.getName() : undefined;
}

/** The layout primitive the element is, whatever it is called here or how many modules re-export it. */
function layoutPrimitive(context: OrbRuleContext, element: TSESTree.JSXOpeningElement): string | undefined {
  const symbol = importedSymbol(context, element.name);
  if (symbol !== undefined && LAYOUT_DOOR.test(symbol.source)) {
    return symbol.name;
  }
  return symbol !== undefined && LOCAL_SOURCE.test(symbol.source) ? declaredName(context, element.name, LAYOUT_HOME) : undefined;
}

/** Container, or Section and Stack with containment on: the elements that own a container. */
function ownsContainer(context: OrbRuleContext, element: TSESTree.JSXOpeningElement): boolean {
  const primitive = layoutPrimitive(context, element);
  return primitive === "Container" || ((primitive === "Section" || primitive === "Stack") && containerPropOn(element) !== undefined);
}

// A bare, string or boolean `container` is containment whatever the element is called; a Portal's `container` is an element or a ref.
function carriesContainerFlag(element: TSESTree.JSXOpeningElement): boolean {
  const attribute = containerPropOn(element);
  const value = attribute?.value;
  return (
    attribute !== undefined &&
    (value === null || value?.type === "Literal" || (value?.type === "JSXExpressionContainer" && value.expression.type === "Literal"))
  );
}

function spreadsContainer(element: TSESTree.JSXOpeningElement): boolean {
  return element.attributes.some(
    (attribute) =>
      attribute.type === "JSXSpreadAttribute" &&
      attribute.argument.type === "ObjectExpression" &&
      attribute.argument.properties.some(
        (property) =>
          property.type === "Property" &&
          ((property.key.type === "Identifier" && property.key.name === CONTAINER_PROP) ||
            (property.key.type === "Literal" && property.key.value === CONTAINER_PROP)) &&
          !isFalseLiteral(property.value),
      ),
  );
}

function isModalRoot(context: OrbRuleContext, element: TSESTree.JSXOpeningElement): boolean {
  const symbol = importedSymbol(context, element.name);
  if (symbol === undefined) {
    return false;
  }
  const declared = LOCAL_SOURCE.test(symbol.source) ? declaredName(context, element.name, MODAL_HOME) : undefined;
  return (MODAL_ROOT_DOOR.test(symbol.source) && MODAL_ROOTS.has(symbol.name)) || (declared !== undefined && MODAL_ROOTS.has(declared));
}

/** The dialog box an anchor returns: the element itself, or beside its sibling dialogs in a fragment, never nested in another element. */
function isDialogBox(context: OrbRuleContext, element: TSESTree.JSXOpeningElement): boolean {
  const symbol = importedSymbol(context, element.name);
  if (symbol === undefined || !DIALOG_BOX_DOOR.test(symbol.source) || !DIALOG_BOX_NAME.test(symbol.name)) {
    return false;
  }
  for (let ancestor: TSESTree.Node | null | undefined = element.parent.parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.type === "JSXElement") {
      return false;
    }
  }
  return true;
}

/** A surface consumes the containment its anchor provides (UI-Architecture-and-Layout.md §4). */
export const surfaceConsumesContainerRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      ...restrictionRule({ selectors: SURFACE_SELECTORS }).create(context),
      JSXOpeningElement: (element: TSESTree.JSXOpeningElement): void => {
        if (ownsContainer(context, element) || carriesContainerFlag(element) || spreadsContainer(element)) {
          context.report({
            node: element,
            message: "A surface never declares its own container. Move the <Container> (or `container` prop) to the anchor that mounts it.",
          });
        } else if (isModalRoot(context, element)) {
          context.report({
            node: element,
            message:
              "A surface never renders its own outer Dialog, AlertDialog or Drawer root. Mount it from the anchor; a surface composes only the trigger or a confirm part.",
          });
        }
      },
    };
  },
};

/** An anchor provides containment: a container owner, or the dialog box it anchors. */
export const anchorProvidesContainerRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    let provides = false;
    return {
      JSXOpeningElement: (element: TSESTree.JSXOpeningElement): void => {
        provides ||= ownsContainer(context, element) || isDialogBox(context, element);
      },
      "Program:exit"(program: TSESTree.Program): void {
        if (!provides) {
          context.report({
            node: program,
            message: "An anchor provides containment: render <Container> (or <Section container>), or the dialog box it anchors.",
          });
        }
      },
    };
  },
};
