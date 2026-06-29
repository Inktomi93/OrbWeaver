// entry/compose/services — THE composition root's service graph (tiers/entry.md §"injection model" + §layout
// "services.ts"). `createServices` constructs every domain service with its DI bundle and wires every
// cross-feature injected op (the ONE tier above `domain-no-cross-feature`). It builds the infra handles
// (SecretBox / CAS / variant cache / image adapter / the provider backend-registry → executor + diagnostics),
// the in-process event bus, the boot-global owner `RoleClients` bundle, then the 15 transport-facing services
// + the non-Services ones downstream wiring needs (sessions for the auth seam; embeddings + its indexer;
// assets; export). Returns the `Services` bundle the transport `Context` reads, plus the boot handles the
// lifecycle supervises (vLLM engine) / probes (SecretBox) / wires (event bus, indexer, runner-env).
//
// DETERMINISM: `now` is an injected param (compose NEVER calls `Date.now()`); id minters are built from the
// kit `mintTypeId`/`newId` (the composition root is the sanctioned mint site). COMPOSE ORDER (D38): guards →
// sessions → settings → credentials → connection → roleClients → the leaf/heavy services. settings is built
// (and its effective-config cache boot-warmed) BEFORE the infra backend-registry so the registry sources the
// admin-resolved `vllmConcurrency` from AppSettings (PD-14) — settings' deps don't touch the registry, so the
// hoist is safe; the registry/executor still precede every consumer (credentials/connection) that needs them.
//
// FLAGGED INERT WIRES (no backing front-door verb in the current slices — see the report, not papered over):
//   • character.reapAssets — assets GC is PD-26 (best-effort no-op until then; called on every delete).
//   • tag.requireParticipant — chat membership gate is PD-19 (chat is P5).
//   • import — its service is PER-OWNER (`ImportContext.ownerId`), built by the `entry/import` driver later.

import type { ResolvedConnection } from "@orb/contracts/connection";
import type { CredentialHealth, ResolvedCredential } from "@orb/contracts/credentials";
import type { DomainEvent } from "@orb/contracts/events";
import type { EndpointInspection } from "@orb/contracts/providers";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { SessionView } from "@orb/contracts/session";
import type { Db } from "@orb/db";
import type { SessionId, TypeIdOf, UserId, WorkloadId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import { createAdminService, requireAdmin, requireOwner } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import { createAssetsService } from "#domain/assets";
import type { BuddyAgentResult, BuddyToolServer } from "#domain/buddy";
import { createBuddyService } from "#domain/buddy";
import type { DefaultCharacterSeeder } from "#domain/character";
import { createCharacterService, createDefaultCharacterSeeder } from "#domain/character";
import { createConnectionService } from "#domain/connection";
import { createCredentialsService } from "#domain/credentials";
import { createDiscoveryService } from "#domain/discovery";
import type { EmbeddingsIndexer, EmbeddingsService } from "#domain/embeddings";
import { createEmbeddingsIndexer, createEmbeddingsService } from "#domain/embeddings";
import type { ExportService } from "#domain/export";
import { createExportService } from "#domain/export";
import { createNotificationsService } from "#domain/notifications";
import { createPersonaService } from "#domain/persona";
import { createPresetService } from "#domain/preset";
import { createSearchService } from "#domain/search";
import type { SessionsService } from "#domain/sessions";
import { createSessionsService } from "#domain/sessions";
import { createSettingsService } from "#domain/settings";
import { createStatsService } from "#domain/stats";
import { createTagService } from "#domain/tag";
import type { StartWorkloadInput, WorkloadRunnerEnv } from "#domain/workloads";
import { createWorkloadService } from "#domain/workloads";
import { createWorldInfoService } from "#domain/world-info";
import { env } from "#foundation/env";
import type { AuditEntry } from "#foundation/observability";
import { logAudit } from "#foundation/observability";
import { createPasswordHasher } from "#infra/auth";
import type { SecretBox } from "#infra/crypto";
import { createSecretBox } from "#infra/crypto";
import { createImageAdapter } from "#infra/image";
import { fetchOpenAiModels } from "#infra/network";
import type { AgentToolSpec, BackendRegistryDeps, VllmEngineHandle } from "#infra/providers";
import {
  createAgentToolServer,
  createBackendRegistry,
  createProviderDiagnostics,
  createProviderExecutor,
} from "#infra/providers";
import { createCas, createVariantCache } from "#infra/storage";
import type { Services } from "../../transport/trpc/context";
import type { EffectiveConfigWiring } from "./effective-config";
import { createEffectiveConfigWiring } from "./effective-config";
import type { DomainEventBus } from "./event-bus";
import { createDomainEventBus } from "./event-bus";
import { bindRoleClientsForUser } from "./role-clients";
import { buildWorkloadRunnerEnv } from "./runner-env";

/**
 * What boot supplies to stand up the whole service graph. `now` + `secretBoxKey` + `casDir`/`variantDir` +
 * `vllmDisabled` are boot-resolved (crypto key path, data dirs, env); `vllmDisabled` is the EFFECTIVE fact
 * (`env.VLLM_DISABLED || !gpuPresent` — entry/lifecycle's ONE gpu-detect), and compose derives its positive
 * complement `vllmAvailable = !vllmDisabled` for the connection resolver's derive-role fallback; `ownerId`
 * is the deployment owner the
 * boot-global `RoleClients` bundle resolves against; `providerSeams` is the test/durable-override channel for
 * the sealed backend registry (the only way to reach a sealed backend's deps). The vLLM `concurrency` is NOT
 * a boot dep — it is sourced from settings' resolved effective-config inside `createServices` (PD-14).
 */
export interface ServicesDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly ownerId: UserId;
  readonly secretBoxKey: Buffer | null;
  readonly casDir: string;
  readonly variantDir: string;
  readonly sessionSecret: string | null;
  readonly vllmDisabled: boolean;
  readonly repoRoot?: string;
  readonly providerSeams?: Partial<BackendRegistryDeps>;
}

