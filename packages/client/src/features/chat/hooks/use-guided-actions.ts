// The composer wand's dispatch: branches on the ChatHandle discriminant. A draft has no committed turn
// to steer, so its one action is the degenerate "Guide the opening" (chat.startChat with
// opening:"generate" forced). A committed chat dispatches per-kind to chat.generate/swipe/continueTurn/
// impersonate. swipe/continue's tail-assistant target is resolved via a separate gated query on the
// same listMessages key the surface already reads — one shared cache entry, not a second round-trip.

import { lastVisibleRow } from "@orb/contracts/chat";
import type { GuidedActionKind, GuidedImpersonatePerson } from "@orb/contracts/preset";
import type { GuidedGameSteerKind } from "@orb/kit/guided";
import type { CharacterId, ChatId, MessageId, PersonaId } from "@orb/kit/ids";
import { useMemo, useState } from "react";
import { createEntityMutation, useGatedQuery, useInvalidation, useTRPC, useTRPCClient } from "#data";
import type { ChatHandle, DraftSeed } from "#state";
import { clearDraftConfig, isCommitted, pushFiredSteer, setComposerDraft } from "#state";
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

// Guided impersonate is NON-PERSISTING + STREAMING (owner ruling): it rides the `chat.impersonateStream`
// SUBSCRIPTION (not a mutation), yielding text deltas the client accumulates into the composer AS THEY ARRIVE
// (progressive fill, not a one-shot dump). It's driven IMPERATIVELY off the vanilla tRPC client (a
// button-click one-shot, not a mounted `useSubscription`); nothing persists, so there's no cache to reconcile.

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
  // `generate` = a server-written opening (the Response/Generate-opening draft path). OMITTED = the server's
  // DEFAULT opening policy (greet-all/first-message by roster size) — the same as a plain draft-send, so the
  // card GREETING is preserved. The guided-impersonate draft path OMITS this (it must NOT discard the
  // greeting — it drafts the user's RESPONSE to it), never `none` (which would seed an empty chat).
  opening?: "generate";
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
  /** Guided impersonate (NON-PERSISTING — owner ruling): drafts the user's next line and hands it back via
   *  `onDrafted` for the composer to FILL (the ST review flow); nothing is committed. On a DRAFT chat it first
   *  commits the room with no auto-opening (fallback: an empty chat exists even if discarded) then drafts the
   *  opening user line. `input` is the optional steer; `person` picks the 1st/2nd/3rd-person perspective. */
  readonly fireImpersonate: (input: string, person: GuidedImpersonatePerson, onDrafted: (text: string) => void) => void;
  readonly fireOpening: (input: string) => void;
}

