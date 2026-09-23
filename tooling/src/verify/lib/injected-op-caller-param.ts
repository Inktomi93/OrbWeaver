// The SHARED READER for the `injected-op-caller-param` family (owner ruling 2026-09-12, #2096 / §12.3):
// the caller-free exemption table, the entity-id vocabulary derivation, and the `@orb/kit/ids` home both
// policies key on.
//
// WHY IT IS HERE AND NOT IN A GATE MODULE. `injected-op-caller-param` reds an injected op that takes a
// branded entity id and no caller; `injected-op-caller-param-health` is its TWO-SIDED ratchet — it reds a
// `CALLER_FREE_OPS` row no live contract declares, and it reds the id derivation coming back empty (the
// blindness arm). A two-sided ratchet is only a ratchet while both halves read ONE table and ONE
// derivation; the health sibling used to reach them by importing the occurrence gate module directly,
// which the owner banned on 2026-09-12: **a gate module NEVER imports another gate module; a shared
// predicate moves to `lib/<family>.ts`.** `lib/contract-derives-not-respells.ts` is the worked precedent.
//
// THE TABLE IS A CLAIM WITH AN END CONDITION, NOT A PARKING SPACE. Each row says WHY the authority is
// elsewhere and what would END the exemption, and the health sibling reds any row whose op no contract
// declares — so a row cannot outlive the op it excuses.
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";

/** The ONE home of the branded entity-id vocabulary both halves derive from. */
export const IDS_MODULE = "packages/kit/src/ids/index.ts";

const TYPEID_OF = "TypeIdOf";

/** One caller-free row: the op NAME as a VALUE, and the mandatory reason. The name is a value rather than a
 *  key for the same reason the tenancy registry's is (`lib/tenancy-scope.ts`): `useNamingConvention` judges
 *  object KEYS and is off for `tooling/src/verify/gates/**` but on for `tooling/src/verify/lib/**`, so a
 *  PascalCase-keyed table cannot move here without either a suppression or a rename — and the op names ARE
 *  the contract vocabulary this family's ratchet compares against live declarations, so renaming them would
 *  make the ratchet compare a vocabulary with a translation of itself. */
export interface CallerFreeOpRow {
  readonly op: string;
  readonly why: string;
}

/** Ops that legitimately carry NO caller. Each row says WHY the authority is elsewhere and what would END
 *  the exemption. Two-sided: a row naming an op no contract declares is RED (the health sibling). */
export const CALLER_FREE_OP_ROWS: readonly CallerFreeOpRow[] = [
  {
    op: "ReapAssetsOp",
    why:
      "the authority is STRUCTURAL, not the caller's: `reapIfOrphan` purges an id only when the whole " +
      "asset-ref REGISTRY holds no reference to it (`selectReferencedAmong`), so a foreign id that is still " +
      "referenced is skipped and a foreign id referenced by nothing is an orphan blob `collectGarbage` would " +
      "reap anyway. UN-PRINCIPAL by design (D20, stated in `assets/verbs/reap-if-orphan.ts`'s header) and it " +
      "returns no row data. Ends the day the reap stops consulting the reference registry first.",
  },
  {
    op: "ListCharacterSpriteAssetsOp",
    why:
      "docs/plans/expressions/design.md — OPTIONAL and currently UNWIRED (no compose root supplies it; the FK cascade " +
      "plus the next GC sweep is the live behavior). It is now a READ of the assetIds bound to a character, " +
      "taken before the owner-scoped delete that actually frees them, and it returns ids the caller already " +
      "proved it owns; it no longer DELETES anything (renamed from `ReapCharacterSpritesOp` when the detach " +
      "was moved behind the delete). Ends the day the expressions leaf lands: the wiring must carry the " +
      "caller then, because the ids it returns would be reachable by characterId alone.",
  },
  {
    op: "ResolveAssetHashOp",
    why:
      "the un-principal indexer/assembly read (D20): it returns a CAS content hash, never row data, and its " +
      "assetId comes from the chat's own already-authorized canon (a seated card's avatar), not from caller " +
      "input. Ends if it ever returns owner-identifying fields.",
  },
  {
    op: "LoadAssetBytesOp",
    why:
      "D20 un-principal blob read for the databank INGEST path, which runs after the enqueue authority check " +
      "(the workload row's owner is the gate). `assets/contract/service.ts` names this the un-principal read " +
      "explicitly, distinct from the principal-carrying door. Ends if ingest ever runs on caller-supplied ids.",
  },
  {
    op: "LoadAssetBytes",
    why: "the embeddings twin of LoadAssetBytesOp — the indexer sweeps ids IT enumerated (D20 un-principal). Ends if the indexer starts taking ids from a request.",
  },
  {
    op: "LoadAssetMime",
    why: "the embeddings mime probe over ids the indexer enumerated itself (D20 un-principal); returns a mime string, no row data. Ends with LoadAssetBytes.",
  },
  {
    op: "LoadCardText",
    why:
      "the embeddings/admin card-text read over ids the indexer enumerated itself (`listEmbeddableCharacterIds`) " +
      "— D20 un-principal, the bulk pass sweeps the whole corpus by construction. Ends if a request-supplied " +
      "characterId ever reaches it.",
  },
];

/** THE ONE READER. Built once per call into a Map so both policies key on the same object; neither sees the
 *  array directly for a membership question, which is what keeps "is this op caller-free" a single answer. */
export function callerFreeOps(): ReadonlyMap<string, CallerFreeOpRow> {
  return new Map(CALLER_FREE_OP_ROWS.map((row) => [row.op, row]));
}

/** Every `TypeIdOf<…>` alias the ids module declares — the entity-id vocabulary the occurrence policy
 *  triggers on and the health sibling's blindness arm counts. An empty set means the derivation went blind,
 *  never that the tree is clean. */
export function deriveEntityIdTypes(files: readonly SourceFile[], relativePath: (sf: SourceFile) => string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const sf of files) {
    if (relativePath(sf) !== IDS_MODULE) {
      continue;
    }
    for (const ta of sf.getTypeAliases()) {
      const tn = ta.getTypeNode();
      if (tn?.isKind(SyntaxKind.TypeReference) === true && tn.getTypeName().getText() === TYPEID_OF) {
        names.add(ta.getName());
      }
    }
  }
  return names;
}