/** What the composition root hands back: the transport `Services` bundle + the boot handles the lifecycle
 *  supervises/probes/wires (the auth seam consumes `sessions`; the indexer/bus are wired here; the runner-env
 *  + vLLM engine go to the worker/lifecycle; the SecretBox is probed by the crypto boot step). */
export interface ServicesResult {
  readonly services: Services;
  readonly sessions: SessionsService;
  readonly embeddings: EmbeddingsService;
  readonly indexer: EmbeddingsIndexer;
  readonly assets: AssetsService;
  readonly exportService: ExportService;
  readonly eventBus: DomainEventBus;
  readonly runnerEnv: WorkloadRunnerEnv;
  readonly roleClients: RoleClients;
  /** The per-owner `RoleClients` binder, PRE-BOUND to the connection service + the executor (async — it
   *  resolves each role's `{credential, model}` via `connection.resolveRole`). The workloads worker's
   *  `WorkloadRunnerDeps.bindRoleClients` is wired from this; entry never touches the raw executor. */
  readonly bindRoleClients: (ownerId: UserId) => Promise<RoleClients>;
  readonly effectiveConfig: EffectiveConfigWiring;
  readonly secretBox: SecretBox;
  readonly vllmEngine: VllmEngineHandle | null;
  /** The default-card seeder (PD-32) — the ONE instance both boot (`ensureSeeded(owner)`) and the app
   *  first-request hook (`ensureSeeded(principal)`) share, so the in-process memo + persisted latch hold
   *  across both call sites. Constructed over the built `character` service + the settings latch ops. */
  readonly characterSeeder: DefaultCharacterSeeder;
}

/** Build a production id minter for a TypeID prefix (the composition root is the sanctioned mint site). */
function minter<P extends string>(prefix: P): () => TypeIdOf<P> {
  return (): TypeIdOf<P> => mintTypeId(prefix);
}

/** Exhaustiveness guard for the closed `DomainEvent` union — a new event member without a bus route is a
 *  `tsc` error here (§7.5 string-union dispatch), not a silent drop. */
function assertNeverEvent(event: never): never {
  throw new Error(`unhandled domain event: ${JSON.stringify(event)}`);
}

/** Construct the full service graph + the boot handles. ASYNC: the boot-global `RoleClients` bundle resolves
 *  each derive-role's connection once (the PD-9 paydown) before the consumers that require it are built. */
