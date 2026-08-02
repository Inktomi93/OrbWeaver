// Composition seam for the portability registry (the zip-bundle export/import descriptors) + the deps
// domain/import's workload contributions close over. Built LAST — the profile-dir importer composes a
// cross-domain slice (character/chat/persona/world-info/tag/assets) that only exists here. Owns no business
// logic.
//
// The workloads junk-drawer exit killed the duplication this file used to carry: the ten-dep profile-import
// slice was passed TWICE — once into `buildPortabilityRegistry` and once into the retired runner-env hub —
// because the import brain was split between the portability descriptors and the god-hub. It is built ONCE
// now and shared: the descriptors take it directly, and the import CONTRIBUTION takes the composed drivers.

import { tmpdir } from "node:os";
import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { AssetsContext, AssetsService } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import type { BulkImportChats } from "#domain/chat";
import type { ExportService } from "#domain/export";
import type { ImportWorkloadDeps } from "#domain/import";
import type { BulkImportPersonas, PersonaService } from "#domain/persona";
import type { PresetContext } from "#domain/preset";
import type { SettingsContext } from "#domain/settings";
import { reconcileStats } from "#domain/stats";
import type { TagContext, TagService } from "#domain/tag";
import type { WorkloadService } from "#domain/workloads";
import type { ImportStandaloneLorebook, WorldInfoExportContext } from "#domain/world-info";
import { stageDirectory } from "#infra/storage";
import type { ImportWorldInfoPort } from "../import";
import {
  createNodeFsImportPort,
  IMPORT_MAX_DECOMPRESSED_BYTES,
  IMPORT_MAX_TOTAL_BYTES,
  importStagedArchive,
  runBundleImport,
  runProfileDirImport,
} from "../import";
import type { ExportRegexScripts, ImportCardScripts, ImportRegexScript } from "#domain/regex";
import { buildPortabilityRegistry } from "./portability";

/** Repo-root ST profile snapshot (gitignored) — the `import-st` default when no `stProfileDir` is set. */
const DEFAULT_ST_PROFILE_DIR = ".st-data";

/** What the portability+import seam needs from the composition root. */
export interface PortabilityRunnerComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly tagCtx: TagContext;
  readonly settingsCtx: SettingsContext;
  readonly presetCtx: PresetContext;
  readonly worldInfoExportCtx: WorldInfoExportContext;
  readonly importStandaloneLorebook: ImportStandaloneLorebook;
  /** The gallery-extended assets ctx (the two character-handle resolvers the gallery export/import verbs need). */
  readonly galleryCtx: AssetsContext;
  readonly persona: PersonaService;
  readonly exportService: ExportService;
  readonly character: CharacterService;
  readonly assets: AssetsService;
  readonly attachCardTag: TagService["attachCardTagByName"];
  readonly importWorldInfo: ImportWorldInfoPort;
  /** D121-E: the card LIFT + the `regex` bundle descriptor's two halves (from the regex compose seam). */
  readonly importCardScripts: ImportCardScripts;
  readonly exportRegexScripts: ExportRegexScripts;
  readonly importRegexScript: ImportRegexScript;
  readonly bulkImportChats: BulkImportChats;
  readonly bulkImportPersonas: BulkImportPersonas;
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
  readonly workloads: Pick<WorkloadService, "start">;
  /** The staging root the upload routes wrote under; absent ⇒ the OS temp dir (the same default the routes
   *  resolve, so the contribution reads exactly where the route wrote). */
  readonly importStagingDir?: string | undefined;
  readonly stProfileDir?: string | undefined;
}

/** The compose product: the registry the delivery core iterates + the deps import's contributions take. */
export interface PortabilityRunnerComposeResult {
  readonly portability: PortabilityRegistry;
  readonly importWorkloads: ImportWorkloadDeps;
}

export function buildPortabilityRunner(deps: PortabilityRunnerComposeDeps): PortabilityRunnerComposeResult {
  const { db, now, workloads } = deps;

  // Shared by the zip-bundle portability descriptors AND the ST profile-directory importer — built ONCE.
  type ImportOwnerOp = (args: { readonly ownerId: UserId }) => Promise<void>;
  const enqueueImportBackfill: ImportOwnerOp = async ({ ownerId }) => {
    await workloads.start({
      input: { kind: "memory-backfill", params: {} },
      caller: null,
      mode: "singular",
      ownerId,
    });
  };
  const reconcileImportStats: ImportOwnerOp = async ({ ownerId }) => {
    await reconcileStats(db, { ownerId, now });
  };
  /** The ST profile importer's cross-domain slice — the ONE spelling, shared by both consumers. */
  const profileImport = {
    character: deps.character,
    storeAvatar: deps.assets.store,
    attachCardTag: deps.attachCardTag,
    importLorebook: deps.importWorldInfo.importLorebook,
    linkCarriedBooks: deps.importWorldInfo.linkCarriedBooks,
    importCardScripts: deps.importCardScripts,
    bulkImportChats: deps.bulkImportChats,
    bulkImportPersonas: deps.bulkImportPersonas,
    enqueueBackfill: enqueueImportBackfill,
    reconcileImportStats,
    resolveOwnerPrincipal: deps.resolveOwnerPrincipal,
  };

  const portability = buildPortabilityRegistry({
    db,
    now,
    tagCtx: deps.tagCtx,
    settingsCtx: deps.settingsCtx,
    presetCtx: deps.presetCtx,
    worldInfoExportCtx: deps.worldInfoExportCtx,
    importStandaloneLorebook: deps.importStandaloneLorebook,
    assetsCtx: deps.galleryCtx,
    persona: deps.persona,
    exportService: deps.exportService,
    listOwnedCharacterIds: deps.character.listEmbeddableCharacterIds,
    exportRegexScripts: deps.exportRegexScripts,
    importRegexScript: deps.importRegexScript,
    ...profileImport,
  });

  const stagingRoot = deps.importStagingDir ?? tmpdir();
  const fs = createNodeFsImportPort();
  const importWorkloads: ImportWorkloadDeps = {
    stagingRoot,
    stProfileDir: deps.stProfileDir ?? DEFAULT_ST_PROFILE_DIR,
    runProfileDirImport: async ({ profileRoot, ownerId, dryRun, signal }) => {
      const principal = await deps.resolveOwnerPrincipal(ownerId);
      const { scanned, changed } = await runProfileDirImport({ fs, profileRoot, principal, ...profileImport, now, dryRun, signal });
      return { scanned, changed };
    },
    runBundleImport: async ({ archive, ownerId, stagingRoot: root, signal }) => {
      const report = await runBundleImport({
        registry: portability,
        ownerId,
        archive,
        extractOptions: { maxTotalBytes: IMPORT_MAX_TOTAL_BYTES, maxTotalDecompressedBytes: IMPORT_MAX_DECOMPRESSED_BYTES, stagingRoot: root },
        signal,
      });
      return { imported: report.imported, skipped: report.skipped, failed: report.failed };
    },
    runStagedDirImport: async ({ stagedPath, ownerId, signal }) => {
      const report = await importStagedArchive({ registry: portability, ownerId, staged: await stageDirectory(stagedPath), signal });
      return { imported: report.imported, skipped: report.skipped, failed: report.failed };
    },
    reconcileImportStats,
  };

  return { portability, importWorkloads };
}
