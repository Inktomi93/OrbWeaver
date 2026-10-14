import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { AgentSdkSpawn } from "@orb/inference";

export type SdkScriptSpawn = (options: Parameters<AgentSdkSpawn>[0]) => ChildProcessWithoutNullStreams;
