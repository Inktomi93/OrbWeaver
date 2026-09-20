// verb: toAgentToolServer — registry → the D47 AgentToolServer (tool-use-design/02 §3). The SECOND
// projection: it wraps each resolved entry as an agent-sdk tool spec whose handler funnels the call back
// through the SAME executeToolCalls pipeline (lookup → parse → gate → invoke → serialize → record) — one
// execute path, two projections. The SDK owns the loop and invokes our wrapped handlers in-process; every
// invocation still produces the SAME ToolCallRecord the wire path persists (the D48 unification). `onRecord`
// fires per completed invocation so the caller (buddy) persists the collected records with its turn row.
//
// The agent-sdk does NOT surface a provider tool-call id to a wrapped handler (it owns the loop), so the
// projection synthesizes a stable per-server ordinal id; nothing downstream reads it beyond the record.

import type { AgentToolResult, AgentToolServer, AgentToolSpec } from "@orb/inference";
import type { CreateAgentToolServer, ToolCallBatch, ToolCallInput, ToolExecutionContext } from "../contract/params.ts";
import type { ResolvedToolSet, ToolCallRecord } from "../contract/results.ts";

type ExecuteToolCalls = (set: ResolvedToolSet, calls: ToolCallBatch, exec: ToolExecutionContext) => Promise<readonly ToolCallRecord[]>;

type ToAgentToolServer = (
  set: ResolvedToolSet,
  exec: ToolExecutionContext,
  deps: { readonly createAgentToolServer: CreateAgentToolServer },
  onRecord: (record: ToolCallRecord) => void,
) => AgentToolServer;

export function createProjectMcp(executeToolCalls: ExecuteToolCalls): ToAgentToolServer {
  return (set, exec, deps, onRecord): AgentToolServer => {
    let ordinal = 0;
    const tools: readonly AgentToolSpec[] = set.entries.map((entry) => ({
      name: entry.name,
      description: entry.description,
      inputSchema: entry.argShape,
      handler: async (args: Record<string, unknown>): Promise<AgentToolResult> => {
        ordinal += 1;
        const call: ToolCallInput = { toolCallId: `mcp_${entry.name}_${ordinal}`, name: entry.name, arguments: JSON.stringify(args) };
        const records = await executeToolCalls({ entries: [entry] }, [call], exec);
        // Single call in, single record out — the one-execute-path invariant.
        const record = records[0];
        if (record === undefined) {
          throw new Error(`tool-use: executeToolCalls returned no record for ${entry.name}`);
        }
        onRecord(record);
        // executeToolCalls always serializes a non-null result on the executed path (null is only the
        // chat loop's recorded-but-unexecuted case, which never rides this projection).
        return {
          content: [{ type: "text", text: record.result ?? "" }],
          ...(record.isError ? { isError: true } : {}),
        };
      },
    }));
    return deps.createAgentToolServer({ tools });
  };
}
