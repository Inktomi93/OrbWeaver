import type { PluginSubscriberRegistry } from "@orb/contracts/automation";
import type { PromptTransform } from "@orb/contracts/chat";
import type { InvocationChat, ResolvePluginChatAuthority } from "@orb/contracts/plugin";
import type { PluginToolHandle, PluginToolSpecData } from "@orb/contracts/tool-use";
import type { Logger, TraceRing } from "#foundation/observability";
import type { PluginHostOps } from "./ops.ts";

/** Insert a plugin-sourced tool at activation. `invoke` runs the guest handler, so it takes the abort signal; the
 *  rest of the registration is contracts data. */
type RegisterPluginToolOp = (
  spec: PluginToolSpecData & { readonly invoke: (argsJson: string, chat: InvocationChat | null, signal?: AbortSignal) => Promise<string> },
) => PluginToolHandle;

export interface PluginRegistrarDeps {
  readonly logger: Logger;
  /** The root's trace ring each supervised plugin-event delivery seals into. */
  readonly traces: TraceRing;
  readonly toolUse: { readonly registerPluginTool: RegisterPluginToolOp };
  readonly promptTransforms: { readonly register: (transform: PromptTransform) => void; readonly unregister: (id: string) => void };
  readonly pluginSubscribers: PluginSubscriberRegistry;
  readonly resolveChatAuthority: ResolvePluginChatAuthority;
  readonly newEventId: () => string;
}
export type PluginRegistrarOps = Pick<PluginHostOps["registrar"], "registerTool" | "registerTransform" | "subscribeEvent">;
