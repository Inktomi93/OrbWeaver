// Composition seam for the portability registry (the zip-bundle export/import descriptors) + the deps
// domain/import's workload contributions close over. Built LAST — the profile-dir importer composes a
// cross-domain slice (character/chat/persona/world-info/tag/assets) that only exists here. Owns no business
// logic.
//
// The workloads junk-drawer exit killed the duplication this file used to carry: the ten-dep profile-import
// slice was passed TWICE — once into `buildPortabilityRegistry` and once into the retired runner-env hub —
// because the import brain was split between the portability descriptors and the god-hub. It is built ONCE
// now and shared: the descriptors take it directly, and the import CONTRIBUTION takes the composed drivers.

import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import type { PersonaId, UserId, WorkloadId } from "@orb/kit/ids";
import type { AssetsContext, AssetsService } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import type { BulkImportChats } from "#domain/chat";
import { createCompareAndSetImportedTokenUsage, createListImportedTokenUsageCandidates } from "#domain/chat";
import type { DatabankPortabilityContext } from "#domain/databank";
import type { ExportService } from "#domain/export";
import type { ImportWorkloadDeps } from "#domain/import";
import { DEFAULT_IMPORT_STAGING_DIR } from "#domain/import";
import type { BulkImportPersonas, PersonaService } from "#domain/persona";
import { findOwnedPersonaByName } from "#domain/persona";
import type { PresetContext } from "#domain/preset";
import { createImportPresets } from "#domain/preset";
import type { ExportRegexScripts, ImportCardScripts, ImportGlobalScripts, ImportPresetScripts, ImportRegexScript } from "#domain/regex";
import type { ImportRpgGame } from "#domain/rpg";
import type { SettingsContext } from "#domain/settings";
import { createApplyImportedAppearance, createImportTheme } from "#domain/settings";
import { bumpStatsCanonVersion, reconcileStats } from "#domain/stats";
import type { TagContext, TagService } from "#domain/tag";
import type { WorkloadService } from "#domain/workloads";
import { WORKLOAD_NOT_ADMISSIBLE } from "#domain/workloads";
import type { AttachOwnedBooksByName, ImportStandaloneLorebook, WorldInfoExportContext } from "#domain/world-info";
import { stageDirectory } from "#infra/storage";
import { publishChatChanged, publishUserEvent, withQuietBulkFanout } from "../../transport/trpc/index.ts";
import { writeImportReport } from "../import/import-report.ts";
import type { ImportWorldInfoPort } from "../import/index.ts";
import {
  bundleImportNotes,
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
  /** The ST profile import's PRESET-scoped + GLOBAL regex lifts (the silent-gap sweep, 2026-08-15). */
  readonly importPresetScripts: ImportPresetScripts;
  readonly importGlobalScripts: ImportGlobalScripts;
  /** The ST world NAME-LINK attach (card `extensions.world` + charLore → the owner's books, by exact name). */
  readonly attachBooksByName: AttachOwnedBooksByName;
  readonly bulkImportChats: BulkImportChats;
  readonly bulkImportPersonas: BulkImportPersonas;
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
  readonly workloads: Pick<WorkloadService, "start">;
  /** The staging root the upload routes wrote under; absent ⇒ {@link DEFAULT_IMPORT_STAGING_DIR} (the same
   *  default the routes resolve, so the contribution reads exactly where the route wrote — and the routes
   *  write, and this reads, under the per-owner subdir `stagedOwnerRoot` derives from it). */
  readonly importStagingDir?: string | undefined;
  readonly stProfileDir?: string | undefined;
}

/** The compose product: the registry the delivery core iterates + the deps import's contributions take. */
export interface PortabilityRunnerComposeResult {
  readonly portability: PortabilityRegistry;
  readonly importWorkloads: ImportWorkloadDeps;
}

