// entry/import/build-import-context — the ONE place the per-owner `ImportContext` wiring is assembled from the
// entry-supplied character/assets/tag/(world-info) ports, plus the port interfaces those ops speak. BOTH import
// routes share it (DRY, task #115 — the two routes stay DISTINCT, only the ImportContext construction is
// deduped):
//   • the SYNC multipart card-upload driver (`run-profile-import`) — card-only, no `profile` block
//   • the bundle-delivery composition seam (`entry/compose/portability` `buildOwnerImport`) — adds the
//     `importLorebook` op + the PD-77 `profile` wave (chats/personas backfill/reconcile)
// The acting `Principal` is resolved at the edge (the upload route / the PD-73 host-principal seam) and passed
// in — identity is resolved ONCE, never re-derived inside the domain (`ImportContext.ownerId` is its id).

import type { CreateCharacterInput, UpdateCharacterInput } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { TagSource, TagStatus } from "@orb/contracts/tag";
import type { BulkImportLorebookInput, BulkImportLorebookResult } from "@orb/contracts/world-info";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import type { ImportContext } from "#domain/import";

/** The `character` front-door slice the driver wires the import create/dedup/edit-in-place ops to. */
export interface ImportCharacterPort {
  readonly create: (params: {
    readonly principal: Principal;
    readonly input: CreateCharacterInput;
    readonly provenance?: { readonly importedFrom: string | null; readonly importHash: string };
  }) => Promise<{ readonly id: CharacterId }>;
  readonly update: (params: {
    readonly principal: Principal;
    readonly characterId: CharacterId;
    readonly input: UpdateCharacterInput;
  }) => Promise<{ readonly id: CharacterId }>;
  readonly findByImportHash: (params: {
    readonly ownerId: UserId;
    readonly importHash: string;
  }) => Promise<{ readonly characterId: CharacterId } | null>;
  /** PD-108 — the ALREADY-BUILT default-card seeder's partial-rerun read, reused for the re-import match. */
  readonly findByHandle: (params: {
    readonly ownerId: UserId;
    readonly handle: string;
  }) => Promise<{ readonly characterId: CharacterId } | null>;
}

/** The `assets` front-door slice the driver wires the import avatar-store op to. */
export interface ImportAssetPort {
  readonly store: (params: {
    readonly principal: Principal;
    readonly bytes: Uint8Array;
    readonly kind: "avatar";
    readonly mime: string;
    readonly enforceMagic?: boolean;
  }) => Promise<{ readonly assetId: AssetId }>;
}

/** The `tag` front-door slice the driver wires the import card-tag carry to (`tag.attachCardTagByName`). The
 *  driver binds `source:'card'`, `status:'pending'` so each `card.tags` entry lands as a staged suggestion. */
export interface ImportTagPort {
  readonly attachCardTagByName: (params: {
    readonly ownerId: UserId;
    readonly characterId: CharacterId;
    readonly tagName: string;
    readonly source: TagSource;
    readonly status: TagStatus;
  }) => Promise<boolean>;
}

/** The `world-info` front-door slice the driver wires the embedded-lorebook import to
 *  (`createBulkImportLorebook`, W1). OPTIONAL in the deps: a card-only composition may omit it (embedded books
 *  are then skipped); the full-profile / delivery composition constructs the op (it has db + minters) and
 *  passes it here. */
export interface ImportWorldInfoPort {
  readonly importLorebook: (params: {
    readonly ownerId: UserId;
    readonly characterId: CharacterId;
    readonly book: BulkImportLorebookInput;
  }) => Promise<BulkImportLorebookResult>;
}

/** The ports + acting principal the shared `ImportContext` wiring closes over. `importLorebook`/`profile` are
 *  optional — the card-only slice omits both; the delivery composition supplies them. */
export interface ImportContextWiring {
  readonly principal: Principal;
  readonly character: ImportCharacterPort;
  readonly storeAvatar: ImportAssetPort["store"];
  readonly attachCardTag: ImportTagPort["attachCardTagByName"];
  /** W1 embedded-lorebook write — when present, embedded card books import; else the card verb skips them. */
  readonly importLorebook?: ImportWorldInfoPort["importLorebook"];
  /** The PD-77 profile-wave deps — present only on the delivery/bundle path (the card-only slice omits it). */
  readonly profile?: ImportContext["profile"];
}

/**
 * Assemble the per-owner `ImportContext` from the entry-supplied ports. `exactOptionalPropertyTypes`: the
 * optional `importLorebook`/`profile` are spread only when defined, never assigned `undefined`.
 */
export function buildImportContext(wiring: ImportContextWiring): ImportContext {
  const { principal, character, storeAvatar, attachCardTag, importLorebook, profile } = wiring;
  const ownerId = principal.userId;
  const ctx: ImportContext = {
    ownerId,
    createCharacter: async ({ input, importedFrom, importHash }) => {
      const created = await character.create({
        principal,
        input,
        provenance: { importedFrom, importHash },
      });
      return { characterId: created.id };
    },
    findByImportHash: async ({ importHash }) => {
      const ref = await character.findByImportHash({ ownerId, importHash });
      return ref?.characterId ?? null;
    },
    findByHandle: async ({ handle }) => {
      const ref = await character.findByHandle({ ownerId, handle });
      return ref?.characterId ?? null;
    },
    updateCharacter: async ({ characterId, input }) => {
      await character.update({ principal, characterId, input });
    },
    storeAsset: async ({ bytes, mime }) => {
      const stored = await storeAvatar({
        principal,
        bytes,
        kind: "avatar",
        mime,
        enforceMagic: false,
      });
      return stored.assetId;
    },
    // Author-shipped card tags land as card/pending suggestions (the user's "Accept" flips them later).
    attachCardTag: ({ ownerId: oid, characterId, tagName }) =>
      attachCardTag({ ownerId: oid, characterId, tagName, source: "card", status: "pending" }),
    ...(importLorebook !== undefined ? { importLorebook } : {}),
    ...(profile !== undefined ? { profile } : {}),
  };
  return ctx;
}
