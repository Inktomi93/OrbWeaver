// The runtime-typed halves of the chat turn shapes rpg consumes. The data halves live in `@orb/contracts/chat`.

import type { ChatRpgGatherData, GenerationObservationParent, RpgTurnFacts } from "@orb/contracts/chat";
import type { GenerationObservationCallback, Resolved, ToolCallInput, WireTool } from "@orb/inference";

/** A completed turn's facts plus the resolved connection the post-commit round runs on, the folded terminal tool
 *  calls and the turn's cancellation signal. */
export interface RpgTurnContext extends RpgTurnFacts {
  readonly connection: Resolved<"chat">;
  /** Null means no usable folded channel; an empty array means it ran and recorded no calls. */
  readonly terminalToolCalls: readonly ToolCallInput[] | null;
  readonly signal: AbortSignal | undefined;
}

/** What a game turn's gather returns to chat: the data contribution plus the terminal tools chat mounts on this
 *  turn and never executes. */
export interface RpgGatherResult extends ChatRpgGatherData {
  /** Absent or empty means the turn is byte-identical to a tool-less one. */
  readonly terminalTools?: readonly WireTool[] | undefined;
}

/** Open a retained generation-observation sink for a host-door call; returns the callback the provider reports into. */
export type BeginGenerationObservation = (parent: GenerationObservationParent) => GenerationObservationCallback;