export function useGuidedActions(opts: UseGuidedActionsOptions): UseGuidedActionsResult {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const invalidation = useInvalidation();
  const chatId = isCommitted(opts.handle) ? opts.handle.id : null;

  const generate = useGuidedGenerateMutation({ trpc, invalidation });
  const swipe = useGuidedSwipeMutation({ trpc, invalidation });
  const continueTurn = useGuidedContinueMutation({ trpc, invalidation });
  const rewrite = useGuidedRewriteMutation({ trpc, invalidation });
  const startChat = useGuidedStartChatMutation({ trpc, invalidation });
  // The impersonation stream is in flight — idles the cluster (one action at a time) exactly like a pending
  // mutation. Set when the subscription starts, cleared on complete/error.
  const [impersonatePending, setImpersonatePending] = useState(false);

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
  // `lastVisibleRow`, not the raw tail: an rpg state anchor (the empty-body snapshot key a host
  // resync/hand-edit appends) is an assistant row nobody can see. Targeting it would have pointed
  // swipe/continue/rewrite at the slot the snapshot is keyed to — appending a prose variant onto it and
  // moving the resolution-ladder head.
  const tailAssistantMessageId = useMemo<MessageId | null>(() => {
    const tail = lastVisibleRow(tailQuery.data?.messages ?? []);
    return tail !== undefined && tail.role === "assistant" ? tail.id : null;
  }, [tailQuery.data]);
  // The tail assistant slot's continue snapshot (D26 `hasContinuation`) — the utility menu's Undo/Revert
  // phase-gate (nothing to undo until a continue has run on this reply's shown swipe).
  const tailHasContinuation = useMemo<boolean>(() => {
    const tail = lastVisibleRow(tailQuery.data?.messages ?? []);
    return tail !== undefined && tail.role === "assistant" && tail.hasContinuation;
  }, [tailQuery.data]);

  // A draft has no committed chatId to fire a turn against, so a guided generation that must BE the first
  // message (Generate-opening; guided impersonate) first COMMITS the draft via `startChat` (carrying the
  // founding cast + the draft-config edits, exactly like the composer Send), then fires on the new chatId.
  // Tracked as one pending flag so the cluster idles across the commit + the follow-on turn.
  const [draftCommitPending, setDraftCommitPending] = useState(false);

  /** Commit the active draft and hand back the new chatId. `opening` is OMITTED by default (the server's
   *  default policy — greet-all/first-message by roster size — so the card GREETING is preserved, exactly
   *  like a plain draft-send); pass `"generate"` for the server-written-opening path. Clears the consumed
   *  draft config on success (mirrors the composer Send). */
  const commitDraft = async (over: { opening?: "generate"; guided?: GuidedSteerInput } = {}): Promise<ChatId> => {
    const { draftKey, characterIds, carry } = resolveDraftCommit(opts.handle, opts.draftSeed);
    const result = await startChat.mutateAsync({
      characterIds,
      anchorPersonaId: opts.draftSeed?.anchorPersonaId ?? null,
      title: opts.draftSeed?.title ?? null,
      ...(over.opening !== undefined ? { opening: over.opening } : {}),
      ...(over.guided !== undefined ? { guided: over.guided } : {}),
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
      await commitDraft({ opening: "generate", ...(input.trim().length === 0 ? {} : { guided: { action: "opening", input } }) });
    });
  };

  /** Drive the `chat.impersonateStream` SUBSCRIPTION imperatively: accumulate each text delta and hand the
   *  GROWING text to `fill` as it arrives (progressive composer fill). Resolves when the stream completes; on a
   *  domain-error terminal frame OR a transport error it rejects (the flow's restore-on-failure surfaces it).
   *  A partial fill already applied stays in the composer (the nicer review-flow UX on cancel). */
  const streamImpersonation = (targetChatId: ChatId, guided: GuidedSteerInput | undefined, fill: (accumulated: string) => void): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      let accumulated = "";
      trpcClient.chat.impersonateStream.subscribe(guided === undefined ? { chatId: targetChatId } : { chatId: targetChatId, guided }, {
        // The yields are `tracked()` envelopes: the payload rides `envelope.data` — a `{ delta }` chunk OR the
        // typed `__subscriptionError` terminal frame `withSubscriptionErrors` emits for a domain error (the
        // participant gate / a provider fault), which we surface as a rejection rather than a silent stall.
        onData: (envelope) => {
          const payload = envelope.data;
          if ("__subscriptionError" in payload) {
            reject(new Error(payload.message));
            return;
          }
          accumulated += payload.delta;
          fill(accumulated);
        },
        onComplete: () => resolve(),
        onError: (error) => reject(error),
      });
    });

  return {
    isPending: generate.isPending || swipe.isPending || continueTurn.isPending || rewrite.isPending || impersonatePending || draftCommitPending,
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
    fireImpersonate: (input, person, onDrafted): void => {
      const guided = steerFor("impersonate", input, person);
      // NON-PERSISTING + STREAMING (owner ruling): impersonate STREAMS the user's next line into the composer
      // AS IT GENERATES (progressive fill) — nothing about the user's line is committed, so the old
      // persist→refetch flash-and-vanish is mooted. The typed steer is consumed and REPLACED by the streamed
      // line (that IS the review). Idles the cluster while streaming; restores the steer on a non-abort error.
      setImpersonatePending(true);
      const restore = perFire(input);
      const flow = async (): Promise<void> => {
        if (chatId !== null) {
          // Committed chat — no navigation, the composer stays mounted; fill via the caller's own onChange,
          // called with the GROWING accumulation on each delta (progressive fill).
          await streamImpersonation(chatId, guided, onDrafted);
          return;
        }
        // DRAFT — the server can't assemble impersonation context without a chat row (a bare card+persona
        // gather is a large parallel surface), so commit the room FIRST (the DEFAULT opening policy — omit
        // `opening` — preserves the card GREETING; impersonate then drafts the user's RESPONSE to it). The
        // commit flips the room draft→committed, so stream into the NEW chatId's composer-draft store directly
        // (the promoted composer reads that scope; the old draft-scope `onChange` is stale post-promotion).
        const targetId = await commitDraft();
        await streamImpersonation(targetId, guided, (accumulated) => setComposerDraft(targetId, accumulated));
      };
      flow()
        .catch((error: unknown) => restore?.onError(error))
        .finally(() => setImpersonatePending(false));
    },
    fireOpening,
  };
}
