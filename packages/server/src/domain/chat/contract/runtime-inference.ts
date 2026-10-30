import type { ResolveHostPrincipalOp } from "@orb/contracts/identity";
import type { GetBoundConnectionOp, ResolveTaskParams, TaskAvailabilityOp } from "@orb/contracts/inference";
import type { ResolveOutcome, RoleClientsWithSignal } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import type { ChatContext, ChatServiceDeps } from "./context.ts";
import type { BeginGenerationObservation } from "./generation-observation.ts";

/** Funder-scoped runtime ports and the chat-owned observation seam. */

export interface ChatInferenceDeps {
  readonly connection: {
    readonly resolve: (params: ResolveTaskParams) => Promise<ResolveOutcome>;
    readonly availability: TaskAvailabilityOp;
    readonly getBoundConnection: GetBoundConnectionOp;
  };
  readonly roleClientsFor: (funderUserId: UserId) => Promise<RoleClientsWithSignal>;
  readonly resolveHostPrincipal: ResolveHostPrincipalOp;
  readonly resolveUtilityPresetParams: ChatContext["resolveUtilityPresetParams"];
  readonly beginObservation: BeginGenerationObservation;
  readonly newChatTurnId: ChatContext["newChatTurnId"];
}
/** Turn-time resolution never substitutes the room host for the requested funder. */
export interface ChatInferenceOps
  extends Pick<
      ChatContext,
      | "resolveChat"
      | "resolveSpeakerReranker"
      | "resolveSpeakerArbiter"
      | "summarizerContextTokens"
      | "embedContextTokens"
      | "summarizeAvailability"
      | "summarize"
    >,
    Pick<ChatServiceDeps, "resolveConnection" | "checkSendAvailability" | "getNextTurnConnection"> {}
