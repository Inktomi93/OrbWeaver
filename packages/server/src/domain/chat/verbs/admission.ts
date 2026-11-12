// D332 admits before preparation; internal follow-ups inherit their already-admitted caller.
//
// A refused admission names its reason only to a caller who already holds a present seat. A closed room is refused
// after the verb's own gate, and a host outside the consent set is re-read as `hostUnavailable` only after
// `requireParticipant` passes for the caller (Spine-Identity-and-Auth §2: a non-member reads not found), so neither
// reason can probe whether a room exists or whether an account is disabled.
import type { ChatScopedParams } from "@orb/contracts/chat";
import type { ChatContext } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatHostWithoutConsentError, ChatOperationError } from "../contract/errors.ts";
import type { AdmittedChatOperations, ChatAdmissionDeps, HandoffBarrier } from "../contract/handoff-barrier.ts";
import { requireHandoffAcceptance, requireHost, requireParticipant } from "../guard.ts";
import { refuseClosedAdmission } from "../substrate/handoff-barrier.ts";

// The member's reading of a room whose host is unavailable; any other error, or a caller without a present seat,
// keeps the error the verb threw.
async function memberRefusal(ctx: ChatContext, { principal, chatId }: ChatScopedParams, error: unknown): Promise<unknown> {
  if (!(error instanceof ChatHostWithoutConsentError)) {
    return error;
  }
  await requireParticipant(ctx, principal, chatId);
  const refusal = new ChatOperationError(CHAT_OP_CODES.hostUnavailable, `chat ${chatId}: the room's host is unavailable`);
  refusal.cause = error;
  return refusal;
}

function admitted<Params extends ChatScopedParams, Result>(
  ctx: ChatContext,
  barrier: HandoffBarrier,
  authorize: typeof requireParticipant,
  operation: (params: Params) => Promise<Result>,
): (params: Params) => Promise<Result> {
  return async (params): Promise<Result> => {
    using custody = barrier.tryEnter(params.chatId);
    if (custody === null) {
      await refuseClosedAdmission(barrier, params.chatId, () => authorize(ctx, params.principal, params.chatId));
    }
    // The canonical guards run under custody; a blocked request's probe cannot rebind after transfer.
    try {
      return await operation(params);
    } catch (error) {
      throw await memberRefusal(ctx, params, error);
    }
  };
}

/** Wrap the actual service operations, not their inherited private collaborators. */
export function createAdmittedChatOperations(ctx: ChatContext, deps: ChatAdmissionDeps): AdmittedChatOperations {
  const { barrier, operations, settleDeferredTurns } = deps;
  return {
    send: admitted(ctx, barrier, requireParticipant, operations.send),
    commitMessage: admitted(ctx, barrier, requireParticipant, operations.commitMessage),
    forceCharacterTurn: admitted(ctx, barrier, requireHost, operations.forceCharacterTurn),
    swipe: admitted(ctx, barrier, requireParticipant, operations.swipe),
    continueTurn: admitted(ctx, barrier, requireParticipant, operations.continueTurn),
    generate: admitted(ctx, barrier, requireParticipant, operations.generate),
    compact: admitted(ctx, barrier, requireHost, operations.compact),
    generateImage: admitted(ctx, barrier, requireParticipant, operations.generateImage),
    async *impersonateStream(params): ReturnType<AdmittedChatOperations["impersonateStream"]> {
      using custody = barrier.tryEnter(params.chatId);
      if (custody === null) {
        await refuseClosedAdmission(barrier, params.chatId, () => requireParticipant(ctx, params.principal, params.chatId));
      }
      try {
        yield* operations.impersonateStream(params);
      } catch (error) {
        throw await memberRefusal(ctx, params, error);
      }
    },
    acceptHostHandoff: async (params): Promise<void> => {
      await requireHandoffAcceptance(ctx, params.principal, params.chatId);
      using transition = barrier.close(params.chatId);
      await transition.settle();
      const acceptance = await requireHandoffAcceptance(ctx, params.principal, params.chatId);
      if (acceptance.kind === "pending") {
        await settleDeferredTurns(params.chatId);
        await transition.settle();
      }
      await operations.acceptHostHandoff(params);
    },
  };
}
