import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import ts from "typescript";
import type { TypeServices as Native } from "./checker.ts";
import { requireTypeServices } from "./checker.ts";
import type { OrbRule, OrbRuleContext } from "./syntax.ts";
import { isElementFactoryCall } from "./syntax.ts";
import { isClassProperty, isComponentElement } from "./ui-feature-classname.ts";

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
    const native = requireTypeServices(context);
    const judge = (node: TSESTree.Node): void => {
      const shape = wrapperShape(native.esTreeNodeToTSNodeMap.get(node));
      if (shape === undefined) {
        return;
      }
      for (const member of shape.members) {
        const name = callbackName(member);
        if (name !== undefined && narrowsCallback(native, member, name, shape.bases)) {
          context.report({
            node: native.tsNodeToESTreeNodeMap.get(member),
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
    const native = requireTypeServices(context);
    return {
      JSXOpeningElement: (node: TSESTree.JSXOpeningElement): void => {
        const element = native.esTreeNodeToTSNodeMap.get(node);
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
    const native = requireTypeServices(context);
    return {
      SpreadElement: (node: TSESTree.SpreadElement): void => {
        const spread = native.esTreeNodeToTSNodeMap.get(node);
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

const UI_SOURCE = /\/packages\/ui\/src\//u;
const LITERAL_NAMES = new Set(["true", "false", "undefined", "null"]);
const MAX_SPREAD_HOPS = 3;
const ANY_CLASS_KEY = "any class key";
const ELEMENT_PROPS_ARGUMENT = 1;

function members(type: ts.Type): readonly ts.Type[] {
  return type.isUnion() ? type.types : [type];
}

// A tv config types its axes as literal unions through a mapped type, so an axis has no declaration or one inside @orb/ui;
// a prop from React or Base UI declares itself in node_modules and is not an axis.
function authoredHere(property: ts.Symbol): boolean {
  const declarations = property.declarations ?? [];
  return declarations.length === 0 || declarations.some((declaration) => UI_SOURCE.test(declaration.getSourceFile().fileName.replaceAll("\\", "/")));
}

function literalUnion(native: Native, type: ts.Type): boolean {
  return members(type).every((member) => member.isLiteral() || LITERAL_NAMES.has(native.checker.typeToString(member)));
}

/** The variant axes of an element's props: the literal-union props the ui package authors, which its `tv` configs derive. */
function variantAxes(native: Native, props: ts.Type, at: ts.Node): ReadonlySet<string> {
  const names = members(props).flatMap((member) =>
    member
      .getProperties()
      .filter((property) => authoredHere(property) && literalUnion(native, native.checker.getTypeOfSymbolAtLocation(property, at)))
      .map((property) => property.name),
  );
  return new Set(names);
}

function outerExpression(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)
    ? outerExpression(node.expression)
    : node;
}

function constOfObject(native: Native, identifier: ts.Identifier, hops: number): boolean {
  const declaration = native.checker.getSymbolAtLocation(identifier)?.valueDeclaration;
  return (
    declaration !== undefined &&
    ts.isVariableDeclaration(declaration) &&
    declaration.getSourceFile() === identifier.getSourceFile() &&
    declaration.parent.getFirstToken()?.kind === ts.SyntaxKind.ConstKeyword &&
    declaration.initializer !== undefined &&
    readableSpread(native, declaration.initializer, hops + 1)
  );
}

function literalEntries(native: Native, object: ts.ObjectLiteralExpression, hops: number): boolean {
  return object.properties.every((property) => {
    if (ts.isSpreadAssignment(property)) {
      return readableSpread(native, property.expression, hops + 1);
    }
    return (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && !ts.isComputedPropertyName(property.name);
  });
}

// What `pnpm ui-facts` reads as a write: an object literal with known keys, a conditional or logical of those, or a
// same-file const of one. The variant census (tooling/src/eslint/ui-classes/variants.ts) reads exactly these spreads.
function readableSpread(native: Native, expression: ts.Expression, hops: number): boolean {
  const node = outerExpression(expression);
  if (hops > MAX_SPREAD_HOPS) {
    return false;
  }
  if (ts.isObjectLiteralExpression(node)) {
    return literalEntries(native, node, hops);
  }
  if (ts.isConditionalExpression(node)) {
    return readableSpread(native, node.whenTrue, hops) && readableSpread(native, node.whenFalse, hops);
  }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      return readableSpread(native, node.right, hops);
    }
    return (
      (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) &&
      readableSpread(native, node.left, hops) &&
      readableSpread(native, node.right, hops)
    );
  }
  return ts.isIdentifier(node) && constOfObject(native, node, hops);
}

// A type with a string index signature, or `any`, can carry every key, so it can write any axis the element has.
function carriesAnyKey(native: Native, type: ts.Type): boolean {
  return type.flags === ts.TypeFlags.Any || native.checker.getIndexInfosOfType(type).some((info) => info.keyType.flags === ts.TypeFlags.String);
}

const writesNothing = (type: ts.Type): boolean => type.flags === ts.TypeFlags.Never || type.flags === ts.TypeFlags.Undefined;

function carriedAxes(native: Native, spread: ts.Type, axes: ReadonlySet<string>): readonly string[] {
  const parts = members(spread);
  if (parts.some((part) => carriesAnyKey(native, part))) {
    return [...axes];
  }
  return [...new Set(parts.flatMap((part) => part.getProperties().map((property) => property.name)))].filter((name) => axes.has(name));
}

/**
 * A spread on an element whose props have variant axes either is a literal the census reads or carries no axis. The
 * census counts what an unreadable spread writes as nothing, so this rule is what makes its zero-use verdicts exact.
 */
export const opaqueVariantSpreadRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const native = requireTypeServices(context);
    return {
      JSXSpreadAttribute: (node: TSESTree.JSXSpreadAttribute): void => {
        const spread = native.esTreeNodeToTSNodeMap.get(node);
        const props = native.checker.getContextualType(spread.parent);
        if (props === undefined || readableSpread(native, spread.expression, 0)) {
          return;
        }
        const axes = variantAxes(native, props, spread);
        if (axes.size === 0) {
          return;
        }
        const carried = carriedAxes(native, native.checker.getTypeAtLocation(spread.expression), axes);
        if (carried.length > 0) {
          context.report({
            node,
            message: `This spread can write the variant ${carried.length === 1 ? "axis" : "axes"} ${carried.join(", ")}, which the variant census cannot read. Spell the axis as an attribute, spread an object literal, or Omit the axis from the spread's type.`,
          });
        }
      },
    };
  },
};

// A key a type declares `never` or `undefined` names a class that cannot be written, which is how a body says its rest holds none.
function classKeys(native: Native, spread: ts.Type, at: ts.Node): readonly string[] {
  const parts = members(spread);
  if (parts.some((part) => carriesAnyKey(native, part))) {
    return [ANY_CLASS_KEY];
  }
  const keys = parts.flatMap((part) => part.getProperties()).filter(({ name }) => isClassProperty(name));
  return keys.filter((key) => !members(native.checker.getTypeOfSymbolAtLocation(key, at)).every(writesNothing)).map(({ name }) => name);
}

/**
 * A spread or an element factory's props on a component cannot carry a class the static rules did not read. The value may have travelled through a
 * nested object, an alias, a call or another file; its type still names the key. Omit the key from the type, or spread what the static rules read.
 *
 * @remarks
 * A type is the limit: a value that holds a class under a type that omits the key passes. `orb/no-built-class-string` refuses that value where it leaves
 * its declaration, and its comment names the one shape left.
 */
export const opaqueClassSpreadRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const native = requireTypeServices(context);
    const judge = (node: TSESTree.Node, expression: ts.Expression): void => {
      if (readableSpread(native, expression, 0)) {
        return;
      }
      const keys = classKeys(native, native.checker.getTypeAtLocation(expression), expression);
      if (keys.length > 0) {
        context.report({
          node,
          message: `This value can carry ${keys.join(", ")} onto a component, where lint cannot read the tokens. Omit the key from its type, or pass a prop.`,
        });
      }
    };
    return {
      JSXSpreadAttribute: (node: TSESTree.JSXSpreadAttribute): void => {
        if (isComponentElement(node.parent)) {
          judge(node, native.esTreeNodeToTSNodeMap.get(node).expression);
        }
      },
      CallExpression: (node: TSESTree.CallExpression): void => {
        const props = isElementFactoryCall(context, node) ? native.esTreeNodeToTSNodeMap.get(node).arguments[ELEMENT_PROPS_ARGUMENT] : undefined;
        if (props !== undefined && !ts.isSpreadElement(props)) {
          judge(node, props);
        }
      },
    };
  },
};
