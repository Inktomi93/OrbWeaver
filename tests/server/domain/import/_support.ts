// Shared test harness for the import domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds an `ImportContext` whose THREE cross-feature ops are recording FAKES — the sanctioned "fake
// at the edges, inject at the root" doctrine (testing §3): real injected deps, not internal-module mocks.
// The card-import slice touches NO db (it injects character.create + the by-importHash lookup + assets.store
// + parses pure), so the harness needs no `freshDb` — the fakes record their calls so the verb tests assert
// the flatten/provenance/dedup behaviour, and `setExisting` seeds the dedup oracle.

import type { CreateCharacterInput } from "@orb/contracts/character";
import type { AssetId, CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImportContext } from "../../../../packages/server/src/domain/import/contract/service.ts";

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

export interface StoreCall {
  readonly ownerId: UserId;
  readonly bytes: Uint8Array;
  readonly mime: string;
}

export interface FindCall {
  readonly ownerId: UserId;
  readonly importHash: string;
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
  readonly stores: StoreCall[];
  readonly finds: FindCall[];
  /** Every card-tag attach the verb issued (the injected `attachCardTag` op, bound to card/pending). */
  readonly tagAttaches: TagAttachCall[];
  /** Seed the dedup oracle: a byte-identical re-import with this `importHash` resolves to `characterId`. */
  readonly setExisting: (importHash: string, characterId: CharacterId) => void;
}

/** Build an `ImportContext` over recording fakes. The fake `createCharacter` mints a deterministic id
 *  (counter-backed, per harness) so created characters are distinguishable without a seeded global. */
export function makeHarness(): ImportHarness {
  const creates: CreateCall[] = [];
  const stores: StoreCall[] = [];
  const finds: FindCall[] = [];
  const tagAttaches: TagAttachCall[] = [];
  const existing = new Map<string, CharacterId>();
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
      return Promise.resolve(existing.get(importHash) ?? null);
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
    stores,
    finds,
    tagAttaches,
    setExisting: (importHash, characterId): void => {
      existing.set(importHash, characterId);
    },
  };
}
