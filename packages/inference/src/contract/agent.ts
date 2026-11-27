// The agent-sdk session seam: the saved spend totals, the session-entry writer and the opaque tool server the
// chat turn mounts.

import type { ChatId, UserConnectionId } from "@orb/kit/ids";
import type { AgentSdkSessionId } from "./identity.ts";

/** The spend totals a resumed agent-sdk session's transcript saved, which the runtime carries into the next
 *  turn's result. Subtracting them leaves that turn's own spend. */
export interface AgentSdkSessionTotals {
  readonly costUsd: number;
  readonly webSearchRequests: number;
  /** Each model's saved counters, keyed as the result's `modelUsage` is: a model this turn billed is one whose
   *  counters grew past these. */
  readonly models: Readonly<Record<string, AgentSdkSavedModelUsage>>;
}

/** One model's counters as the transcript saved them. A token count the saved entry does not carry is `undefined`. */
export interface AgentSdkSavedModelUsage {
  readonly costUsd: number;
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
}

/** The D8 write-path injection seam: `session_entries` persistence (`packages/db/src/schema/sdk-session.ts`)
 *  as two ops, kept SDK-free/db-free here (the sealed-executor invariant — infra never imports `@orb/db`
 *  directly; the compose root builds these over `db.insert`/`db.update` and injects them). `insert` covers a
 *  BRAND NEW sdk-session lineage entry (dispositions `seeded`/`forked` — a new `sdkSessionId` was minted);
 *  `update` covers a switch back onto an EXISTING entry (`reseeded`, `rewound`, `readopted` — the SAME
 *  `sdkSessionId`). Both name the lineage the connection now runs on, and the writer moves that
 *  `(chat, connection)`'s primary seat to it; `resumed` writes nothing because the seat is already there.
 *  Absent ⇒ no persistence (the in-memory cache alone still works — a durable row is an optimization per
 *  `Tier-3b-Providers.md` Esoteric §3, not a correctness need). */
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
