import type { Wire } from "@orb/contracts/inference";
import type { ChatPosture } from "./side-gen.ts";

/** What a turn's resolution depends on beyond the intent and the model. */
export interface ResolveChatOptions {
  /** {@link ChatPosture}; absent is a delivered chat turn. */
  readonly posture?: ChatPosture | undefined;
  /** The wire the turn rides, where the wire changes how a reasoning budget and the output cap combine. */
  readonly wire?: Wire | undefined;
}

export interface EmbedOptions {
  readonly inputType?: "query" | "document" | undefined;
  readonly instruction?: string | undefined;
}
