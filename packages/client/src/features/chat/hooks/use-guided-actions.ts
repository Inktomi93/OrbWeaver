// The composer wand's dispatch: branches on the ChatHandle discriminant. A draft has no committed turn
// to steer, so its one action is the degenerate "Guide the opening" (chat.startChat with
// opening:"generate" forced). A committed chat dispatches per-kind to chat.generate/swipe/continueTurn/
// impersonate. swipe/continue's tail-assistant target is resolved via a separate gated query on the
// same listMessages key the surface already reads — one shared cache entry, not a second round-trip.

import type { GuidedActionKind, GuidedImpersonatePerson } from "@orb/contracts/preset";
import type { GuidedGameSteerKind } from "@orb/kit/guided";
import type { CharacterId, ChatId, MessageId, PersonaId } from "@orb/kit/ids";
import { useMemo, useState } from "react";
import { createEntityMutation, useGatedQuery, useInvalidation, useTRPC } from "#data";
import type { ChatHandle, DraftSeed } from "#state";
import { clearDraftConfig, isCommitted, pushFiredSteer } from "#state";
import type { DraftCarry } from "../lib/draft-commit";
import { resolveDraftCommit } from "../lib/draft-commit";
import { isSilencedTurnAbort } from "../lib/turn-abort-notice";

interface GuidedSteerInput {
  readonly action: GuidedActionKind;
  readonly input?: string | undefined;
  readonly person?: GuidedImpersonatePerson | undefined;
  /** A P5 one-shot GAME steer KIND (the wand's Plot submenu / "Offer choices") — the server resolves the
   *  kit template by kind; `input` is ignored on this arm. */
  readonly gameSteer?: GuidedGameSteerKind | undefined;
}

