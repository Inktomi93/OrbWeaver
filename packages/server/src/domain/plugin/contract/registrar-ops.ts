import type { PluginSubscriberRegistry } from "@orb/contracts/automation";
import type { PromptTransform } from "@orb/contracts/chat";
import type { ResolvePluginChatAuthority } from "@orb/contracts/plugin";
import type { ToolUseService } from "#domain/tool-use";
import type { Logger, TraceRing } from "#foundation/observability";
import type { PluginHostOps } from "./ops.ts";

export interface PluginRegistrarDeps {
  readonly logger: Logger;
  /** The root's trace ring each supervised plugin-event delivery seals into. */
  readonly traces: TraceRing;
  readonly toolUse: Pick<ToolUseService, "registerPluginTool">;
  readonly promptTransforms: { readonly register: (transform: PromptTransform) => void; readonly unregister: (id: string) => void };
  readonly pluginSubscribers: PluginSubscriberRegistry;
  readonly resolveChatAuthority: ResolvePluginChatAuthority;
  readonly newEventId: () => string;
}
export type PluginRegistrarOps = Pick<PluginHostOps["registrar"], "registerTool" | "registerTransform" | "subscribeEvent">;
