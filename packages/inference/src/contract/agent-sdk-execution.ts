import type { Options, query } from "@anthropic-ai/claude-agent-sdk";

export type AgentSdkQuery = typeof query;
export type AgentSdkSpawn = NonNullable<Options["spawnClaudeCodeProcess"]>;
