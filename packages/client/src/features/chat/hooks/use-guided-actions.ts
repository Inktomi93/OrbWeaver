// The composer wand's dispatch: per-kind to chat.generate/swipe/continueTurn/impersonate. swipe/continue's
// tail-assistant target is resolved via a separate query on the same listMessages key the surface already
// reads — one shared cache entry, not a second round-trip.
//
// THE DRAFT ARMS ARE GONE (D166). Every wand action used to
// carry a second shape for a rowless room: "Guide the opening" was `chat.startChat` with `opening:"generate"`
// forced (a CREATION call wearing a turn's clothes), and impersonate-on-a-draft force-committed the room
// first because the server cannot assemble impersonation context without a chat row. A chat row exists from
// the creation click, so both collapse to "the room already exists" and a generated opening is an ordinary
// `chat.generate` — which also makes the START-1 failure class (a `generate` opening failing AFTER the room
// committed, leaving a real chat orphaned behind the draft UI while the user's retry minted a second one)
// unreachable by construction rather than degraded-not-broken.
//
// THE WAND IS THE STEERED DOOR — three ratified pairs live here (#568). This hook is the second door on
// `chat.generate`, `chat.swipe` and `chat.continueTurn`, all three budgeted at 2 by duplicate-action-doors.
// The pairing is deliberate and none of the three is the #539 echo class (two controls in ONE home, one a
// strict payload subset): every twin below is a BARE-verb affordance on another plane, and this hook is the
// only door that can carry a `guided` steer.
//   • generate / continueTurn ← `use-continue-turn.ts`: a settings-gated EMPTY-Enter keyboard gesture
//     (`continueOnSend` / `generateOnEmptySend`), no steer, no speaker, no `afterAssistant`.
//   • swipe ← `swipe-strip.tsx`: the transcript row's variant PAGER, whose right chevron generates only at
//     the tip and which owns the ‹/› keyboard nav (`use-swipe-keyboard-nav`) — a reader-side control on the
//     message, not a composer control on the draft.
// Retiring any twin deletes a whole interaction MODE (keyboard-only, or reader-side), not a redundant echo.

import type { GuidedActionKind, GuidedImpersonatePerson, RewriteToggleId } from "@orb/contracts/preset";
import type { GuidedGameSteerKind } from "@orb/kit/guided";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createEntityMutation, useInvalidation, useTRPC, useTRPCClient } from "#data";
import { GENERATION_FAILED_DETAIL, isSilencedTurnAbort, turnMutationToast } from "#lib";
import { pushFiredSteer } from "#state";
import { notifyImpersonateFailure } from "../lib/guided-failure-notices.ts";

interface GuidedSteerInput {
  readonly action: GuidedActionKind;
  readonly input?: string | undefined;
  readonly person?: GuidedImpersonatePerson | undefined;
  /** A P5 one-shot GAME steer KIND (the wand's Plot submenu / "Offer choices") — the server resolves the
   *  kit template by kind; `input` is ignored on this arm. */
  readonly gameSteer?: GuidedGameSteerKind | undefined;
  /** The Rewrite modal's picked toggle KINDS (the templating fork's ARM B) — the server resolves each id's
   *  preset prose slot and joins the sentences ahead of `input`. No fragment text crosses the wire. */
  readonly rewriteToggles?: RewriteToggleId[] | undefined;
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
  errorToast: (error) => turnMutationToast(error, "Couldn't generate a guided response."),
});

const useGuidedSwipeMutation = createEntityMutation<GuidedSlotVars, unknown>({
  options: (trpc) => trpc.chat.swipe.mutationOptions(),
  busDriven: true,
  errorToast: (error) => turnMutationToast(error, "Couldn't generate that guided swipe."),
});

const useGuidedContinueMutation = createEntityMutation<GuidedSlotVars, unknown>({
  options: (trpc) => trpc.chat.continueTurn.mutationOptions(),
  busDriven: true,
  errorToast: (error) => turnMutationToast(error, "Couldn't continue with that guidance."),
});

