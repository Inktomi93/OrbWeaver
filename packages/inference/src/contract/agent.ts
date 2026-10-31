// The agent-sdk session seam: the saved spend totals, the session-entry writer and the opaque tool server the
// chat turn mounts.

import type { ChatId, UserConnectionId } from "@orb/kit/ids";
import type { AgentSdkSessionId } from "./identity.ts";

/** The spend totals a resumed agent-sdk session's transcript saved, which the runtime carries into the next
 *  turn's result. Subtracting them leaves that turn's own spend. */
export interface AgentSdkSessionTotals {
  readonly costUsd: number;
  readonly webSearchRequests: number;
}

export interface SessionEntryWriter {
  readonly insert: (entry: {
    readonly chatId: ChatId;
    readonly connectionId: UserConnectionId;
    readonly sdkSessionId: AgentSdkSessionId;
    readonly seededThroughSeq: number;
    readonly canonHash: string;
  }) => Promise<void>;
  readonly update: (entry: {
    readonly connectionId: UserConnectionId;
    readonly sdkSessionId: AgentSdkSessionId;
    readonly seededThroughSeq: number;
    readonly canonHash: string;
  }) => Promise<void>;
}

/** The core treats it as opaque; the agent-sdk backend narrows it to its MCP server-config-with-instance. */
export type AgentToolServer = unknown;
