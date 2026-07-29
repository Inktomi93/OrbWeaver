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
  // `generate` = a server-written opening (the Response/Generate-opening draft path); `none` = commit the
  // room with no auto-opening so an impersonate turn can BE the first move (the owner's "a guided generation
  // can BE the first message" principle — impersonate writes the USER's opening line, not a greeting).
  opening: "generate" | "none";
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

  // A draft has no committed chatId to fire a turn against, so a guided generation that must BE the first
  // message (Generate-opening; guided impersonate) first COMMITS the draft via `startChat` (carrying the
  // founding cast + the draft-config edits, exactly like the composer Send), then fires on the new chatId.
  // Tracked as one pending flag so the cluster idles across the commit + the follow-on turn.
  const [draftCommitPending, setDraftCommitPending] = useState(false);

  /** Commit the active draft and hand back the new chatId, threading the `startChat` `opening` policy + an
   *  optional opening steer. Clears the consumed draft config on success (mirrors the composer Send). */
  const commitDraft = async (opening: "generate" | "none", guided?: GuidedSteerInput): Promise<ChatId> => {
    const { draftKey, characterIds, carry } = resolveDraftCommit(opts.handle, opts.draftSeed);
    const result = await startChat.mutateAsync({
      characterIds,
      anchorPersonaId: opts.draftSeed?.anchorPersonaId ?? null,
      title: opts.draftSeed?.title ?? null,
      opening,
      ...(guided !== undefined ? { guided } : {}),
      ...carry,
    });
    opts.onCommitted?.(result.chat.id);
    if (draftKey !== null) {
      clearDraftConfig(draftKey);
    }
    return result.chat.id;
  };

  /** Run a draft-commit-then-fire flow under the shared pending flag, threading the D57 restore-on-failure
   *  side effect (the just-fired steer text is handed back to the composer on a non-abort error). */
  const runDraftFlow = (input: string, flow: () => Promise<void>): void => {
    setDraftCommitPending(true);
    const restore = perFire(input);
    flow()
      .catch((error: unknown) => restore?.onError(error))
      .finally(() => setDraftCommitPending(false));
  };

  const fireOpening = (input: string): void => {
    runDraftFlow(input, async () => {
      // §6.4 empty-steer shape: an EMPTY opening steer OMITS the guided object entirely (a plain generated
      // opening) — the owner's "a guided generation can BE the first message" draft path.
      await commitDraft("generate", input.trim().length === 0 ? undefined : { action: "opening", input });
    });
  };

  return {
    isPending: generate.isPending || swipe.isPending || continueTurn.isPending || rewrite.isPending || impersonate.isPending || draftCommitPending,
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
      const guided = steerFor("impersonate", input, person);
      // A DRAFT has no committed chat: impersonate writes the USER's opening line, so on a fresh chat it IS
      // the first move (the ST "generate opening" sibling — owner: "a guided generation can BE the first
      // message"). Commit the room with NO auto-opening (`opening:"none"` — impersonate provides the first
      // line, we don't also want a generated greeting), then fire impersonate on the new chatId with the same
      // steer/person. The server impersonate verb already runs on a 0-message chat (turn.int.test.ts).
      if (chatId === null) {
        runDraftFlow(input, async () => {
          const committedId = await commitDraft("none");
          await impersonate.mutateAsync(guided === undefined ? { chatId: committedId } : { chatId: committedId, guided });
        });
        return;
      }
      impersonate.mutate(guided === undefined ? { chatId } : { chatId, guided }, perFire(input));
    },
    fireOpening,
  };
}
