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
import type { ProseOverrides } from "@orb/contracts/prose";
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
import { readSeedAvatar, readSeedBackground, SEED_BACKGROUND_PLATES } from "@orb/default-content";
import type { RoleClientsWithSignal, SideGenSampling } from "@orb/inference";
import { resolveSideGenSampling } from "@orb/inference";
import type { AssetId, CharacterHandle, PersonaId, PresetId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { AssetsContext, AssetsService } from "#domain/assets";
import { createAssetsService } from "#domain/assets";
import type { CharacterService, DefaultCharacterSeeder } from "#domain/character";
import { createCharacterService, createDefaultCharacterSeeder, createLinkCharacterAvatars, migrateSeededCardBackgrounds } from "#domain/character";
import { migrateSeededRoomBackgrounds } from "#domain/chat";
import type { PersonaService } from "#domain/persona";
import type { PresetService } from "#domain/preset";
import { PresetNotFoundError } from "#domain/preset";
import type { DefaultBackgroundSeeder, SeededPlateAsset, SettingsService } from "#domain/settings";
import { createDefaultBackgroundSeeder, migrateSeededBackgroundPicks } from "#domain/settings";
import { bumpStatsCanonVersion } from "#domain/stats";
import type { TagService } from "#domain/tag";
import { createCopyCharacterBooks } from "#domain/world-info";
import { env } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import type { ImageAdapter } from "#infra/image";
import type { Cas, VariantCache } from "#infra/storage";
import { publishUserEvent } from "../../transport/trpc/index.ts";
import type { DefaultPersonaSeeder, DefaultPersonaSeederDeps } from "../boot/index.ts";
import { createDefaultPersonaSeeder } from "../boot/index.ts";
import { createMaterializeBackground } from "./materialize-background.ts";
import { minter } from "./minter.ts";

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
  /** The per-FUNDER role-client binder (§8.5b) — the greeting studio spends the CALLER's own `summarize` row. */
  readonly roleClientsFor: (funderUserId: UserId) => Promise<Pick<RoleClientsWithSignal, "summarize">>;
  /** The keystone's late-bound materializeBackground holder (character + seeders reference it at request time). */
  readonly materializeBackground: MaterializeBackgroundOp;
  /** LIVE effective per-image byte cap (the background materialize belt reads it per download). */
  readonly maxImageBytes: () => number;
  /** LIVE effective image-variant quality (item 6) — folded into the variant cache key so a retune regenerates. */
  readonly imageVariantQuality: () => number;
  readonly settings: Pick<SettingsService, "getUserSettings" | "updateUserSettingsSection">;
  /** Mints one `appearance.backgroundLibrary` row id — the SAME minter the settings service uses for an
   *  upload/`addExternalBackground` entry, so a seeded plate's row is indistinguishable from a user's own. */
  readonly newBackgroundEntryId: () => string;
  /** Request-time forward-ref: the preset service (composes after this seam) — the greeting-template resolver. */
  readonly getPreset: () => Pick<PresetService, "get">;
  /** The caller's default-preset generation params (the side-gen sampling ladder's TOP rung). */
  readonly resolveUserPresetParams: (userId: UserId) => Promise<SideGenSampling>;
  /** Request-time forward-ref: the persona service (composes after this seam) — the persona seeder's create
   *  plus the `list` its layer-2 artifact probe reads (`createPersonaSeedLatch`). */
  readonly getPersona: () => Pick<PersonaService, "create" | "list">;
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
  /** The per-user SCENE-PLATE seeder — boot + the first-authed-request hook run `ensureSeeded`; the card and
   *  demo-chat packs dress through its `resolvePlate`. */
  readonly backgroundSeeder: DefaultBackgroundSeeder;
  readonly materializeBackgroundOp: MaterializeBackgroundOp;
}

