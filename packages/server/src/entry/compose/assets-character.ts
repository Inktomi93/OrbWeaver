// Composition seam for assets (+ the co-participant / chat-asset-ref resolvers and the gallery-extended ctx) and
// character (+ the greeting-studio closures) and the two default seeders (character + persona). Owns no business
// logic — it wires each service's injected ops onto the already-built infra handles (CAS, variant cache, image
// adapter) + sibling front doors (tag attach/detach, the world-info copyCharacterBooks factory).
//
// TWO deferred wirings this seam threads:
//   1. `materializeBackground` LATE-BIND — the real op needs `assets` (built here) + the live max-bytes getter,
//      but settings/character/chat compose over the holder BEFORE assets exists. The keystone mints the holder;
//      this seam returns the constructed op so the keystone rebinds it once assets is live (the spriteSheetOps
//      pattern — invoked only when a user pastes an external background URL, long after wiring).
//   2. FORWARD-REFS `persona` + `preset` — the persona seeder's `createPersona` and character's greeting-template
//      resolver deref services built LATER (search-discovery). The keystone threads them as request-time getters.

import { DEFAULT_GUIDED_ACTIONS, SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import {
  assets as assetsTable,
  characters as charactersTable,
  chatParticipants,
  messageAssets,
  messages as messagesTable,
  personas as personasTable,
} from "@orb/db";
import type { AssetId, PersonaId, PresetId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { toSummarizeOptions } from "@orb/server/kit/side-gen-posture";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { AssetsContext, AssetsService } from "#domain/assets";
import { createAssetsService } from "#domain/assets";
import type { CharacterService, DefaultCharacterSeeder } from "#domain/character";
import { createCharacterService, createDefaultCharacterSeeder } from "#domain/character";
import type { PersonaService } from "#domain/persona";
import type { PresetService } from "#domain/preset";
import type { SettingsService } from "#domain/settings";
import type { TagService } from "#domain/tag";
import { createCopyCharacterBooks } from "#domain/world-info";
import type { AuditEntry } from "#foundation/observability";
import type { ImageAdapter } from "#infra/image";
import type { RoleClientsWithSignal } from "#infra/providers";
import type { Cas, VariantCache } from "#infra/storage";
import { publishUserEvent } from "../../transport/trpc";
import type { DefaultPersonaSeeder } from "../boot";
import { createDefaultPersonaSeeder } from "../boot";
import { readSeedAvatar, readSeedGalleryPiece } from "../boot/seed-assets";
import { createMaterializeBackground } from "./materialize-background";
import { minter } from "./minter";

/** What the assets/character seam needs from the composition root. `getPreset`/`getPersona` are the request-time
 *  forward-ref getters (those services compose later); `materializeBackground` is the keystone's late-bound holder
 *  (character/seeders reference it, and this seam returns the real op the keystone rebinds onto the holder). */
export interface AssetsCharacterComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly cas: Cas;
  readonly variants: VariantCache;
  readonly imageAdapter: ImageAdapter;
  readonly emit: AssetsContext["emit"];
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
  readonly tag: Pick<TagService, "attachCardTagByName" | "detachCardTagByName">;
  readonly roleClients: Pick<RoleClientsWithSignal, "summarize">;
  /** The keystone's late-bound materializeBackground holder (character + seeders reference it at request time). */
  readonly materializeBackground: MaterializeBackgroundOp;
  /** LIVE effective per-image byte cap (the background materialize belt reads it per download). */
  readonly maxImageBytes: () => number;
  /** LIVE effective image-variant quality (item 6) — folded into the variant cache key so a retune regenerates. */
  readonly imageVariantQuality: () => number;
  readonly settings: Pick<SettingsService, "getUserSettings" | "updateUserSettingsSection">;
  /** Request-time forward-ref: the preset service (composes after this seam) — the greeting-template resolver. */
  readonly getPreset: () => Pick<PresetService, "get">;
  /** The caller's default-preset generation params (the side-gen sampling ladder's TOP rung). */
  readonly resolveUserPresetParams: (userId: UserId) => Promise<SideGenSampling>;
  /** Request-time forward-ref: the persona service (composes after this seam) — the persona seeder's create. */
  readonly getPersona: () => Pick<PersonaService, "create">;
}

/** The assets/character compose product. `materializeBackgroundOp` is the constructed op the keystone rebinds
 *  onto its late-bound holder now that `assets` is live. */
export interface AssetsCharacterComposeResult {
  readonly assetsCtx: AssetsContext;
  readonly assets: AssetsService;
  readonly character: CharacterService;
  readonly galleryCtx: AssetsContext;
  readonly characterSeeder: DefaultCharacterSeeder;
  readonly personaSeeder: DefaultPersonaSeeder;
  readonly materializeBackgroundOp: MaterializeBackgroundOp;
}

export function buildAssetsCharacter(deps: AssetsCharacterComposeDeps): AssetsCharacterComposeResult {
  const { db, now, cas, variants, imageAdapter, tag, roleClients, settings } = deps;

  // Captured as a named const so the portability registry's gallery descriptor can reuse it.
  const assetsCtx: AssetsContext = {
    db,
    cas,
    variants,
    imageTransform: imageAdapter.transform,
    imageVariantQuality: deps.imageVariantQuality,
    imageProbe: imageAdapter.probe,
    emit: deps.emit,
    now,
    newAssetId: minter(ID_PREFIX.asset),
    newGalleryItemId: minter(ID_PREFIX.galleryItem),
    assertCharacterOwned: async (ownerId, characterId) => {
      const rows = await db
        .select({ id: charactersTable.id })
        .from(charactersTable)
        .where(and(eq(charactersTable.id, characterId), eq(charactersTable.ownerId, ownerId)))
        .limit(1);
      return rows.length > 0;
    },
    // Roster-avatar reference-check, not a hash→any-owner oracle. Returns an owner only if `hash` is the
    // asset-hash of the `avatarAssetId` of either (a) a character currently rostered in a chat where
    // `callerId` is a present member, or (b) a persona that is a present human participant's
    // `activePersonaId` in a chat where `callerId` is also present (a co-participant's own persona avatar
    // in a shared group chat). Returns `assets.ownerId` (the CAS bytes live in the asset owner's partition).
    loadCoParticipantOwner: async (callerId, hash) => {
      const rosterChar = alias(chatParticipants, "roster_char");
      const callerSeat = alias(chatParticipants, "caller_seat");
      const characterRows = await db
        .select({ ownerId: assetsTable.ownerId })
        .from(assetsTable)
        .innerJoin(charactersTable, eq(charactersTable.avatarAssetId, assetsTable.id))
        .innerJoin(rosterChar, and(eq(rosterChar.characterId, charactersTable.id), eq(rosterChar.kind, "character"), isNull(rosterChar.leftSeq)))
        .innerJoin(callerSeat, and(eq(callerSeat.chatId, rosterChar.chatId), eq(callerSeat.userId, callerId), isNull(callerSeat.leftSeq)))
        .where(eq(assetsTable.hash, hash))
        .limit(1);
      if (characterRows[0] !== undefined) {
        return characterRows[0].ownerId;
      }

      const personaSeat = alias(chatParticipants, "persona_seat");
      const personaCallerSeat = alias(chatParticipants, "persona_caller_seat");
      const personaRows = await db
        .select({ ownerId: assetsTable.ownerId })
        .from(assetsTable)
        .innerJoin(personasTable, eq(personasTable.avatarAssetId, assetsTable.id))
        .innerJoin(personaSeat, and(eq(personaSeat.activePersonaId, personasTable.id), eq(personaSeat.kind, "human"), isNull(personaSeat.leftSeq)))
        .innerJoin(
          personaCallerSeat,
          and(eq(personaCallerSeat.chatId, personaSeat.chatId), eq(personaCallerSeat.userId, callerId), isNull(personaCallerSeat.leftSeq)),
        )
        .where(eq(assetsTable.hash, hash))
        .limit(1);
      if (personaRows[0] !== undefined) {
        return personaRows[0].ownerId;
      }

      // Attachment arm: the hash is an asset structurally referenced by a message_assets row for a message
      // in a chat where both the caller and the asset's owner are present participants.
      const attachOwnerSeat = alias(chatParticipants, "attach_owner_seat");
      const attachCallerSeat = alias(chatParticipants, "attach_caller_seat");
      const attachmentRows = await db
        .select({ ownerId: assetsTable.ownerId })
        .from(assetsTable)
        .innerJoin(messageAssets, eq(messageAssets.assetId, assetsTable.id))
        .innerJoin(messagesTable, eq(messagesTable.id, messageAssets.messageId))
        .innerJoin(
          attachCallerSeat,
          and(eq(attachCallerSeat.chatId, messagesTable.chatId), eq(attachCallerSeat.userId, callerId), isNull(attachCallerSeat.leftSeq)),
        )
        .innerJoin(
          attachOwnerSeat,
          and(eq(attachOwnerSeat.chatId, messagesTable.chatId), eq(attachOwnerSeat.userId, assetsTable.ownerId), isNull(attachOwnerSeat.leftSeq)),
        )
        .where(eq(assetsTable.hash, hash))
        .limit(1);
      return attachmentRows[0]?.ownerId;
    },
    // Chat-scoped resolver a present viewer uses to render inline attachments: a pair is returned only
    // when the asset has a message_assets row for a message in `chatId` AND both owner and caller are
    // present participants. Membership alone is not sufficient — the message_assets FK is the reference.
    loadChatAssetRefs: async (callerId, forChatId, assetIds) => {
      if (assetIds.length === 0) {
        return [];
      }
      const ownerSeat = alias(chatParticipants, "chat_ref_owner_seat");
      const callerSeat = alias(chatParticipants, "chat_ref_caller_seat");
      const rows = await db
        .selectDistinct({ assetId: assetsTable.id, hash: assetsTable.hash })
        .from(assetsTable)
        .innerJoin(messageAssets, eq(messageAssets.assetId, assetsTable.id))
        .innerJoin(messagesTable, eq(messagesTable.id, messageAssets.messageId))
        .innerJoin(callerSeat, and(eq(callerSeat.chatId, messagesTable.chatId), eq(callerSeat.userId, callerId), isNull(callerSeat.leftSeq)))
        .innerJoin(ownerSeat, and(eq(ownerSeat.chatId, messagesTable.chatId), eq(ownerSeat.userId, assetsTable.ownerId), isNull(ownerSeat.leftSeq)))
        .where(and(eq(messagesTable.chatId, forChatId), inArray(assetsTable.id, [...assetIds])));
      return rows;
    },
  };
  const assets = createAssetsService(assetsCtx);
  // Now that `assets` exists, bind the real materializeBackground op (the holder above forwards to it). Full
  // public-internet SSRF firewall (ANY_HOST, no ownerConfiguredEndpoint) — this is a user-pasted URL; the
  // image magic-belt + the effective per-image byte cap bound the download (side-eye F-P0-2).
  const materializeBackgroundOp = createMaterializeBackground({
    storeBackground: (principal, bytes, mime) =>
      assets.store({ principal, bytes, kind: "background", mime, enforceMagic: true, maxBytes: deps.maxImageBytes() }),
    maxBytes: () => deps.maxImageBytes(),
  });

  const character = createCharacterService({
    db,
    now,
    newCharacterId: minter(ID_PREFIX.character),
    newSnapshotId: minter(ID_PREFIX.characterSnapshot),

    audit: deps.audit,
    emit: deps.emit,
    emitUserEvent: publishUserEvent,
    // F-P0-2: a `kind:"external"` carried card background is materialized into an owned CAS asset at update.
    materializeBackground: deps.materializeBackground,
    // Best-effort: remove/bulk-remove wrap it in try/catch, so a reap failure never fails the delete —
    // the orphan self-heals on the next collectGarbage sweep.
    reapAssets: async (assetIds): Promise<void> => {
      await assets.reapIfOrphan(assetIds);
    },
    attachCardTag: tag.attachCardTagByName,
    detachCardTag: tag.detachCardTagByName,
    // PD-141: world-info owns the character_books junction — the duplicate carry is its persistence factory,
    // wired here directly (world-info's full service composes after chat, below).
    copyCharacterBooks: createCopyCharacterBooks({ db, now }),
    // Greeting studio (audit §3). resolveGreetingTemplate reads the CALLER's active-preset guided template
    // (the resolvePromptConfigFor precedent — default preset id from user settings → preset.get → config,
    // falling back to the contract default), so character never imports preset. `preset` is a forward
    // reference resolved at request time (it composes below). generateGreetingText runs the bounded side-LLM
    // completion over the summarize lane (the imagery captionImage precedent) at quiet-generate's floor
    // (temp 0.3, 1024 out — a bounded rewrite, not an open turn); the caller IS the request owner so
    // roleClients (bound for deps.ownerId) is the caller's connection.
    resolveGreetingTemplate: async ({ caller, kind }): Promise<string> => {
      const defaultPresetId = (await settings.getUserSettings({ principal: caller })).config.seeds.defaultPresetId;
      const fallback = DEFAULT_GUIDED_ACTIONS[kind].prompt;
      if (defaultPresetId === null) {
        return fallback;
      }
      try {
        const detail = await deps.getPreset().get({ userId: caller.userId, id: castId<PresetId>(defaultPresetId) });
        return detail.config.guidedActions?.[kind].prompt ?? fallback;
      } catch {
        return fallback;
      }
    },
    generateGreetingText: async ({ caller, prompt }): Promise<{ text: string; costUsd: number | null }> => {
      // The side-gen sampling ladder: the `greeting_studio` floor ← the caller's default-preset params (the
      // ONE user-owned rung — there is no per-template override; owner ruling 2026-08-01). `maxOutputTokens`
      // maps to the summarize seam's `maxTokens`; an absent knob is omitted (the backend default stands).
      const presetParams = await deps.resolveUserPresetParams(caller.userId);
      const posture = resolveSideGenSampling(SIDE_GEN_POSTURES.greeting_studio, presetParams);
      const res = await roleClients.summarize([{ systemPrompt: prompt, userPrompt: "" }], toSummarizeOptions(posture));
      const item = res.items[0];
      return { text: (item?.text ?? "").trim(), costUsd: item?.usage.costUsd ?? null };
    },
  });

  // The live assets ctx extended with the two character-handle resolvers the gallery export/import verbs
  // need. Wired after `character` so the forward reference resolves.
  const galleryCtx: AssetsContext = {
    ...assetsCtx,
    resolveCharacterHandle: async (characterId): Promise<string | null> => {
      const rows = await db.select({ handle: charactersTable.handle }).from(charactersTable).where(eq(charactersTable.id, characterId)).limit(1);
      return rows[0]?.handle ?? null;
    },
    findCharacterByHandle: async ({ ownerId, handle }) => {
      const ref = await character.findByHandle({ ownerId, handle });
      return ref?.characterId ?? null;
    },
  };

  // The one idempotent instance boot + the app first-request hook share.
  const characterSeeder = createDefaultCharacterSeeder({
    characters: character,
    attachCardTag: ({ ownerId, characterId, tagName }): Promise<boolean> =>
      tag.attachCardTagByName({ ownerId, characterId, tagName, source: "card", status: "pending" }),
    // A missing bundled file / store hiccup returns null → the card seeds avatar-less (never blocks the seed).
    storeAvatar: async (principal, handle): Promise<AssetId | null> => {
      const art = await readSeedAvatar(handle);
      if (art === null) {
        return null;
      }
      const stored = await assets.store({
        principal,
        bytes: art.bytes,
        kind: "avatar",
        mime: art.mime,
        enforceMagic: true,
      });
      return stored.assetId;
    },
    seedGallery: async (principal, characterId, handle): Promise<void> => {
      const avatarArt = await readSeedAvatar(handle);
      if (avatarArt !== null) {
        const avatarAsset = await assets.store({
          principal,
          bytes: avatarArt.bytes,
          kind: "avatar",
          mime: avatarArt.mime,
          enforceMagic: true,
        });
        await assets.addToGallery({
          principal,
          assetId: avatarAsset.assetId,
          subjectCharacterId: characterId,
        });
      }
      const galleryArt = await readSeedGalleryPiece(handle);
      if (galleryArt !== null) {
        const galleryAsset = await assets.store({
          principal,
          bytes: galleryArt.bytes,
          kind: "gallery",
          mime: galleryArt.mime,
          enforceMagic: true,
        });
        await assets.addToGallery({
          principal,
          assetId: galleryAsset.assetId,
          subjectCharacterId: characterId,
        });
      }
    },
    isSeeded: async (principal): Promise<boolean> => (await settings.getUserSettings({ principal })).config.onboarding.defaultCharactersSeeded,
    markSeeded: async (principal, welcomeAssistantId): Promise<void> => {
      await settings.updateUserSettingsSection({
        principal,
        input: { section: "onboarding", patch: { defaultCharactersSeeded: true } },
      });
      if (welcomeAssistantId !== null) {
        const current = (await settings.getUserSettings({ principal })).config;
        if (current.seeds.welcomeAssistantCharacterId === null) {
          await settings.updateUserSettingsSection({
            principal,
            input: { section: "seeds", patch: { welcomeAssistantCharacterId: welcomeAssistantId } },
          });
        }
      }
    },
  });

  // Mirror of characterSeeder, for the default "You" persona.
  const personaSeeder = createDefaultPersonaSeeder({
    createPersona: async ({ principal, input }): Promise<{ id: PersonaId }> => {
      const detail = await deps.getPersona().create({ principal, input });
      return { id: detail.id };
    },
    storeAvatar: async (principal): Promise<AssetId | null> => {
      const art = await readSeedAvatar("persona-you");
      if (art === null) {
        return null;
      }
      const stored = await assets.store({
        principal,
        bytes: art.bytes,
        kind: "avatar",
        mime: art.mime,
        enforceMagic: true,
      });
      return stored.assetId;
    },
    isSeeded: async (principal): Promise<boolean> => (await settings.getUserSettings({ principal })).config.onboarding.defaultPersonaSeeded,
    markSeeded: async (principal, seededPersonaId): Promise<void> => {
      await settings.updateUserSettingsSection({
        principal,
        input: { section: "onboarding", patch: { defaultPersonaSeeded: true } },
      });
      if (seededPersonaId !== null) {
        const current = (await settings.getUserSettings({ principal })).config;
        const patch: { defaultPersonaId?: PersonaId; currentPersonaId?: PersonaId } = {};
        if (current.seeds.defaultPersonaId === null) {
          patch.defaultPersonaId = seededPersonaId;
        }
        if (current.seeds.currentPersonaId === null) {
          patch.currentPersonaId = seededPersonaId;
        }
        if (Object.keys(patch).length > 0) {
          await settings.updateUserSettingsSection({
            principal,
            input: { section: "seeds", patch },
          });
        }
      }
    },
  });

  return { assetsCtx, assets, character, galleryCtx, characterSeeder, personaSeeder, materializeBackgroundOp };
}
