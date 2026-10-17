import type { ToolCallRecord } from "@orb/contracts/chat";
import type { WireCapture } from "@orb/contracts/debug";
import type { GenerationUsageLeg, ResolvedWarning } from "@orb/contracts/inference";

/** Provider filters remain raw query strings, including names that match no captured provider. */
export interface WireCaptureFilter {
  readonly chatId?: WireCapture["chatId"];
  readonly providerId?: string | undefined;
  readonly limit?: number | undefined;
}

/** Arguments remain the raw model text: malformed calls are diagnostic evidence, not parseable input. */
export interface WireToolCall extends Pick<ToolCallRecord, "name"> {
  readonly args: ToolCallRecord["arguments"];
}

/** Diagnostic codes remain raw strings rather than claiming application warning-schema admission. */
export interface WireWarning extends Pick<ResolvedWarning, "message"> {
  readonly code: string;
}

/**
 * Outcome metadata preserves unknown reasons and absent accounting, never parsed reply bodies.
 * Tokens sum all model calls; the output ceiling applies per call, so modelCalls is their denominator.
 */
export interface WireOutcome extends Readonly<Pick<GenerationUsageLeg, "tokensOut" | "maxOutputTokens" | "modelCalls" | "stopReason" | "terminalReason">> {
  readonly chatId: NonNullable<WireCapture["chatId"]>;
  readonly at: WireCapture["at"];
  readonly model: WireCapture["model"] | null;
  /** Engine lifecycle, not provider termination: a returned but refused generation is still completed. */
  readonly disposition: "completed" | "error" | "user" | "stale";
  readonly finishReason: string | null;
  readonly contentChars: number;
  readonly reasoningChars: number;
  readonly reasoningEffort: string | null;
  readonly toolCalls: readonly WireToolCall[];
  readonly warnings: readonly WireWarning[];
}
