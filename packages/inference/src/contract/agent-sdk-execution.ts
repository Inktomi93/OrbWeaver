import type { AgentSdkNativeOptions, AgentSdkQuery, AgentSdkSpawn } from "./agent-sdk-native.ts";
import type { InferenceLog, SpawnIdentity } from "./runtime.ts";

export type { AgentSdkNativeOptions, AgentSdkQuery, AgentSdkSpawn } from "./agent-sdk-native.ts";

export interface AgentSdkQueryLease extends AsyncDisposable {
  readonly signal: AbortSignal;
  readonly query: ReturnType<AgentSdkQuery>;
  readonly stderrTail: () => string;
  readonly safeErrorMessage: (error: unknown) => string;
}

export interface AgentSdkLifetime {
  readonly cancel: () => void;
  readonly settle: () => Promise<void>;
}

export interface AgentSdkExecution extends AgentSdkLifetime {
  readonly open: (connection: SpawnIdentity, input: Parameters<AgentSdkQuery>[0], signal?: AbortSignal) => AgentSdkQueryLease;
}

export interface AgentSdkExecutionDeps {
  readonly query: AgentSdkQuery;
  readonly spawn?: AgentSdkSpawn;
  readonly native?: AgentSdkNativeOptions;
  readonly log: InferenceLog;
}
