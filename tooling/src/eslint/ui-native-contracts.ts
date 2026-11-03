import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import type { Native } from "./test-routes.ts";
import { nativeOf } from "./test-routes.ts";

const BASE_UI_PACKAGE = /\/node_modules\/@base-ui\/react\//u;
const REACT_TYPES_PACKAGE = /\/node_modules\/@types\/react\//u;

function callable(type: ts.Type): boolean {
  return type.getCallSignatures().length > 0 || (type.isUnion() && type.types.some(callable));
}

interface WrapperShape {
  readonly members: readonly ts.TypeElement[];
  readonly bases: readonly (ts.TypeReferenceNode | ts.ExpressionWithTypeArguments)[];
}

function wrapperShape(node: ts.Node): WrapperShape | undefined {
  if (ts.isInterfaceDeclaration(node)) {
    return { members: node.members, bases: node.heritageClauses?.flatMap((clause) => [...clause.types]) ?? [] };
  }
  if (ts.isTypeAliasDeclaration(node) && ts.isIntersectionTypeNode(node.type)) {
    return {
      members: node.type.types.flatMap((type) => (ts.isTypeLiteralNode(type) ? [...type.members] : [])),
      bases: node.type.types.filter(ts.isTypeReferenceNode),
    };
  }
  return undefined;
}

function omittedBase(native: Native, node: ts.TypeReferenceNode | ts.ExpressionWithTypeArguments): ts.Type | undefined {
  const name = ts.isTypeReferenceNode(node) ? node.typeName : node.expression;
  const base = node.typeArguments?.[0];
  if (!ts.isIdentifier(name) || name.text !== "Omit" || base === undefined) {
    return undefined;
  }
  const standard =
    native.checker.getSymbolAtLocation(name)?.declarations?.some((declaration) => native.program.isSourceFileDefaultLibrary(declaration.getSourceFile())) ===
    true;
  return standard ? native.checker.getTypeAtLocation(base) : undefined;
}

function callbackName(member: ts.TypeElement): string | undefined {
  if (
    !(ts.isPropertySignature(member) || ts.isMethodSignature(member)) ||
    member.type === undefined ||
    !(ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
  ) {
    return undefined;
  }
  return member.name.text === "style" || /^on[A-Z]/u.test(member.name.text) ? member.name.text : undefined;
}

function narrowsCallback(native: Native, member: ts.TypeElement, name: string, bases: WrapperShape["bases"]): boolean {
  const replacement = native.checker.getTypeAtLocation(member);
  return bases.some((base) => {
    const original = omittedBase(native, base);
    const property = original === undefined ? undefined : native.checker.getPropertyOfType(original, name);
    if (property === undefined || native.checker.getPropertyOfType(native.checker.getTypeAtLocation(base), name) !== undefined) {
      return false;
    }
    const libraryOwned =
      property.declarations?.some((declaration) => BASE_UI_PACKAGE.test(declaration.getSourceFile().fileName.replaceAll("\\", "/"))) === true;
    const owned = native.checker.getTypeOfSymbolAtLocation(property, member);
    return libraryOwned && callable(owned) && !native.checker.isTypeAssignableTo(owned, replacement);
  });
}

/** Preserve callback-capable props removed through Omit and declared again on a wrapper. */
export const nativeCallbackNarrowingRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const native = nativeOf(context);
    if (native === undefined) {
      return {};
    }
    const judge = (node: TSESTree.Node): void => {
      const shape = wrapperShape(native.toTs(node));
      if (shape === undefined) {
        return;
      }
      for (const member of shape.members) {
        const name = callbackName(member);
        if (name !== undefined && narrowsCallback(native, member, name, shape.bases)) {
          context.report({
            node: native.toEs(member) ?? node,
            message: `The redeclared ${name} narrows a native callback contract. Derive it from the owning props and preserve callback state and event details.`,
          });
        }
      }
    };
    return { TSInterfaceDeclaration: judge, TSTypeAliasDeclaration: judge };
  },
};

function hookName(checker: ts.TypeChecker, initializer: ts.Expression | undefined): string | undefined {
  if (initializer === undefined || !ts.isCallExpression(initializer)) {
    return undefined;
  }
  const owner = checker.getResolvedSignature(initializer)?.declaration;
  return owner !== undefined && ts.isFunctionDeclaration(owner) && REACT_TYPES_PACKAGE.test(owner.getSourceFile().fileName.replaceAll("\\", "/"))
    ? owner.name?.text
    : undefined;
}