// F1 — Rewrite/Corrections: "fix the last reply per my instruction" lands as a NEW VARIANT of the tail
// assistant message, so it rides `chat.swipe` (append-variant) exactly like a guided swipe — the ONLY
// difference is the guided action kind (`rewrite`), which selects the out-of-character rewrite template.
// The delivery seam already existed (swipe + guided); this was the missing fire surface (the preset card
// shipped its config with nothing able to trigger it — the dead-ended-pair defect).
const useGuidedRewriteMutation = createEntityMutation<GuidedSlotVars, unknown>({
  options: (trpc) => trpc.chat.swipe.mutationOptions(),
  busDriven: true,
  errorToast: (error) => turnMutationToast(error, "Couldn't rewrite that reply."),
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

export interface UseGuidedActionsOptions {
  readonly chatId: ChatId;
  /** F3 — restore the just-fired steer text into the composer when a guided mutation FAILS (the source's
   *  sacred input-restore, client-only per D57). The wand's `onChange` clears the draft at fire time; on
   *  error the ephemeral steer would otherwise be lost. Called with the fired text on any non-abort error. */
  readonly onFireError?: ((firedText: string) => void) | undefined;
}

export interface UseGuidedActionsResult {
  readonly isPending: boolean;
  /** Null while unknown (an empty transcript, still loading, or the tail isn't assistant). */
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
  /** F1 — rewrite the tail assistant reply out of character (lands as a variant via `chat.swipe`). `toggles`
   *  are the Rewrite modal's picked KINDS: the wire carries the ids, the server resolves each one's preset
   *  prose slot and joins them ahead of `input` (the templating fork's ARM B). Either half may be empty; both
   *  empty is a no-op (that would be an unguided reroll, which Regenerate already covers). */
  readonly fireRewrite: (input: string, toggles?: readonly RewriteToggleId[]) => void;
  /** Guided impersonate (NON-PERSISTING — owner ruling): drafts the user's next line and hands it back via
   *  `onDrafted` for the composer to FILL (the ST review flow); nothing is committed. `input` is the optional
   *  steer; `person` picks the 1st/2nd/3rd-person perspective. */
  readonly fireImpersonate: (input: string, person: GuidedImpersonatePerson, onDrafted: (text: string) => void) => void;
  /** IMP-2 — cancel the LIVE impersonate stream; null when no stream is running (the cluster renders its Stop
   *  off this). Stopping unsubscribes and settles cleanly: no toast, no steer restore, partial fill KEPT. */
  readonly stopImpersonation: (() => void) | null;
}

export function useGuidedActions(opts: UseGuidedActionsOptions): UseGuidedActionsResult {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const invalidation = useInvalidation();
  const chatId = opts.chatId;

  const generate = useGuidedGenerateMutation({ trpc, invalidation });
  const swipe = useGuidedSwipeMutation({ trpc, invalidation });
  const continueTurn = useGuidedContinueMutation({ trpc, invalidation });
  const rewrite = useGuidedRewriteMutation({ trpc, invalidation });
  // The impersonation stream is in flight — idles the cluster (one action at a time) exactly like a pending
  // mutation. Set when the subscription starts, cleared on complete/error.
  const [impersonatePending, setImpersonatePending] = useState(false);
  // IMP-2 — the live stream's cancel lever: the subscription's own unsubscribe, wrapped so it SETTLES the
  // flow as a normal completion. Non-null EXACTLY while a stream is filling the composer, which is what the
  // cluster renders its Stop off (a draft commit that precedes the stream is not cancellable — there is no
  // subscription yet, and the room is already being written). Cancelling KEEPS the partial fill already in
  // the composer: a deliberate divergence from ST, which clears the draft at start and overwrites per tick
  // (2026-08-01) — ours is a review flow, so a half-drafted line
  // the user stopped BECAUSE they liked its start is the thing they wanted to keep.
  const [stopImpersonation, setStopImpersonation] = useState<(() => void) | null>(null);

  // F3 — the fired-steer side-effects, applied around every committed guided fire: record the steer into
  // the session recovery ring, and on a NON-ABORT failure hand the text back so the wand can restore the
  // draft (a silenced turn-abort is a user stop, not a lost steer). This is ONLY the input-restore + ring the
  // source treats as sacred — NOT an error surface (it is a no-op on an empty composer, and shows nothing when
  // it does run). The user-visible toast rides the mutation's own `errorToast` meta, or — for the
  // subscription-driven impersonate, which has no meta seam — `notifyImpersonateFailure`.
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

  const tailQuery = useQuery(trpc.chat.listMessages.queryOptions({ chatId }));
  // The raw tail IS the tail a reader means (D124: every canon row is a real message now — the rpg
  // state-anchor slot this used to skip no longer exists).
  const tailMessage = tailQuery.data?.messages.at(-1);
  const tailAssistant = tailMessage !== undefined && tailMessage.role === "assistant" ? tailMessage : null;
  const tailAssistantMessageId: MessageId | null = tailAssistant?.id ?? null;
  // The tail assistant slot's continue snapshot (D26 `hasContinuation`) — the utility menu's Undo/Revert
  // phase-gate (nothing to undo until a continue has run on this reply's shown swipe).
  const tailHasContinuation: boolean = tailAssistant?.hasContinuation ?? false;

  /** Drive the `chat.impersonateStream` SUBSCRIPTION imperatively: accumulate each text delta and hand the
   *  GROWING text to `fill` as it arrives (progressive composer fill). Resolves when the stream completes; on a
   *  domain-error terminal frame, a transport error, OR a server-reported fault the link would silently retry,
   *  it rejects with a USER-FACING message (the caller toasts it). A partial fill already applied stays in the
   *  composer UNLESS a typed steer is restored over it (the D57 restore wins — the steer is the recoverable
   *  thing, a truncated half-line is not).
   *
   *  ONE-SHOT, NOT A LIVE FEED — every settle path unsubscribes. This is the zombie-subscription seam: the
   *  handle was previously discarded, and the link tears itself down only on complete/error. A server fault
   *  with a RETRYABLE tRPC code (INTERNAL_SERVER_ERROR) is NOT an error to `httpSubscriptionLink`: it
   *  reports "connecting" with the error and lets EventSource reconnect every ~3s FOREVER, re-running the
   *  server generator (a full silent re-generation per reconnect) while NO client callback ever fires — the
   *  owner's dead-engine incident, one gesture and minutes of `impersonateStream` GETs. For a one-shot,
   *  non-resumable drive that is terminal: reject + unsubscribe on the first server-reported connection error.
   *
   *  THE GUARD IS STILL LOAD-BEARING, but the incident's own trigger is gone at the source: a raw
   *  `ProviderError` used to reach here as a 500 because it is not a `DomainError` and so never became a
   *  typed terminal frame. `transport/trpc/error-mapping.ts` classifies it now, so a provider fault of a
   *  modelled kind arrives on `onData` as a terminal frame that terminates. What still lands here is the
   *  genuinely unmodelled throw — which is exactly the shape this guard was written for. */
  const streamImpersonation = (targetChatId: ChatId, guided: GuidedSteerInput | undefined, fill: (accumulated: string) => void): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      let accumulated = "";
      let settled = false;
      // Assigned right after `subscribe` returns — the observer fires SYNCHRONOUSLY during the call (the link's
      // behavior-subject replays its initial `connecting` state), so a `const handle` referenced from a callback
      // would be a TDZ crash. `settle` closes over the box instead. That one synchronous emission carries
      // `error: null`, so it never settles: every settle path below runs with `close` assigned.
      let close: (() => void) | undefined;
      const settle = (finish: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        close?.();
        setStopImpersonation(null);
        finish();
      };
      const handle = trpcClient.chat.impersonateStream.subscribe(guided === undefined ? { chatId: targetChatId } : { chatId: targetChatId, guided }, {
        // The yields are `tracked()` envelopes: the payload rides `envelope.data` — a `{ delta }` chunk OR the
        // typed `__subscriptionError` terminal frame `withSubscriptionErrors` emits for a domain error (the
        // participant gate / a provider fault), which we surface as a rejection rather than a silent stall. Its
        // `message` is the CURATED domain message, so it rides through as the toast detail (the same treatment
        // `use-chat-bus` gives its own terminal frame).
        onData: (envelope) => {
          const payload = envelope.data;
          if ("__subscriptionError" in payload) {
            settle(() => reject(new Error(payload.message)));
            return;
          }
          accumulated += payload.delta;
          fill(accumulated);
        },
        onComplete: () => settle(resolve),
        // A link-level throw (a non-retryable code / a dead EventSource) carries framework text, never user
        // copy — the caller's toast uses the generic detail and the raw error rides `cause` for the console.
        onError: (error) => settle(() => reject(new Error(GENERATION_FAILED_DETAIL, { cause: error }))),
        // The retry-instead-of-fail arm (see the doc comment): `connecting` WITH an error means the link is
        // about to silently re-open the stream. Terminal ONLY when the error carries a tRPC error SHAPE
        // (`.data`) — i.e. the SERVER reported the failure and the link chose to retry it. A shapeless error
        // is the socket dropping (`TRPCClientError.from(<DOM Event>)`, message "Unknown error"), which stays
        // on tRPC's own reconnect path.
        onConnectionStateChange: (state) => {
          if (state.error !== null && state.error.data !== undefined) {
            settle(() => reject(new Error(GENERATION_FAILED_DETAIL, { cause: state.error })));
          }
        },
      });
      close = (): void => handle.unsubscribe();
      // The user's Stop: unsubscribe + resolve. A cancel is NOT a failure — resolving means no toast fires and
      // the D57 steer-restore never runs, so the drafted text the user chose to keep survives untouched.
      setStopImpersonation(() => (): void => settle(resolve));
    });

  return {
    isPending: generate.isPending || swipe.isPending || continueTurn.isPending || rewrite.isPending || impersonatePending,
    tailAssistantMessageId,
    tailHasContinuation,
    fireResponse: (input, respOpts): void => {
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
      // No perFire: the steer is a picked KIND, not recoverable composer text — nothing to restore/recall.
      generate.mutate({ chatId, guided: { action: "response", gameSteer: kind } });
    },
    fireSwipe: (input): void => {
      if (tailAssistantMessageId === null) {
        return;
      }
      const guided = steerFor("swipe", input);
      swipe.mutate(
        guided === undefined ? { chatId, messageId: tailAssistantMessageId } : { chatId, messageId: tailAssistantMessageId, guided },
        perFire(input),
      );
    },
    fireContinue: (input): void => {
      if (tailAssistantMessageId === null) {
        return;
      }
      const guided = steerFor("continue", input);
      continueTurn.mutate(
        guided === undefined ? { chatId, messageId: tailAssistantMessageId } : { chatId, messageId: tailAssistantMessageId, guided },
        perFire(input),
      );
    },
    fireRewrite: (input, toggles = []): void => {
      // Rewrite requires a steer AND a tail assistant reply to rewrite — an empty steer would be an unguided
      // reroll, which the guided-swipe item already covers. A steer is now EITHER half: picked toggle kinds
      // alone are a complete instruction once the server resolves them (ARM B), so `steerFor`'s text-only
      // emptiness rule cannot decide this one.
      if (tailAssistantMessageId === null) {
        return;
      }
      const trimmed = input.trim();
      if (trimmed === "" && toggles.length === 0) {
        return;
      }
      const guided: GuidedSteerInput = {
        action: "rewrite",
        ...(trimmed === "" ? {} : { input: trimmed }),
        ...(toggles.length === 0 ? {} : { rewriteToggles: [...toggles] }),
      };
      // `perFire` records the TYPED text into the recovery ring — the picked kinds are chips the modal keeps
      // (D57 state ownership), so there is nothing of them to lose or restore.
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
      // No navigation and no commit: the composer stays mounted, so the fill goes through the caller's own
      // onChange, called with the GROWING accumulation on each delta (progressive fill).
      // @orb-waive caught-failure-ownership(streamImpersonation): the .catch below explicitly
      // toasts via notifyImpersonateFailure before restoring the typed steer — the failure is surfaced, not
      // swallowed. Ends if the toast call is ever removed from the handler.
      streamImpersonation(chatId, guided, onDrafted)
        .catch((error: unknown) => {
          // The D57 input-restore is NOT an error surface (it silently re-types the steer, and does nothing at
          // all when the composer was empty) — impersonate rides a subscription, so it has no `meta.errorToast`
          // and every failure here used to die silent. Toast first, then restore.
          notifyImpersonateFailure(error);
          restore?.onError(error);
        })
        .finally(() => setImpersonatePending(false));
    },
    stopImpersonation,
  };
}
