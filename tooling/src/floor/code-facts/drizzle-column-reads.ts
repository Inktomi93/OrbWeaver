// Canonical native property-reference and row-member extraction; consumers judge table attribution.
import type { Node, SourceFile } from "ts-morph";
import { Node as N, SyntaxKind, ts } from "ts-morph";
import { readCallTarget } from "./call-returns.ts";
import type { IndexedCallParameters, NativeColumnReference, RowShapeRead } from "./drizzle-column-read-contract.ts";
import { readFunctionBodyNodes } from "./function-context.ts";
import { readMemberReference, staticMemberAccess } from "./reference-fact.ts";
import { unwrapTarget } from "./reference-fact-alias.ts";
import type { MemberReference, ReferenceFact } from "./reference-fact-contract.ts";
import { MEMBER_ACCESS_KINDS } from "./reference-fact-contract.ts";

/** Member observations of one supplied source expression, including unreadable computed members. */
export function readMemberUses(node: Node): readonly ReferenceFact<MemberReference>[] {
  const children = MEMBER_ACCESS_KINDS.flatMap((kind) => node.getDescendantsOfKind(kind));
  return [node, ...children].filter((candidate) => MEMBER_ACCESS_KINDS.some((kind) => candidate.isKind(kind))).map(readMemberReference);
}

/** Indexing relationships of actual helper parameters, never coincident names from a nested scope. */
export function readIndexedCallParameters(call: import("ts-morph").CallExpression): readonly IndexedCallParameters[] {
  const target = readCallTarget(call);
  const fn = target.kind === "resolved" ? target.value : undefined;
  if (!(N.isFunctionDeclaration(fn) || N.isArrowFunction(fn) || N.isFunctionExpression(fn) || N.isMethodDeclaration(fn))) {
    return [];
  }
  const parameters = fn.getParameters();
  return readFunctionBodyNodes(fn)
    .filter(N.isElementAccessExpression)
    .flatMap((node) => {
      const argument = node.getArgumentExpression();
      const receiver = unwrapTarget(node.getExpression()).getSymbol()?.getValueDeclaration();
      const key = argument === undefined ? undefined : unwrapTarget(argument).getSymbol()?.getValueDeclaration();
      const receiverIndex = N.isParameterDeclaration(receiver) ? parameters.indexOf(receiver) : -1;
      const keyIndex = N.isParameterDeclaration(key) ? parameters.indexOf(key) : -1;
      return receiverIndex < 0 || keyIndex < 0 ? [] : [{ receiverIndex, keyIndex, node }];
    });
}

/** A name that could reference a column: an identifier, or the string key of `x["col"]`. */
function isColumnNameCandidate(node: ts.Node, columnNames: ReadonlySet<string>): node is ts.Identifier | ts.StringLiteral {
  if (ts.isIdentifier(node)) {
    return columnNames.has(node.text);
  }
  return ts.isStringLiteral(node) && ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node && columnNames.has(node.text);
}

/** The symbols a name refers to, plus the property symbols `findReferences` relates it to: the contextual
 *  type's member for an object-literal or JSX key, and the source type's member for a `{ col }` destructure. */
function referenceSymbols(name: ts.Identifier | ts.StringLiteral, checker: ts.TypeChecker): readonly ts.Symbol[] {
  const own = checker.getSymbolAtLocation(name);
  const parent = name.parent;
  let carrier: ts.Type | undefined;
  if ((ts.isPropertyAssignment(parent) || ts.isShorthandPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) && parent.name === name) {
    carrier = ts.isObjectLiteralExpression(parent.parent) ? checker.getContextualType(parent.parent) : undefined;
  } else if (ts.isJsxAttribute(parent) && parent.name === name) {
    carrier = checker.getContextualType(parent.parent);
  } else if (ts.isBindingElement(parent) && parent.name === name && parent.propertyName === undefined && ts.isObjectBindingPattern(parent.parent)) {
    carrier = checker.getTypeAtLocation(parent.parent);
  }
  const members = carrier === undefined ? [] : (carrier.isUnion() ? carrier.types : [carrier]).map((type) => type.getProperty(name.text));
  return [own, ...members].filter((symbol): symbol is ts.Symbol => symbol !== undefined);
}

/** The property declarations actually related to each column-name occurrence by this native checker. */
export function readColumnReferences(source: SourceFile, names: ReadonlySet<string>): readonly NativeColumnReference[] {
  const out: NativeColumnReference[] = [];
  const checker = source.getProject().getTypeChecker().compilerObject;
  const visit = (node: ts.Node): void => {
    if (isColumnNameCandidate(node, names)) {
      const declarations = referenceSymbols(node, checker).flatMap((symbol) =>
        [symbol, ...checker.getRootSymbols(symbol)].flatMap((root) => root.declarations ?? []),
      );
      out.push({ node, declarations });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source.compilerNode, visit);
  return out;
}

/** Native receiver occurrences for the AST lens's deliberately over-inclusive row-shape attribution. */
export function readRowShapeMembers(source: SourceFile, names: ReadonlySet<string>): readonly RowShapeRead[] {
  const out: RowShapeRead[] = [];
  for (const kind of [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression] as const) {
    for (const node of source.getDescendantsOfKind(kind)) {
      const member = staticMemberAccess(node);
      if (member !== undefined && names.has(member.name)) {
        out.push({ name: member.name, node, receiver: member.receiver });
      }
    }
  }
  for (const pattern of source.getDescendantsOfKind(SyntaxKind.ObjectBindingPattern)) {
    for (const binding of pattern.getElements()) {
      const name = (binding.getPropertyNameNode() ?? binding.getNameNode()).getText();
      if (names.has(name)) {
        out.push({ name, node: pattern, receiver: pattern });
      }
    }
  }
  return out;
}
