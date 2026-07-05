// `useSendMessage` — the composer's Send, Pattern B (scout §"composer"): branch on the `ChatHandle`
// DISCRIMINANT, never an ambient `isOptimistic` boolean (UI-Gates §11.3). A committed chat fires the
// `send` verb directly; a draft chat has no server row yet, so Send lazily creates one
// (`chat.startChat`) THEN commits the typed text as that new chat's first `send` — "commit-first-
// message." Both mutations go through `createEntityMutation` (§13.1) — the append-only "create" case
// takes the cheaper VARIABLES-render mode (no cache-patch `optimistic` config): `isPending`/`error`
// drive the composer's own busy/error chrome, and the actual appearance of the sent row rides the bus
// (`messageCommitted` → the central invalidation seam → `listMessages` refetch), which lands well
// before this mutation's promise resolves (the `send` verb's promise stays open for the WHOLE turn,
// not just the user row's commit — Stop/streaming state is read from `useTurnPhase`, never from
// `isPending` here).

import type { CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import { useState } from "react";
import { createEntityMutation, useTRPC } from "#data";
import type { ChatHandle, DraftSeed } from "#state";
import { isCommitted, isLiveTurnPhase, readTurnPhase } from "#state";
import { useInvalidation } from "./use-invalidation";

// `DraftSeed` now lives in `state/active-chat-store.ts` (state owns the seed like it owns `ChatHandle`
// — one-directional flow). Re-exported here so this hook's own consumers (composer.tsx,
// chat-room-surface.tsx) + the chat front door keep importing it from the same place — a stable seam.
export type { DraftSeed } from "#state";

interface SendVars {
  readonly chatId: ChatId;
  readonly content: string;
}

// Module-scope factory (§13.1 pattern — the returned hook has a stable identity). TData is `unknown`:
// the sent turn is bus-driven (messageCommitted/turnStarted/…), never read back from this mutation.
const useSendMutation = createEntityMutation<SendVars, unknown>({
  options: (trpc) => trpc.chat.send.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.chat.getChat.queryFilter({ chatId: vars.chatId }),
    trpc.chat.listMessages.pathFilter(),
    trpc.chat.listChats.pathFilter(),
  ],
  errorToast: "Couldn't send your message.",
});

interface StartChatVars {
  // Mutable (matches the wire schema's inferred `z.array(...)` element type) — a `readonly` array
  // isn't assignable to it under `exactOptionalPropertyTypes`; callers still receive/hold `DraftSeed`
  // as `readonly` (below), copying into a fresh mutable array only at this one call boundary.
  characterIds: CharacterId[];
  anchorPersonaId?: PersonaId | null | undefined;
  title?: string | null | undefined;
}

/**
 * The one field this path reads off `chat.startChat`'s result. `ChatDetail`/`StartChatResult` have no
 * `@orb/contracts` wire-DTO home (they're server-domain-only, `client ⇏ @orb/server` at runtime) — a
 * minimal local read shape is the correct client-side projection (the real result is a structural
 * superset, so it satisfies this at the call site) rather than widening TData to `unknown` (unlike the
 * `send`/`swipe` mutations, this ONE result IS consumed: the new chat's id promotes the draft handle).
 */
interface StartChatResult {
  readonly chat: { readonly id: ChatId };
}

const useStartChatMutation = createEntityMutation<StartChatVars, StartChatResult>({
  options: (trpc) => trpc.chat.startChat.mutationOptions(),
  invalidates: (trpc) => [trpc.chat.listChats.pathFilter()],
  errorToast: "Couldn't start the chat.",
});

export interface UseSendMessageOptions {
  readonly handle: ChatHandle;
  readonly draftSeed?: DraftSeed | undefined;
  /** Fires once a draft is promoted to a committed chat (startChat resolved) — the composition
   *  tier's seam to flip its own `ChatHandle` from `draft` to `committed`. */
  readonly onCommitted?: ((chatId: ChatId) => void) | undefined;
  /** Restore the composer's draft text after a send that failed BEFORE the user's row committed (the
   *  composer clears its textarea optimistically on submit; this puts the text back). Only the
   *  PRE-COMMIT branch calls it — see the phase-gate in `send` below. */
  readonly onRestoreDraft?: ((content: string) => void) | undefined;
}

export interface UseSendMessageResult {
  readonly send: (content: string) => void;
  readonly isPending: boolean;
  readonly error: unknown | null;
  readonly clearError: () => void;
}

