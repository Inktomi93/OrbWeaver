import type { PluginSubscriberRegistry } from "@orb/contracts/automation";
import type { PromptTransform } from "@orb/contracts/chat";
import type { ParticipantRole, Principal } from "@orb/contracts/identity";
import type { InvocationChat, PluginToolRegistration } from "@orb/contracts/plugin";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { PluginHostOps } from "./ops.ts";

export interface PluginRegistrarDeps {
  readonly toolUse: {
    readonly registerPluginTool: (
      spec: Omit<PluginToolRegistration, "handler"> & {
        readonly installer: Principal;
        readonly invoke: (argsJson: string, chat: InvocationChat | null, signal?: AbortSignal) => Promise<string>;
        readonly resolveInstallerRole: (chatId: ChatId) => Promise<ParticipantRole | null>;
      },
    ) => { readonly unregister: () => void };
  };
  readonly promptTransforms: { readonly register: (transform: PromptTransform) => void; readonly unregister: (id: string) => void };
  readonly pluginSubscribers: PluginSubscriberRegistry;
  readonly loadPresentRole: (chatId: ChatId, userId: UserId) => Promise<ParticipantRole | null>;
  readonly newEventId: () => string;
}
export type PluginRegistrarOps = Pick<PluginHostOps["registrar"], "registerTool" | "registerTransform" | "subscribeEvent">;
