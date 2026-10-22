// Wire automation and plugin onto the same effect ports, feedback registries and enforcement belts.
// Author and installer Principals are row-derived through the injected entry resolver.

import { randomUUID } from "node:crypto";
import type { Principal } from "@orb/contracts/identity";
import type { DatabaseHandle } from "@orb/db/wiring";
import type { BindingActor, RoleClientsWithSignal, SideGenSampling } from "@orb/inference";
import type { AssetId, CharacterId, IdSource, PluginId, SandboxWireId, UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import type { ScheduleOp } from "@orb/kit/time";
import { packShowcaseBundle, readShowcaseManifest, SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import type { AdminService } from "#domain/admin";
import { can, createPluginDistributionRecipients } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import { createPluginAssetReads } from "#domain/assets";
import type { AutomationService } from "#domain/automation";
import {
  createAutomationRuntimeOps,
  createAutomationService,
  createEnabledRuleIndex,
  createPluginFeedbackOps,
  createPluginSubscriberRegistry,
  createPluginSuggestionRaiser,
  createPromptTransformIndex,
  createSuggestionStore,
} from "#domain/automation";
import { readPluginCardData, writePluginCardData } from "#domain/character";
import { createPluginChatAuthority, requireHost } from "#domain/chat";
import type { ConnectionService } from "#domain/connection";
import type { DatabankService } from "#domain/databank";
import type { ImageryService } from "#domain/imagery";
import type { NotificationsService } from "#domain/notifications";
import { createPluginNotificationDelivery, createRecordAndPublishNotification } from "#domain/notifications";
import type { PluginBelts, PluginHostOps, PluginHostPort, PluginMacroRegistry, PluginService } from "#domain/plugin";
import {
  buildConfirmedActRunner,
  buildPluginStorage,
  createNotifyFloor,
  createPluginEventBus,
  createPluginEventEmitter,
  createPluginRateFloor,
  createPluginRegistrarOps,
  createPluginRuntimeOps,
  createPluginService,
  createPluginSuggestionExecutor,
  createPluginSurfaceStateStore,
  createPluginUiOutbox,
  createSnippetGate,
  createSurfaceStatePublisher,
  createUiHostCallGate,
  buildPluginQuietLlm as domainBuildPluginQuietLlm,
  isPluginEnabledFor,
  PLUGIN_ASSET_EGRESS_PER_HOUR,
  PLUGIN_EGRESS_PER_HOUR,
  PLUGIN_QUIET_LLM_PER_HOUR,
  PLUGIN_SEARCH_QUERY_PER_HOUR,
} from "#domain/plugin";
import type { SearchService } from "#domain/search";
import { createPluginDocumentSearch } from "#domain/search";
import type { SessionsService } from "#domain/sessions";
import { createResolveUserEnabled } from "#domain/sessions";
import type { SettingsService } from "#domain/settings";
import type { ResolvedToolSet, ToolUseService } from "#domain/tool-use";
import type { WorldInfoService } from "#domain/world-info";
import { createPluginWorldInfoReads } from "#domain/world-info";
import type { ScopedEgress } from "#infra/network";
import { createNetworkPluginGitSource, fetchPluginBundle, pluginGitSource } from "#infra/network";
import type { PluginHostSeamDeps } from "#infra/plugin-host";
import { createPluginHost } from "#infra/plugin-host";
import type { LiveBuses } from "#transport/trpc";

import { createAutomationOps } from "./automation-watcher.ts";
import type { ChatComposeResult } from "./chat.ts";
import { minter } from "./minter.ts";
import { loadPluginCharacters, loadPluginMessages } from "./plugin-chat-reads.ts";

/** What the automation+plugin seam needs from the composition root. */

export interface AutomationPluginComposeDeps {
  readonly pluginExecution?: Pick<PluginHostSeamDeps, "spawn" | "monotonicNow">;
  readonly timers?: PluginHostSeamDeps["timers"];
  readonly emitUserEvent: LiveBuses["user"]["publishUserEvent"];
  readonly publishNotification: LiveBuses["notifications"]["publishNotification"];
  readonly publishAutomationEvent: LiveBuses["automation"]["publishAutomationEvent"];

  readonly egress?: Pick<ScopedEgress, "safeFetch" | "fetchPluginBundle">;
  readonly scheduleTimeout?: ScheduleOp;
  readonly random?: (() => number) | undefined;
  readonly newOpaqueId?: (() => string) | undefined;
  readonly idSource?: IdSource;
  readonly db: DatabaseHandle;
  readonly now: () => number;
  readonly connection: Pick<ConnectionService, "registerPluginProviders" | "dropPluginProviders">;
  readonly chatCompose: ChatComposeResult;
  /** chat's `resolveViewerVisibility` (membership AND the D16 canon floor) — automation/plugin never re-derive. */
  readonly resolveViewerVisibility: PluginHostOps["chat"]["resolveViewerVisibility"];
  /** The shared machine writer + the two reads the plugin `worldinfo.write` gates gate on (attachment =
   *  the room's consent; the entry index = the per-plugin cap's counter). */
  readonly worldInfo: Pick<WorldInfoService, "upsertEntries" | "listForChat" | "listEntryIndex" | "listEntries">;
  readonly notifications: Pick<NotificationsService, "record" | "refreshStanding" | "retract">;
  readonly imagery: Pick<ImageryService, "generatePicture">;
  readonly settings: Pick<SettingsService, "getUserSettings">;
  readonly assets: Pick<AssetsService, "store" | "loadAssetBytes" | "assetCasRefById" | "reapIfOrphan" | "readOwnedAssetBytes">;
  /** #788 F1 — first-party retrieval for the plugin `search.query` read. `documents` is the owner-scoped RAG
   *  verb; the membrane rides it under `scope: { ownerId: installer }`, so a plugin searches only its own corpus. */
  readonly search: Pick<SearchService, "documents">;
  /** The tool registry seam. `registerPluginTool` is the membrane's PL-A registrar; the other four are the
   *  `run_tool` arm's (D146): the direct-drive reachability predicate this seam re-checks itself, plus the
   *  resolve→execute pair every other tool consumer already funnels through. Deliberately still a `Pick` —
   *  neither automation nor the membrane may reach `register` (compose-time, first-party only). */
  readonly toolUse: Pick<
    ToolUseService,
    "registerPluginTool" | "isToolDrivableBy" | "resolveTools" | "executeToolCalls" | "listDrivableToolNames" | "toToolDefinitions"
  >;
  /** The plugin fan-out's RECIPIENT enumeration (D147 clause (d)), and nothing else — a `Pick` of exactly the
   *  one admin read, because `admin` is the only sanctioned reader of `users` and a distribution needs to know
   *  who the humans are. It re-gates on the acting admin, so the list is never obtained on nobody's authority. */
  readonly admin: Pick<AdminService, "listUsers">;
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
  /** C5 — the owner-GLOBAL lane's standing-authority read, threaded from `domain/sessions` because the
   *  `users` table belongs to sessions + admin alone (the no-direct-users-read chokepoint). A chat rule's
   *  authority is its room's roster and needs none of this; a chat-less rule has no roster, so the account
   *  itself is the only standing fact left to re-prove per fire. */
  readonly sessions: Pick<SessionsService, "loadUserById">;
  /** The per-FUNDER role-client binder (§8.5b): a rule spends its AUTHOR's rows, a plugin its INSTALLER's. An
   *  `actor` folds that actor's own binding before the funder's (a plugin's `plugin-grant` row). */
  readonly roleClientsFor: (funderUserId: UserId, actor?: BindingActor) => Promise<RoleClientsWithSignal>;
  /** The process-wide PLUGIN-MACRO registry — minted at the composition ROOT and
   *  handed to BOTH this plane (which writes it at activation) and chat's compose (which reads it per turn as
   *  `ChatContext.pluginMacros`). Minted there rather than here purely because chat composes FIRST: one shared
   *  instance and no late bind, which is the shape the S4 store had to work around. */
  readonly pluginMacros: PluginMacroRegistry;
  /** A user's Utility-role preset params (D299) — /autobg, rule analysis and plugin quiet calls. */
  readonly resolveUtilityPresetParams: (userId: UserId) => Promise<SideGenSampling | undefined>;
  /** #679 U8 seam 15 — databank's canon-write op (`createFromText`), narrowed. The membrane's `databank.ingest`
   *  host fn rides it under the installer (compose resolves the Principal): a scraper plugin ingests into the
   *  installer's OWN library and the derived indexer auto-runs (the write enqueues the ingest workload). */
  readonly databankCreateFromText: DatabankService["createFromText"];
  /** #679 U8 seam 17 — the character canon-write op, pre-built PER-INSTALLER at the composition root (it needs
   *  the import-context wiring the root holds). Serializes the guest card to JSON bytes + runs the SAME
   *  `importCharacter` funnel a file upload takes (the ContentChanged-emitting path). Owner-scoped: the root
   *  resolves the installer's Principal and the import funnel re-gates ownership. */
  readonly ingestCharacterCard: (req: {
    readonly installerUserId: UserId;
    readonly card: Record<string, unknown>;
    /** The calling plugin's own manifest id (#1702 provenance — see `domain/plugin/contract/ops.ts`'s
     *  `character.ingest` doc). */
    readonly pluginId: PluginId | null;
  }) => Promise<{
    readonly characterId: SandboxWireId<CharacterId>;
    readonly created: boolean;
  }>;
  /** #798 — the remote-image "summon with art" op, pre-built PER-INSTALLER at the composition root (same
   *  import-context wiring `ingestCharacterCard` needs). Reads the PNG from the installer's OWN CAS (owner-gated,
   *  leak-free on foreign/absent) and runs the SAME `importCharacter` funnel — so the character arrives WITH its
   *  embedded avatar. */
  readonly ingestCharacterAsset: (req: {
    readonly installerUserId: UserId;
    readonly assetId: SandboxWireId<AssetId>;
    /** See `ingestCharacterCard`'s `pluginId` (#1702 provenance). */
    readonly pluginId: PluginId | null;
  }) => Promise<{
    readonly characterId: SandboxWireId<CharacterId>;
    readonly created: boolean;
  }>;
}

/** The automation+plugin compose product. */
export interface AutomationPluginComposeResult extends AsyncDisposable {
  readonly automation: AutomationService;
  readonly plugin: PluginService;
}

const buildPluginQuietLlm = domainBuildPluginQuietLlm;

export async function buildAutomationPlugin(deps: AutomationPluginComposeDeps): Promise<AutomationPluginComposeResult> {
  const newOpaqueId = deps.newOpaqueId ?? randomUUID;
  const hostResources = new AsyncDisposableStack();
  const pluginResources = new AsyncDisposableStack();
  await using construction = new AsyncDisposableStack();
  construction.defer(() => pluginResources.disposeAsync());
  construction.defer(() => hostResources.disposeAsync());
  const { db, now, connection, chatCompose, worldInfo, notifications, imagery, settings, assets, admin, resolveOwnerPrincipal, roleClientsFor, pluginMacros } =
    deps;
  const { service: chat } = chatCompose;
  const automationNotify = deps.publishAutomationEvent;
  const emitNotification = createRecordAndPublishNotification((params) => notifications.record(params), deps.publishNotification);
  const automationRuntime = createAutomationRuntimeOps<ResolvedToolSet>({
    resolveOwnerPrincipal,
    requestTurn: (params) => chatCompose.requestTurn(params),
    postNarratorMessage: (chatId, content, media, options) => chatCompose.rpgChatOps.postNarratorMessage(chatId, content, media, options),
    imagery,
    settings,
    toolUse: deps.toolUse,
    roleClientsFor,
    resolveUtilityPresetParams: deps.resolveUtilityPresetParams,
    newToolCallId: () => `automation_${newOpaqueId()}`,
  });
  const assetReads = createPluginAssetReads({ assets, resolveOwnerPrincipal });
  const worldInfoReads = createPluginWorldInfoReads({ worldInfo, resolveOwnerPrincipal });
  const notificationDelivery = createPluginNotificationDelivery({ notifications, publish: deps.publishNotification });
  const pluginFeedback = createPluginFeedbackOps({ db, emit: emitNotification, notify: automationNotify });
  const pluginRuntime = createPluginRuntimeOps({
    db,
    now,
    requestTurn: (params) => chatCompose.requestTurn(params),
    imagery,
    assets,
    resolveOwnerPrincipal,
    databankCreateFromText: (params) => deps.databankCreateFromText(params),
    readCardData: (target) => readPluginCardData(db, target),
    writeCardData: (target, data) => writePluginCardData(db, target, data),
    readShowcaseManifest,
  });
  const automationOps = createAutomationOps({
    db,
    resolveViewerVisibility: deps.resolveViewerVisibility,
    applyVariableOps: chatCompose.applyVariableOps,
    resolveChatProse: chatCompose.resolveChatProse,
    requestTurn: automationRuntime.requestTurn,
    upsertEntries: async ({ authorUserId, bookId, entries }) =>
      worldInfo.upsertEntries({ principal: await resolveOwnerPrincipal(authorUserId), bookId, entries }),
    emitNotification,
    generatePicture: automationRuntime.generatePicture,
    listBackgroundChoices: automationRuntime.listBackgroundChoices,
    setChatBackground: async ({ authorUserId, chatId, background }) => {
      await chat.setChatBackground({ principal: await resolveOwnerPrincipal(authorUserId), chatId, background });
    },
    isToolDrivableBy: (toolName, authorUserId) => deps.toolUse.isToolDrivableBy(toolName, authorUserId),
    runTool: automationRuntime.runTool,
    summarizeQuiet: automationRuntime.summarizeQuiet,
  });
  const automationEnabled = createEnabledRuleIndex(db);
  // One store backs both automation confirms and plugin suggestions.
  const automationSuggestions = createSuggestionStore();
  const newSuggestionId = minter(ID_PREFIX.automationSuggestion, deps.idSource);
  // Automation confirms are bound after the plugin effect bundle exists.
  const suggestionExecutor = createPluginSuggestionExecutor();
  // The watcher and plugin activation share one registry.
  const pluginSubscribers = createPluginSubscriberRegistry();
  const automationTransforms = createPromptTransformIndex({
    db,
    ops: automationOps,
    prng: deps.random ?? Math.random,
    now,
    register: chatCompose.promptTransforms.register,
    unregister: chatCompose.promptTransforms.unregister,
  });
  const automation = createAutomationService({
    db,
    now,
    prng: deps.random ?? Math.random,
    newRuleId: minter(ID_PREFIX.automationRule, deps.idSource),
    newFireId: minter(ID_PREFIX.automationFire, deps.idSource),
    newSuggestionId,
    can,
    ops: automationOps,
    listRuleTools: automationRuntime.listRuleTools,
    enabled: automationEnabled,
    suggestions: automationSuggestions,
    pluginSubscribers,
    transforms: automationTransforms,
    resolveAuthor: resolveOwnerPrincipal,
    isAuthorEnabled: createResolveUserEnabled(deps.sessions),
    executePluginSuggestion: suggestionExecutor.run,
    isPluginLive: (pluginId, ownerId) => isPluginEnabledFor(db, ownerId, pluginId),
    applyProseRewrite: async ({ authorUserId, chatId, messageId, variantId, expectedContentHash, content }) => {
      await chat.applyProseRewrite({ principal: await resolveOwnerPrincipal(authorUserId), chatId, messageId, variantId, expectedContentHash, content });
    },
    notify: automationNotify,
  });
  await automationEnabled.reload();
  await automationTransforms.reload();
  const pluginHost: PluginHostPort = hostResources.use(
    createPluginHost({
      ...deps.pluginExecution,
      ...(deps.timers === undefined ? {} : { timers: deps.timers }),
      nowEpochMs: now,
      nextRandom: deps.random ?? Math.random,
      mintId: newOpaqueId,
      ...(deps.egress === undefined ? {} : { safeFetch: deps.egress.safeFetch }),
    }),
  );
  // Activation and confirmed acts share the same process-wide belts.
  const pluginBelts: PluginBelts = {
    notify: createNotifyFloor(now),
    egress: createPluginRateFloor(now, { capability: "net.fetch", limit: PLUGIN_EGRESS_PER_HOUR }),
    assetEgress: createPluginRateFloor(now, { capability: "net.fetchAsset", limit: PLUGIN_ASSET_EGRESS_PER_HOUR }),
    quietLlm: createPluginRateFloor(now, { capability: "llm.quiet", limit: PLUGIN_QUIET_LLM_PER_HOUR }),
    searchQuery: createPluginRateFloor(now, { capability: "search.query", limit: PLUGIN_SEARCH_QUERY_PER_HOUR }),
  };
  const pluginSurfaceState = createPluginSurfaceStateStore();
  // Private pubsub has no domain/chat event sink.
  const pluginEventBus = createPluginEventBus();
  const pluginUiOutbox = createPluginUiOutbox(now);
  const resolveChatAuthority = createPluginChatAuthority({ db, can });
  const registrarOps = createPluginRegistrarOps({
    toolUse: deps.toolUse,
    promptTransforms: chatCompose.promptTransforms,
    pluginSubscribers,
    resolveChatAuthority,
    newEventId: () => `plugin-event:${newOpaqueId()}`,
  });
  const pluginHostOps: PluginHostOps = {
    chat: {
      listMessages: (chatId, opts) => loadPluginMessages(db, chatId, opts),
      resolveViewerVisibility: deps.resolveViewerVisibility,
      requireHost: async (chatId, installerUserId) => {
        await requireHost({ db, can }, await deps.resolveOwnerPrincipal(installerUserId), chatId);
      },
      listCharacters: (chatId) => loadPluginCharacters(db, chatId),
      getVariables: automationOps.chat.readVariables,
      applyVariableOps: automationOps.chat.applyVariableOps,
      requestTurn: pluginRuntime.requestTurn,
    },
    worldInfo: { upsertEntries: automationOps.worldInfo.upsertEntries, ...worldInfoReads },
    storage: buildPluginStorage(db, now),
    notifications: { ...notificationDelivery, post: pluginFeedback.postNotification },
    quickReply: { surface: pluginFeedback.surfaceQuickReply },
    imagery: { generatePicture: pluginRuntime.generatePicture },
    llm: { quiet: buildPluginQuietLlm(deps) },
    variables: {
      get: async (ownerId, key) => automation.getGlobalVariable({ principal: await resolveOwnerPrincipal(ownerId), key }),
      set: async (ownerId, key, value) => {
        await automation.setGlobalVariable({ principal: await resolveOwnerPrincipal(ownerId), key, value });
      },
      delete: async (ownerId, key) => automation.deleteGlobalVariable({ principal: await resolveOwnerPrincipal(ownerId), key }),
    },
    assets: { read: assetReads.read, storeFetched: pluginRuntime.storeFetched },
    search: { documents: createPluginDocumentSearch((params) => deps.search.documents(params)) },
    suggestions: {
      raise: createPluginSuggestionRaiser({ suggestions: automationSuggestions, notify: automationNotify, newSuggestionId, now }),
      voidForPlugin: (pluginId) => {
        automationSuggestions.voidPlugin(pluginId);
      },
    },
    ui: {
      setState: createSurfaceStatePublisher(pluginSurfaceState, deps.emitUserEvent),
      toast: (identity, level, message) => {
        pluginUiOutbox.pushToast(identity, level, message);
        return Promise.resolve();
      },
      openDialog: (pluginId, surfaceId) => {
        pluginUiOutbox.requestDialog(pluginId, surfaceId);
        return Promise.resolve();
      },
    },
    databank: {
      ingest: pluginRuntime.ingestDatabank,
    },
    character: {
      ingest: ({ installerUserId, card, pluginId }) => deps.ingestCharacterCard({ installerUserId, card, pluginId }),
      ingestAsset: ({ installerUserId, assetId, pluginId }) => deps.ingestCharacterAsset({ installerUserId, assetId, pluginId }),
      setCardData: pluginRuntime.cardState.setCardData,
      getCardData: pluginRuntime.cardState.getCardData,
    },
    pubsub: { emit: createPluginEventEmitter(pluginEventBus) },
    registrar: {
      ...registrarOps,
      registerMacros: (macros, invoke, scope) =>
        pluginMacros.register({
          installer: scope.installer.userId,
          slug: scope.slug,
          macros,
          invoke,
        }),
      subscribePubsub: (subscriptions, invoke, scope) =>
        pluginEventBus.register({ installer: scope.installer.userId, subscriberSlug: scope.slug, subscriptions, invoke }),
    },
  };
  suggestionExecutor.bind(buildConfirmedActRunner(pluginHostOps, pluginBelts));
  const plugin: PluginService = pluginResources.use(
    createPluginService(
      {
        db,
        now,
        scheduleTimeout: deps.scheduleTimeout,
        newPluginId: minter(ID_PREFIX.plugin, deps.idSource),
        assets: {
          store: (caller, bytes, mime) => assets.store({ principal: caller, bytes, kind: "plugin", mime }),
          readBytes: assetReads.readBytes,
          reapOrphans: async (assetIds) => {
            await assets.reapIfOrphan(assetIds);
          },
        },
        host: pluginHost,
        ops: pluginHostOps,
        fetchBundle: deps.egress?.fetchPluginBundle ?? fetchPluginBundle,
        gitSource: deps.egress === undefined ? pluginGitSource : createNetworkPluginGitSource(deps.egress.safeFetch),
        showcase: {
          slugs: new Set<string>(SHOWCASE_PLUGIN_SLUGS),
          bundle: packShowcaseBundle,
          version: pluginRuntime.showcaseVersion,
        },
        surfaceState: pluginSurfaceState,
        uiOutbox: pluginUiOutbox,
        belts: pluginBelts,
        snippetGate: createSnippetGate(),
        uiHostCallGate: createUiHostCallGate(),
        resolveChatAuthority,
      },
      {
        requireAdmin: (caller): void => {
          can(caller, "admin", { kind: "global" });
        },
        listRecipients: createPluginDistributionRecipients(admin, resolveOwnerPrincipal),
        readPublishedBundle: assetReads.readPublishedBundle,
      },
      {
        activate: (rows, { pluginId, pluginName }) => connection.registerPluginProviders({ rows, pluginId, pluginName }),
        deactivate: (pluginId) => connection.dropPluginProviders({ pluginId }),
      },
    ),
  );

  const lifetime = construction.move();
  return { automation, plugin, [Symbol.asyncDispose]: (): Promise<void> => lifetime.disposeAsync() };
}
