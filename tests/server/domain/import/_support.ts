// Shared test harness for the import domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds an `ImportContext` whose SIX cross-feature ops are recording FAKES — the sanctioned "fake at
// the edges, inject at the root" doctrine (testing §3): real injected deps, not internal-module mocks. The
// card-import slice touches NO db (it injects character.create/update + the by-importHash/by-handle lookups
// + assets.store + tag.attachCardTagByName, and parses pure), so the harness needs no `freshDb` — the fakes
// record their calls so the verb tests assert the flatten/provenance/dedup/handle-match/tag-attach
// behaviour. `setExisting` seeds the byte-identical dedup oracle; `setExistingHandle` seeds the PD-108
// (ownerId, handle) match oracle.

import type { AttachedBookRef, CreateCharacterInput, UpdateCharacterInput } from "@orb/contracts/character";
import type { BulkImportChatInput } from "@orb/contracts/chat";
import type { BulkImportPersonaInput } from "@orb/contracts/persona";
import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import type { AssetId, CharacterId, PersonaId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImportContext } from "../../../../packages/server/src/domain/import/context.ts";
import type { ImportProfileDeps } from "../../../../packages/server/src/domain/import/contract/service.ts";

const OWNER_ID = castId<UserId>("user_owner");
// A format-VALID asset TypeID (26-char crockford-base32 suffix) — the create schema validates
// `avatarAssetId` through `typeIdSchema`, so the fake store must return a real-shaped id. Static (not
// minted) so it stays deterministic (test-determinism — no unseeded ids under tests/).
const STORED_ASSET_ID = castId<AssetId>("asset_00000000000000000000000000");

interface CreateCall {
  readonly ownerId: UserId;
  readonly input: CreateCharacterInput;
  readonly importedFrom: string | null;
  readonly importHash: string;
}

interface UpdateCall {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly input: UpdateCharacterInput;
}

interface StoreCall {
  readonly ownerId: UserId;
  readonly bytes: Uint8Array;
  readonly mime: string;
}

interface FindCall {
  readonly ownerId: UserId;
  readonly importHash: string;
}

interface FindByHandleCall {
  readonly ownerId: UserId;
  readonly handle: string;
}

interface TagAttachCall {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly tagName: string;
}

interface LorebookCall {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly book: BulkImportLorebookInput;
}

interface LinkBooksCall {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly refs: readonly AttachedBookRef[];
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
  /** Every embedded-lorebook import the verb issued (the injected `importLorebook` op, W1). */
  readonly lorebooks: LorebookCall[];
  /** Every attached-book re-link the verb issued (the injected `linkCarriedBooks` op, PD-144). */
  readonly linkBooks: LinkBooksCall[];
  /** Set what the fake `linkCarriedBooks` returns for the NEXT calls (default: links every carried ref). The
   *  verb skips the embedded-clone fallback when `linked > 0`, so this drives the same-vs-foreign-install split. */
  readonly setLinkOutcome: (outcome: (refs: readonly AttachedBookRef[]) => { linked: number; skipped: number }) => void;
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
  const lorebooks: LorebookCall[] = [];
  const linkBooks: LinkBooksCall[] = [];
  let linkOutcome: (refs: readonly AttachedBookRef[]) => { linked: number; skipped: number } = (refs) => ({ linked: refs.length, skipped: 0 });
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
    importLorebook: (args) => {
      lorebooks.push(args);
      return Promise.resolve({
        worldBookId: castId<WorldBookId>("world_book_00000000000000000000000000"),
        entryCount: args.book.entries.length,
        replaced: false,
      });
    },
    linkCarriedBooks: (args) => {
      linkBooks.push(args);
      return Promise.resolve(linkOutcome(args.refs));
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
    lorebooks,
    linkBooks,
    setLinkOutcome: (outcome): void => {
      linkOutcome = outcome;
    },
    setExisting: (importHash, characterId): void => {
      existingByHash.set(importHash, characterId);
    },
    setExistingHandle: (handle, characterId): void => {
      existingByHandle.set(handle, characterId);
    },
  };
}

