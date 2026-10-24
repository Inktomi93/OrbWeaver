import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import { ASSET_UPLOAD_MAX_BYTES } from "@orb/contracts/uploads";
import type { DatabaseHandle } from "@orb/db/wiring";
import type { IdSource, PersonaId, UserId } from "@orb/kit/ids";
import type { AssetsContext, AssetsService } from "#domain/assets";
import { createBackgroundStore } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import type { BulkImportChats } from "#domain/chat";
import { createCompareAndSetImportedTokenUsage, createListImportedTokenUsageCandidates } from "#domain/chat";
import type { DatabankPortabilityContext } from "#domain/databank";
import type { ExportService } from "#domain/export";
import type { ImageryPortabilityService } from "#domain/imagery";
import type { ImportWorkloadDeps, SettleImportMemory } from "#domain/import";
import {
  createEnqueueImportIndex,
  createImportLibraryEmitter,
  createImportWorkloadDrivers,
  createRefreshImportPlannerStats,
  createSettleImportMemory,
  DEFAULT_IMPORT_STAGING_DIR,
} from "#domain/import";
import type { BulkImportPersonas, PersonaService } from "#domain/persona";
import { createFindOwnedPersonaByName } from "#domain/persona";
import type { PresetContext } from "#domain/preset";
import { createImportPresets } from "#domain/preset";
import type { ExportRegexScripts, ImportCardScripts, ImportGlobalScripts, ImportPresetScripts, ImportRegexScript } from "#domain/regex";
import type { ImportRpgGame } from "#domain/rpg";
import type { SettingsContext } from "#domain/settings";
import { createApplyImportedAppearance, createImportTheme } from "#domain/settings";
import { createStatsBatchWiring, reconcileStats } from "#domain/stats";
import type { TagContext, TagService } from "#domain/tag";
import type { WorkloadService } from "#domain/workloads";
import type { AttachOwnedBooksByName, ImportStandaloneLorebook, ImportWorldInfoPort, WorldInfoExportContext } from "#domain/world-info";
import { extractZip, stageDirectory, writeImportReportFile } from "#infra/storage";
import type { LiveBuses } from "#transport/trpc";
import { createNodeFsImportPort, importStagedArchive, runBundleImport, runProfileDirImport } from "../import/index.ts";
import { buildPortabilityRegistry } from "./portability.ts";

const DEFAULT_ST_PROFILE_DIR = ".st-data";

/** What the portability+import seam needs from the composition root. */
export interface PortabilityRunnerComposeDeps {
  readonly quiet: LiveBuses["quiet"]["withQuietBulkFanout"];
  readonly emitUserEvent: LiveBuses["user"]["publishUserEvent"];
  readonly publishChatChanged: LiveBuses["user"]["publishChatChanged"];

  readonly idSource: IdSource;
  readonly db: DatabaseHandle;
  readonly now: () => number;
  readonly tagCtx: TagContext;
  readonly settingsCtx: SettingsContext;
  readonly presetCtx: PresetContext;
  readonly worldInfoExportCtx: WorldInfoExportContext;
  readonly importStandaloneLorebook: ImportStandaloneLorebook;
  /** The gallery-extended assets ctx (the two character-handle resolvers the gallery export/import verbs need). */
  readonly galleryCtx: AssetsContext;
  readonly imageryPortability: ImageryPortabilityService;
  /** The databank portability bundle (db + clock + id minter + the ingest enqueue a restore re-runs). */
  readonly databankCtx: DatabankPortabilityContext;
  readonly persona: PersonaService;
  readonly exportService: ExportService;
  readonly character: CharacterService;
  readonly assets: AssetsService;
  readonly attachCardTag: TagService["attachCardTagByName"];
  /** R6 — the orb-native chat bundle's chat-TAG overlay re-link (D30 per-tagger, resolve-or-create by name). */
  readonly attachChatTag: TagService["attachChatTagByName"];
  /** R6 — the chat-anchored rpg campaign's WRITE half (from the rpg compose seam, which owns the id mints). */
  readonly importRpgGame: ImportRpgGame;
  readonly importWorldInfo: ImportWorldInfoPort;
  /** D121-E: the card LIFT + the `regex` bundle descriptor's two halves (from the regex compose seam). */
  readonly importCardScripts: ImportCardScripts;
  readonly exportRegexScripts: ExportRegexScripts;
  readonly importRegexScript: ImportRegexScript;
  /** The ST profile import's PRESET-scoped + GLOBAL regex lifts (the silent-gap sweep, 2026-08-15). */
  readonly importPresetScripts: ImportPresetScripts;
  readonly importGlobalScripts: ImportGlobalScripts;
  /** The ST world NAME-LINK attach (card `extensions.world` + charLore → the owner's books, by exact name). */
  readonly attachBooksByName: AttachOwnedBooksByName;
  readonly bulkImportChats: BulkImportChats;
  readonly bulkImportPersonas: BulkImportPersonas;
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
  readonly workloads: Pick<WorkloadService, "start">;
  /** The staging root the upload routes wrote under; absent uses the shared import staging default (the same
   *  default the routes resolve, so the contribution reads exactly where the route wrote — and the routes
   *  write, and this reads, under the per-owner subdir `stagedOwnerRoot` derives from it). */
  readonly importStagingDir?: string | undefined;
  readonly stProfileDir?: string | undefined;
  /** Where a real (non-dry) profile import writes its "what landed / what didn't" report. */
  readonly importReportsDir: string;
}

