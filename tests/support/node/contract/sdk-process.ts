import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { AgentSdkSpawn } from "@orb/inference";
import { z } from "zod";

export type SdkScriptSpawn = (options: Parameters<AgentSdkSpawn>[0]) => ChildProcessWithoutNullStreams;

export interface SdkScriptInput {
  readonly lines: AsyncIterable<string>;
  readonly sessionId: string;
  readonly frameId: (name: string) => string;
}

export const SDK_SCRIPT_FRAME_NAMES = [
  "init",
  "assistant",
  "result",
  "user",
  "status",
  "partial",
  "stream",
  "bad-meta-compact",
  "bad-meta-retry",
  "bad-meta-status",
  "bad-meta-thinking",
  "bad-meta-fallback",
  "bad-meta-refusal",
  "bad-meta-limit",
  "bad-meta-auth",
  "bad-meta-delta",
] as const;
export const SDK_SCRIPT_IDENTITY_TYPE = "orb_test_sdk_identity";
export const sdkScriptIdentitySchema = z.object({
  type: z.literal(SDK_SCRIPT_IDENTITY_TYPE),
  sessionId: z.uuid(),
  frames: z.record(z.enum(SDK_SCRIPT_FRAME_NAMES), z.uuid()),
});
