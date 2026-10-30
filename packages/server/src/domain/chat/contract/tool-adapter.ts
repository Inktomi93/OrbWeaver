// Chat consumes the registry through an opaque resolved set, preserving resolve/project/execute identity.

import type { ToolCallRecord } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { ResolveToolsOp } from "@orb/contracts/tool-use";
import type { ChatToolDefinition, ToolCallInput } from "@orb/inference";
import type { ChatToolExecFrame } from "./context.ts";

export interface ChatToolAdapter<TSet> {
  readonly resolveTools: ResolveToolsOp<TSet>;
  readonly toToolDefinitions: (set: TSet) => readonly ChatToolDefinition[];
  readonly executeToolCalls: (
    set: TSet,
    calls: readonly ToolCallInput[],
    exec: Omit<ChatToolExecFrame, "runAsUserId"> & { readonly principal: Principal },
  ) => Promise<readonly ToolCallRecord[]>;
}
