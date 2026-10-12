// The structure of a function body with its own names erased: syntax kinds in pre-order, each name the function
// binds itself (parameters, locals, nested declarations, catch bindings) replaced by its first-use slot, free names
// and literals kept, type annotations dropped. Two functions with one shape compute the same thing whatever their
// authors named the locals or typed the parameters; a free name differs when the copies call different code.
import { createHash } from "node:crypto";
import type { Node, SourceFile } from "ts-morph";
import { Node as N, ts } from "ts-morph";

/** Below this many shape tokens a body is one call or one property read, which names its callee instead of
 *  copying a rule. Measured over the tree: every copy at or above it is an exact twin of an exported body. */
const FUNCTION_SHAPE_TOKEN_FLOOR = 12;

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
  return ts.isTypeNode(node) || ts.isTypeParameterDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node);
}

/** The shape of one function-like node (declaration, arrow, expression, method), or undefined below the floor. */
export function functionShape(fn: Node): FunctionShape | undefined {
  const root = fn.compilerNode;
  if (!(ts.isFunctionLike(root) && "body" in root) || root.body === undefined) {
    return;
  }
  const bound = boundNames(root);
  const slots = new Map<string, number>();
  const tokens: string[] = [];
  const emit = (node: ts.Node): void => {
    if (isTypeOnly(node)) {
      return;
    }
    if (ts.isIdentifier(node)) {
      if (bound.has(node.text) && !isMemberName(node)) {
        const slot = slots.get(node.text) ?? slots.size;
        slots.set(node.text, slot);
        tokens.push(`$${String(slot)}`);
      } else {
        tokens.push(`#${node.text}`);
      }
      return;
    }
    tokens.push(ts.isLiteralExpression(node) || ts.isTemplateLiteralToken(node) ? `${String(node.kind)}:${node.text}` : String(node.kind));
    ts.forEachChild(node, emit);
  };
  for (const parameter of root.parameters) {
    emit(parameter);
  }
  emit(root.body);
  if (tokens.length < FUNCTION_SHAPE_TOKEN_FLOOR) {
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