// ── the PROFILE-wave harness (Option B; PD-77): a `ctx.profile` over RECORDING FAKES — the chats/personas
// verbs perform NO db access, they translate ST → the canonical bulk-import input and delegate the WRITE to
// the injected `bulkImportChats`/`bulkImportPersonas` ops. The import VERB tests exercise the ST→input mapping
// + the PD-78 backfill gate against these fakes; the db-write correctness is pinned in the chat/persona
// persistence mirror int-tests. No `freshDb` for import (import fabricates no db).

/** A fixed clock for the profile harness (deterministic — no unseeded time under tests/). */
const IMPORT_NOW = 1_700_000_000_000;

/** One recorded `bulkImportChats` call (the ST→canonical mapping assertion surface). */
interface BulkChatsCall {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly chats: readonly BulkImportChatInput[];
}

/** One recorded `bulkImportPersonas` call. */
interface BulkPersonasCall {
  readonly ownerId: UserId;
  readonly personas: readonly BulkImportPersonaInput[];
}

export interface ProfileHarness {
  readonly ctx: ImportContext;
  readonly profile: ImportProfileDeps;
  /** Every `bulkImportChats` call the verb issued (the ST→canonical mapping assertion surface). */
  readonly chatCalls: BulkChatsCall[];
  /** Every `bulkImportPersonas` call the verb issued. */
  readonly personaCalls: BulkPersonasCall[];
  /** Every `enqueueBackfill` call (the PD-78 gate assertion surface). */
  readonly backfills: { readonly ownerId: UserId }[];
  /** Every inline `reconcileStats` call. */
  readonly reconciles: { readonly ownerId: UserId }[];
}

/** Build a profile-wave `ImportContext` over recording fakes, owned by `ownerId`. The fake `bulkImportChats`
 *  derives its counts from the mapped input (so the backfill gate — `realConversationWritten` — reflects the
 *  verb's ST→canonical mapping); the fake `bulkImportPersonas` returns an `idByName` for every input name. */
export function makeProfileHarness(ownerId: UserId): ProfileHarness {
  const chatCalls: BulkChatsCall[] = [];
  const personaCalls: BulkPersonasCall[] = [];
  const backfills: { ownerId: UserId }[] = [];
  const reconciles: { ownerId: UserId }[] = [];
  let personaSeq = 0;

  const profile: ImportProfileDeps = {
    now: (): number => IMPORT_NOW,
    personaByUserName: new Map<string, PersonaId>(),
    bulkImportChats: (args) => {
      chatCalls.push(args);
      const realConversationWritten = args.chats.some((c) => c.isRealConversation);
      return Promise.resolve({
        chatsImported: args.chats.length,
        chatsSkipped: 0,
        messagesImported: args.chats.reduce((n, c) => n + c.messages.length, 0),
        variantsImported: args.chats.reduce((n, c) => n + c.messages.reduce((v, m) => v + m.variants.length, 0), 0),
        branchesLinked: 0,
        realConversationWritten,
      });
    },
    bulkImportPersonas: (args) => {
      personaCalls.push(args);
      const idByName: Record<string, PersonaId> = {};
      let defaultPersonaId: PersonaId | null = null;
      let created = 0;
      for (const p of args.personas) {
        const key = p.name.trim().toLowerCase();
        if (key.length === 0) {
          continue;
        }
        if (idByName[key] === undefined) {
          personaSeq += 1;
          idByName[key] = castId<PersonaId>(`persona_${String(personaSeq).padStart(26, "0")}`);
          created += 1;
        }
        if (p.isDefault) {
          defaultPersonaId = idByName[key];
        }
      }
      return Promise.resolve({
        personasCreated: created,
        personasSkipped: args.personas.length - created,
        defaultPersonaId,
        idByName,
      });
    },
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
    throw new Error("import profile harness: card op not wired (chats/personas verbs must not call it)");
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
  return { ctx, profile, chatCalls, personaCalls, backfills, reconciles };
}
