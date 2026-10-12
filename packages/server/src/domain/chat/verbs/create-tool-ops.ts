// Tool execution resolves the frozen host's actual role before building its execution frame.
import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { ToolUseService } from "#domain/tool-use";
import type { BoundToolExecution, ChatToolOps, ChatToolSet } from "../contract/context.ts";

/** Adapt tool-use into chat through typed closures over the concrete resolved set.
 * The host Principal resolves before the request is built (D152).
 * @public Test-anchored composition surface.
 */
export function buildChatToolOps(toolUse: ToolUseService, resolveHostPrincipal: (userId: UserId) => Promise<Principal>): ChatToolOps {
  return {
    resolveTools: (driverUserId, names): ChatToolSet => {
      const set = toolUse.resolveTools(driverUserId, names);
      return {
        toToolDefinitions: () => toolUse.toToolDefinitions(set),
        prepareExecution: async (frame): Promise<BoundToolExecution> => {
          const exec = {
            principal: await resolveHostPrincipal(frame.runAsUserId),
            triggeredBy: frame.triggeredBy,
            chatId: frame.chatId,
            membership: frame.membership,
            turnId: frame.turnId,
            ...(frame.signal !== undefined ? { signal: frame.signal } : {}),
          };
          return (calls) => toolUse.executeToolCalls(set, calls, exec);
        },
      };
    },
  };
}