/** The post-import embed DAG, shared by the zip-bundle portability descriptors AND the ST profile-directory
 *  importer — built ONCE. It runs in order and only AFTER the whole import: embed CHARACTERS (the corpus
 *  `index` pass) first, then embed CHATS (`memory-backfill`) gated on it via `dependsOn`. Chaining (not two
 *  independent enqueues) is deliberate — embeddings never run mid-import, and the chat memory pass does not
 *  compete with the character pass for the embed engine.
 *
 *  RETURNS A COVERAGE CLAIM, not a queue count: `true` means a memory pass that WILL cover this import
 *  entered the queue behind this import's index pass. Two outcomes report `false` rather than throwing,
 *  because neither is an import failure — the workloads door REFUSING the pass (#156: this owner has memory
 *  off, so the sweep skips every one of their chats and could only land a vacuous 0/0 success), and a memory
 *  pass already being in flight for this owner (that run holds no edge to the index pass above and may
 *  already be past the rows just written, so it is not coverage for THIS import). The character `index` pass
 *  is unconditional — it is what memory recall would search, and it stands on its own.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function createEnqueueImportBackfill(workloads: Pick<WorkloadService, "start">): (args: { readonly ownerId: UserId }) => Promise<boolean> {
  const startEmbed = async (
    ownerId: UserId,
    input: StartWorkloadInput,
    options: { readonly adoptActive?: true; readonly dependsOnId?: WorkloadId } = {},
  ): Promise<WorkloadId> => {
    const { id } = await workloads.start({
      input,
      caller: null,
      mode: "singular",
      ownerId,
      ...(options.adoptActive === true ? { adoptActive: true } : {}),
      ...(options.dependsOnId !== undefined ? { dependsOn: [options.dependsOnId] } : {}),
    });
    return id;
  };
  return async ({ ownerId }: { readonly ownerId: UserId }): Promise<boolean> => {
    // THE INDEX PASS ADOPTS. It is a DEPENDENCY TARGET, and any active run of the same admission unit is
    // exactly the thing to wait on — that run is idempotent + hash-gated, so it already covers the freshly
    // imported rows, but the dependent still has to WAIT for it. Swallowing the conflict and losing the id
    // (what this did before `adoptActive`) dropped the `dependsOn` edge on precisely that path, so the memory
    // pass was enqueued as an INDEPENDENT root that could run before the index pass it must follow.
    const embedChars = await startEmbed(ownerId, { kind: "index", params: { source: "text" } }, { adoptActive: true });
    try {
      // THE MEMORY PASS DOES NOT ADOPT, and the asymmetry is the point. This function's boolean is a COVERAGE
      // CLAIM — the import report renders it as "the memory pass entered the queue for this import" — while
      // an ADOPTED memory run was admitted under someone else's `dependsOn` (`workloads/contract/params.ts`:
      // an adopted row necessarily drops the caller's). It carries no edge to the index pass above and may
      // already be past the rows this import just wrote, so reporting `true` for it would make the report
      // claim a coverage it cannot have. A conflict is reported as `false` — the same honest arm the #156
      // memory-off refusal lands on, and the same answer this returned before adoption existed.
      await startEmbed(ownerId, { kind: "memory-backfill", params: {} }, { dependsOnId: embedChars });
      return true;
    } catch (err) {
      if (err instanceof DomainConflictError) {
        return false;
      }
      if (err instanceof DomainOperationError && err.code === WORKLOAD_NOT_ADMISSIBLE) {
        return false;
      }
      throw err;
    }
  };
}

export function buildPortabilityRunner(deps: PortabilityRunnerComposeDeps): PortabilityRunnerComposeResult {
  const { db, now, workloads } = deps;

  type ImportOwnerOp = (args: { readonly ownerId: UserId }) => Promise<void>;
  const enqueueImportBackfill = createEnqueueImportBackfill(workloads);
  const reconcileImportStats: ImportOwnerOp = async ({ ownerId }) => {
    await reconcileStats(db, { ownerId, now });
  };
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

  const stagingRoot = deps.importStagingDir ?? DEFAULT_IMPORT_STAGING_DIR;
  const fs = createNodeFsImportPort();
  const importWorkloads: ImportWorkloadDeps = {
    stagingRoot,
    stProfileDir: deps.stProfileDir ?? DEFAULT_ST_PROFILE_DIR,
    listTokenUsageCandidates: createListImportedTokenUsageCandidates(db),
    compareAndSetTokenUsage: createCompareAndSetImportedTokenUsage(db, bumpStatsCanonVersion),
    // W8 / F5 — THE THREE BULK RUNS, EACH UNDER QUIET MODE. Every per-entity import verb announces itself
    // (`character/verbs/create.ts` fires `charactersChanged` per CARD; the persona/preset/tag/theme/regex/
    // world-info import verbs each fire their own), so an ST library fanned hundreds of events and the
    // client's `invalidateQueries` cancel-and-restart churned the visible library for the whole run
    // (staleness design §2.5). The scope is opened HERE, not in a verb: only the composition of the run knows
    // it is one gesture. Semantics + the misuse note: `transport/trpc/user-events-bus.ts`. #23's
    // `emitLibraryChanged` deliberately stays OUTSIDE these scopes — it fires after the runner returns, from
    // the workload contribution's settle step, and it is the belt that covers a run which wrote canon.
    runProfileDirImport: async ({ profileRoot, ownerId, dryRun, signal }) =>
      await withQuietBulkFanout(async () => {
        const principal = await deps.resolveOwnerPrincipal(ownerId);
        const report = await runProfileDirImport({
          fs,
          profileRoot,
          principal,
          ...profileImport,
          importStandaloneLorebook: deps.importStandaloneLorebook,
          // The silent-gap sweep's three ST-profile-only ops: preset-scoped + global regex lifts and the
          // world name-link attach. Direct args (not the shared `profileImport` slice) — the zip-bundle
          // descriptors have no ST wire to spend them on.
          importPresetScripts: deps.importPresetScripts,
          importGlobalScripts: deps.importGlobalScripts,
          attachBooksByName: deps.attachBooksByName,
          // The ST chat-completion preset wave writes through the preset domain's OWN import verb (idempotent
          // on (ownerId, name), one serde, one collision rule) — the same op the zip-bundle descriptor uses.
          importPreset: createImportPresets(deps.presetCtx),
          // The ST THEME wave does the same through the settings domain's own theme-backup import (idempotent
          // on (ownerId, name); a SEED palette is `ownerId IS NULL` and structurally unreachable by that write).
          importTheme: createImportTheme(deps.settingsCtx),
          // The ST BACKGROUND wave: one CAS write per file under the caller, kind `background`, with the
          // extension-derived mime VERIFIED against the bytes (`enforceMagic`) before anything is persisted.
          storeBackground: async (params) => {
            const storedAsset = await deps.assets.store({ ...params, kind: "background", enforceMagic: true });
            return { assetId: storedAsset.assetId, hash: storedAsset.hash };
          },
          applyImportedAppearance: createApplyImportedAppearance(deps.settingsCtx),
          newBackgroundEntryId: deps.settingsCtx.newBackgroundEntryId,
          now,
          dryRun,
          signal,
        });
        // A real run writes the "what landed / what didn't" report to disk; a dry run writes nothing.
        const reportPath = dryRun ? undefined : await writeImportReport(report, now());
        return { scanned: report.scanned, changed: report.changed, failed: report.skippedCards.length, ...(reportPath !== undefined ? { reportPath } : {}) };
      }),
    runBundleImport: async ({ archive, ownerId, stagingRoot: root, signal }) =>
      await withQuietBulkFanout(async () => {
        const report = await runBundleImport({
          registry: portability,
          ownerId,
          archive,
          extractOptions: { maxTotalBytes: IMPORT_MAX_TOTAL_BYTES, maxTotalDecompressedBytes: IMPORT_MAX_DECOMPRESSED_BYTES, stagingRoot: root },
          signal,
        });
        // #1710 — carry what #1688 already put on the report (a kept edited lorebook, a dropped overlay) into
        // the BACKGROUND workload's own result, not only the descriptor-level report a sync door would read.
        return { imported: report.imported, skipped: report.skipped, failed: report.failed, notes: bundleImportNotes(report) };
      }),
    runStagedDirImport: async ({ stagedPath, ownerId, signal }) =>
      await withQuietBulkFanout(async () => {
        const report = await importStagedArchive({ registry: portability, ownerId, staged: await stageDirectory(stagedPath), signal });
        return { imported: report.imported, skipped: report.skipped, failed: report.failed, notes: bundleImportNotes(report) };
      }),
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