export function useSendMessage(opts: UseSendMessageOptions): UseSendMessageResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const sendMutation = useSendMutation({ trpc, invalidation });
  const startChatMutation = useStartChatMutation({ trpc, invalidation });
  // ONE local error/pending slot spanning BOTH mutations (never `a.error ?? b.error` — gate
  // no-multiplexed-mutation-error, UI-Gates §11.1: each underlying mutation's own sticky error is its
  // OWN toast + `errorToast`; this slot is purely this hook's "is a send in flight / did IT fail"
  // read, derived from awaiting `mutateAsync` rather than combined from the two hooks' `.error`s).
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // RESTORE-ON-FAILED-SEND, gated on the turn phase (the "Stop flashes / lost draft" sibling bug). The
  // composer clears its textarea the instant Send is clicked; if the send then FAILS we want the text
  // back — but ONLY when the failure is pre-commit (the user's row never durably landed). The `send` verb's
  // promise stays open for the WHOLE turn and can reject AFTER the user row committed and generation began
  // (the server rethrows a post-`turnStarted` engine error — domain/chat/verbs/turn.ts createSend's
  // `try/finally`, engine.ts executeTurn's emit-turnAborted-then-rethrow). Restoring then would wrongly
  // re-populate text already persisted AND visible in the transcript.
  //
  // The gate is `isLiveTurnPhase` (pending/streaming/stopping — the SAME predicate the ghost row uses),
  // NOT `!== "idle"`: a turn slot is NOT reset to `idle` between turns (there is no client `clearTurn`
  // caller — a completed/aborted slot lingers at its terminal phase until the NEXT turn's `beginTurn`
  // overwrites it). So `!== "idle"` would read a STALE `completed`/`aborted` from a prior turn as
  // "committed" and wrongly skip the restore when a 2nd+ message fails pre-commit. `isLiveTurnPhase`
  // reads it correctly: a live turn (pending/streaming/stopping) means THIS send's `turnStarted` fired ⇒
  // `messageCommitted` fired before it (createSend emits it strictly earlier) ⇒ the row committed → keep
  // the cleared draft; a non-live phase (idle OR a stale terminal) means no live turn for this send ⇒
  // pre-commit ⇒ restore. A `startChat` rejection on the draft path is ALWAYS pre-commit (no chat/row
  // exists yet) → always restore (`committedChatId` stays null).
  //
  // TWO known-and-accepted residual windows where the gate can misjudge (both narrow, both recoverable —
  // worst case the restored text is already in the transcript, so the user just clears it, no data loss):
  // (a) a throw in createSend AFTER persistUserMessage but BEFORE turnStarted (canonFacts/arbitrate/
  // mintSyntheticGroupCharacter/activeTurns.register) leaves the phase non-live while the row IS committed
  // → a wrong restore; (b) an SSE race — a generation failing within SSE-delivery latency of `turnStarted`
  // can reject here before the client has processed the `turnStarted` frame, so the phase is still non-live
  // → a wrong restore. (A stale terminal phase is NOT a third window — `isLiveTurnPhase` reads it as
  // not-live, which is the correct restore.) The fully race-free fix is clear-on-`messageCommitted` (only
  // clear the composer once the bus confirms the user's row) — deferred: it needs bus↔composer correlation
  // plumbing. The phase-gate is the right client-only fix for now.
  const runSend = async (content: string, trimmed: string): Promise<void> => {
    let committedChatId: ChatId | null = isCommitted(opts.handle) ? opts.handle.id : null;
    try {
      if (committedChatId === null) {
        // Draft: no server row yet. Lazily create the room, then commit the typed text as its first send.
        const result = await startChatMutation.mutateAsync({
          characterIds: [...(opts.draftSeed?.characterIds ?? [])],
          anchorPersonaId: opts.draftSeed?.anchorPersonaId ?? null,
          title: opts.draftSeed?.title ?? null,
        });
        committedChatId = result.chat.id;
        opts.onCommitted?.(committedChatId);
      }
      await sendMutation.mutateAsync({ chatId: committedChatId, content: trimmed });
    } catch (err) {
      // Pre-commit ⇔ startChat itself failed (no chat/row) OR the send failed with NO live turn for it.
      if (committedChatId === null || !isLiveTurnPhase(readTurnPhase(committedChatId))) {
        opts.onRestoreDraft?.(content);
      }
      throw err;
    }
  };

  const send = (content: string): void => {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return; // continue-on-empty is a documented future enhancement (lib/continue-on-empty.ts)
    }
    setError(null);
    setIsPending(true);
    runSend(content, trimmed)
      .catch((err: unknown) => setError(err))
      .finally(() => setIsPending(false));
  };

  return {
    send,
    isPending,
    error,
    clearError: (): void => setError(null),
  };
}
