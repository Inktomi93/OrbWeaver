// Each activation keeps its own installer ceiling and disposable registration handles.

import type { InvocationChat, PluginHandlerRef } from "@orb/contracts/plugin";
import { PLUGIN_READ_CONTENT_MAX_CHARS, pluginToolWireName } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { superviseDetached } from "#foundation/observability";
import type { PluginRegistrarDeps, PluginRegistrarOps } from "../contract/registrar-ops.ts";
import { buildPluginPromptTransform, capFactContent } from "../substrate/registrar.ts";

const PLUGIN_TRANSFORM_ORDER_BASE = 1000;
/** Bind registration identity, host gating and supervised event delivery to the process registries. */
export function createPluginRegistrarOps(deps: PluginRegistrarDeps): PluginRegistrarOps {
  let pluginTransformSeq = 0;
  const { pluginSubscribers } = deps;
  return {
    registerTool: (reg, invoke, scope) =>
      deps.toolUse.registerPluginTool({
        name: pluginToolWireName(scope.slug, reg.name),
        ...(reg.displayName === undefined ? {} : { displayName: reg.displayName }),
        ...(reg.replayHistory === undefined ? {} : { replayHistory: reg.replayHistory }),
        description: reg.description,
        parameters: reg.parameters,
        installer: scope.installer,
        invoke: (argsJson, chatScope, signal) => invoke(reg.handler, argsJson, chatScope, signal),
        // PL-C: the invocation ceiling's principal is the INSTALLER, resolved per chat by ROW READ — the same
        // `loadPresentRole` op the transform registrar (`isInstallerHost`) and the event fan-out use. Never
        // the turn caller's membership: that made the read admission a no-op and took `canWrite` from whoever
        // happened to be host of the room the tool was called in.
        resolveInstallerRole: (chatId) => deps.loadPresentRole(chatId, scope.installer.userId),
      }),
    registerTransform: (reg, invoke, scope): ReturnType<PluginRegistrarOps["registerTransform"]> => {
      const id = `plugin:${scope.slug}:${reg.name}:${pluginTransformSeq}`;
      const transform = buildPluginPromptTransform(reg, {
        id,
        slug: scope.slug,
        order: PLUGIN_TRANSFORM_ORDER_BASE + pluginTransformSeq,
        isInstallerHost: async (chatId) => (await deps.loadPresentRole(chatId, scope.installer.userId)) === "host",
        invoke: (handler, argsJson, signal) => invoke(handler, argsJson, null, signal),
      });
      pluginTransformSeq += 1;
      deps.promptTransforms.register(transform);
      return { unregister: () => deps.promptTransforms.unregister(id) };
    },
    subscribeEvent: (subscriptions, invoke, scope): ReturnType<PluginRegistrarOps["subscribeEvent"]> => {
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
          const argsJson = JSON.stringify(capFactContent(fact, PLUGIN_READ_CONTENT_MAX_CHARS));
          // The event handler runs IN the fact's chat scope. `canWrite` = the installer is HOST; a chat-less
          // domain fact ⇒ no scope (`null`). The per-delivery host read + guest invokes are fire-and-forget.
          superviseDetached(deps.newEventId(), "plugin.event.deliver", { eventType: fact.type, pluginSlug: scope.slug }, async () => {
            let eventChat: InvocationChat | null = null;
            if (fact.chatId !== null) {
              const factChatId = castId<ChatId>(fact.chatId);
              const role = await deps.loadPresentRole(factChatId, scope.installer.userId);
              eventChat = { chatId: factChatId, canWrite: role === "host", automationDepth };
            }
            // A rejected handler is already logged with its plugin and cause by the resident `invoke`, so it is
            // not rethrown here (that would log the same failure twice).
            await Promise.allSettled(refs.map((handler) => invoke(handler, argsJson, eventChat)));
          });
        },
      });
      return { unregister };
    },
  };
}
