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

import type { MaterializeBackgroundOp } from "@orb/contracts/theme";
import type { DatabaseHandle } from "@orb/db/wiring";
import { readSeedBackground, SEED_BACKGROUND_PLATES } from "@orb/default-content";
import type { RoleClientsWithSignal, SideGenSampling } from "@orb/inference";
import type { CharacterId, IdSource, UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { AssetsContext, AssetsService, MaterializeBackgroundDeps } from "#domain/assets";
import { createAssetsService, createBackgroundStore, createMaterializeBackground, createSeedPlateStore } from "#domain/assets";
import type { CharacterService, DefaultCharacterSeeder } from "#domain/character";
import {
  createCharacterOwned,
  createCharacterService,
  createDefaultCharacterSeeder,
  createGalleryCharacterOps,
  createGreetingCompletion,
  createGreetingTemplate,
  createLinkCharacterAvatars,
  migrateSeededCardBackgrounds,
} from "#domain/character";
import { createLoadChatAssetRefs, createLoadCoParticipantOwner, migrateSeededRoomBackgrounds } from "#domain/chat";
import type { DefaultPersonaSeeder, DefaultPersonaSeederDeps, PersonaService } from "#domain/persona";
import { createDefaultPersonaSeeder, createFindSeededDefault } from "#domain/persona";
import type { PresetService } from "#domain/preset";
import { createReadOptionalPresetConfig } from "#domain/preset";
import { createCharacterIndexPublication } from "#domain/search";
import type { DefaultBackgroundSeeder, SettingsService } from "#domain/settings";
import {
  createBackgroundSeedSettings,
  createDefaultBackgroundSeeder,
  createMarkWelcomeAssistant,
  createPersonaSeedSettings,
  createReadDefaultPresetId,
  createSeedBackgroundRewriter,
} from "#domain/settings";
import { createStatsBatchWiring } from "#domain/stats";
import type { TagService } from "#domain/tag";
import { createSeedCardTag } from "#domain/tag";
import type { BulkImportLorebook, HasPrimaryBook } from "#domain/world-info";
import { createCopyCharacterBooks } from "#domain/world-info";
import { isAutomatedPersonaSeedEnabled } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import type { ImageAdapter } from "#infra/image";
import type { Cas, VariantCache } from "#infra/storage";
import type { LiveBuses } from "#transport/trpc";

import { minter } from "./minter.ts";
import { createSeedAvatarOps } from "./seed-avatar-ops.ts";

/** What the assets/character seam needs from the composition root. `getPreset`/`getPersona` are the request-time
 *  forward-ref getters (those services compose later); `materializeBackground` is the keystone's late-bound holder
 *  (character/seeders reference it, and this seam returns the real op the keystone rebinds onto the holder). */
export interface AssetsCharacterComposeDeps {
  readonly emitUserEvent: LiveBuses["user"]["publishUserEvent"];

  readonly fetchImpl?: MaterializeBackgroundDeps["fetchImpl"];
  readonly idSource?: IdSource;
  readonly db: DatabaseHandle;
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
  /** The caller's Utility-role preset params (D299). */
  readonly resolveUtilityPresetParams: (userId: UserId) => Promise<SideGenSampling | undefined>;
  /** Request-time forward-ref: the persona service (composes after this seam) — the persona seeder's create
   *  plus the `list` its layer-2 artifact probe reads (`createPersonaSeedLatch`). */
  readonly getPersona: () => Pick<PersonaService, "create" | "list">;
  /** World-info's lorebook import pair, composed after this seam (world-info builds over character). Read at
   *  seed time, never during composition. */
  readonly getLorebookImport: () => { readonly importLorebook: BulkImportLorebook; readonly hasPrimaryBook: HasPrimaryBook };
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
   *  card pack dresses through its `resolvePlate`. */
  readonly backgroundSeeder: DefaultBackgroundSeeder;
  readonly materializeBackgroundOp: MaterializeBackgroundOp;
  /** Does `ownerId` own `characterId`? The same read `assetsCtx.assertCharacterOwned` gates the gallery add on. */
  readonly characterOwned: (ownerId: UserId, characterId: CharacterId) => Promise<boolean>;
}

/** Bind each canonical owner; persona identifies its artifact, settings repairs picks and completes the latch. */
export function createPersonaSeedLatch(deps: {
  readonly settings: Pick<SettingsService, "getUserSettings" | "updateUserSettingsSection">;
  readonly getPersona: () => Pick<PersonaService, "list">;
}): Pick<DefaultPersonaSeederDeps, "isSeeded" | "findSeededDefault" | "markSeeded"> {
  return {
    ...createPersonaSeedSettings(deps.settings),
    findSeededDefault: createFindSeededDefault((params) => deps.getPersona().list(params)),
  };
}

export function buildAssetsCharacter(deps: AssetsCharacterComposeDeps): AssetsCharacterComposeResult {
  const { db, now, cas, variants, imageAdapter, tag, roleClientsFor, settings } = deps;

  // The gallery add verb's subject gate and imagery's auto-add gate both close over this one read.
  const characterOwned = createCharacterOwned(db);

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
    newAssetId: minter(ID_PREFIX.asset, deps.idSource),
    newGalleryItemId: minter(ID_PREFIX.galleryItem, deps.idSource),
    // The cross-domain avatar-pointer write, delivered as the OWNING domain's op (character owns
    // `characters.avatarAssetId`) — the persona `createBulkImportPersonas` shape. Built from character's
    // own persistence factory, not re-implemented here.
    linkCharacterAvatars: createLinkCharacterAvatars({ db, now }),
    assertCharacterOwned: characterOwned,
    loadCoParticipantOwner: createLoadCoParticipantOwner({ db }),
    loadChatAssetRefs: createLoadChatAssetRefs({ db }),
  };
  const assets = createAssetsService(assetsCtx);
  // Now that `assets` exists, bind the real materializeBackground op (the holder above forwards to it). Full
  // public-internet SSRF firewall (ANY_HOST, unconditional public-address pin) — this is a user-pasted URL; the
  // image magic-belt + the effective per-image byte cap bound the download (side-eye F-P0-2).
  const materializeBackgroundOp = createMaterializeBackground({
    ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
    storeBackground: createBackgroundStore({ store: (params) => assets.store(params), maxBytes: () => deps.maxImageBytes() }),
    maxBytes: () => deps.maxImageBytes(),
  });

  const character = createCharacterService({
    db,
    bumpStatsCanonVersion: createStatsBatchWiring(deps.idSource).bumpStatsCanonVersion,
    now,
    newCharacterId: minter(ID_PREFIX.character, deps.idSource),
    newSnapshotId: minter(ID_PREFIX.characterSnapshot, deps.idSource),

    audit: deps.audit,
    emit: deps.emit,
    // Every card write also drops the owner's lexical index, so the next text search rebuilds over the live
    // card set: a deleted card leaves both the hits and the coverage counts.
    emitUserEvent: createCharacterIndexPublication(deps.emitUserEvent),
    // F-P0-2: a `kind:"external"` carried card background is materialized into an owned CAS asset at update.
    materializeBackground: deps.materializeBackground,
    // Best-effort: remove/bulk-remove wrap it in try/catch, so a reap failure never fails the delete —
    // the orphan self-heals on the next collectGarbage sweep.
    reapAssets: async (assetIds): Promise<void> => {
      await assets.reapIfOrphan(assetIds);
    },
    attachCardTag: tag.attachCardTagByName,
    detachCardTag: tag.detachCardTagByName,
    // World-info owns the character_books junction — the duplicate carry is its persistence factory,
    // wired here directly (world-info's full service composes after chat, below).
    copyCharacterBooks: createCopyCharacterBooks({ db, now }),
    resolveGreetingTemplate: createGreetingTemplate({
      readDefaultPresetId: createReadDefaultPresetId(settings),
      readPresetConfig: createReadOptionalPresetConfig((params) => deps.getPreset().get(params)),
    }),
    generateGreetingText: createGreetingCompletion({
      resolveUtilityPresetParams: (userId) => deps.resolveUtilityPresetParams(userId),
      roleClientsFor: (userId) => roleClientsFor(userId),
    }),
  });

  // The live assets ctx extended with the two character-handle resolvers the gallery export/import verbs
  // need. Wired after `character` so the forward reference resolves.
  const galleryCtx: AssetsContext = { ...assetsCtx, ...createGalleryCharacterOps(db, character) };

  // The SCENE-PLATE seeder, built BEFORE the card seeder because the card pack's dressing resolves its
  // plate through this one (`resolveSeededBackground` below). It is the composition point where the three
  // halves meet that no single domain may see at once: the shipped BYTES (`@orb/default-content`), the CAS
  // write (`assets.store`), the settings library (`domain/settings`), and the three raw-JSON rewrites that
  // retire `kind:"seeded"` across settings, cards and rooms.
  const backgroundSeeder = createDefaultBackgroundSeeder({
    plates: SEED_BACKGROUND_PLATES,
    storePlate: createSeedPlateStore({ readPlate: readSeedBackground, store: (params) => assets.store(params) }),
    newEntryId: deps.newBackgroundEntryId,
    ...createBackgroundSeedSettings(settings),
    rewriteSeededReferences: createSeedBackgroundRewriter({
      db,
      now,
      migrateCards: (userId, resolve, at) => migrateSeededCardBackgrounds(db, userId, resolve, at),
      migrateRooms: (userId, resolve, at) => migrateSeededRoomBackgrounds(db, userId, resolve, at),
    }),
  });

  const seedAvatars = createSeedAvatarOps(assets);

  // The one idempotent instance boot + the app first-request hook share.
  const characterSeeder = createDefaultCharacterSeeder({
    resolveSeededBackground: backgroundSeeder.resolvePlate,
    importLorebook: (args) => deps.getLorebookImport().importLorebook(args),
    hasPrimaryBook: (args) => deps.getLorebookImport().hasPrimaryBook(args),
    characters: character,
    attachCardTag: createSeedCardTag((params) => tag.attachCardTagByName(params)),
    ...seedAvatars.character,
    markWelcomeAssistant: createMarkWelcomeAssistant(settings),
  });

  // Mirror of characterSeeder, for the default `{{user}}` persona.
  const personaSeeder = createDefaultPersonaSeeder({
    autoSeedEnabled: isAutomatedPersonaSeedEnabled,
    createPersona: (params) => deps.getPersona().create(params),
    ...seedAvatars.persona,
    ...createPersonaSeedLatch({ settings, getPersona: deps.getPersona }),
  });

  return { assetsCtx, assets, character, galleryCtx, characterSeeder, personaSeeder, backgroundSeeder, materializeBackgroundOp, characterOwned };
}
