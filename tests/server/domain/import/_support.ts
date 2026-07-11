// Shared test harness for the import domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds an `ImportContext` whose SIX cross-feature ops are recording FAKES — the sanctioned "fake at
// the edges, inject at the root" doctrine (testing §3): real injected deps, not internal-module mocks. The
// card-import slice touches NO db (it injects character.create/update + the by-importHash/by-handle lookups
// + assets.store + tag.attachCardTagByName, and parses pure), so the harness needs no `freshDb` — the fakes
// record their calls so the verb tests assert the flatten/provenance/dedup/handle-match/tag-attach
// behaviour. `setExisting` seeds the byte-identical dedup oracle; `setExistingHandle` seeds the PD-108
// (ownerId, handle) match oracle.

import type { CreateCharacterInput, UpdateCharacterInput } from "@orb/contracts/character";
import type { Db } from "@orb/db";
import type {
  AssetId,
  CharacterId,
  ChatId,
  ChatParticipantId,
  MessageId,
  MessageVariantId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type {
  ImportContext,
  ImportProfileDeps,
} from "../../../../packages/server/src/domain/import/contract/service.ts";

const OWNER_ID = castId<UserId>("user_owner");
// A format-VALID asset TypeID (26-char crockford-base32 suffix) — the create schema validates
// `avatarAssetId` through `typeIdSchema`, so the fake store must return a real-shaped id. Static (not
// minted) so it stays deterministic (test-determinism — no unseeded ids under tests/).
const STORED_ASSET_ID = castId<AssetId>("asset_00000000000000000000000000");

export interface CreateCall {
  readonly ownerId: UserId;
  readonly input: CreateCharacterInput;
  readonly importedFrom: string | null;
  readonly importHash: string;
}

export interface UpdateCall {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly input: UpdateCharacterInput;
}

export interface StoreCall {
  readonly ownerId: UserId;
  readonly bytes: Uint8Array;
  readonly mime: string;
}

export interface FindCall {
  readonly ownerId: UserId;
  readonly importHash: string;
}

export interface FindByHandleCall {
  readonly ownerId: UserId;
  readonly handle: string;
}

export interface TagAttachCall {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly tagName: string;
}

export interface ImportHarness {
  readonly ctx: ImportContext;
  readonly ownerId: UserId;
  readonly storedAssetId: AssetId;
  readonly creates: CreateCall[];
  readonly updates: UpdateCall[];
  readonly stores: StoreCall[];
  readonly finds: FindCall[];
  readonly findsByHandle: FindByHandleCall[];
  /** Every card-tag attach the verb issued (the injected `attachCardTag` op, bound to card/pending). */
  readonly tagAttaches: TagAttachCall[];
  /** Seed the byte-identical dedup oracle: a re-import with this `importHash` resolves to `characterId`. */
  readonly setExisting: (importHash: string, characterId: CharacterId) => void;
  /** Seed the PD-108 (ownerId, handle) match oracle: a re-import deriving this `handle` resolves to
   *  `characterId` (edit-in-place) instead of inserting. */
  readonly setExistingHandle: (handle: string, characterId: CharacterId) => void;
}

/** Build an `ImportContext` over recording fakes. The fake `createCharacter` mints a deterministic id
 *  (counter-backed, per harness) so created characters are distinguishable without a seeded global. */
export function makeHarness(): ImportHarness {
  const creates: CreateCall[] = [];
  const updates: UpdateCall[] = [];
  const stores: StoreCall[] = [];
  const finds: FindCall[] = [];
  const findsByHandle: FindByHandleCall[] = [];
  const tagAttaches: TagAttachCall[] = [];
  const existingByHash = new Map<string, CharacterId>();
  const existingByHandle = new Map<string, CharacterId>();
  let created = 0;

  const ctx: ImportContext = {
    ownerId: OWNER_ID,
    createCharacter: (args): Promise<{ characterId: CharacterId }> => {
      creates.push(args);
      created += 1;
      return Promise.resolve({ characterId: castId<CharacterId>(`character_created_${created}`) });
    },
    findByImportHash: ({ ownerId, importHash }): Promise<CharacterId | null> => {
      finds.push({ ownerId, importHash });
      return Promise.resolve(existingByHash.get(importHash) ?? null);
    },
    findByHandle: ({ ownerId, handle }): Promise<CharacterId | null> => {
      findsByHandle.push({ ownerId, handle });
      return Promise.resolve(existingByHandle.get(handle) ?? null);
    },
    updateCharacter: (args): Promise<void> => {
      updates.push(args);
      return Promise.resolve();
    },
    storeAsset: (args): Promise<AssetId> => {
      stores.push(args);
      return Promise.resolve(STORED_ASSET_ID);
    },
    attachCardTag: (args): Promise<boolean> => {
      tagAttaches.push(args);
      return Promise.resolve(true);
    },
  };

  return {
    ctx,
    ownerId: OWNER_ID,
    storedAssetId: STORED_ASSET_ID,
    creates,
    updates,
    stores,
    finds,
    findsByHandle,
    tagAttaches,
    setExisting: (importHash, characterId): void => {
      existingByHash.set(importHash, characterId);
    },
    setExistingHandle: (handle, characterId): void => {
      existingByHandle.set(handle, characterId);
    },
  };
}

// ── the PROFILE-wave harness (PD-77): a REAL `freshDb`-backed `ImportContext` with `ctx.profile` wired ─────
// (RULING A). The card ops are inert no-ops (the chats/personas verbs never touch them); the profile deps are
// real — a fixed clock + counter-minted (deterministic + unique) ids + a live `personaByUserName` map + the
// PD-78 ops recording their calls. Seed the owner + character with the test factories, then drive
// `importChats`/`importPersonas` over `db`.

/** A fixed clock for the profile harness (deterministic — no unseeded time under tests/). */
export const IMPORT_NOW = 1_700_000_000_000;

export interface ProfileHarness {
  readonly ctx: ImportContext;
  readonly profile: ImportProfileDeps;
  /** Every `enqueueBackfill` call the run issued (the PD-78 gate assertion surface). */
  readonly backfills: { readonly ownerId: UserId }[];
  /** Every inline `reconcileStats` call the run issued. */
  readonly reconciles: { readonly ownerId: UserId }[];
}

/** Build a profile-wave `ImportContext` over a real `db`, owned by `ownerId`. Ids are counter-minted so the
 *  bulk writes are unique AND deterministic (test-determinism — no `mintTypeId`/clock under tests/). */
export function makeProfileHarness(db: Db, ownerId: UserId): ProfileHarness {
  const backfills: { ownerId: UserId }[] = [];
  const reconciles: { ownerId: UserId }[] = [];
  let n = 0;
  const counter = (): string => {
    n += 1;
    return String(n).padStart(26, "0");
  };
  const profile: ImportProfileDeps = {
    db,
    now: (): number => IMPORT_NOW,
    personaByUserName: new Map<string, PersonaId>(),
    newChatId: (): ChatId => castId<ChatId>(`chat_${counter()}`),
    newMessageId: (): MessageId => castId<MessageId>(`message_${counter()}`),
    newVariantId: (): MessageVariantId => castId<MessageVariantId>(`message_variant_${counter()}`),
    newParticipantId: (): ChatParticipantId =>
      castId<ChatParticipantId>(`chat_participant_${counter()}`),
    newPersonaId: (): PersonaId => castId<PersonaId>(`persona_${counter()}`),
    newWorldBookId: () => castId("world_book_0"),
    newWorldEntryId: () => castId("world_entry_0"),
    enqueueBackfill: ({ ownerId: o }): Promise<void> => {
      backfills.push({ ownerId: o });
      return Promise.resolve();
    },
    reconcileStats: ({ ownerId: o }): Promise<void> => {
      reconciles.push({ ownerId: o });
      return Promise.resolve();
    },
  };
  const inert = (): never => {
    throw new Error(
      "import profile harness: card op not wired (chats/personas verbs must not call it)",
    );
  };
  const ctx: ImportContext = {
    ownerId,
    createCharacter: inert,
    findByImportHash: inert,
    findByHandle: inert,
    updateCharacter: inert,
    storeAsset: inert,
    attachCardTag: inert,
    profile,
  };
  return { ctx, profile, backfills, reconciles };
}