export async function createServices(deps: ServicesDeps): Promise<ServicesResult> {
  const { db, now } = deps;

  // ── Shared seams (the bound audit writer, the user-id minter, the in-process event bus) ───────────────
  const audit = (entry: AuditEntry, at: number): Promise<void> => logAudit(db, entry, at);
  const newUserId = (): UserId => newId<UserId>();
  const eventBus = createDomainEventBus();

  // ── guards → sessions → settings (the auth/config spine head, D38). settings is hoisted ABOVE the infra
  //    backend-registry so the registry can source the admin-resolved vLLM concurrency from the effective-
  //    config (PD-14). Its deps (db/now/audit + the pure guard fns) never touch the registry → safe hoist. ──
  const sessions = createSessionsService({ db, now, sessionSecret: deps.sessionSecret });
  const settings = createSettingsService({ db, now, audit, requireAdmin, requireOwner });

  // ── The effective-config boot surface: warm the resolved-config cache from the stored override so the SYNC
  //    getEffectiveConfig() returns the floor⊕override config (incl. vllmConcurrency) before the registry reads
  //    it. The cache is module-scoped + lazily env-floored, so this boot warm is what lets a DB override land. ─
  const effectiveConfig = createEffectiveConfigWiring(settings);
  await effectiveConfig.reload();
  const resolved = effectiveConfig.getEffectiveConfig();

  // ── Infra handles (the sealed I/O executors + the provider surfaces). The backend registry sources the
  //    resolved vLLM batch concurrency from AppSettings — ResolvedVllmConcurrency {embed,summarize} (every
  //    field present) maps onto the registry's optional {embed?,summarize?} concurrency shape (PD-14). ───────
  const registry = createBackendRegistry({
    ...(deps.providerSeams ?? {}),
    now,
    vllmDisabled: deps.vllmDisabled,
    vllmConcurrency: {
      embed: resolved.vllmConcurrency.embed,
      summarize: resolved.vllmConcurrency.summarize,
    },
    ...(deps.repoRoot !== undefined ? { repoRoot: deps.repoRoot } : {}),
  });
  const executor = createProviderExecutor({ backends: registry.backends });
  const diagnostics = createProviderDiagnostics({ backends: registry.backends });
  const secretBox = createSecretBox(deps.secretBoxKey);
  const cas = createCas(deps.casDir);
  const variants = createVariantCache(deps.variantDir);
  const imageAdapter = createImageAdapter();
  const passwordHasher = createPasswordHasher(deps.sessionSecret);

  // ── credentials → connection (the rest of the auth/config spine, D38) ─────────────────────────────────
  const credentials = createCredentialsService({
    db,
    now,
    newCredentialId: minter(ID_PREFIX.userCredential),
    box: secretBox,
    requireOwner,
    probe: (credential): Promise<CredentialHealth> => diagnostics.probe({ credential }),
    inspect: (req): Promise<EndpointInspection> => diagnostics.inspect(req),
    fetchModels: fetchOpenAiModels,
  });
  // The ONE GPU fact in positive form — the connection resolver's no-GPU derive fallback reads it (the
  // registry above reads its complement, `deps.vllmDisabled`). No re-probe: both arms share the boot fact.
  const vllmAvailable = !deps.vllmDisabled;
  const connection = createConnectionService({
    db,
    now,
    resolveCredential: (params): Promise<ResolvedCredential> => credentials.resolve(params),
    fetchOrCatalog: diagnostics.fetchOrCatalog,
    loadUserSettings: settings.loadUserSettings,
    vllmAvailable,
  });

  // ── The per-owner RoleClients binder (the ONE binder — no vLLM floor): pre-bound to the connection service
  //    + the executor. The boot-global OWNER bundle resolves through it ONCE; the workloads worker rebinds
  //    per acting-owner through the same thunk (so workload roles honor the user's per-role roleDefaults). ──
  const bindRoleClients = (ownerId: UserId): Promise<RoleClients> =>
    bindRoleClientsForUser({ connection, executor }, ownerId);
  const roleClients = await bindRoleClients(deps.ownerId);

  // ── The vector substrate (embeddings). Its event indexer is built AFTER the asset/character cluster below
  //    (it injects their un-principal canon re-readers) and then subscribed to the bus. ─────────────────────
  const embeddings = createEmbeddingsService({
    db,
    roleClients,
    now,
    newCharacterEmbeddingId: minter(ID_PREFIX.characterEmbedding),
    newImageEmbeddingId: minter(ID_PREFIX.imageEmbedding),
    newChatDigestId: minter(ID_PREFIX.chatDigest),
    newChatSegmentId: minter(ID_PREFIX.chatSegment),
  });

  // ── Tag (built BEFORE character so character's by-name card-tag attach port wires to the real tag verb —
  //    PD-49 paid down; tag has no upward deps, so the hoist is safe) ─────────────────────────────────────
  const tag = createTagService({
    db,
    newTagId: minter(ID_PREFIX.tag),
    // INERT (flagged): the chat membership gate is PD-19 — chat (and its participant guard) is P5.
    requireParticipant: (): Promise<void> =>
      Promise.reject(
        new Error("tag.requireParticipant: chat membership gate not built (PD-19) — chat is P5"),
      ),
  });

  // ── Asset + character cluster (the event emitters; the bus carries character.updated / asset.created) ──
  const assets = createAssetsService({
    db,
    cas,
    variants,
    imageTransform: imageAdapter.transform,
    emit: eventBus.emit,
    now,
    newAssetId: minter(ID_PREFIX.asset),
  });
  const character = createCharacterService({
    db,
    now,
    newCharacterId: minter(ID_PREFIX.character),
    newSnapshotId: minter(ID_PREFIX.characterSnapshot),
    audit,
    emit: eventBus.emit,
    // INERT (flagged): assets GC is PD-26 — best-effort reap is a no-op until the GC verbs land.
    reapAssets: (): Promise<void> => Promise.resolve(),
    // The by-name card-tag attach port → tag's resolve-or-create-by-name verb (PD-49 paid down). Shapes match
    // 1:1 ({ ownerId, characterId, tagName } → Promise<boolean>); ownership is pre-gated by bulkAddCardTag.
    attachCardTag: tag.attachCardTagByName,
  });

  // ── The default-card seeder (PD-32): the ONE idempotent instance boot + the app first-request hook share.
  //    The settings latch lives in a SIBLING domain (domain-no-cross-feature), so the read/write are injected
  //    here as closures over the settings front door. `markSeeded` mirrors neo: stamp the latch, then point
  //    seeds.welcomeAssistantCharacterId at the seeded Assistant ONLY when the user hasn't already picked one
  //    (never clobber an explicit choice). `create` requires the acting Principal → ensureSeeded takes it. ──
  const characterSeeder = createDefaultCharacterSeeder({
    characters: character,
    // Each default card's native tags land as card/pending suggestions (same carry as an imported card).
    attachCardTag: ({ ownerId, characterId, tagName }): Promise<boolean> =>
      tag.attachCardTagByName({ ownerId, characterId, tagName, source: "card", status: "pending" }),
    isSeeded: async (principal): Promise<boolean> =>
      (await settings.getUserSettings({ principal })).config.onboarding.defaultCharactersSeeded,
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

  // ── The embeddings indexer (the event SUBSCRIBER) + its bus subscription (PD-48 paid down) ─────────────
  //    The canon re-readers are the UN-PRINCIPAL system by-id reads (D20 — the vector substrate carries no
  //    ownerId; the indexer re-reads canon by the event's branded id with no owner gate). `?? undefined`
  //    bridges the domains' `| null` "absent" convention to the indexer op's `| undefined` (a deleted source
  //    is a silent skip either way). Subscribing wires character.updated → re-embed card-text, asset.created
  //    → embed both image lenses; emit is fire-and-forget + error-isolated (event-bus.ts).
  const indexer = createEmbeddingsIndexer({
    store: embeddings.store,
    loadCardText: async (characterId): Promise<string | undefined> =>
      (await character.loadCardText(characterId)) ?? undefined,
    loadAssetBytes: async (assetId): Promise<Uint8Array | undefined> =>
      (await assets.loadAssetBytes(assetId)) ?? undefined,
    roleClients,
    embedDim: env.VLLM_EMBED_DIM,
    imageEmbedDim: env.VLLM_EMBED_DIM,
  });
  // Gate the SUBSCRIPTION on the search-corpus knob (effective-config `corpusAutoindex`, the env/admin floor
  // resolved above). OFF ⇒ the indexer is built but NOT subscribed ⇒ no embed-on-write (a clean boot; the
  // seeder's character.updated writes never trigger inference — the path of the boot "vllm not wired"/local-
  // light spam). ON ⇒ subscribe; the embed routes through the now-fallback-capable role-clients (vLLM when a
  // GPU is present, local-light-jina otherwise). This is DISTINCT from `memoryDefaults.mode` (chat digests,
  // P5): character/image search ⟂ chat-memory (decision (b) — two separate knobs).
  if (resolved.corpusAutoindex) {
    eventBus.subscribe((event: DomainEvent): Promise<void> => {
      switch (event.type) {
        case "character.updated":
          return indexer.onCharacterUpdated(event);
        case "asset.created":
          return indexer.onAssetCreated(event);
        default:
          return assertNeverEvent(event);
      }
    });
  }

  // ── Leaf + remaining services ─────────────────────────────────────────────────────────────────────────
  const persona = createPersonaService({ db, now, newPersonaId: minter(ID_PREFIX.persona), audit });
  const preset = createPresetService({ db, now, newPresetId: minter(ID_PREFIX.preset), audit });
  const worldInfo = createWorldInfoService({
    db,
    now,
    newBookId: minter(ID_PREFIX.worldBook),
    newEntryId: minter(ID_PREFIX.worldEntry),
    audit,
  });
  const stats = createStatsService(db);
  const search = createSearchService({ db, roleClients });
  const discovery = createDiscoveryService({
    db,
    now,
    newDuplicateCharacterPairId: minter(ID_PREFIX.duplicateCharacterPair),
    newThemeClusterId: minter(ID_PREFIX.themeCluster),
    summarize: roleClients.summarize,
    writeHubScores: embeddings.writeHubScores,
  });
  const notifications = createNotificationsService({ db, now });
  const workloads = createWorkloadService({ db, now, newWorkloadId: minter(ID_PREFIX.workload) });

  const admin = createAdminService({
    db,
    now,
    newUserId,
    hashPassword: passwordHasher.hash,
    audit,
    sessions: {
      // The admin device list needs the `userId` SessionView deliberately omits — the caller already holds
      // it, so re-stamp it onto each row (SessionAdminView = SessionView + userId).
      listForUser: async (
        userId: UserId,
      ): Promise<readonly (SessionView & { userId: UserId })[]> => {
        const views = await sessions.listForUser(userId);
        return views.map((view): SessionView & { userId: UserId } => ({ ...view, userId }));
      },
      revoke: (sessionId: string): Promise<void> => sessions.revoke(castId<SessionId>(sessionId)),
      revokeAllForUser: (userId: UserId): Promise<number> => sessions.revokeAllForUser(userId),
    },
    vllm: {
      allEngineStatuses: (): ReturnType<VllmEngineHandle["status"]> =>
        registry.vllmEngine === null ? {} : registry.vllmEngine.status(),
      restartEngine: (name: string): Promise<string> =>
        registry.vllmEngine === null
          ? Promise.resolve("vllm supervisor not running")
          : registry.vllmEngine.restart(name as Parameters<VllmEngineHandle["restart"]>[0]),
    },
  });

  const buddy = createBuddyService({
    db,
    now,
    newTurnId: minter(ID_PREFIX.buddyTurn),
    newProposalId: minter("buddy_proposal"),
    resolveAgentConnection: ({ principal }): Promise<ResolvedConnection> =>
      connection.resolveRole({ role: "agent", principal }),
    agentTurn: async (req): Promise<BuddyAgentResult> => {
      const result = await executor.runAgentTurn({
        credential: req.credential,
        model: req.model,
        systemPrompt: req.systemPrompt,
        prompt: req.prompt,
        mcpServer: req.toolServer,
        ...(req.maxTurns !== undefined ? { maxTurns: req.maxTurns } : {}),
        ...(req.maxOutputTokens !== undefined ? { maxOutputTokens: req.maxOutputTokens } : {}),
        ...(req.maxContextTokens !== undefined ? { maxContextTokens: req.maxContextTokens } : {}),
        ...(req.signal !== undefined ? { signal: req.signal } : {}),
      });
      return { text: result.reply };
    },
    // Build the in-process MCP tool server via the seal-preserving providers front-door factory.
    // `BuddyToolSpec` mirrors `AgentToolSpec` by design (buddy.md — name/description/inputSchema:ZodRawShape/
    // handler→{content:[{type:'text',text}],isError?}); the cast bridges the readonly-array nominal gap only.
    buildToolServer: (tools): BuddyToolServer =>
      createAgentToolServer({ tools: tools as readonly AgentToolSpec[] }),
    roleClients,
    agentEnv: {
      startWorkload: async ({ ownerId, kind }): Promise<{ readonly workloadId: WorkloadId }> => {
        const input: StartWorkloadInput =
          kind === "find-duplicates"
            ? { kind: "find-duplicates", params: {} }
            : { kind: "embed-corpus", params: {} };
        const started = await workloads.start({ input, ownerId });
        return { workloadId: started.id };
      },
    },
  });

  const exportService = createExportService({ db, cas, imageTransform: imageAdapter.transform });

  // ── The cross-feature workload hub (the effective-config surface is built up-front for PD-14) ──────────
  const runnerEnv = buildWorkloadRunnerEnv({ db, now, cas, discovery, connection });

  const services: Services = {
    admin,
    buddy,
    character,
    connection,
    credentials,
    discovery,
    notifications,
    persona,
    preset,
    search,
    settings,
    stats,
    tag,
    workloads,
    worldInfo,
  };

  return {
    services,
    sessions,
    embeddings,
    indexer,
    assets,
    exportService,
    eventBus,
    runnerEnv,
    roleClients,
    bindRoleClients,
    effectiveConfig,
    secretBox,
    vllmEngine: registry.vllmEngine,
    characterSeeder,
  };
}
