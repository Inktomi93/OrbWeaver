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
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { DomainConflictError } from "@orb/kit/errors";
import type { PersonaId, UserId, WorkloadId } from "@orb/kit/ids";
import type { AssetsContext, AssetsService } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import type { BulkImportChats } from "#domain/chat";
import type { DatabankPortabilityContext } from "#domain/databank";
import type { ExportService } from "#domain/export";
import type { ImportWorkloadDeps } from "#domain/import";
import type { BulkImportPersonas, PersonaService } from "#domain/persona";
import { findOwnedPersonaByName } from "#domain/persona";
import type { PresetContext } from "#domain/preset";
import { createImportPresets } from "#domain/preset";
import type { ExportRegexScripts, ImportCardScripts, ImportRegexScript } from "#domain/regex";
import type { ImportRpgGame } from "#domain/rpg";
import type { SettingsContext } from "#domain/settings";
import { reconcileStats } from "#domain/stats";
import type { TagContext, TagService } from "#domain/tag";
import type { WorkloadService } from "#domain/workloads";
import type { ImportStandaloneLorebook, WorldInfoExportContext } from "#domain/world-info";
import { stageDirectory } from "#infra/storage";
import { publishChatChanged, publishUserEvent } from "../../transport/trpc/index.ts";
import { writeImportReport } from "../import/import-report.ts";
import type { ImportWorldInfoPort } from "../import/index.ts";
import {
  createNodeFsImportPort,
  IMPORT_MAX_DECOMPRESSED_BYTES,
  IMPORT_MAX_TOTAL_BYTES,
  importStagedArchive,
  runBundleImport,
  runProfileDirImport,
} from "../import/index.ts";
import { buildPortabilityRegistry } from "./portability.ts";

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

  // Enqueue one embed workload, swallowing the benign "already queued/running" admission conflict (that run is
  // idempotent + hash-gated, so it already covers the freshly imported rows). Returns the new workload id (or
  // undefined on a swallowed conflict) so the caller can chain a dependent on it.
  const startEmbed = async (ownerId: UserId, input: StartWorkloadInput, dependsOnId?: WorkloadId): Promise<WorkloadId | undefined> => {
    try {
      const { id } = await workloads.start({
        input,
        caller: null,
        mode: "singular",
        ownerId,
        ...(dependsOnId !== undefined ? { dependsOn: [dependsOnId] } : {}),
      });
      return id;
    } catch (err) {
      if (err instanceof DomainConflictError) {
        return;
      }
      throw err;
    }
  };

  // Shared by the zip-bundle portability descriptors AND the ST profile-directory importer — built ONCE.
  // Post-import embedding runs as a DAG, in order and only AFTER the whole import: embed CHARACTERS (the
  // corpus `index` pass) first, then embed CHATS (`memory-backfill`) gated on it via `dependsOn`. Chaining
  // (not two independent enqueues) is deliberate — embeddings never run mid-import, and the chat memory pass
  // does not compete with the character pass for the embed engine.
  type ImportOwnerOp = (args: { readonly ownerId: UserId }) => Promise<void>;
  const enqueueImportBackfill: ImportOwnerOp = async ({ ownerId }) => {
    const embedChars = await startEmbed(ownerId, { kind: "index", params: { source: "text" } });
    await startEmbed(ownerId, { kind: "memory-backfill", params: {} }, embedChars);
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
    // R6 — the orb-native chat bundle's three cross-domain re-links (persona by name, the chat-tag overlay,
    // the rpg campaign). Shared by both consumers exactly like the rest of this slice.
    findPersonaByName: ({ ownerId, name }: { readonly ownerId: UserId; readonly name: string }): Promise<PersonaId | null> =>
      findOwnedPersonaByName(db, ownerId, name),
    attachChatTagByName: deps.attachChatTag,
    importRpgGame: deps.importRpgGame,
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
    databankCtx: deps.databankCtx,
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
      const report = await runProfileDirImport({
        fs,
        profileRoot,
        principal,
        ...profileImport,
        importStandaloneLorebook: deps.importStandaloneLorebook,
        // The ST chat-completion preset wave writes through the preset domain's OWN import verb (idempotent on
        // (ownerId, name), one serde, one collision rule) — the same op the zip-bundle descriptor uses.
        importPreset: createImportPresets(deps.presetCtx),
        now,
        dryRun,
        signal,
      });
      // A real run writes the "what landed / what didn't" report to disk; a dry run writes nothing.
      const reportPath = dryRun ? undefined : await writeImportReport(report, now());
      return { scanned: report.scanned, changed: report.changed, failed: report.skippedCards.length, ...(reportPath !== undefined ? { reportPath } : {}) };
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
    // #23: the terminal "your library changed" fan for a background import. `chatsChanged` (chatId absent)
    // already drives BOTH the chat list AND `character.list` in the client's user-bus map; `charactersChanged`
    // is emitted too so a characters-only import (no chats) still refreshes. The always-on client user-bus
    // receives these regardless of whether the import UI is still mounted — the gap a background import left.
    emitLibraryChanged: ({ ownerId }) => {
      publishUserEvent(ownerId, { type: "charactersChanged" });
      publishChatChanged(ownerId, undefined);
    },
  };

  return { portability, importWorkloads };
}
