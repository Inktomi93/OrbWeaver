import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { Options, query } from "@anthropic-ai/claude-agent-sdk";

export type AgentSdkQuery = typeof query;
/** The supported raw execution hook returns a real child, never a Query or process facade. */
export type AgentSdkSpawn = (options: Parameters<NonNullable<Options["spawnClaudeCodeProcess"]>>[0]) => ChildProcessWithoutNullStreams;
/** Trusted physical selection retains the SDK's native transport and prepared environment. */
export type AgentSdkNativeOptions = Pick<
  Options,
  "executable" | "executableArgs" | "pathToClaudeCodeExecutable" | "cwd" | "debug" | "debugFile" | "onNativeProcessCreated"
>;
