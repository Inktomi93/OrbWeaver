// Chat consumes the registry through an opaque resolved set, preserving resolve/project/execute identity.

import type { ToolCallRecord } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { ChatToolDefinition, ToolCallInput } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import type { ChatToolExecFrame } from "./context.ts";

export interface ChatToolAdapter<TSet> {
  readonly resolveTools: (driverUserId: UserId, names: readonly string[]) => TSet;
  readonly toToolDefinitions: (set: TSet) => readonly ChatToolDefinition[];
  readonly executeToolCalls: (
    set: TSet,
    calls: readonly ToolCallInput[],
    exec: Omit<ChatToolExecFrame, "runAsUserId"> & { readonly principal: Principal },
  ) => Promise<readonly ToolCallRecord[]>;
}
