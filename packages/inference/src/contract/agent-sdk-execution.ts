import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { Options, query } from "@anthropic-ai/claude-agent-sdk";
import type { InferenceLog, SpawnIdentity } from "./runtime.ts";

export type AgentSdkQuery = typeof query;
/** The supported raw execution hook returns a real child, never a Query or process facade. */
export type AgentSdkSpawn = (options: Parameters<NonNullable<Options["spawnClaudeCodeProcess"]>>[0]) => ChildProcessWithoutNullStreams;

export interface AgentSdkQueryLease extends AsyncDisposable {
  readonly signal: AbortSignal;
  readonly query: ReturnType<AgentSdkQuery>;
  readonly stderrTail: () => string;
}

export interface AgentSdkLifetime {
  readonly cancel: () => void;
  readonly settle: () => Promise<void>;
}

export interface AgentSdkExecution extends AgentSdkLifetime {
  readonly open: (connection: SpawnIdentity, input: Parameters<AgentSdkQuery>[0], signal?: AbortSignal, captureStderr?: boolean) => AgentSdkQueryLease;
}

export interface AgentSdkExecutionDeps {
  readonly query: AgentSdkQuery;
  readonly spawn?: AgentSdkSpawn;
  readonly log: InferenceLog;
}
