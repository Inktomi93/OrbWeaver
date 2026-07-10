// entry/compose/services — THE composition root's service graph (core/Tier-5-Entry.md §"injection model" + §layout
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

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { CredentialHealth, ResolvedCredential } from "@orb/contracts/credentials";
import type { DomainEvent } from "@orb/contracts/events";
import type {
  AccountCredits,
  EndpointInspection,
  GenerationCost,
  VerifyAuthResult,
} from "@orb/contracts/providers";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { SessionView } from "@orb/contracts/session";
import type { BatchStmt, Db } from "@orb/db";
import {
  assets as assetsTable,
  characters as charactersTable,
  chatParticipants,
  personas as personasTable,
  users,
} from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { SessionId, TypeIdOf, UserId, WorkloadId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import { and, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { can, createAdminService, requireAdmin, requireOwner } from "#domain/admin";
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
import { createImageryService } from "#domain/imagery";
import { createNotificationsService } from "#domain/notifications";
import { createPersonaService } from "#domain/persona";
import { createPresetService } from "#domain/preset";
import { createSearchService } from "#domain/search";
import type { SessionsService } from "#domain/sessions";
import { createSessionsService } from "#domain/sessions";
import { createSettingsService } from "#domain/settings";
import { applyStatsDelta, createStatsService } from "#domain/stats";
import { createTagService } from "#domain/tag";
import { createToolUseService } from "#domain/tool-use";
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
import {
  createChatBus,
  requireAuthorOrHost,
  requireHost,
  requireParticipant,
  setParticipantActivePersona,
} from "../../domain/chat";
import { publishChatEvent, publishUserEvent } from "../../transport/trpc";
import type { Services } from "../../transport/trpc/context";
import type { PresenceRegistry } from "../../transport/trpc/presence-registry";
import { createPresenceRegistry } from "../../transport/trpc/presence-registry";
import { createHostPrincipalResolver } from "../auth";
import { buildChatService } from "./chat";
import type { EffectiveConfigWiring } from "./effective-config";
import { createEffectiveConfigWiring } from "./effective-config";
import { createCharacterUpdatedChatFan } from "./emit-character-updated";
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
  /** This replica's stable lock-holder tag — the chat turn-lock holder (and the boot reclaim's match key, so
   *  the same value MUST drive `reclaimChatLocksOnBoot`). Stable across restarts of the same replica (entry
   *  passes `os.hostname()`); defaulted for tests that don't run chat turns. */
  readonly holder?: string;
}

/** What the composition root hands back: the transport `Services` bundle + the boot handles the lifecycle
 *  supervises/probes/wires (the auth seam consumes `sessions`; the indexer/bus are wired here; the runner-env
 *  + vLLM engine go to the worker/lifecycle; the SecretBox is probed by the crypto boot step). */
export interface ServicesResult {
  readonly services: Services;
  /** The transport presence registry (PD-70) — surfaced so `entry/` can thread it onto the request ctx (the
   *  SSE `connect` side); its `read` side is already injected into the chat service's `presence.read` op. */
  readonly presence: PresenceRegistry;
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
  /** The ONE bound `logAudit` writer (suppress-and-drop) — the same closure every domain's `audit` op is
   *  wired from; surfaced so the lifecycle can hand it to `WorkloadRunnerDeps.audit` (PD-113). */
  readonly audit: (entry: AuditEntry, at: number) => Promise<void>;
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
  // PD-70: the transport presence registry — built HERE over the injected `now` (transport modules can't read
  // ambient time, the `no-raw-clock` seam). Its `read` side feeds chat's `presence.read` op (cast-gating);
  // its `connect` side is surfaced on `ServicesResult` for `entry/` to thread onto the request ctx.
  const presence = createPresenceRegistry(now);

  // ── Shared seams (the bound audit writer, the user-id minter, the in-process event bus) ───────────────
  const audit = (entry: AuditEntry, at: number): Promise<void> => logAudit(db, entry, at);
  const newUserId = (): UserId => newId<UserId>();
  const eventBus = createDomainEventBus();

  // ── guards → sessions → settings (the auth/config spine head, D38). settings is hoisted ABOVE the infra
  //    backend-registry so the registry can source the admin-resolved vLLM concurrency from the effective-
  //    config (PD-14). Its deps (db/now/audit + the pure guard fns) never touch the registry → safe hoist. ──
  const sessions = createSessionsService({ db, now, sessionSecret: deps.sessionSecret });
  const settings = createSettingsService({
    db,
    now,
    audit,
    requireAdmin,
    requireOwner,
    newThemeId: minter(ID_PREFIX.theme),
    emitUserEvent: publishUserEvent,
  });

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
    emitUserEvent: publishUserEvent,
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
    // The host-Claude auth verify (testClaudeAuth) — providers' agent-sdk diagnostic through the same
    // sealed front door as fetchOrCatalog.
    verifyClaudeAuth: (req): Promise<VerifyAuthResult> => diagnostics.verifyAuth(req),
    // The OpenRouter account reads (getOrCredits / getGenerationCost) — source-dispatched diagnostics.
    accountCredits: (req): Promise<AccountCredits> => diagnostics.accountCredits(req),
    generationCost: (req): Promise<GenerationCost> => diagnostics.generationCost(req),
    vllmAvailable,
    // Owner-ness via the admin seam (non-throwing boolean over `requireOwner`) — the resolver's
    // owner-conditional chat default (owner → max-pro-sub, else vllm) without re-spelling the D17 lattice.
    isOwner: (principal) => {
      try {
        requireOwner(principal);
        return true;
      } catch {
        return false;
      }
    },
  });

  // ── The per-owner RoleClients binder (the ONE binder — no vLLM floor): pre-bound to the connection service
  //    + the executor. The boot-global OWNER bundle resolves through it ONCE; the workloads worker rebinds
  //    per acting-owner through the same thunk (so workload roles honor the user's per-role roleDefaults). ──
  const bindRoleClients = (ownerId: UserId): Promise<RoleClients> =>
    bindRoleClientsForUser({ connection, executor }, ownerId);
  const roleClients = await bindRoleClients(deps.ownerId);

  // ── Tag (built BEFORE character so character's by-name card-tag attach port wires to the real tag verb —
  //    PD-49 paid down; tag has no upward deps, so the hoist is safe) ─────────────────────────────────────
  const tag = createTagService({
    db,
    newTagId: minter(ID_PREFIX.tag),
    // RESOLVED (PD-19): the chat membership gate is wired via the domain/chat/guard.
    requireParticipant: (principal, chatId) =>
      requireParticipant({ db, can }, principal, chatId).then((): void => undefined),
    // Tag is CLOCKLESS (rows born-stamp via SQL default), so the audit timestamp is pre-bound HERE from
    // the root's injected clock — the verbs hand only the entry.
    audit: (entry): Promise<void> => audit(entry, now()),
    emitUserEvent: publishUserEvent,
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
    newGalleryItemId: minter(ID_PREFIX.galleryItem),
    // Gallery owner-only posture (§1.3): does `ownerId` own `characterId`? A direct owner-scoped
    // `characters` read (assets never sideways-imports the character domain — the check arrives as an
    // injected op, the same seam as `loadCoParticipantOwner`). `addToGallery` gates the subject character
    // on this before curating.
    assertCharacterOwned: async (ownerId, characterId) => {
      const rows = await db
        .select({ id: charactersTable.id })
        .from(charactersTable)
        .where(and(eq(charactersTable.id, characterId), eq(charactersTable.ownerId, ownerId)))
        .limit(1);
      return rows.length > 0;
    },
    // PD-28 / D21 (amended 2026-07-02, widened 2026-07-07 for multi-human group persona avatars): the
    // roster-avatar reference-check — NOT a hash→any-owner oracle (PD-107). Returns an owner ONLY IF `hash`
    // is the asset-hash of the `avatarAssetId` of EITHER (a) a CHARACTER rostered (`kind='character'`,
    // present — `leftSeq IS NULL`) in a chat where `callerId` is a PRESENT member, OR (b) a PERSONA that is
    // a present HUMAN participant's `activePersonaId` in a chat where `callerId` is ALSO a present member
    // (the sibling case: a co-participant's OWN persona avatar in a shared group chat — without this arm a
    // multi-human room's other members' persona avatars 404 and fall back to initials). Both arms are pure
    // REFERENCE-checks (the join proves the asset IS that rostered identity's CURRENT avatar): a
    // co-participant's non-avatar asset, an identity in a chat the caller isn't in, or a left caller/
    // identity all miss on both arms. Returns `assets.ownerId` (NOT `characters.ownerId`/`personas.ownerId`)
    // — the CAS bytes live in the ASSET owner's partition, so the downstream `metadataForOwnerAndHash`/
    // `cas.read(ownerId, hash)` must key off the asset owner. `undefined` when neither arm matches.
    // SPRITE-SET EXTENSION POINT (PD-56, deferred): when `character_sprites` lands, D21's exception widens
    // from `avatarAssetId` to the sprite set — add a UNION arm joining `character_sprites.assetId = assets.id`
    // under the same rostered-character + present-caller gate. v1 constrains to `avatarAssetId` only.
    loadCoParticipantOwner: async (callerId, hash) => {
      // Self-join `chat_participants` twice: `rosterChar` = the character's own present roster row;
      // `callerSeat` = the caller's own present membership of THAT SAME chat.
      const rosterChar = alias(chatParticipants, "roster_char");
      const callerSeat = alias(chatParticipants, "caller_seat");
      const characterRows = await db
        .select({ ownerId: assetsTable.ownerId })
        .from(assetsTable)
        .innerJoin(charactersTable, eq(charactersTable.avatarAssetId, assetsTable.id))
        .innerJoin(
          rosterChar,
          and(
            eq(rosterChar.characterId, charactersTable.id),
            eq(rosterChar.kind, "character"),
            isNull(rosterChar.leftSeq),
          ),
        )
        .innerJoin(
          callerSeat,
          and(
            eq(callerSeat.chatId, rosterChar.chatId),
            eq(callerSeat.userId, callerId),
            isNull(callerSeat.leftSeq),
          ),
        )
        .where(eq(assetsTable.hash, hash))
        .limit(1);
      if (characterRows[0] !== undefined) {
        return characterRows[0].ownerId;
      }

      // Sibling persona arm: `personaSeat` = the OTHER human's present seat carrying this persona as their
      // CURRENT `activePersonaId`; `personaCallerSeat` = the caller's own present membership of that chat.
      const personaSeat = alias(chatParticipants, "persona_seat");
      const personaCallerSeat = alias(chatParticipants, "persona_caller_seat");
      const personaRows = await db
        .select({ ownerId: assetsTable.ownerId })
        .from(assetsTable)
        .innerJoin(personasTable, eq(personasTable.avatarAssetId, assetsTable.id))
        .innerJoin(
          personaSeat,
          and(
            eq(personaSeat.activePersonaId, personasTable.id),
            eq(personaSeat.kind, "human"),
            isNull(personaSeat.leftSeq),
          ),
        )
        .innerJoin(
          personaCallerSeat,
          and(
            eq(personaCallerSeat.chatId, personaSeat.chatId),
            eq(personaCallerSeat.userId, callerId),
            isNull(personaCallerSeat.leftSeq),
          ),
        )
        .where(eq(assetsTable.hash, hash))
        .limit(1);
      return personaRows[0]?.ownerId;
    },
  });
  const character = createCharacterService({
    db,
    now,
    newCharacterId: minter(ID_PREFIX.character),
    newSnapshotId: minter(ID_PREFIX.characterSnapshot),
    audit,
    emit: eventBus.emit,
    emitUserEvent: publishUserEvent,
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

  // ── The vector substrate (embeddings) — built AFTER the asset/character cluster: the PD-53 bulk embed
  //    passes inject their UN-PRINCIPAL enumeration + canon re-reads (D20 — the vector substrate carries no
  //    ownerId; the sweeps are trusted SYSTEM consumers). `?? undefined` bridges the domains' `| null`
  //    "absent" convention to the ops' `| undefined` (a deleted source is a silent skip either way). ───────
  const embeddings = createEmbeddingsService({
    db,
    roleClients,
    now,
    newCharacterEmbeddingId: minter(ID_PREFIX.characterEmbedding),
    newImageEmbeddingId: minter(ID_PREFIX.imageEmbedding),
    newChatDigestId: minter(ID_PREFIX.chatDigest),
    newChatSegmentId: minter(ID_PREFIX.chatSegment),
    listCharacterIds: character.listEmbeddableCharacterIds,
    loadCardText: async (characterId): Promise<string | undefined> =>
      (await character.loadCardText(characterId)) ?? undefined,
    listImageAssetIds: assets.listImageAssetIds,
    loadAssetBytes: async (assetId): Promise<Uint8Array | undefined> =>
      (await assets.loadAssetBytes(assetId)) ?? undefined,
    embedDim: env.VLLM_EMBED_DIM,
    imageEmbedDim: env.VLLM_EMBED_DIM,
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

  // PD-128: the ONE chat bus. persona's active-persona write needs the chat bus's durable-first emit, but
  // persona composes BEFORE `buildChatService` (chat needs `persona.get` for turn assembly — a genuine cycle),
  // so the bus is built HERE, early — it needs only {db, now, newEventId}, all available — and threaded into
  // BOTH persona's write AND `buildChatService`. ONE durable-first emit, ONE replay ring (bus.ts
  // FLAG[bus-not-on-ctx]: service builds ONE bus). This replaces the former split — a `personaSwitchBus` here
  // + a second `createChatBus` inside chat.ts — whose per-instance ring had zero readers today but was a
  // latent per-chat `seq`-gap trap the moment the transport ever reads the ring for a resume window (PD-128).
  const chatBus = createChatBus({ db, now, newEventId: minter(ID_PREFIX.chatEvent) });
  const emitChatEvent = async (event: ChatBusEvent): Promise<void> => {
    // Durable-first: the bus assigns the per-chat `seq` (the `chat_events` INSERT commits first), THEN the
    // cursor-stamped event goes to the transport live channel — a dead live path never loses an event.
    const seq = await chatBus.emit(event);
    publishChatEvent({ seq, event });
  };

  // ── The MULTI-HUMAN bridge (task #17): character.updated → a `chatUpdated` chat-bus event on every chat where
  //    that character is CURRENTLY seated, so a co-member's OPEN room refetches the roster/theme/assembly fields
  //    when another human's card edit lands (emit-character-updated.ts). SEPARATE, ALWAYS-ON subscription —
  //    UNLIKE the indexer's, it is NOT gated on `corpusAutoindex` (open-room freshness ⟂ the search-corpus knob):
  //    a stale co-member room is a bug whether or not the corpus indexes. Fans through the durable-first
  //    `emitChatEvent` (the ONE bus); asset.created is not our concern here (a narrow single-arm subscriber). ──
  const fanCharacterUpdateToChats = createCharacterUpdatedChatFan(db, emitChatEvent);
  eventBus.subscribe((event: DomainEvent): Promise<void> => {
    if (event.type === "character.updated") {
      return fanCharacterUpdateToChats(event.characterId);
    }
    return Promise.resolve();
  });

  const persona = createPersonaService({
    db,
    now,
    newPersonaId: minter(ID_PREFIX.persona),
    audit,
    // PD user-bus lane: the per-user live-freshness emit → transport's process-local `publishUserEvent`.
    // The SAME closure backs every domain below (one bus, keyed per userId).
    emitUserEvent: publishUserEvent,
    requireChatAuthorOrHost: async (principal, chatId, targetUserId) => {
      await requireAuthorOrHost({ db, can }, principal, chatId, targetUserId);
    },
    setChatActivePersona: async (chatId, targetUserId, personaId) => {
      await setParticipantActivePersona(db, emitChatEvent, { chatId, targetUserId, personaId });
    },
  });
  const preset = createPresetService({
    db,
    now,
    newPresetId: minter(ID_PREFIX.preset),
    audit,
    emitUserEvent: publishUserEvent,
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
  const notifications = createNotificationsService({
    db,
    now,
    // D60 recipient belt (agent-principal-design/06 §3): the entry root is the sanctioned `users` reader
    // (exempt from `no-direct-users-read`, the `resolveAgentEnabled` precedent) — an agent principal has no
    // inbox, so `record` refuses it. A missing row ⇒ false (only a real agent row refuses).
    isAgentRecipient: async (userId) => {
      const rows = await db
        .select({ kind: users.kind })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return rows[0]?.kind === "agent";
    },
  });
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
    // The PD-90 inline single-card embed port: the OWNER-SCOPED card read is the producer-ownership check
    // (a foreign/missing character reads null — leak-free), then the same card-text projection + store the
    // indexer uses (idempotent — the store verb hash-gates, so re-embedding an unchanged card is a noop).
    embed: {
      embedCharacterCard: async (principal, characterId): Promise<boolean> => {
        const card = await character.getCard({ principal, characterId });
        if (card === null) {
          return false;
        }
        const text = await character.loadCardText(characterId);
        if (text === null || text.length === 0) {
          return false;
        }
        await embeddings.store({
          kind: "card",
          lens: "card-text",
          characterId,
          content: text,
          model: roleClients.embedModel,
          dim: env.VLLM_EMBED_DIM,
        });
        return true;
      },
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
    // `BuddyToolSpec` mirrors `AgentToolSpec` by design (name/description/inputSchema:ZodRawShape/
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

  // ── imagery (the P5 free-mode leaf — imagery-design). Binds its narrow ops to the built siblings: the
  //    generateImage role (connection.resolveRole), the sealed executor (executor.generateImage), the CAS
  //    write (assets.store, kind always "generated"), and a STANDALONE stats apply (applyStatsDelta pushes
  //    into a fresh batch this op commits — imagery is a sync verb, not a canon-write co-batch). ───────────
  const imagery = createImageryService({
    db,
    now,
    newGenerationId: minter(ID_PREFIX.imageryGeneration),
    resolveGenerateImage: async (caller) => {
      const conn = await connection.resolveRole({ role: "generateImage", principal: caller });
      return { connection: conn, capability: conn.capability };
    },
    generateImage: (req) => executor.generateImage(req),
    storeAsset: (caller, bytes, kind, mime) =>
      assets.store({ principal: caller, bytes, kind, mime, enforceMagic: true }),
    recordStats: async (delta): Promise<void> => {
      const batch: BatchStmt[] = [];
      applyStatsDelta(batch, db, delta);
      if (batch.length > 0) {
        await db.batch(batchMany(batch));
      }
    },
  });

  // ── chat (built LAST — it injects character/persona/connection/credentials/stats/embeddings/search/
  //    notifications/settings/roleClients, all built above). The widest DI bundle in the system; its op
  //    graph + the flagged inert/permissive stubs live in `./chat` (entry-local). `holder` is the per-replica
  //    lock tag the boot reclaim must match (defaulted for non-turn tests). ───────────────────────────────
  // D48: the ONE tool registry — composed EMPTY today (registrants arrive with rpg/buddy; the chat ops
  // are live so the recurse loop is real; a plain chat attaches nothing → byte-identical requests).
  const toolUse = createToolUseService({ can, clock: now });

  const chatCompose = buildChatService({
    toolUse,
    db,
    now,
    emitChatEvent, // PD-128: the ONE bus, built above — chat no longer constructs its own.
    holder: deps.holder ?? "replica-default",
    sessionSecret: deps.sessionSecret,
    // The PD-73 frozen-host → Principal bridge (sessions is the sanctioned users reader).
    resolveHostPrincipal: createHostPrincipalResolver(sessions),
    audit,
    can,
    roleClients,
    connection,
    credentials,
    character,
    persona,
    preset,
    settings,
    notifications,
    search,
    assets,
    embeddings,
    // PD-66: sessions' exact handle→userId resolver for targeted invites.
    resolveHandle: (handle) => sessions.resolveHandle(handle),
    // D60: sessions' lazy agent-principal mint for seatAgent (doc 04 §3).
    provisionAgentPrincipal: (params) => sessions.provisionAgentPrincipal(params),
    runChatTurn: executor.runChatTurn,
    // PD-70: the read side of the transport presence registry → chat's `presence.read` op (cast-gating drops
    // an offline human's persona from the present cast for the next round).
    readPresence: (userId) => Promise.resolve(presence.read(userId)),
    // The imagery leaf's orchestrator → chat's `generatePicture` op (mapped to the chat-local structural
    // result inside `buildChatService`).
    generatePicture: imagery.generatePicture,
  });
  const { service: chat, emitBusEvent: emitChatBusEvent } = chatCompose;

  // ── The cross-feature workload hub (built AFTER chat — the PD-41 memory/group-character sweeps are
  //    chat-ctx-bound ops off the chat compose product). ─────────────────────────────────────────────────
  const runnerEnv = buildWorkloadRunnerEnv({
    db,
    now,
    cas,
    discovery,
    connection,
    embeddings,
    memoryBackfill: chatCompose.backfill.memory,
    groupCharacterBackfill: chatCompose.backfill.groupCharacters,
  });

  // ── world-info (built AFTER chat — its PD-30 chat scope injects chat's membership guards + the chat
  //    bus emit; world-info itself never reads the roster nor imports chat). ────────────────────────────
  const worldInfo = createWorldInfoService({
    db,
    now,
    newBookId: minter(ID_PREFIX.worldBook),
    newEntryId: minter(ID_PREFIX.worldEntry),
    audit,
    // Chat's own guards over the shared {db, can} — host for the room-config writes, member for the list.
    requireChatHost: (principal, chatId) =>
      requireHost({ db, can }, principal, chatId).then((): void => undefined),
    requireChatMember: (principal, chatId) =>
      requireParticipant({ db, can }, principal, chatId).then((): void => undefined),
    // WI attachment changes ride the SAME durable-first chat bus (WiBusEvent ⊂ ChatBusEvent).
    emitWiEvent: emitChatBusEvent,
    emitUserEvent: publishUserEvent,
  });

  const services: Services = {
    admin,
    assets,
    buddy,
    character,
    chat,
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
    presence,
    sessions,
    embeddings,
    indexer,
    assets,
    exportService,
    eventBus,
    runnerEnv,
    roleClients,
    bindRoleClients,
    audit,
    effectiveConfig,
    secretBox,
    vllmEngine: registry.vllmEngine,
    characterSeeder,
  };
}