/** The default-persona seeder's three SETTINGS/LIBRARY-backed ops: the persisted latch (layer 1), the
 *  artifact probe (layer 2 — `metadata.seededDefault`, #461), and the mark.
 *
 *  THE PICK LAW, which is why this is a named factory and not an inline literal: `markSeeded` may point
 *  `seeds.defaultPersonaId`/`currentPersonaId` at the freshly-seeded row ONLY while they are still null. An
 *  explicit pick — the first-run dialog's, the picker's, an import's — outranks the seeder permanently, and
 *  the two pointers are decided INDEPENDENTLY (a user who pinned a default but never switched their current
 *  gets the current filled and the default left alone). Extracted so that law is provable over the real
 *  settings + persona services; the seeder itself never imports a domain, so it cannot own this.
 *
 *  THE LATCH IS WRITTEN LAST (#1412) — see `markSeeded` for why the order IS the invariant here. A prior
 *  ruling on this factory said the layer-2 heal must not hand over the surviving row's id ("would relitigate
 *  a pick the user may have made"); its MECHANISM survives untouched — the `=== null` guards below are what
 *  make relitigating impossible — while its premise does not cover a pointer that is already null, which is
 *  exactly the state the #461 blob-reset leaves behind and the state the heal now repairs.
 *
 * @public Test-anchored module surface; the pick law is pinned at `tests/server/entry/compose/assets-character.int.test.ts`.
 */
export function createPersonaSeedLatch(deps: {
  readonly settings: Pick<SettingsService, "getUserSettings" | "updateUserSettingsSection">;
  readonly getPersona: () => Pick<PersonaService, "list">;
}): Pick<DefaultPersonaSeederDeps, "isSeeded" | "findSeededDefault" | "markSeeded"> {
  return {
    isSeeded: async (principal): Promise<boolean> => (await deps.settings.getUserSettings({ principal })).config.onboarding.defaultPersonaSeeded,
    findSeededDefault: async (principal): Promise<PersonaId | null> =>
      (await deps.getPersona().list({ principal })).find((row) => row.metadata?.seededDefault === true)?.id ?? null,
    markSeeded: async (principal, seededPersonaId): Promise<void> => {
      // POINTERS FIRST, LATCH LAST (#1412). The two settings sections cannot be written in one call, so the
      // ORDER is the only atomicity available — and it decides what a crash between them means. Latch-first
      // committed "this user is seeded" before it was true: `isSeeded` short-circuits `seed()` ahead of the
      // layer-2 heal, so a created persona with null pointers was permanently unrepairable. Latch-last makes
      // the latch a COMPLETENESS claim: an interruption leaves it false, the next touch re-enters `seed()`,
      // layer 2 recognises the surviving artifact and repairs the pointers.
      //
      // The read below is check-then-act over a section this same request is about to patch, so a concurrent
      // explicit pick landing between the read and the write can still lose (a NARROW window: it is the
      // freshest possible read immediately preceding its own write, not a stale snapshot). Closing it needs a
      // CONDITIONAL section write in `domain/settings`, which does not exist; that is a settings-domain
      // change, not a composition-root one.
      const current = (await deps.settings.getUserSettings({ principal })).config;
      const patch: { defaultPersonaId?: PersonaId; currentPersonaId?: PersonaId } = {};
      // THE PICK LAW, unchanged: only a pointer that is genuinely NULL is filled, and the two are decided
      // independently — an explicit pick outranks the seeder permanently, on the heal path too.
      if (current.seeds.defaultPersonaId === null) {
        patch.defaultPersonaId = seededPersonaId;
      }
      if (current.seeds.currentPersonaId === null) {
        patch.currentPersonaId = seededPersonaId;
      }
      if (Object.keys(patch).length > 0) {
        await deps.settings.updateUserSettingsSection({
          principal,
          input: { section: "seeds", patch },
        });
      }
      await deps.settings.updateUserSettingsSection({
        principal,
        input: { section: "onboarding", patch: { defaultPersonaSeeded: true } },
      });
    },
  };
}

