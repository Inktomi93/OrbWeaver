// The structure of a function body with its own names erased: syntax kinds in pre-order, each name the function
// binds itself (parameters, locals, nested declarations, catch bindings, its own name) replaced by a slot, free names,
// property keys and literals kept. Type-level syntax is dropped whole: annotations, `as`, `satisfies`, `!`, optional
// markers and parentheses, and a body that is one `return` reads as its expression. Two functions with one shape
// compute the same thing however their authors named or typed it; a free name differs when they call different code.
import { createHash } from "node:crypto";
import type { Node, SourceFile } from "ts-morph";
import { Node as N, ts } from "ts-morph";

/** Below this many shape tokens a body is one call or one property read, which names its callee instead of copying a rule. */
const FUNCTION_SHAPE_TOKEN_FLOOR = 12;
/** A copied rule does at least this much: calls, branches, short-circuits, throws or extra statements. One template
 *  or one projection (`rows.map((r) => r.id)`) is an idiom two authors write alike without copying anything. */
const FUNCTION_SHAPE_SUBSTANCE_FLOOR = 2;
const SELF = "$self";

export interface FunctionShape {
  readonly key: string;
  readonly tokens: number;
}

/** A function a module exports as its own declaration, under its exported name. */
interface ExportedFunction {
  readonly name: string;
  readonly node: Node;
}

function bindingNames(name: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(name)) {
    into.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      bindingNames(element.name, into);
    }
  }
}

function boundNames(root: ts.Node): ReadonlySet<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isBindingElement(node)) {
      bindingNames(node.name, names);
    } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isFunctionExpression(node)) && node.name !== undefined) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return names;
}

/** The name a function calls itself by: its own declared name, or the binding an arrow is assigned to. */
function selfName(fn: ts.Node): string | undefined {
  if ((ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name !== undefined) {
    return fn.name.text;
  }
  return ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name) ? fn.parent.name.text : undefined;
}

// A property name is a member of some other value, never one of this function's bindings.
function isMemberName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node)
  );
}

function isTypeOnly(node: ts.Node): boolean {
  return (
    ts.isTypeNode(node) ||
    ts.isTypeParameterDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    // `x?: T` and `let x!: T` differ from their copies only in what the checker is told.
    node.kind === ts.SyntaxKind.QuestionToken ||
    node.kind === ts.SyntaxKind.ExclamationToken
  );
}

/** A wrapper that changes what the checker believes, never what runs. */
function transparentOperand(node: ts.Node): ts.Expression | undefined {
  const wraps =
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isParenthesizedExpression(node);
  return wraps ? node.expression : undefined;
}

/** A function body that is one `return <expression>` reads as that expression, as an arrow's expression body does. */
function singleReturn(node: ts.Node): ts.Expression | undefined {
  if (!(ts.isBlock(node) && ts.isFunctionLike(node.parent)) || node.statements.length !== 1) {
    return;
  }
  const [only] = node.statements;
  return only !== undefined && ts.isReturnStatement(only) ? only.expression : undefined;
}

const SHORT_CIRCUITS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

/** What a node adds to a body's substance: a call, a branch, a loop, a short-circuit, a throw, or each statement of the
 *  function's own block past the first. */
function substanceOf(node: ts.Node, root: ts.Node): number {
  if (ts.isBlock(node) && node.parent === root) {
    return Math.max(0, node.statements.length - 1);
  }
  const acts =
    ts.isCallExpression(node) ||
    ts.isNewExpression(node) ||
    ts.isTaggedTemplateExpression(node) ||
    ts.isIfStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isIterationStatement(node, false) ||
    ts.isSwitchStatement(node) ||
    ts.isTryStatement(node) ||
    ts.isThrowStatement(node) ||
    (ts.isBinaryExpression(node) && SHORT_CIRCUITS.has(node.operatorToken.kind));
  return acts ? 1 : 0;
}

/** The tokens of a name: a binding through `nameOf`, a member name kept free. `{ id }` is the key `id` holding the
 *  value `id`, so the key stays a free name and the value goes through `nameOf`. */
function leafTokens(node: ts.Node, nameOf: (name: string) => string): readonly string[] | undefined {
  if (ts.isIdentifier(node)) {
    return [isMemberName(node) ? `#${node.text}` : nameOf(node.text)];
  }
  return ts.isShorthandPropertyAssignment(node) ? [String(node.kind), `#${node.name.text}`, nameOf(node.name.text)] : undefined;
}

/** The shape of one function-like node (declaration, arrow, expression, method), or undefined below either floor. */
export function functionShape(fn: Node): FunctionShape | undefined {
  const root = fn.compilerNode;
  if (!(ts.isFunctionLike(root) && "body" in root) || root.body === undefined) {
    return;
  }
  const self = selfName(root);
  const bound = boundNames(root);
  const slots = new Map<string, number>();
  const tokens: string[] = [];
  let substance = 0;
  const bind = (name: string): string => {
    if (name === self) {
      return SELF;
    }
    const slot = slots.get(name) ?? slots.size;
    slots.set(name, slot);
    return `$${String(slot)}`;
  };
  const isBound = (name: string): boolean => bound.has(name) || name === self;
  const emit = (node: ts.Node): void => {
    const unwrapped = transparentOperand(node) ?? singleReturn(node);
    if (unwrapped !== undefined) {
      emit(unwrapped);
      return;
    }
    if (isTypeOnly(node)) {
      return;
    }
    const leaf = leafTokens(node, (name) => (isBound(name) ? bind(name) : `#${name}`));
    if (leaf !== undefined) {
      tokens.push(...leaf);
      return;
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
      // `x["name"]` is `x.name` spelled with brackets.
      tokens.push(String(ts.SyntaxKind.PropertyAccessExpression));
      emit(node.expression);
      tokens.push(`#${node.argumentExpression.text}`);
      return;
    }
    substance += substanceOf(node, root);
    tokens.push(ts.isLiteralExpression(node) || ts.isTemplateLiteralToken(node) ? `${String(node.kind)}:${node.text}` : String(node.kind));
    ts.forEachChild(node, emit);
  };
  for (const parameter of root.parameters) {
    emit(parameter);
  }
  emit(root.body);
  if (tokens.length < FUNCTION_SHAPE_TOKEN_FLOOR || substance < FUNCTION_SHAPE_SUBSTANCE_FLOOR) {
    return;
  }
  return { key: createHash("sha256").update(tokens.join(" ")).digest("hex"), tokens: tokens.length };
}

/** Every function this file exports as its own declaration: function declarations and function-valued consts,
 *  under each exported name, read from the module's export table so `export { f }` lists count too. */
export function ownExportedFunctions(sourceFile: SourceFile): readonly ExportedFunction[] {
  return [...sourceFile.getExportedDeclarations()].flatMap(([name, declarations]) =>
    declarations.flatMap((declaration) => {
      const node = declaration.getSourceFile() === sourceFile ? functionOf(declaration) : undefined;
      return node === undefined ? [] : [{ name, node }];
    }),
  );
}

function functionOf(declaration: Node): Node | undefined {
  if (N.isFunctionDeclaration(declaration)) {
    return declaration;
  }
  const initializer = N.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
  return initializer !== undefined && (N.isArrowFunction(initializer) || N.isFunctionExpression(initializer)) ? initializer : undefined;
}
