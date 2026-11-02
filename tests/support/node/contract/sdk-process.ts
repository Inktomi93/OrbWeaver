import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { AgentSdkSessionId, AgentSdkSpawn } from "@orb/inference";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";

export type SdkScriptSpawn = (options: Parameters<AgentSdkSpawn>[0]) => ChildProcessWithoutNullStreams;

export interface SdkScriptInput {
  readonly lines: AsyncIterable<string>;
  /** The agent SDK's own session uuid (its `--resume` value), never an Orbweaver session row. */
  readonly sdkSessionId: AgentSdkSessionId;
  readonly frameId: (name: string) => string;
}

// A child reads the brand off kit, not the inference door: importing that door would load the whole runtime per child.
const sdkSessionIdSchema = brandedId("AgentSdkSessionId");

/** The SDK protocol's session text, parsed into the brand the product reads it as. */
export const sdkSessionIdOf = (text: string): AgentSdkSessionId => sdkSessionIdSchema.parse(text);

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
