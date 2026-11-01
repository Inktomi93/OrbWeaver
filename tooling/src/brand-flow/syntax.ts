// The syntax half of the brand-flow scan: which nodes might carry a brand into or out of a slot, found without asking the
// checker anything. The checker half (`collect.ts`) judges only these.
import type { Node, SourceFile } from "@typescript/native/ast";
import {
  isArrayBindingPattern,
  isArrayLiteralExpression,
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isBlock,
  isCallExpression,
  isConditionalExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isJsxAttribute,
  isJsxExpression,
  isMethodDeclaration,
  isNewExpression,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isReturnStatement,
  isShorthandPropertyAssignment,
  isSourceFile,
  isSpreadElement,
  isStringLiteral,
  isTypeAssertion,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";

/** Where a value is handed to a typed slot. */
const HANDED_KINDS = ["argument", "return", "property", "variable", "assign", "jsx-prop", "element"] as const;
type HandedKind = (typeof HANDED_KINDS)[number];

export interface Handed {
  readonly value: Node;
  readonly kind: HandedKind;
  /** The call, return, property, declaration, attribute or assignment the value sits in. */
  readonly container: Node;
  readonly index: number;
}

export const COMPARISONS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.EqualsEqualsEqualsToken,
  SyntaxKind.ExclamationEqualsEqualsToken,
  SyntaxKind.EqualsEqualsToken,
  SyntaxKind.ExclamationEqualsToken,
]);

// A string method returns its receiver's text, so the receiver is where the value came from.
const TEXT_PRESERVING = new Set(["trim", "toLowerCase", "toUpperCase", "normalize"]);

const CAST_ID = "castId";
const REACT_KEY = "key";
// The calls that mint a brand from the ids module: a parse schema, or an id source.
export const PARSE_MINTS: ReadonlySet<string> = new Set(["typeIdSchema", "brandedId"]);
const SOURCE_MINTS: ReadonlySet<string> = new Set(["mintTypeId", "mintUserId", "mintRpgQuestId", "mintSocketId", "typeId", "userId", "rpgQuestId"]);

const ID_NAME = /^(?:[a-z][A-Za-z0-9]*Ids?|ids?)$/u;

export interface StateDeclaration {
  readonly call: Node;
  readonly state: Node;
  readonly setter: Node | undefined;
}

export interface Gathered {
  readonly casts: Node[];
  readonly mintCalls: Node[];
  readonly asExpressions: Node[];
  readonly handed: Handed[];
  readonly comparisons: Node[];
  readonly declarations: Node[];
  readonly states: StateDeclaration[];
}

