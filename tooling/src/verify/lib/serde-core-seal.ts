// The SHARED READER for the `serde-core-seal` family (owner ruling 2026-09-12, #2096 / §12.3): the PNG
// card-chunk import IDENTITY, the sanctioned serde homes, and the domain root both policies key on.
//
// WHY IT IS HERE AND NOT IN A GATE MODULE. `serde-core-seal` reds a NEW importer of the byte-surgery
// engine outside the two sanctioned homes; `serde-core-seal-health` reds a sanctioned home that has STOPPED
// importing it. The two are the same question asked in opposite directions, so they must answer "is this an
// engine import" with ONE predicate — two copies drift apart silently, and each module's own proofs stay
// green while they do. The health sibling used to reach these by importing the occurrence gate module
// directly, which the owner banned on 2026-09-12: **a gate module NEVER imports another gate module; a
// shared predicate moves to `lib/<family>.ts`.** `lib/contract-derives-not-respells.ts` is the precedent.
//
// THE SEAL IS THE PAIR (SYMBOL, SPECIFIER), NEVER ONE OF THEM. A non-engine symbol from the sealed module
// and an engine-NAMED symbol from a different module both pass; only both halves together are the engine.
// That is pinned by `serde-core-seal`'s own `mustPass[2]`, which reds if either test is deleted.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";

const PNG_CHUNK_SYMBOLS = new Set(["readCardChunk", "writeCardChunk", "isPng"]);
const PNG_CHUNK_SPECIFIER = /^@orb\/kit\/png-card-chunk(?:\/|$)/u;

/** The sanctioned serde homes, named individually so the health sibling can name the dead one. */
export const SANCTIONED_DOMAINS = ["import", "export"] as const;

export const DOMAIN_ROOT = "packages/server/src/domain/";

/** Is this ImportSpecifier a card-chunk engine symbol imported from `@orb/kit/png-card-chunk`? The ONE
 *  import-identity answer both halves of the family use, so the occurrence seal and the stale-sanction
 *  ratchet can never disagree about what counts as byte surgery. */
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
