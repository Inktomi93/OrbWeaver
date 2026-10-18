// The evaluator keeps its judgments; native delivery supplies only the existing raw questions.
import type { Identifier, Node, SourceFile } from "ts-morph";
import { nodeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import type { StaticClassNativeContext } from "../contract/static-class-expression.ts";
import { requiredInvocationFact } from "./native-invocation.ts";

export function assertClassNode(node: Node, read: StaticClassNativeContext | undefined): void {
  if (read === undefined) {
    return;
  }
  const facts = read.evidence.typeObservations;
  if (facts === undefined) {
    throw new Error("native static-class evidence is unavailable");
  }
  facts.assertNode(node);
}
export function classDeclarations(node: Identifier, read: StaticClassNativeContext | undefined): readonly Node[] {
  if (read === undefined) {
    return node.getSymbol()?.getDeclarations() ?? [];
  }
  const symbol = read.types.symbol(node);
  return symbol === null ? [] : read.types.symbolData(symbol).declarations;
}
export function classAliasDeclarations(node: Identifier, read: StaticClassNativeContext | undefined): readonly Node[] {
  if (read === undefined) {
    return node.getSymbol()?.getAliasedSymbol()?.getDeclarations() ?? [];
  }
  const symbol = read.types.symbol(node);
  if (symbol === null) {
    return [];
  }
  const own = read.types.symbolData(symbol);
  const target = read.types.symbolData(own.canonical);
  return own.key === target.key ? [] : target.declarations;
}
export function classStringReceiver(node: Node, read: StaticClassNativeContext | undefined): boolean {
  if (read === undefined) {
    const type = node.getType();
    return type.isString() || type.isStringLiteral() || (type.isUnion() && type.getUnionTypes().every((part) => part.isString() || part.isStringLiteral()));
  }
  const selector = nodeTypeSelector(node);
  const flags = read.types.primitiveFlags(selector);
  if (flags.string || flags.stringLiteral) {
    return true;
  }
  const parts = read.types.unions(selector);
  return (
    parts.length > 0 &&
    parts.every((part) => {
      const childFlags = read.types.primitiveFlags(part);
      return childFlags.string || childFlags.stringLiteral;
    })
  );
}
export function classExported(node: Node, source: SourceFile, read: StaticClassNativeContext, isDefault = false): boolean {
  const symbol = read.types.symbol(node);
  if (symbol === null) {
    return false;
  }
  const own = read.types.symbolData(symbol).key;
  const exported = isDefault ? [read.types.defaultExport(source)].filter((value) => value !== null) : read.types.exports(source);
  return exported.some((value) => read.types.symbolData(value).key === own || read.types.symbolData(read.types.symbolData(value).canonical).key === own);
}
export function classAuthored(
  node: Node,
  read: StaticClassNativeContext,
): import("../../floor/code-facts/authored-value-projection.ts").NativeAuthoredValueProjection["value"] {
  assertClassNode(node, read);
  return requiredInvocationFact(read.evidence.authoredValues, node).value;
}

function classMeaningfulTypes(
  node: Node,
  read: StaticClassNativeContext,
): readonly import("../../floor/code-facts/type-projection-contract.ts").NativeTypeSelector[] {
  const selector = nodeTypeSelector(node);
  const parts = read.types.unions(selector);
  return (parts.length > 0 ? parts : [selector]).filter((part) => {
    const flags = read.types.primitiveFlags(part);
    return !(flags.null || flags.undefined);
  });
}
export function classDomProperty(node: Node, property: string, read: StaticClassNativeContext): boolean {
  const parts = classMeaningfulTypes(node, read);
  return (
    parts.length > 0 &&
    parts.every((part) => {
      const symbol = read.types.propertySymbol(part, property);
      return (
        symbol !== null &&
        read.types.symbolData(symbol).declarations.some((declaration) => {
          assertClassNode(declaration, read);
          return declaration.getSourceFile().getFilePath().replaceAll("\\", "/").endsWith("/typescript/lib/lib.dom.d.ts");
        })
      );
    })
  );
}
export function classDomTokenList(node: Node, read: StaticClassNativeContext): boolean {
  const parts = classMeaningfulTypes(node, read);
  return (
    parts.length > 0 &&
    parts.every((part) => {
      const selected = read.types.select(part);
      if (selected === null) {
        return false;
      }
      const type = read.types.type(selected);
      const symbol = type.aliasSymbol ?? type.symbol;
      if (symbol === null) {
        return false;
      }
      const data = read.types.symbolData(symbol);
      return (
        data.name === "DOMTokenList" &&
        data.declarations.some((declaration) => {
          assertClassNode(declaration, read);
          return declaration.getSourceFile().getFilePath().replaceAll("\\", "/").endsWith("/typescript/lib/lib.dom.d.ts");
        })
      );
    })
  );
}
export function classLiteralTypes(node: Node, read: StaticClassNativeContext): readonly string[] {
  const selector = nodeTypeSelector(node);
  const parts = read.types.unions(selector);
  return (parts.length > 0 ? parts : [selector]).flatMap((part) => {
    const literal = read.types.literalValue(part);
    if (typeof literal === "string" || typeof literal === "number") {
      return [String(literal)];
    }
    return read.types.primitiveFlags(part).booleanLiteral ? [read.types.defaultDisplay(part)] : [];
  });
}
