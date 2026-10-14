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
        // PL-C captures the installer; the turn caller's seat grants this ceiling nothing.
        resolveInstallerAuthority: (chatId) => deps.resolveChatAuthority(scope.installer, chatId),
      }),
    registerTransform: (reg, invoke, scope): ReturnType<PluginRegistrarOps["registerTransform"]> => {
      const id = `plugin:${scope.slug}:${reg.name}:${pluginTransformSeq}`;
      const transform = buildPluginPromptTransform(reg, {
        id,
        slug: scope.slug,
        order: PLUGIN_TRANSFORM_ORDER_BASE + pluginTransformSeq,
        isInstallerHost: async (chatId) => (await deps.resolveChatAuthority(scope.installer, chatId)).canWrite,
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
          // Delivery rechecks the installer after fan-out admission; a departure while queued admits no guest.
          superviseDetached(deps.newEventId(), "plugin.event.deliver", { eventType: fact.type, pluginSlug: scope.slug }, async () => {
            let eventChat: InvocationChat | null = null;
            if (fact.chatId !== null) {
              const factChatId = castId<ChatId>(fact.chatId);
              const authority = await deps.resolveChatAuthority(scope.installer, factChatId);
              if (!authority.canRead) {
                return;
              }
              eventChat = { chatId: factChatId, canWrite: authority.canWrite, automationDepth };
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
