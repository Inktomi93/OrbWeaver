// The one place the per-owner `ImportContext` wiring is assembled from entry-supplied ports. Both import
// routes share it: the sync multipart card-upload driver (card-only, no profile block) and the
// bundle-delivery composition seam (adds importLorebook + the profile wave). The acting Principal is
// resolved at the edge and passed in — identity is resolved once, never re-derived inside the domain.

import type { AttachedBookRef, CreateCharacterInput, UpdateCharacterInput } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { ImportCardScripts } from "#domain/regex";
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
  readonly findByImportHash: (params: { readonly ownerId: UserId; readonly importHash: string }) => Promise<{ readonly characterId: CharacterId } | null>;
  readonly findByHandle: (params: { readonly ownerId: UserId; readonly handle: string }) => Promise<{ readonly characterId: CharacterId } | null>;
}

/** The `assets` front-door slice the driver wires the import avatar-store op to. `maxBytes` (PD-94) is the
 *  non-HTTP caller's zip-bomb belt — the store seam rejects an over-cap blob before the CAS write. */
export interface ImportAssetPort {
  readonly store: (params: {
    readonly principal: Principal;
    readonly bytes: Uint8Array;
    readonly kind: "avatar";
    readonly mime: string;
    readonly enforceMagic?: boolean;
    readonly maxBytes?: number;
  }) => Promise<{ readonly assetId: AssetId }>;
}

/** The `tag` front-door slice the driver wires the import card-tag carry to. The driver binds
 *  `source:'card'`, `status:'pending'` so each `card.tags` entry lands as a staged suggestion. */
export interface ImportTagPort {
  readonly attachCardTagByName: (params: {
    readonly ownerId: UserId;
    readonly characterId: CharacterId;
    readonly tagName: string;
    readonly source: TagSource;
    readonly status: TagStatus;
  }) => Promise<boolean>;
}

/** The `world-info` front-door slice the driver wires the embedded-lorebook import + the PD-144 attached-book
 *  re-link to. Optional: a card-only composition may omit them (embedded books / references are then skipped). */
export interface ImportWorldInfoPort {
  readonly importLorebook: (params: {
    readonly ownerId: UserId;
    readonly characterId: CharacterId;
    readonly book: BulkImportLorebookInput;
  }) => Promise<BulkImportLorebookResult>;
  readonly linkCarriedBooks: (params: {
    readonly ownerId: UserId;
    readonly characterId: CharacterId;
    readonly refs: readonly AttachedBookRef[];
  }) => Promise<{ readonly linked: number; readonly skipped: number }>;
}

/** The ports + acting principal the shared `ImportContext` wiring closes over. `importLorebook`/`profile`
 *  are optional — the card-only slice omits both; the delivery composition supplies them. */
export interface ImportContextWiring {
  readonly principal: Principal;
  readonly character: ImportCharacterPort;
  readonly storeAvatar: ImportAssetPort["store"];
  readonly attachCardTag: ImportTagPort["attachCardTagByName"];
  readonly importLorebook?: ImportWorldInfoPort["importLorebook"];
  readonly linkCarriedBooks?: ImportWorldInfoPort["linkCarriedBooks"];
  /** D121-E: the regex card LIFT (the `importLorebook` twin). Optional for the same reason: the card-only
   *  slice may omit it; the delivery composition always supplies it. */
  readonly importCardScripts?: ImportCardScripts;
  readonly profile?: ImportContext["profile"];
}

/**
 * Assemble the per-owner `ImportContext` from the entry-supplied ports. `exactOptionalPropertyTypes`: the
 * optional `importLorebook`/`profile` are spread only when defined, never assigned `undefined`.
 */
export function buildImportContext(wiring: ImportContextWiring): ImportContext {
  const { principal, character, storeAvatar, attachCardTag, importLorebook, linkCarriedBooks, importCardScripts, profile } = wiring;
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
    attachCardTag: ({ ownerId: oid, characterId, tagName }) => attachCardTag({ ownerId: oid, characterId, tagName, source: "card", status: "pending" }),
    ...(importLorebook !== undefined ? { importLorebook } : {}),
    ...(linkCarriedBooks !== undefined ? { linkCarriedBooks } : {}),
    ...(importCardScripts !== undefined ? { importCardScripts } : {}),
    ...(profile !== undefined ? { profile } : {}),
  };
  return ctx;
}
