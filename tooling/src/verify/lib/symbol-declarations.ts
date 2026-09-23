// Shared checker-symbol identity primitives (gate-runtime-standardization.md §3, owner ruling #2097). A
// FINAL policy module never calls `Symbol#getDeclarations()` / `getAliasedSymbol()` itself; the census and
// twin-parity policies both need "what does this symbol denote, following one import-alias hop" and "what
// declares it", so those two questions live here once instead of nine separate
// `(symbol.getAliasedSymbol() ?? symbol).getDeclarations()` chains.
import type { Node as MorphNode, Symbol as MorphSymbol } from "ts-morph";

/** The symbol this reference ultimately denotes, following one import-alias hop. */
export function ultimateSymbol(symbol: MorphSymbol | undefined): MorphSymbol | undefined {
  return symbol?.getAliasedSymbol() ?? symbol;
}

/** A stable identity for a symbol, alias-following, suitable for Set/Map membership. */
export function symbolIdentity(symbol: MorphSymbol | undefined): object | undefined {
  return ultimateSymbol(symbol)?.compilerSymbol;
}

/** Every declaration a symbol carries, with no alias-following — the raw `getDeclarations()` answer for a
 *  caller that must see an alias's own declaration (an `ExportSpecifier`, an import clause) rather than
 *  the target it points at. */
export function symbolDeclarations(symbol: MorphSymbol | undefined): readonly MorphNode[] {
  return symbol?.getDeclarations() ?? [];
}