/** The compose product: the registry the delivery core iterates + the deps import's contributions take. */
export interface PortabilityRunnerComposeResult {
  readonly portability: PortabilityRegistry;
  readonly importWorkloads: ImportWorkloadDeps;
  /** The synchronous chat-import route settles its scope through the same op the workload runs use. */
  readonly settleImportMemory: SettleImportMemory;
}

export function buildPortabilityRunner(deps: PortabilityRunnerComposeDeps): PortabilityRunnerComposeResult {
  const { db, now, workloads } = deps;
  const settleImportMemory = createSettleImportMemory(workloads, now);

  const enqueueImportIndex = createEnqueueImportIndex(workloads);
  const reconcileImportStats: ImportWorkloadDeps["reconcileImportStats"] = async ({ ownerId }) => {
    await reconcileStats(db, { ownerId, now, idSource: deps.idSource });
  };
  const findPersonaByName = createFindOwnedPersonaByName(db);
  /** The ST profile importer's cross-domain slice — the ONE spelling, shared by both consumers. */
  const profileImport = {
    character: deps.character,
    storeAvatar: deps.assets.store,
    attachCardTag: deps.attachCardTag,
    importLorebook: deps.importWorldInfo.importLorebook,
    hasPrimaryBook: deps.importWorldInfo.hasPrimaryBook,
    linkCarriedBooks: deps.importWorldInfo.linkCarriedBooks,
    importCardScripts: deps.importCardScripts,
    bulkImportChats: deps.bulkImportChats,
    bulkImportPersonas: deps.bulkImportPersonas,
    enqueueImportIndex,
    reconcileImportStats,
    // R6 — the orb-native chat bundle's three cross-domain re-links (persona by name, the chat-tag overlay,
    // the rpg campaign). Shared by both consumers exactly like the rest of this slice.
    findPersonaByName: ({ ownerId, name }: { readonly ownerId: UserId; readonly name: string }): Promise<PersonaId | null> => findPersonaByName(ownerId, name),
    attachChatTagByName: deps.attachChatTag,
    importRpgGame: deps.importRpgGame,
    findOwnedAssetIdsByHash: deps.assets.ownedAssetIdsByHash,
    resolveOwnerPrincipal: deps.resolveOwnerPrincipal,
  };

  const portability = buildPortabilityRegistry({
    now,
    tagCtx: deps.tagCtx,
    settingsCtx: deps.settingsCtx,
    presetCtx: deps.presetCtx,
    worldInfoExportCtx: deps.worldInfoExportCtx,
    importStandaloneLorebook: deps.importStandaloneLorebook,
    assetsCtx: deps.galleryCtx,
    imagery: deps.imageryPortability,
    databankCtx: deps.databankCtx,
    persona: deps.persona,
    exportService: deps.exportService,
    listOwnedCharacterIds: deps.character.listEmbeddableCharacterIds,
    exportRegexScripts: deps.exportRegexScripts,
    importRegexScript: deps.importRegexScript,
    ...profileImport,
  });

  const stagingRoot = deps.importStagingDir ?? DEFAULT_IMPORT_STAGING_DIR;
  const fs = createNodeFsImportPort();
  const importWorkloads: ImportWorkloadDeps = {
    stagingRoot,
    stProfileDir: deps.stProfileDir ?? DEFAULT_ST_PROFILE_DIR,
    listTokenUsageCandidates: createListImportedTokenUsageCandidates(db),
    compareAndSetTokenUsage: createCompareAndSetImportedTokenUsage(db, createStatsBatchWiring(deps.idSource).bumpStatsCanonVersion),
    ...createImportWorkloadDrivers({
      now,
      quiet: deps.quiet,
      resolveOwnerPrincipal: deps.resolveOwnerPrincipal,
      profile: (principal, { profileRoot, dryRun, signal, personaCollisions }) =>
        runProfileDirImport({
          fs,
          profileRoot,
          principal,
          ...profileImport,
          importStandaloneLorebook: deps.importStandaloneLorebook,
          importPresetScripts: deps.importPresetScripts,
          importGlobalScripts: deps.importGlobalScripts,
          attachBooksByName: deps.attachBooksByName,
          importPreset: createImportPresets(deps.presetCtx),
          importTheme: createImportTheme(deps.settingsCtx),
          storeBackground: createBackgroundStore({ store: deps.assets.store, maxBytes: () => ASSET_UPLOAD_MAX_BYTES }),
          applyImportedAppearance: createApplyImportedAppearance(deps.settingsCtx),
          newBackgroundEntryId: deps.settingsCtx.newBackgroundEntryId,
          now,
          dryRun,
          signal,
          personaCollisions,
        }),
      bundle: (args) => runBundleImport({ ...args, registry: portability, extractArchive: extractZip }),
      staged: async ({ stagedPath, ...args }) => importStagedArchive({ ...args, registry: portability, staged: await stageDirectory(stagedPath) }),
      writeReport: (markdown, generatedAt) => writeImportReportFile(markdown, generatedAt, deps.importReportsDir),
      reconcileStats: reconcileImportStats,
      settleMemory: settleImportMemory,
    }),
    reconcileImportStats,
    refreshPlannerStats: createRefreshImportPlannerStats(db),
    emitLibraryChanged: createImportLibraryEmitter({
      charactersChanged: ({ ownerId }) => deps.emitUserEvent(ownerId, { type: "charactersChanged" }),
      chatsChanged: ({ ownerId }) => deps.publishChatChanged(ownerId, undefined),
    }),
  };

  return { portability, importWorkloads, settleImportMemory };
}
