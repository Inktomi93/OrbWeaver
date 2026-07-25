// The composer wand's dispatch: branches on the ChatHandle discriminant. A draft has no committed turn
// to steer, so its one action is the degenerate "Guide the opening" (chat.startChat with
// opening:"generate" forced). A committed chat dispatches per-kind to chat.generate/swipe/continueTurn/
// impersonate. swipe/continue's tail-assistant target is resolved via a separate gated query on the
// same listMessages key the surface already reads — one shared cache entry, not a second round-trip.

import type { GuidedActionKind, GuidedImpersonatePerson } from "@orb/contracts/preset";
import type { CharacterId, ChatId, MessageId, PersonaId } from "@orb/kit/ids";
import { useMemo, useState } from "react";
import { createEntityMutation, useGatedQuery, useInvalidation, useTRPC } from "#data";
import type { ChatHandle, DraftSeed } from "#state";
import { clearDraftConfig, isCommitted } from "#state";
import type { DraftCarry } from "../lib/draft-commit";
import { resolveDraftCommit } from "../lib/draft-commit";
import { isSilencedTurnAbort } from "../lib/turn-abort-notice";

interface GuidedSteerInput {
  readonly action: GuidedActionKind;
  readonly input: string;
  readonly person?: GuidedImpersonatePerson | undefined;
}

interface GuidedTurnVars {
  readonly chatId: ChatId;
  readonly guided?: GuidedSteerInput | undefined;
}

interface GuidedSlotVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly guided?: GuidedSteerInput | undefined;
}

const useGuidedGenerateMutation = createEntityMutation<GuidedTurnVars, unknown>({
  options: (trpc) => trpc.chat.generate.mutationOptions(),
  busDriven: true,
  errorToast: (error) => (isSilencedTurnAbort(error) ? null : "Couldn't generate a guided response."),
});

const useGuidedSwipeMutation = createEntityMutation<GuidedSlotVars, unknown>({
  options: (trpc) => trpc.chat.swipe.mutationOptions(),
  busDriven: true,
  errorToast: (error) => (isSilencedTurnAbort(error) ? null : "Couldn't generate that guided swipe."),
});

const useGuidedContinueMutation = createEntityMutation<GuidedSlotVars, unknown>({
  options: (trpc) => trpc.chat.continueTurn.mutationOptions(),
  busDriven: true,
  errorToast: (error) => (isSilencedTurnAbort(error) ? null : "Couldn't continue with that guidance."),
});

const useGuidedImpersonateMutation = createEntityMutation<GuidedTurnVars, unknown>({
  options: (trpc) => trpc.chat.impersonate.mutationOptions(),
  busDriven: true,
  errorToast: (error) => (isSilencedTurnAbort(error) ? null : "Couldn't impersonate with that guidance."),
});

// An empty steer omits the whole `guided` object — `input:""` isn't enough, the server would still
// resolve the guided template into a dangling scaffold.
function steerFor(action: GuidedActionKind, input: string, person?: GuidedImpersonatePerson): GuidedSteerInput | undefined {
  if (input.trim() === "") {
    return;
  }
  return person === undefined ? { action, input } : { action, input, person };
}

interface GuidedStartChatVars extends DraftCarry {
  characterIds: CharacterId[];
  anchorPersonaId?: PersonaId | null | undefined;
  title?: string | null | undefined;
  opening: "generate";
  guided: GuidedSteerInput;
}

interface GuidedStartChatResult {
  readonly chat: { readonly id: ChatId };
}

const useGuidedStartChatMutation = createEntityMutation<GuidedStartChatVars, GuidedStartChatResult>({
  options: (trpc) => trpc.chat.startChat.mutationOptions(),
  busDriven: true,
  errorToast: (error) => (isSilencedTurnAbort(error) ? null : "Couldn't guide the opening."),
});

export interface UseGuidedActionsOptions {
  readonly handle: ChatHandle;
  readonly draftSeed?: DraftSeed | undefined;
  readonly onCommitted?: ((chatId: ChatId) => void) | undefined;
}

export interface UseGuidedActionsResult {
  readonly isPending: boolean;
  /** Null while unknown (a draft, an empty transcript, still loading, or the tail isn't assistant). */
  readonly tailAssistantMessageId: MessageId | null;
  readonly fireResponse: (input: string) => void;
  readonly fireSwipe: (input: string) => void;
  readonly fireContinue: (input: string) => void;
  readonly fireImpersonate: (input: string, person: GuidedImpersonatePerson) => void;
  readonly fireOpening: (input: string) => void;
}

export function useGuidedActions(opts: UseGuidedActionsOptions): UseGuidedActionsResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const chatId = isCommitted(opts.handle) ? opts.handle.id : null;

  const generate = useGuidedGenerateMutation({ trpc, invalidation });
  const swipe = useGuidedSwipeMutation({ trpc, invalidation });
  const continueTurn = useGuidedContinueMutation({ trpc, invalidation });
  const impersonate = useGuidedImpersonateMutation({ trpc, invalidation });
  const startChat = useGuidedStartChatMutation({ trpc, invalidation });

  const tailQuery = useGatedQuery(chatId, (id) => trpc.chat.listMessages.queryOptions({ chatId: id }));
  const tailAssistantMessageId = useMemo<MessageId | null>(() => {
    const tail = tailQuery.data?.messages.at(-1);
    return tail !== undefined && tail.role === "assistant" ? tail.id : null;
  }, [tailQuery.data]);

  const [openingPending, setOpeningPending] = useState(false);

  const fireOpening = (input: string): void => {
    setOpeningPending(true);
    const run = async (): Promise<void> => {
      const { draftKey, characterIds, carry } = resolveDraftCommit(opts.handle, opts.draftSeed);
      const result = await startChat.mutateAsync({
        characterIds,
        anchorPersonaId: opts.draftSeed?.anchorPersonaId ?? null,
        title: opts.draftSeed?.title ?? null,
        opening: "generate",
        guided: { action: "opening", input },
        ...carry,
      });
      opts.onCommitted?.(result.chat.id);
      if (draftKey !== null) {
        clearDraftConfig(draftKey);
      }
    };
    run()
      .catch(() => undefined)
      .finally(() => setOpeningPending(false));
  };

  return {
    isPending: generate.isPending || swipe.isPending || continueTurn.isPending || impersonate.isPending || openingPending,
    tailAssistantMessageId,
    fireResponse: (input): void => {
      if (chatId === null) {
        return;
      }
      const guided = steerFor("response", input);
      generate.mutate(guided === undefined ? { chatId } : { chatId, guided });
    },
    fireSwipe: (input): void => {
      if (chatId === null || tailAssistantMessageId === null) {
        return;
      }
      const guided = steerFor("swipe", input);
      swipe.mutate(guided === undefined ? { chatId, messageId: tailAssistantMessageId } : { chatId, messageId: tailAssistantMessageId, guided });
    },
    fireContinue: (input): void => {
      if (chatId === null || tailAssistantMessageId === null) {
        return;
      }
      const guided = steerFor("continue", input);
      continueTurn.mutate(guided === undefined ? { chatId, messageId: tailAssistantMessageId } : { chatId, messageId: tailAssistantMessageId, guided });
    },
    fireImpersonate: (input, person): void => {
      if (chatId === null) {
        return;
      }
      const guided = steerFor("impersonate", input, person);
      impersonate.mutate(guided === undefined ? { chatId } : { chatId, guided });
    },
    fireOpening,
  };
}
