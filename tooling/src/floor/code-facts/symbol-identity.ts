// Raw native symbol identity follows exactly one import-alias hop; declarations remain separately observable.

import type { Symbol as MorphSymbol, Node } from "ts-morph";
import { Node as MorphNode } from "ts-morph";

/** The native target of the canonical one-hop alias primitive. */
export function ultimateSymbol(symbol: MorphSymbol | undefined): MorphSymbol | undefined {
  return symbol?.getAliasedSymbol() ?? symbol;
}

/** Equality belongs to the supplying native compiler capture, never spelling or type display. */
export function symbolIdentity(symbol: MorphSymbol | undefined): object | undefined {
  return ultimateSymbol(symbol)?.compilerSymbol;
}

/** Raw declaration order, deliberately without alias following. */
export function symbolDeclarations(symbol: MorphSymbol | undefined): readonly Node[] {
  return symbol?.getDeclarations() ?? [];
}

/** Delivered symbol equivalence is local to its explicit native capture. */
export function observedSymbolIdentity(
  symbol: import("./type-observations-contract.ts").ObservedReference<"symbol"> | null | undefined,
  readers: import("./type-observations-contract.ts").TypeObservationReader,
): object | undefined {
  return symbol === null || symbol === undefined ? undefined : readers.symbolData(readers.symbolData(symbol).canonical).key;
}
export function observedUltimateSymbol(
  symbol: import("./type-observations-contract.ts").ObservedReference<"symbol"> | null | undefined,
  readers: import("./type-observations-contract.ts").TypeObservationReader,
): import("./type-observations-contract.ts").ObservedReference<"symbol"> | undefined {
  return symbol === null || symbol === undefined ? undefined : readers.symbolData(symbol).canonical;
}
export function observedSymbolDeclarations(
  symbol: import("./type-observations-contract.ts").ObservedReference<"symbol"> | null | undefined,
  readers: import("./type-observations-contract.ts").TypeObservationReader,
): readonly Node[] {
  return symbol === null || symbol === undefined ? [] : readers.symbolData(symbol).declarations;
}

/** A physical-origin bridge carries no typed equality across compiler captures. */
export function observedSymbolOriginKey(
  symbol: import("./type-observations-contract.ts").ObservedReference<"symbol"> | null | undefined,
  readers: import("./type-observations-contract.ts").TypeObservationReader,
): string | undefined {
  const canonical = observedUltimateSymbol(symbol, readers);
  if (canonical === undefined) {
    return undefined;
  }
  const declarations = observedSymbolDeclarations(canonical, readers);
  return declarations.length === 0
    ? undefined
    : JSON.stringify(
        declarations
          .map((node) => [node.getSourceFile().getFilePath().replaceAll("\\", "/"), node.getStart(), node.getEnd(), node.getKind()])
          .map((span) => JSON.stringify(span))
          .toSorted(),
      );
}

/** Existing value bindings supply their actual authored declarations, not a name or type-display substitute. */
export function observedValueDeclarations(node: Node, readers: import("./type-observations-contract.ts").TypeObservationReader): readonly Node[] {
  const symbol = observedUltimateSymbol(readers.symbol(node), readers);
  return observedSymbolDeclarations(symbol, readers).filter(
    (declaration) =>
      (MorphNode.isVariableDeclaration(declaration) || MorphNode.isPropertyDeclaration(declaration)) && declaration.getInitializer() !== undefined,
  );
}
