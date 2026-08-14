// Composition seam for automation (D46) + the domain/plugin transport slice (D46 Tier-2 sandbox). Extracted as
// ONE file (not two) because they are a single tangled unit: the plugin membrane's host-fn op bundle REUSES
// automation's write ops verbatim (one home — a plugin write rides the SAME seam an automation action does),
// plugin's service consumes automation's `getGlobalVariable`/`setGlobalVariable`/`deleteGlobalVariable`, and both
// register onto the SAME `pluginSubscribers` fan-out registry minted between them. Splitting into two files would
// require plugin to import automation's constructed op objects across a file seam (the map's flagged cycle risk),
// so they compose together, LAST. Owns no business logic.
//
// Two DELIBERATELY SEPARATE principal resolvers reach this seam: the keystone's `resolveHostPrincipal` (chat's
// own role-sensitive ops) is NOT threaded here; `resolveOwnerPrincipal` (world-info's — the author-ownership
// gate) IS, and it drives every automation/plugin author→Principal resolution.
//
// `bindRoleClients` (the `/autobg` `summarizeQuiet` arm) is the THIRD author→Principal path and it now agrees:
// it takes a bare `authorUserId` and the binder resolves it through the same `createHostPrincipalResolver`
// (D135 clause G). It used to stamp `role:"owner"` inside `role-clients.ts`, which mattered precisely because
// an author here is NOT the box owner — `automation/verbs/create-rule.ts` gates on `requireChatHost`, D18 ROOM
// authority, so any authenticated user who creates a chat can author and enable a rule that fires this arm.
// Every author→Principal edge in this file must stay a ROW READ; a `UserId` arriving here carries no authority.

import { randomUUID } from "node:crypto";
import type { Principal } from "@orb/contracts/identity";
import { generateImageActionArgsSchema } from "@orb/contracts/imagery";
import { AUTOMATION_NOTICE_MESSAGE_MAX } from "@orb/contracts/notifications";
import type { InvocationChat, PluginHandlerRef } from "@orb/contracts/plugin";
import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { listSeededBackgrounds } from "@orb/contracts/theme";
import type { Db } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { toSummarizeOptions } from "@orb/server/kit/side-gen-posture";
import { can } from "#domain/admin";
import type { AssetsService } from "#domain/assets";
import type { AutomationService } from "#domain/automation";
import {
  createArmExecutors,
  createAutomationService,
  createEnabledRuleIndex,
  createPluginSubscriberRegistry,
  createPromptTransformIndex,
  loadPresentHumanMemberIds,
} from "#domain/automation";
import { loadPresentRole } from "#domain/chat";
import type { ImageryService } from "#domain/imagery";
import type { NotificationsService } from "#domain/notifications";
import type { PluginHostOps, PluginHostPort, PluginService } from "#domain/plugin";
import { buildPluginPromptTransform, buildPluginStorage, capFactContent, createPluginService } from "#domain/plugin";
import type { SettingsService } from "#domain/settings";
import type { ToolUseService } from "#domain/tool-use";
import type { WorldInfoService } from "#domain/world-info";
import { createPluginHost } from "#infra/plugin-host";
import type { RoleClientsWithSignal } from "#infra/providers";
import { publishAutomationEvent, publishNotification } from "../../transport/trpc/index.ts";
import { createAutomationOps } from "./automation-watcher.ts";
import type { ChatComposeResult } from "./chat.ts";
import { minter } from "./minter.ts";
import { loadPluginMessages } from "./plugin-chat-reads.ts";

const AUTOBG_SYSTEM =
  "You choose the single best-matching background for a scene. Reply with ONLY the exact background name from the provided list, nothing else.";
const PLUGIN_MESSAGE_CONTENT_CAP = 16_384;
// The plugin prompt-transform ORDER BAND (automation 0–999, plugins 1000+; host policy wraps guest).
const PLUGIN_TRANSFORM_ORDER_BASE = 1000;

