// The DOM class-name terminals the hook census records: a `DOMTokenList` mutator call and a `className`
// assignment, each proven against TypeScript's own DOM declarations rather than a member spelling.
import { readStaticString, staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Type } from "ts-morph";
import { Node } from "ts-morph";
import type { StaticClassNativeContext } from "../contract/static-class-expression.ts";
import { requiredInvocationFact } from "./native-invocation.ts";
import { classDomProperty, classDomTokenList } from "./static-class-semantic.ts";

const TYPESCRIPT_DOM_LIB = "/typescript/lib/lib.dom.d.ts";

/** The accessed member name in either spelling; the computed arm resolves through the shared reader. */
export function accessedPropertyName(node: Node, native?: StaticClassNativeContext): string | undefined {
  return staticMemberAccess(node, (key) => (native === undefined ? readStaticString(key) : requiredInvocationFact(native.evidence.strings, key)))?.name;
}

export function accessReceiver(node: Node): Node | undefined {
  return Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node) ? node.getExpression() : undefined;
}

function meaningfulTypes(type: Type): readonly Type[] {
  const candidates = type.isUnion() ? type.getUnionTypes() : [type];
  return candidates.filter((candidate) => !(candidate.isNull() || candidate.isUndefined()));
}

function isDomDeclaration(node: Node): boolean {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/").endsWith(TYPESCRIPT_DOM_LIB);
}

export function isDomTokenListExpression(node: Node, native?: StaticClassNativeContext): boolean {
  if (native !== undefined) {
    return classDomTokenList(node, native);
  }
  const types = meaningfulTypes(node.getType());
  return (
    types.length > 0 &&
    types.every((type) => {
      const symbol = type.getAliasSymbol() ?? type.getSymbol();
      return symbol?.getName() === "DOMTokenList" && symbol.getDeclarations().some(isDomDeclaration);
    })
  );
}

export function isDomClassNameReceiver(node: Node, native?: StaticClassNativeContext): boolean {
  if (native !== undefined) {
    return classDomProperty(node, "className", native);
  }
  const types = meaningfulTypes(node.getType());
  return types.length > 0 && types.every((type) => type.getProperty("className")?.getDeclarations().some(isDomDeclaration) === true);
}