function ownsRef(checker: ts.TypeChecker, expression: ts.Expression): boolean {
  if (!ts.isIdentifier(expression)) {
    return false;
  }
  const declaration = checker.getSymbolAtLocation(expression)?.valueDeclaration;
  if (declaration !== undefined && ts.isVariableDeclaration(declaration)) {
    return hookName(checker, declaration.initializer) === "useRef";
  }
  if (declaration === undefined || !ts.isBindingElement(declaration) || !ts.isArrayBindingPattern(declaration.parent)) {
    return false;
  }
  const binding = declaration.parent;
  const variable = binding.parent;
  return binding.elements[1] === declaration && ts.isVariableDeclaration(variable) && hookName(checker, variable.initializer) === "useState";
}

function otherUse(checker: ts.TypeChecker, expression: ts.Identifier, scope: ts.Node): boolean {
  const symbol = checker.getSymbolAtLocation(expression);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (node === expression || found) {
      return;
    }
    if (ts.isIdentifier(node) && checker.getSymbolAtLocation(node) === symbol) {
      const parent = node.parent;
      const binding = (ts.isVariableDeclaration(parent) || ts.isBindingElement(parent)) && parent.name === node;
      if (!binding) {
        found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return found;
}

function functionBody(node: ts.Node): ts.ConciseBody | undefined {
  for (let parent = node.parent; !ts.isSourceFile(parent); parent = parent.parent) {
    if (ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isArrowFunction(parent)) {
      return parent.body;
    }
  }
  return undefined;
}

function refExpression(element: ts.JsxOpeningElement | ts.JsxSelfClosingElement): ts.Expression | undefined {
  const ref = element.attributes.properties.find(
    (attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name) && attribute.name.text === "ref",
  );
  return ref?.initializer !== undefined && ts.isJsxExpression(ref.initializer) ? ref.initializer.expression : undefined;
}

function incomingBody(checker: ts.TypeChecker, expression: ts.Identifier): ts.ConciseBody | undefined {
  const declaration = checker.getSymbolAtLocation(expression)?.valueDeclaration;
  if (declaration === undefined) {
    return undefined;
  }
  let owner: ts.Node = declaration;
  while (ts.isBindingElement(owner) || ts.isObjectBindingPattern(owner) || ts.isArrayBindingPattern(owner)) {
    owner = owner.parent;
  }
  return ts.isParameter(owner) ? functionBody(owner) : undefined;
}

function conflictingSpread(native: Native, element: ts.JsxOpeningElement | ts.JsxSelfClosingElement): boolean {
  return element.attributes.properties.some((attribute) => {
    if (!(ts.isJsxSpreadAttribute(attribute) && ts.isIdentifier(attribute.expression))) {
      return false;
    }
    const incoming = native.checker.getTypeAtLocation(attribute.expression);
    const body = incomingBody(native.checker, attribute.expression);
    return body !== undefined && native.checker.getPropertyOfType(incoming, "ref") !== undefined && !otherUse(native.checker, attribute.expression, body);
  });
}

/** Refuse an internal React ref or DOM-node setter competing with an otherwise-unconsumed ref spread. */
export const overwrittenRefRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const native = nativeOf(context);
    if (native === undefined) {
      return {};
    }
    return {
      JSXOpeningElement: (node: TSESTree.JSXOpeningElement): void => {
        const element = native.toTs(node);
        if (!(ts.isJsxOpeningElement(element) || ts.isJsxSelfClosingElement(element))) {
          return;
        }
        const expression = refExpression(element);
        if (expression !== undefined && ownsRef(native.checker, expression) && conflictingSpread(native, element)) {
          context.report({
            node,
            message: "A ref-bearing spread and an internal ref overwrite each other. Extract the caller ref and merge it with the internal ref.",
          });
        }
      },
    };
  },
};

function cssContext(type: ts.Type): boolean {
  if (type.isUnion() || type.isIntersection()) {
    return type.types.some(cssContext);
  }
  const symbol = type.getSymbol();
  return (
    symbol?.name === "CSSProperties" &&
    symbol.declarations?.some((declaration) => REACT_TYPES_PACKAGE.test(declaration.getSourceFile().fileName.replaceAll("\\", "/"))) === true
  );
}

/** Resolve callback-capable CSS styles before spreading their object properties. */
export const unresolvedStyleSpreadRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const native = nativeOf(context);
    if (native === undefined) {
      return {};
    }
    return {
      SpreadElement: (node: TSESTree.SpreadElement): void => {
        const spread = native.toTs(node);
        if (!(ts.isSpreadAssignment(spread) && ts.isObjectLiteralExpression(spread.parent))) {
          return;
        }
        const target = native.checker.getContextualType(spread.parent);
        if (target !== undefined && cssContext(target) && callable(native.checker.getTypeAtLocation(spread.expression))) {
          context.report({
            node,
            message: "Resolve a callback-capable CSS style with its native state before object spreading; spreading the function drops its returned styles.",
          });
        }
      },
    };
  },
};