/** What the automation+plugin seam needs from the composition root. */
export interface AutomationPluginComposeDeps {
  readonly db: Db;
  readonly now: () => number;
  readonly chatCompose: ChatComposeResult;
  /** chat's `resolveViewerVisibility` (membership AND the D16 canon floor) — automation/plugin never re-derive. */
  readonly resolveViewerVisibility: PluginHostOps["chat"]["resolveViewerVisibility"];
  readonly worldInfo: Pick<WorldInfoService, "upsertEntries">;
  readonly notifications: Pick<NotificationsService, "record">;
  readonly imagery: Pick<ImageryService, "generatePicture">;
  readonly settings: Pick<SettingsService, "getUserSettings">;
  readonly assets: Pick<AssetsService, "store" | "loadAssetBytes" | "assetCasRefById" | "reapIfOrphan">;
  readonly toolUse: Pick<ToolUseService, "registerPluginTool">;
  readonly resolveOwnerPrincipal: (userId: UserId) => Promise<Principal>;
  readonly bindRoleClients: (ownerId: UserId) => Promise<RoleClientsWithSignal>;
  /** The author's default-preset generation params (the side-gen sampling ladder's middle rung — /autobg). */
  readonly resolveUserPresetParams: (userId: UserId) => Promise<SideGenSampling>;
}

/** The automation+plugin compose product. */
export interface AutomationPluginComposeResult {
  readonly automation: AutomationService;
  readonly plugin: PluginService;
}