interface GuidedTurnVars {
  readonly chatId: ChatId;
  readonly guided?: GuidedSteerInput | undefined;
  /** F5 — a steer + a chosen speaker in ONE `chat.generate` (a targeted nudge in a multi-character room);
   *  null/omitted ⇒ arbitration picks. The verb has always accepted both fields together. */
  readonly speakerCharacterId?: CharacterId | null | undefined;
  /** The wand Response icon sets this when the tail is an ASSISTANT turn — the server appends the
   *  `responseNudge` so a reply after the model's OWN last line has something to respond to (a user-tail
   *  Response omits it: the user message is the prompt). */
  readonly afterAssistant?: boolean | undefined;
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

// F1 — Rewrite/Corrections: "fix the last reply per my instruction" lands as a NEW VARIANT of the tail
// assistant message, so it rides `chat.swipe` (append-variant) exactly like a guided swipe — the ONLY
// difference is the guided action kind (`rewrite`), which selects the out-of-character rewrite template.
// The delivery seam already existed (swipe + guided); this was the missing fire surface (the preset card
// shipped its config with nothing able to trigger it — the dead-ended-pair defect).
const useGuidedRewriteMutation = createEntityMutation<GuidedSlotVars, unknown>({
  options: (trpc) => trpc.chat.swipe.mutationOptions(),
  busDriven: true,
  errorToast: (error) => (isSilencedTurnAbort(error) ? null : "Couldn't rewrite that reply."),
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
  guided?: GuidedSteerInput;
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
  /** F3 — restore the just-fired steer text into the composer when a guided mutation FAILS (the source's
   *  sacred input-restore, client-only per D57). The wand's `onChange` clears the draft at fire time; on
   *  error the ephemeral steer would otherwise be lost. Called with the fired text on any non-abort error. */
  readonly onFireError?: ((firedText: string) => void) | undefined;
}

export interface UseGuidedActionsResult {
  readonly isPending: boolean;
  /** Null while unknown (a draft, an empty transcript, still loading, or the tail isn't assistant). */
  readonly tailAssistantMessageId: MessageId | null;
  /** The tail assistant slot has a continue snapshot (D26) — the utility menu's Undo/Revert phase-gate. */
  readonly tailHasContinuation: boolean;
  /** F5 — a chosen speaker rides the response steer in a multi-character room (null ⇒ arbitrate). The wand
   *  passes `afterAssistant` when the tail is an assistant turn (the `responseNudge` gate). */
  readonly fireResponse: (input: string, opts?: { speakerCharacterId?: CharacterId | null; afterAssistant?: boolean }) => void;
  /** P5 — fire a one-shot GAME steer by KIND (Plot submenu / "Offer choices"). Rides the same
   *  `chat.generate` fire path; NOT recorded in the recent-steers ring (there is no typed text to lose). */
  readonly fireGameSteer: (kind: GuidedGameSteerKind) => void;
  readonly fireSwipe: (input: string) => void;
  readonly fireContinue: (input: string) => void;
  /** F1 — rewrite the tail assistant reply out of character (lands as a variant via `chat.swipe`). */
  readonly fireRewrite: (input: string) => void;
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
  const rewrite = useGuidedRewriteMutation({ trpc, invalidation });
  const impersonate = useGuidedImpersonateMutation({ trpc, invalidation });
  const startChat = useGuidedStartChatMutation({ trpc, invalidation });

  // F3 — the fired-steer side-effects, applied around every committed guided fire: record the steer into
  // the session recovery ring, and on a NON-ABORT failure hand the text back so the wand can restore the
  // draft (a silenced turn-abort is a user stop, not a lost steer). The error toast rides the mutation's
  // own `errorToast` meta; this only handles the input-restore + ring the source treats as sacred.
  const onFireError = opts.onFireError;
  const perFire = (firedText: string): { onError: (error: unknown) => void } | undefined => {
    if (firedText.trim().length === 0) {
      return;
    }
    pushFiredSteer(firedText);
    return {
      onError: (error: unknown): void => {
        if (!isSilencedTurnAbort(error)) {
          onFireError?.(firedText);
        }
      },
    };
  };

  const tailQuery = useGatedQuery(chatId, (id) => trpc.chat.listMessages.queryOptions({ chatId: id }));
  const tailAssistantMessageId = useMemo<MessageId | null>(() => {
    const tail = tailQuery.data?.messages.at(-1);
    return tail !== undefined && tail.role === "assistant" ? tail.id : null;
  }, [tailQuery.data]);
  // The tail assistant slot's continue snapshot (D26 `hasContinuation`) — the utility menu's Undo/Revert
  // phase-gate (nothing to undo until a continue has run on this reply's shown swipe).
  const tailHasContinuation = useMemo<boolean>(() => {
    const tail = tailQuery.data?.messages.at(-1);
    return tail !== undefined && tail.role === "assistant" && tail.hasContinuation;
  }, [tailQuery.data]);

  const [openingPending, setOpeningPending] = useState(false);

  const fireOpening = (input: string): void => {
    setOpeningPending(true);
    const restore = perFire(input);
    const run = async (): Promise<void> => {
      const { draftKey, characterIds, carry } = resolveDraftCommit(opts.handle, opts.draftSeed);
      const result = await startChat.mutateAsync({
        characterIds,
        anchorPersonaId: opts.draftSeed?.anchorPersonaId ?? null,
        title: opts.draftSeed?.title ?? null,
        opening: "generate",
        // §6.4 empty-steer shape: an EMPTY opening steer OMITS the guided object entirely (a plain
        // generated opening) — the owner's "a guided generation can BE the first message" draft path.
        ...(input.trim().length === 0 ? {} : { guided: { action: "opening", input } }),
        ...carry,
      });
      opts.onCommitted?.(result.chat.id);
      if (draftKey !== null) {
        clearDraftConfig(draftKey);
      }
    };
    run()
      .catch((error: unknown) => restore?.onError(error))
      .finally(() => setOpeningPending(false));
  };

  return {
    isPending: generate.isPending || swipe.isPending || continueTurn.isPending || rewrite.isPending || impersonate.isPending || openingPending,
    tailAssistantMessageId,
    tailHasContinuation,
    fireResponse: (input, respOpts): void => {
      if (chatId === null) {
        return;
      }
      const guided = steerFor("response", input);
      // F5 — a chosen speaker rides the steer in one `chat.generate` (null/omitted ⇒ arbitration picks).
      const speaker = respOpts?.speakerCharacterId ?? null;
      // The Response icon passes `afterAssistant` when the tail is an assistant turn — the server appends the
      // `responseNudge` so a reply after the model's own line isn't rudderless (a user-tail Response omits it).
      const nudgeAfterAssistant = respOpts?.afterAssistant === true;
      let vars: GuidedTurnVars = guided === undefined ? { chatId } : { chatId, guided };
      if (speaker !== null) {
        vars = { ...vars, speakerCharacterId: speaker };
      }
      if (nudgeAfterAssistant) {
        vars = { ...vars, afterAssistant: true };
      }
      generate.mutate(vars, perFire(input));
    },
    fireGameSteer: (kind): void => {
      if (chatId === null) {
        return;
      }
      // No perFire: the steer is a picked KIND, not recoverable composer text — nothing to restore/recall.
      generate.mutate({ chatId, guided: { action: "response", gameSteer: kind } });
    },
    fireSwipe: (input): void => {
      if (chatId === null || tailAssistantMessageId === null) {
        return;
      }
      const guided = steerFor("swipe", input);
      swipe.mutate(
        guided === undefined ? { chatId, messageId: tailAssistantMessageId } : { chatId, messageId: tailAssistantMessageId, guided },
        perFire(input),
      );
    },
    fireContinue: (input): void => {
      if (chatId === null || tailAssistantMessageId === null) {
        return;
      }
      const guided = steerFor("continue", input);
      continueTurn.mutate(
        guided === undefined ? { chatId, messageId: tailAssistantMessageId } : { chatId, messageId: tailAssistantMessageId, guided },
        perFire(input),
      );
    },
    fireRewrite: (input): void => {
      // Rewrite requires a steer (the correction instruction) AND a tail assistant reply to rewrite — an
      // empty steer would be an unguided reroll, which the guided-swipe item already covers.
      if (chatId === null || tailAssistantMessageId === null) {
        return;
      }
      const guided = steerFor("rewrite", input);
      if (guided === undefined) {
        return;
      }
      rewrite.mutate({ chatId, messageId: tailAssistantMessageId, guided }, perFire(input));
    },
    fireImpersonate: (input, person): void => {
      if (chatId === null) {
        return;
      }
      const guided = steerFor("impersonate", input, person);
      impersonate.mutate(guided === undefined ? { chatId } : { chatId, guided }, perFire(input));
    },
    fireOpening,
  };
}
