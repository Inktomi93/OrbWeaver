// Declaration provenance for shape comparisons; matching types never establish a shared origin.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { INVENTORY_KEY_SEPARATOR } from "./semantic-inventory-contract.ts";
import { inventoryDeclarationKey } from "./semantic-inventory-reader.ts";

/** Origin declarations named by a bare alias (`type X = Y`), resolved through import/re-export hops. */
function bareAliasTargetKeys(decl: MorphNode): Set<string> {
  const keys = new Set<string>();
  if (!Node.isTypeAliasDeclaration(decl)) {
    return keys;
  }
  const typeNode = decl.getTypeNode();
  if (typeNode === undefined || !Node.isTypeReference(typeNode) || typeNode.getTypeArguments().length > 0) {
    return keys;
  }
  const entity = typeNode.getTypeName();
  const identifier = Node.isQualifiedName(entity) ? entity.getRight() : entity;
  const symbol = identifier.getSymbol();
  if (symbol === undefined) {
    return keys;
  }
  for (const declaration of (symbol.getAliasedSymbol() ?? symbol).getDeclarations()) {
    keys.add(inventoryDeclarationKey(declaration));
  }
  return keys;
}

/** Contracts declarations named directly by `extends`; inherited fields are already derived. */
function heritageTargetKeys(decl: MorphNode): Set<string> {
  const keys = new Set<string>();
  let heritage = Node.isInterfaceDeclaration(decl) ? decl.getExtends() : [];
  if (Node.isClassDeclaration(decl)) {
    const clause = decl.getExtends();
    heritage = clause === undefined ? [] : [clause];
  }
  for (const clause of heritage) {
    const symbol = clause.getExpression().getSymbol();
    for (const declaration of (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []) {
      keys.add(inventoryDeclarationKey(declaration));
    }
  }
  return keys;
}

/** Direct alias and heritage targets, resolved to declaration identities rather than names. */
export function directDerivationTargetKeys(decl: MorphNode): Set<string> {
  return new Set([...bareAliasTargetKeys(decl), ...heritageTargetKeys(decl)]);
}

/** Shared `typeof value` provenance through a generic derive (`z.infer`, `ReturnType`, and equivalents). */
export function typeQueryDerivationKeys(decl: MorphNode): Set<string> {
  const keys = new Set<string>();
  if (!Node.isTypeAliasDeclaration(decl)) {
    return keys;
  }
  const typeNode = decl.getTypeNode();
  if (typeNode === undefined || !Node.isTypeReference(typeNode)) {
    return keys;
  }
  const [argument] = typeNode.getTypeArguments();
  if (argument === undefined || typeNode.getTypeArguments().length !== 1 || !Node.isTypeQuery(argument)) {
    return keys;
  }
  const genericSymbol = typeNode.getTypeName().getSymbol();
  const genericKeys = ((genericSymbol?.getAliasedSymbol() ?? genericSymbol)?.getDeclarations() ?? []).map(inventoryDeclarationKey);
  const operandSymbol = argument.getExprName().getSymbol();
  const operandKeys = ((operandSymbol?.getAliasedSymbol() ?? operandSymbol)?.getDeclarations() ?? []).map(inventoryDeclarationKey);
  for (const genericKey of genericKeys) {
    for (const operandKey of operandKeys) {
      keys.add(`${genericKey}${INVENTORY_KEY_SEPARATOR}${operandKey}`);
    }
  }
  return keys;
}