/** The name a call goes by: `f` for `f()` and `o.f()`. */
export function calleeName(call: Node): string | undefined {
  if (!(isCallExpression(call) || isNewExpression(call))) {
    return undefined;
  }
  const callee = call.expression;
  if (isIdentifier(callee)) {
    return callee.text;
  }
  return isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

// The values a call or an array literal hands to its slots, one slot each; a spread has no slot of its own.
function listed(node: Node): readonly Handed[] {
  const array = isArrayLiteralExpression(node);
  const calls = isCallExpression(node) || isNewExpression(node);
  const values: readonly Node[] = [...(array ? node.elements : []), ...(calls ? (node.arguments ?? []) : [])];
  const kind: HandedKind = array ? "element" : "argument";
  return values.flatMap((value, index) => (isSpreadElement(value) ? [] : [{ value, kind, container: node, index }]));
}

// A JSX attribute's value. React's `key` identifies a sibling for reconciliation: a cache key, not an id slot.
function jsxHanded(expression: Node & { readonly expression?: Node }, attribute: Node & { readonly name: Node }): readonly Handed[] {
  if (attribute.name.getText() === REACT_KEY || expression.expression === undefined) {
    return [];
  }
  return [{ value: expression.expression, kind: "jsx-prop", container: attribute, index: 0 }];
}

function handedAt(node: Node): readonly Handed[] {
  const one = (value: Node | undefined, kind: HandedKind, container: Node): readonly Handed[] =>
    value === undefined ? [] : [{ value, kind, container, index: 0 }];
  if (isCallExpression(node) || isNewExpression(node) || isArrayLiteralExpression(node)) {
    return listed(node);
  }
  if (isReturnStatement(node)) {
    return one(node.expression, "return", node);
  }
  if (isArrowFunction(node)) {
    return isBlock(node.body) ? [] : one(node.body, "return", node);
  }
  if (isVariableDeclaration(node)) {
    return node.type === undefined ? [] : one(node.initializer, "variable", node);
  }
  if (isPropertyAssignment(node)) {
    return one(node.initializer, "property", node);
  }
  if (isShorthandPropertyAssignment(node)) {
    return one(node.name, "property", node);
  }
  if (isJsxExpression(node) && isJsxAttribute(node.parent)) {
    return jsxHanded(node, node.parent);
  }
  return isBinaryExpression(node) && node.operatorToken.kind === SyntaxKind.EqualsToken ? one(node.right, "assign", node) : [];
}

const isLiteralValue = (node: Node): boolean =>
  isObjectLiteralExpression(node) || isStringLiteral(node) || isNoSubstitutionTemplateLiteral(node) || isNumericLiteral(node);

function stateOf(node: Node): StateDeclaration | undefined {
  if (!(isVariableDeclaration(node) && isArrayBindingPattern(node.name) && node.initializer !== undefined && calleeName(node.initializer) === "useState")) {
    return undefined;
  }
  const [state, setter] = node.name.elements.map((element) => (isBindingElement(element) ? element.name : undefined));
  return state === undefined ? undefined : { call: node.initializer, state, setter };
}

function isIdDeclaration(node: Node): boolean {
  const declared =
    isParameterDeclaration(node) ||
    isPropertySignatureDeclaration(node) ||
    isPropertyDeclaration(node) ||
    isVariableDeclaration(node) ||
    isBindingElement(node);
  return declared && node.name !== undefined && isIdentifier(node.name) && ID_NAME.test(node.name.text);
}

// A call into the ids module: a cast, or a mint.
function noteCall(found: Gathered, call: Node): void {
  const name = calleeName(call) ?? "";
  if (name === CAST_ID) {
    found.casts.push(call);
  } else if (PARSE_MINTS.has(name) || SOURCE_MINTS.has(name)) {
    found.mintCalls.push(call);
  }
}

function noteUses(found: Gathered, node: Node): void {
  if (isCallExpression(node)) {
    noteCall(found, node);
  }
  if (isAsExpression(node) || isTypeAssertion(node)) {
    found.asExpressions.push(node);
  }
  found.handed.push(...handedAt(node).filter(({ value }) => !isLiteralValue(value)));
  if (isBinaryExpression(node) && COMPARISONS.has(node.operatorToken.kind)) {
    found.comparisons.push(node);
  }
}

function noteDeclarations(found: Gathered, node: Node): void {
  if (isIdDeclaration(node)) {
    found.declarations.push(node);
  }
  const state = stateOf(node);
  if (state !== undefined) {
    found.states.push(state);
  }
}

/** Everything in a file that might mint a brand, widen one or re-narrow one. */
export function gather(files: readonly SourceFile[]): Gathered {
  const found: Gathered = { casts: [], mintCalls: [], asExpressions: [], handed: [], comparisons: [], declarations: [], states: [] };
  const visit = (node: Node): void => {
    noteUses(found, node);
    noteDeclarations(found, node);
    node.forEachChild(visit);
  };
  for (const file of files) {
    file.forEachChild(visit);
  }
  return found;
}

/** The expression a value was read from, past parentheses, `!`, `as` and a text-preserving string method. */
export function peel(node: Node): Node {
  if (isParenthesizedExpression(node) || isNonNullExpression(node) || isAsExpression(node)) {
    return peel(node.expression);
  }
  if (isCallExpression(node) && isPropertyAccessExpression(node.expression) && TEXT_PRESERVING.has(node.expression.name.text)) {
    return peel(node.expression.expression);
  }
  if (isBinaryExpression(node) && (node.operatorToken.kind === SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === SyntaxKind.BarBarToken)) {
    return peel(node.left);
  }
  return node;
}

/** The name nodes whose declarations a value was read from: the identifier, the property name, the callee's name. */
export function rootNames(node: Node): readonly Node[] {
  const read = peel(node);
  if (isConditionalExpression(read)) {
    return [...rootNames(read.whenTrue), ...rootNames(read.whenFalse)];
  }
  const target = isCallExpression(read) ? read.expression : read;
  if (isIdentifier(target)) {
    return [target];
  }
  return isPropertyAccessExpression(target) ? [target.name] : [];
}

/** The function-like node a return or a name sits in, with the node that names it. */
export function enclosingFunction(node: Node): { readonly fn: Node; readonly name: Node | undefined } | undefined {
  for (let up: Node = node; !isSourceFile(up); up = up.parent) {
    if (isFunctionDeclaration(up) || isMethodDeclaration(up)) {
      return { fn: up, name: up.name };
    }
    if (isArrowFunction(up) || isFunctionExpression(up)) {
      const holder = up.parent;
      const named = isVariableDeclaration(holder) || isPropertyAssignment(holder) || isPropertyDeclaration(holder) ? holder.name : undefined;
      return { fn: up, name: named };
    }
  }
  return undefined;
}

const OWNERS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.EnumDeclaration,
]);

/** The interface, class or alias a member is declared in. */
export function ownerOf(node: Node): string | null {
  for (let up: Node = node.parent; !isSourceFile(up); up = up.parent) {
    const { name } = up as Node & { readonly name?: Node };
    if (OWNERS.has(up.kind) && name !== undefined && isIdentifier(name)) {
      return name.text;
    }
  }
  return null;
}

/** The node that carries a declaration's name. */
export const nameOf = (node: Node): Node => (node as Node & { readonly name?: Node }).name ?? node;

/** Whether a node sits inside a call to one of `callees` through a callback: a zod hook that parses its value. */
export function insideCallTo(node: Node, callees: ReadonlySet<string>): boolean {
  for (let up: Node = node.parent; !isSourceFile(up); up = up.parent) {
    if (isCallExpression(up) && callees.has(calleeName(up) ?? "")) {
      return true;
    }
  }
  return false;
}
