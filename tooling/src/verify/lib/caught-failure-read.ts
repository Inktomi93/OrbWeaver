// Related declarations retain their candidate's importing-world reader, never their primary file's owner.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ObservedLiteralValue } from "../../floor/code-facts/type-observations-contract.ts";
import { nodeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import type { CaughtFailureReadServices } from "../contract/caught-failure.ts";

export function rawFailureDeclarations(node: Node, reads: CaughtFailureReadServices | undefined, aliased = false): readonly Node[] {
  if (reads === undefined) {
    const symbol = node.getSymbol();
    return (aliased ? (symbol?.getAliasedSymbol() ?? symbol) : symbol)?.getDeclarations() ?? [];
  }
  const symbol = reads.types.symbol(node);
  return symbol === null ? [] : reads.types.symbolData(aliased ? reads.types.symbolData(symbol).canonical : symbol).declarations;
}

export function failureDefinitionNodes(node: Node, reads: CaughtFailureReadServices | undefined): readonly Node[] {
  return reads === undefined ? node.asKindOrThrow(SyntaxKind.Identifier).getDefinitionNodes() : reads.types.definitions(node);
}

export function failureLiteralValue(node: Node, reads: CaughtFailureReadServices | undefined): ObservedLiteralValue | undefined {
  return reads === undefined ? node.getType().getLiteralValue() : reads.types.literalValue(nodeTypeSelector(node));
}

export function failureNever(node: Node, reads: CaughtFailureReadServices | undefined): boolean {
  if (reads === undefined) {
    return node.getType().isNever();
  }
  const selected = reads.types.select(nodeTypeSelector(node));
  if (selected === null) {
    throw new Error("native caught-failure Type is absent");
  }
  return reads.types.type(selected).never;
}
