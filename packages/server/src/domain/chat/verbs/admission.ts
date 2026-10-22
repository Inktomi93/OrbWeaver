// D332 admits before preparation; internal follow-ups inherit their already-admitted caller.
import type { Principal } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context.ts";
import type { AdmittedChatOperations, ChatAdmissionDeps, HandoffBarrier } from "../contract/handoff-barrier.ts";
import { requireHandoffAcceptance, requireHost, requireParticipant } from "../guard.ts";
import { refuseHandoffAdmission } from "../substrate/handoff-barrier.ts";

function admitted<Params extends { readonly principal: Principal; readonly chatId: ChatId }, Result>(
  ctx: ChatContext,
  barrier: HandoffBarrier,
  authorize: typeof requireParticipant,
  operation: (params: Params) => Promise<Result>,
): (params: Params) => Promise<Result> {
  return async (params): Promise<Result> => {
    using custody = barrier.tryEnter(params.chatId);
    if (custody === null) {
      await authorize(ctx, params.principal, params.chatId);
      refuseHandoffAdmission();
    }
    // The canonical guards run under custody; a blocked request's probe cannot rebind after transfer.
    return await operation(params);
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
        await requireParticipant(ctx, params.principal, params.chatId);
        refuseHandoffAdmission();
      }
      yield* operations.impersonateStream(params);
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
