import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { PNG_CHUNK_SPECIFIER_PATTERN, PNG_CHUNK_SYMBOL_NAMES } from "../contract/serde-core-seal.ts";

const PNG_CHUNK_SYMBOLS: ReadonlySet<string> = new Set(PNG_CHUNK_SYMBOL_NAMES);
const PNG_CHUNK_SPECIFIER = new RegExp(PNG_CHUNK_SPECIFIER_PATTERN, "u");

/** Identify the PNG engine imports that keep a sanctioned domain active. */
export function pngChunkImport(node: Node): string {
  if (!node.isKind(SyntaxKind.ImportSpecifier)) {
    return "";
  }
  const name = node.getName();
  if (!PNG_CHUNK_SYMBOLS.has(name)) {
    return "";
  }
  const decl = node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  return decl !== undefined && PNG_CHUNK_SPECIFIER.test(decl.getModuleSpecifierValue()) ? name : "";
}