export async function buildAutomationPlugin(deps: AutomationPluginComposeDeps): Promise<AutomationPluginComposeResult> {
  const { db, now, chatCompose, worldInfo, notifications, imagery, settings, assets, resolveOwnerPrincipal, bindRoleClients } = deps;
  const { service: chat } = chatCompose;

  // Automation (D46) — built AFTER its action-op collaborators (chat/world-info/imagery/notifications +
  // resolveOwnerPrincipal). Every action op resolves the author's Principal where its sibling owner-gates.
  const automationNotify = publishAutomationEvent;
  const automationOps = createAutomationOps({
    db,
    resolveViewerVisibility: deps.resolveViewerVisibility,
    applyVariableOps: chatCompose.applyVariableOps,
    // PROSE-1 census 91 — the /autobg pick reads the ROOM HOST's prose, through chat's one host resolver.
    resolveChatProse: chatCompose.resolveChatProse,
    // The `trigger_turn` arm's autonomous turn → chat's `requestTurn`. `initiator:"automation"` is HARDCODED
    // here (automation cannot forge a different origin); the funder = the rule author (chat resolves the funding
    // host from the room + runs the engine's consent + per-member turn RATE belt — the loop-safety guard).
    requestTurn: async (req) => {
      const outcome = await chatCompose.requestTurn({
        chatId: req.chatId,
        initiator: "automation",
        funderUserId: req.authorUserId,
        automationDepth: req.automationDepth,
        ...(req.speakerCharacterId !== undefined ? { speakerCharacterId: req.speakerCharacterId } : {}),
        ...(req.guided !== undefined ? { guided: { action: "response", input: req.guided } } : {}),
      });
      return { messageCount: outcome.messages.length };
    },
    upsertEntries: async ({ authorUserId, bookId, entries }) =>
      worldInfo.upsertEntries({ principal: await resolveOwnerPrincipal(authorUserId), bookId, entries }),
    emitNotification: async (event) => {
      const view = await notifications.record({ event });
      publishNotification(view);
    },
    generatePicture: async (req) => {
      const caller = await resolveOwnerPrincipal(req.authorUserId);
      const picture = await imagery.generatePicture({
        caller,
        chatId: req.chatId,
        mode: req.mode,
        n: req.n,
        useAvatarReference: req.useAvatarReference,
        reuse: req.reuse,
        ...(req.prompt !== undefined ? { prompt: req.prompt } : {}),
        ...(req.negative !== undefined ? { negative: req.negative } : {}),
        ...(req.size !== undefined ? { size: req.size } : {}),
        ...(req.subjectCharacterId !== undefined ? { subjectCharacterId: req.subjectCharacterId } : {}),
      });
      // ONE /imagine path: the DEFAULT (`quiet:false`) surfaces the image IN-CHAT — otherwise a
      // `generate_image` rule's output is only ever reachable via the gallery. Post through chat's EXISTING
      // server-side image-post seam (`postNarratorMessage`), never a second posting path. `quiet:true` stays
      // store-only (gallery only).
      if (!req.quiet && picture.images.length > 0) {
        // N1 (F1 cascade belt): stamp the posted image's slot with `initiator:"automation"` + the firing rule's
        // cascade depth so its `messageCommitted` fact rides at depth ≥ 1.
        await chatCompose.rpgChatOps.postNarratorMessage(
          req.chatId,
          req.prompt ?? "",
          picture.images.map((img) => img.assetId),
          { initiator: "automation", automationDepth: req.automationDepth },
        );
      }
      return { imageCount: picture.images.length };
    },
    // BG-F — the /autobg candidate set: the SEEDED catalog PLUS the author's OWNED library uploads.
    listBackgroundChoices: async (authorUserId) => {
      const config = (await settings.getUserSettings({ principal: await resolveOwnerPrincipal(authorUserId) })).config;
      const seeded = listSeededBackgrounds().map((s) => ({
        name: s.label,
        background: { kind: "seeded" as const, seededId: s.id, externalUrl: "", assetId: "", assetHash: "", mime: "", provenanceUrl: "" },
      }));
      const owned = config.appearance.backgroundLibrary.map((entry) => ({
        name: entry.name,
        background: {
          kind: "asset" as const,
          seededId: "",
          externalUrl: "",
          assetId: entry.assetId,
          assetHash: entry.assetHash,
          mime: entry.mime,
          provenanceUrl: entry.provenanceUrl ?? "",
        },
      }));
      return [...seeded, ...owned];
    },
    // BG-F — the author-scoped chat-background write (chat's host-gated verb under the author's Principal).
    setChatBackground: async ({ authorUserId, chatId, background }) => {
      await chat.setChatBackground({ principal: await resolveOwnerPrincipal(authorUserId), chatId, background });
    },
    // BG-F — the quiet summarize-role pick: one summarize generation under the author's connection. The side-gen
    // sampling ladder: the `autobg` floor (temp 0.2, 32 out — a deterministic name pick) ← the author's
    // default-preset params. A user with no preset params gets byte-identical behavior.
    summarizeQuiet: async ({ authorUserId, prompt }) => {
      const rc = await bindRoleClients(authorUserId);
      const posture = resolveSideGenSampling(SIDE_GEN_POSTURES.autobg, await deps.resolveUserPresetParams(authorUserId));
      const res = await rc.summarize([{ systemPrompt: AUTOBG_SYSTEM, userPrompt: prompt }], toSummarizeOptions(posture));
      const item = res.items[0];
      return { text: (item?.text ?? "").trim() };
    },
  });
  const automationEnabled = createEnabledRuleIndex(db);
  // The plugin `events.on` fan-out registry — ONE per-process instance, injected into the
  // automation context (the watcher fan-out reads it) AND handed to the membrane host's `subscribeEvent` seam.
  const pluginSubscribers = createPluginSubscriberRegistry();
  // The prompt-transform index — `transform_draft` rules register into chat's compose-wired
  // `promptTransformRegistry` (the D50 seam) as they enable/disable/reorder.
  const automationTransforms = createPromptTransformIndex({
    db,
    ops: automationOps,
    prng: Math.random,
    now,
    register: chatCompose.promptTransforms.register,
    unregister: chatCompose.promptTransforms.unregister,
  });
  const automation = createAutomationService({
    db,
    now,
    prng: Math.random,
    newRuleId: minter(ID_PREFIX.automationRule),
    newFireId: minter(ID_PREFIX.automationFire),
    can,
    ops: automationOps,
    runArm: createArmExecutors({ db, ops: automationOps, prng: Math.random, notify: automationNotify }),
    enabled: automationEnabled,
    pluginSubscribers,
    transforms: automationTransforms,
    resolveAuthor: resolveOwnerPrincipal,
    notify: automationNotify,
  });
  // Prime the watcher's in-process enabled index + the transform registry from canon —
  // before the watcher starts consuming and before the first turn assembles.
  await automationEnabled.reload();
  await automationTransforms.reload();

  // ── domain/plugin (D46 Tier-2 sandbox) — the transport slice. The runtime is the sealed infra sandbox
  // (`createPluginHost`, injected UP — plugin-no-ambient); the membrane host-fn op bundle REUSES automation's
  // write ops verbatim + the installing-user global-KV bridge + the tool-use RUNTIME registrar (PL-A).
  let pluginTransformSeq = 0;
  const pluginHost: PluginHostPort = createPluginHost({ nowEpochMs: now, nextRandom: Math.random, mintId: () => randomUUID() });
  const pluginHostOps: PluginHostOps = {
    // INVARIANT (injected-op-caller-gate, INFO-5): every chat op below takes a BARE chatId and does NOT re-check
    // caller authority — it TRUSTS that admission already happened. The membrane is the ONLY caller and the gate.
    chat: {
      // The reduced plugin view, FLOOR-CLAMPED in SQL — `plugin-chat-reads.ts` (extracted so the
      // predicate deciding which canon bytes reach an untrusted guest realm has a reachable test seam).
      listMessages: (chatId, opts) => loadPluginMessages(db, chatId, opts),
      // The bridge asks this BEFORE `listMessages` and hands the resolved floor down (a non-member ⇒ `[]`).
      resolveViewerVisibility: deps.resolveViewerVisibility,
      getVariables: automationOps.chat.readVariables,
      applyVariableOps: automationOps.chat.applyVariableOps,
      // turn.trigger → chat's principal-free `requestTurn`. `initiator:"plugin"` is HARDCODED.
      requestTurn: async ({ funderUserId, chatId, automationDepth, speakerCharacterId, guided }) => {
        await chatCompose.requestTurn({
          chatId,
          initiator: "plugin",
          funderUserId,
          automationDepth,
          ...(speakerCharacterId !== undefined ? { speakerCharacterId: castId<CharacterId>(speakerCharacterId) } : {}),
          ...(guided !== undefined ? { guided: { action: "response", input: guided } } : {}),
        });
      },
    },
    worldInfo: automationOps.worldInfo,
    // storage.kv — the plugin-PRIVATE KV.
    storage: buildPluginStorage(db, now),
    // The durable inbox seam.
    notifications: {
      emit: async (event) => {
        publishNotification(await notifications.record({ event }));
      },
      post: async ({ pluginId, installerUserId, chatId, recipient, message }) => {
        const recipients = recipient === "host" ? [installerUserId] : await loadPresentHumanMemberIds(db, chatId);
        const capped = message.slice(0, AUTOMATION_NOTICE_MESSAGE_MAX);
        const source = { kind: "plugin", pluginId } as const;
        await Promise.all(
          recipients.map(async (recipientUserId) => {
            const event = { type: "automation-notice", recipientUserId, chatId, source, message: capped } as const;
            publishNotification(await notifications.record({ event }));
          }),
        );
      },
    },
    // chat.quick_reply — transient chips onto the chat's automation bus.
    quickReply: {
      surface: ({ pluginId, chatId, choices }) => {
        const projected = choices.map((c) => ({ label: c.label, sendText: c.sendText }));
        automationNotify({ type: "quickReplySurfaced", chatId, source: { kind: "plugin", pluginId }, choices: projected });
        return Promise.resolve();
      },
    },
    // The membrane's imagery returns the primary image's `{assetId}`.
    imagery: {
      generatePicture: async ({ authorUserId, chatId, args }) => {
        const p = generateImageActionArgsSchema.parse(args);
        const caller = await resolveOwnerPrincipal(authorUserId);
        const picture = await imagery.generatePicture({
          caller,
          chatId,
          mode: p.mode,
          n: p.n,
          useAvatarReference: p.useAvatarReference,
          reuse: p.reuse,
          ...(p.prompt !== undefined ? { prompt: p.prompt } : {}),
          ...(p.negative !== undefined ? { negative: p.negative } : {}),
          ...(p.size !== undefined ? { size: p.size } : {}),
          ...(p.subjectCharacterId !== undefined ? { subjectCharacterId: p.subjectCharacterId } : {}),
        });
        const first = picture.images[0];
        if (first === undefined) {
          throw new Error("plugin imagery: generation produced no image");
        }
        return { assetId: first.assetId };
      },
    },
    // The installing user's global KV — `fetchOwned` under the installer.
    variables: {
      get: async (ownerId, key) => automation.getGlobalVariable({ principal: await resolveOwnerPrincipal(ownerId), key }),
      set: async (ownerId, key, value) => {
        await automation.setGlobalVariable({ principal: await resolveOwnerPrincipal(ownerId), key, value });
      },
      delete: async (ownerId, key) => automation.deleteGlobalVariable({ principal: await resolveOwnerPrincipal(ownerId), key }),
    },
    registrar: {
      // PL-A: a plugin tool namespaces `plugin_<slug'>_<name>` and lands in the ONE tool-use registry.
      registerTool: (reg, invoke, scope) =>
        deps.toolUse.registerPluginTool({
          name: `plugin_${scope.slug.replaceAll("-", "_")}_${reg.name}`,
          description: reg.description,
          parameters: reg.parameters,
          installer: scope.installer,
          invoke: (argsJson, chatScope) => invoke(reg.handler, argsJson, chatScope),
        }),
      // D50 — one PromptTransform per collected registration in the PLUGIN order band (1000+).
      registerTransform: (reg, invoke, scope) => {
        const id = `plugin:${scope.slug}:${reg.name}:${pluginTransformSeq}`;
        const transform = buildPluginPromptTransform(reg, {
          id,
          order: PLUGIN_TRANSFORM_ORDER_BASE + pluginTransformSeq,
          isInstallerHost: async (chatId) => (await loadPresentRole(db, chatId, scope.installer.userId)) === "host",
          invoke: (handler, argsJson) => invoke(handler, argsJson, null),
        });
        pluginTransformSeq += 1;
        chatCompose.promptTransforms.register(transform);
        return { unregister: () => chatCompose.promptTransforms.unregister(id) };
      },
      // The plugin `events.on` fan-out: ONE PluginTriggerSubscriber per instance.
      subscribeEvent: (subscriptions, invoke, scope) => {
        const refsByType = new Map<string, PluginHandlerRef[]>();
        for (const sub of subscriptions) {
          const refs = refsByType.get(sub.type) ?? [];
          refs.push(sub.handler);
          refsByType.set(sub.type, refs);
        }
        const unregister = pluginSubscribers.register({
          installer: scope.installer.userId,
          declaredEvents: new Set(subscriptions.map((s) => s.type)),
          matchAutomationEvents: scope.matchAutomationEvents,
          deliver: (fact, automationDepth) => {
            const refs = refsByType.get(fact.type);
            if (refs === undefined) {
              return;
            }
            const argsJson = JSON.stringify(capFactContent(fact, PLUGIN_MESSAGE_CONTENT_CAP));
            // The event handler runs IN the fact's chat scope. `canWrite` = the installer is HOST; a chat-less
            // domain fact ⇒ no scope (`null`). The per-delivery host read + guest invokes are fire-and-forget.
            void (async (): Promise<void> => {
              let eventChat: InvocationChat | null = null;
              if (fact.chatId !== null) {
                const factChatId = castId<ChatId>(fact.chatId);
                const role = await loadPresentRole(db, factChatId, scope.installer.userId);
                eventChat = { chatId: factChatId, canWrite: role === "host", automationDepth };
              }
              await Promise.all(refs.map((handler) => invoke(handler, argsJson, eventChat).catch(() => undefined)));
            })();
          },
        });
        return { unregister };
      },
    },
  };
  const plugin = createPluginService({
    db,
    now,
    newPluginId: minter(ID_PREFIX.plugin),
    can,
    assets: {
      store: (caller, bytes, mime) => assets.store({ principal: caller, bytes, kind: "plugin", mime }),
      // The owner-scoped `plugins` row was already loaded (getById) before activation reads its bundle, so the
      // un-principal CAS read is gated upstream; `_caller` documents the seam's owner without a second check.
      readBytes: async (_caller, assetId) => {
        const bytes = await assets.loadAssetBytes(assetId);
        if (bytes === null) {
          throw new DomainNotFoundError("asset", assetId);
        }
        const ref = await assets.assetCasRefById(assetId);
        return { bytes, mime: ref?.mime ?? "application/zip" };
      },
      reapOrphans: async (assetIds) => {
        await assets.reapIfOrphan(assetIds);
      },
    },
    host: pluginHost,
    ops: pluginHostOps,
    // The snippet gate: the caller's leak-free read/host authority for a chat.
    resolveChatAuthority: async (caller, chatId) => {
      const role = await loadPresentRole(db, chatId, caller.userId);
      return { canRead: role !== null, canWrite: role === "host" };
    },
  });

  return { automation, plugin };
}