export function buildAssetsCharacter(deps: AssetsCharacterComposeDeps): AssetsCharacterComposeResult {
  const { db, now, cas, variants, imageAdapter, tag, roleClientsFor, settings } = deps;

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
    // The cross-domain avatar-pointer write, delivered as the OWNING domain's op (character owns
    // `characters.avatarAssetId`) — the persona `createBulkImportPersonas` shape. Built from character's
    // own persistence factory, not re-implemented here.
    linkCharacterAvatars: createLinkCharacterAvatars({ db, now }),
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
        .selectDistinct({
          assetId: assetsTable.id,
          hash: assetsTable.hash,
          mime: assetsTable.mime,
          width: assetsTable.width,
          height: assetsTable.height,
        })
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
    bumpStatsCanonVersion,
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
    // the bundle is bound for the caller — their own `summarize` connection, never a box owner's (§8.5b).
    resolveGreetingTemplate: async ({ caller, kind }): Promise<{ template: string; prose: ProseOverrides }> => {
      const defaultPresetId = (await settings.getUserSettings({ principal: caller })).config.seeds.defaultPresetId;
      const fallback = DEFAULT_GUIDED_ACTIONS[kind].prompt;
      // No preset (or an unreadable one) ⇒ the contract default template and NO prose overrides, which
      // resolves every transform fragment to its shipped default — the pre-fork bytes exactly.
      if (defaultPresetId === null) {
        return { template: fallback, prose: {} };
      }
      try {
        const detail = await deps.getPreset().get({ userId: caller.userId, id: castId<PresetId>(defaultPresetId) });
        // The SAME `promptConfig.prose` blob the chat assembly seam composes for a turn (the fork's ARM B):
        // the studio's transform fragments are preset-homed slots, so the caller's preset is their storage.
        // `config.prose` is `prefault({})` at the schema, so a preset that never carried one still resolves
        // every transform fragment to its shipped default.
        return { template: detail.config.guidedActions?.[kind].prompt ?? fallback, prose: detail.config.prose };
      } catch (err) {
        // Only a genuinely stale/unowned/missing preset id degrades to the contract default template — a
        // database, I/O, or program failure must surface, never silently substitute the shipped default
        // prose/template for the caller's configured one.
        if (err instanceof PresetNotFoundError) {
          return { template: fallback, prose: {} };
        }
        throw err;
      }
    },
    generateGreetingText: async ({ caller, prompt }): Promise<{ text: string; costUsd: number | null }> => {
      // The side-gen sampling ladder: the `greeting_studio` floor ← the caller's default-preset params (the
      // ONE user-owned rung — there is no per-template override; owner ruling 2026-08-01). The resolved posture
      // is the summarize options as-is; an absent knob is omitted (the backend default stands).
      const presetParams = await deps.resolveUserPresetParams(caller.userId);
      const posture = resolveSideGenSampling(SIDE_GEN_POSTURES.greeting_studio, presetParams);
      const rc = await roleClientsFor(caller.userId);
      const res = await rc.summarize([{ systemPrompt: prompt, userPrompt: "" }], posture);
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

  // The SCENE-PLATE seeder, built BEFORE the card seeder because the card pack's dressing resolves its
  // plate through this one (`resolveSeededBackground` below). It is the composition point where the three
  // halves meet that no single domain may see at once: the shipped BYTES (`@orb/default-content`), the CAS
  // write (`assets.store`), the settings library (`domain/settings`), and the three raw-JSON rewrites that
  // retire `kind:"seeded"` across settings, cards and rooms.
  const backgroundSeeder = createDefaultBackgroundSeeder({
    plates: SEED_BACKGROUND_PLATES,
    // A missing bundled file / store hiccup returns null → that ONE plate is skipped (never blocks the seed).
    storePlate: async (principal, slug): Promise<SeededPlateAsset | null> => {
      const art = await readSeedBackground(slug);
      if (art === null) {
        return null;
      }
      // `kind: "background"` is the ONE kind a background may be (`domain/settings`'s
      // `BACKGROUND_ASSET_KIND`) — the same kind the upload field and the pasted-URL materializer store, so
      // the settings write predicate accepts a seeded plate exactly as it accepts an upload. The CAS is
      // content-addressed, so a re-seed resolves the same asset instead of duplicating the bytes.
      const stored = await assets.store({ principal, bytes: art.bytes, kind: "background", mime: art.mime, enforceMagic: true });
      return { assetId: stored.assetId, assetHash: stored.hash, mime: art.mime };
    },
    newEntryId: deps.newBackgroundEntryId,
    readOnboarding: async (principal) => ({ seeded: (await settings.getUserSettings({ principal })).config.onboarding.defaultBackgroundsSeeded }),
    readLibrary: async (principal) => (await settings.getUserSettings({ principal })).config.appearance.backgroundLibrary,
    writeLibrary: async (principal, library): Promise<void> => {
      await settings.updateUserSettingsSection({
        principal,
        input: { section: "appearance", patch: { backgroundLibrary: library.map((entry) => ({ ...entry })) } },
      });
    },
    markSeeded: async (principal): Promise<void> => {
      await settings.updateUserSettingsSection({
        principal,
        input: { section: "onboarding", patch: { defaultBackgroundsSeeded: true } },
      });
    },
    // The three storage locations of a retired `kind:"seeded"` reference, each rewritten by the domain that
    // OWNS its table. They are summed rather than chained-with-early-exit: a user can carry a legacy
    // reference in any subset of the three, and a zero from one says nothing about the others.
    rewriteSeededReferences: async (userId, resolve): Promise<number> => {
      const at = now();
      const picks = await migrateSeededBackgroundPicks(db, userId, resolve, at);
      const cards = await migrateSeededCardBackgrounds(db, userId, resolve, at);
      const rooms = await migrateSeededRoomBackgrounds(db, userId, resolve, at);
      return picks + cards + rooms;
    },
  });

  // The one idempotent instance boot + the app first-request hook share.
  const characterSeeder = createDefaultCharacterSeeder({
    resolveSeededBackground: backgroundSeeder.resolvePlate,
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
    },
    isSeeded: async (principal): Promise<boolean> => (await settings.getUserSettings({ principal })).config.onboarding.defaultCharactersSeeded,
    // The pack stamp: an already-latched library trailing CARD_PACK_VERSION gets the reseed migration.
    readPackVersion: async (principal): Promise<number> => (await settings.getUserSettings({ principal })).config.onboarding.defaultCharactersPackVersion,
    markPackVersion: async (principal, version): Promise<void> => {
      await settings.updateUserSettingsSection({
        principal,
        input: { section: "onboarding", patch: { defaultCharactersPackVersion: version } },
      });
    },
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

  // Mirror of characterSeeder, for the default `{{user}}` persona. The bundled art keeps its `persona-you`
  // seed-asset key — that is a FILE key, not the display name, and renaming it would be a pack migration.
  const personaSeeder = createDefaultPersonaSeeder({
    // AUTOMATION-ONLY auto-create (the forced-first-run redesign — `boot/seed-default-persona.ts` header):
    // a stack an agent/script booted seeds Traveler so no dev regen or e2e boot ever hits the blocking ask;
    // a REAL stack seeds nothing, so the zero-personas first-run trigger holds and the human names their own
    // `{{user}}`. Read per call (not captured) so the frozen env stays the single source.
    autoSeedEnabled: (): boolean => env.E2E_HARNESS === "on" || env.DEV_SEED === "on",
    createPersona: async ({ principal, input }): Promise<{ id: PersonaId }> => {
      const detail = await deps.getPersona().create({ principal, input });
      return { id: detail.id };
    },
    storeAvatar: async (principal): Promise<AssetId | null> => {
      const art = await readSeedAvatar(castId<CharacterHandle>("persona-you"));
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
    ...createPersonaSeedLatch({ settings, getPersona: deps.getPersona }),
  });

  return { assetsCtx, assets, character, galleryCtx, characterSeeder, personaSeeder, backgroundSeeder, materializeBackgroundOp };
}
