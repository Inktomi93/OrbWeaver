// Composition seam for the portability registry (the zip-bundle export/import descriptors) + the workloads
// runner-env (the per-user execution env the workloads worker resolves per job) + the two shared import
// after-effects (memory-backfill enqueue + stats reconcile). Built LAST — the memory/group-character sweeps are
// chat-ctx-bound ops off the chat compose product, and `import.importAll` composes the profile-dir importer's
// cross-feature slice. Owns no business logic.

import type { Principal } from "@orb/contracts/identity";
import type { PortabilityRegistry } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { AssetsContext, AssetsService } from "#domain/assets";
import type { CharacterService } from "#domain/character";
import type { BulkImportChats } from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import type { DatabankIngest } from "#domain/databank";
import type { DiscoveryService } from "#domain/discovery";
import type { EmbeddingsService } from "#domain/embeddings";
import type { ExportService } from "#domain/export";
import type { BulkImportPersonas, PersonaService } from "#domain/persona";
import type { PresetContext } from "#domain/preset";
import type { SettingsContext } from "#domain/settings";
import { reconcileStats } from "#domain/stats";
import type { TagContext, TagService } from "#domain/tag";
import type { WorkloadRunnerEnv, WorkloadService } from "#domain/workloads";
import type { ImportStandaloneLorebook, WorldInfoExportContext } from "#domain/world-info";
import type { ImportWorldInfoPort } from "../import";
import { buildPortabilityRegistry } from "./portability";
import type { RunnerEnvDeps } from "./runner-env";
import { buildWorkloadRunnerEnv } from "./runner-env";

/** The chat compose product's slices the runner-env consumes (memory/group-character sweeps) — typed off
 *  `RunnerEnvDeps` so it stays in lockstep with the runner-env's expected backfill op shapes. */
interface PortabilityChatSlice {
  readonly backfill: {
    readonly memory: RunnerEnvDeps["memoryBackfill"];
    readonly groupCharacters: RunnerEnvDeps["groupCharacterBackfill"];
  };
}

/** What the portability+runner seam needs from the composition root. */
export interface PortabilityRunnerComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly cas: Parameters<typeof buildWorkloadRunnerEnv>[0]["cas"];
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
  readonly bulkImportChats: BulkImportChats;
  readonly bulkImportPersonas: BulkImportPersonas;
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
  readonly workloads: Pick<WorkloadService, "start">;
  readonly discovery: DiscoveryService;
  readonly connection: ConnectionService;
  readonly embeddings: EmbeddingsService;
  readonly databankIngest: DatabankIngest;
  readonly chat: PortabilityChatSlice;
  readonly importStagingDir?: string | undefined;
  readonly stProfileDir?: string | undefined;
}

/** The portability+runner compose product: the registry the delivery core iterates + the workloads runner-env. */
export interface PortabilityRunnerComposeResult {
  readonly portability: PortabilityRegistry;
  readonly runnerEnv: WorkloadRunnerEnv;
}

export function buildPortabilityRunner(deps: PortabilityRunnerComposeDeps): PortabilityRunnerComposeResult {
  const { db, now, workloads } = deps;

  // Shared by the zip-bundle portability descriptors AND the ST profile-directory importer (runnerEnv below).
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
    character: deps.character,
    listOwnedCharacterIds: deps.character.listEmbeddableCharacterIds,
    storeAvatar: deps.assets.store,
    attachCardTag: deps.attachCardTag,
    importLorebook: deps.importWorldInfo.importLorebook,
    linkCarriedBooks: deps.importWorldInfo.linkCarriedBooks,
    bulkImportChats: deps.bulkImportChats,
    bulkImportPersonas: deps.bulkImportPersonas,
    enqueueBackfill: enqueueImportBackfill,
    reconcileImportStats,
    resolveOwnerPrincipal: deps.resolveOwnerPrincipal,
  });

  // Built after chat + portability's import ports — the memory/group-character sweeps are chat-ctx-bound ops
  // off the chat compose product; `import.importAll` composes the profile-dir importer's cross-feature slice.
  const runnerEnv = buildWorkloadRunnerEnv({
    db,
    now,
    cas: deps.cas,
    discovery: deps.discovery,
    connection: deps.connection,
    embeddings: deps.embeddings,
    databankIngest: deps.databankIngest,
    assets: deps.assets,
    memoryBackfill: deps.chat.backfill.memory,
    groupCharacterBackfill: deps.chat.backfill.groupCharacters,
    // Lazy: this thunk derefs the registry at run time (it's already assembled just above, but the bundle op
    // reads it lazily by contract).
    getPortabilityRegistry: () => portability,
    ...(deps.importStagingDir !== undefined ? { importStagingDir: deps.importStagingDir } : {}),
    ...(deps.stProfileDir !== undefined ? { stProfileDir: deps.stProfileDir } : {}),
    profileImport: {
      character: deps.character,
      storeAvatar: deps.assets.store,
      attachCardTag: deps.attachCardTag,
      importLorebook: deps.importWorldInfo.importLorebook,
      linkCarriedBooks: deps.importWorldInfo.linkCarriedBooks,
      bulkImportChats: deps.bulkImportChats,
      bulkImportPersonas: deps.bulkImportPersonas,
      enqueueBackfill: enqueueImportBackfill,
      reconcileImportStats,
      resolveOwnerPrincipal: deps.resolveOwnerPrincipal,
    },
  });

  return { portability, runnerEnv };
}
