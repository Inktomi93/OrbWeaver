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

import type { UserIntent } from "@orb/contracts/preset";
import type { CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import { useState } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import type { ChatHandle, DraftSeed } from "#state";
import { isCommitted, subscribeUserMessageCommitted } from "#state";

// `DraftSeed` now lives in `state/active-chat-store.ts` (state owns the seed like it owns `ChatHandle`
// — one-directional flow). Re-exported here so this hook's own consumers (composer.tsx,
// chat-room-surface.tsx) + the chat front door keep importing it from the same place — a stable seam.
export type { DraftSeed } from "#state";

interface SendVars {
  readonly chatId: ChatId;
  readonly content: string;
  /** The per-turn generation intent, threaded onto the send when present. The wire (`chat.send` schema)
   *  accepts `intent: z.any().optional()`, so this typed `Partial<UserIntent>` rides it directly. */
  readonly intent?: Partial<UserIntent> | undefined;
}

// Module-scope factory (§13.1 pattern — the returned hook has a stable identity). TData is `unknown`:
// the sent turn is bus-driven (messageCommitted/turnStarted/…), never read back from this mutation.
const useSendMutation = createEntityMutation<SendVars, unknown>({
  options: (trpc) => trpc.chat.send.mutationOptions(),
  // `busDriven` — NO mutation-side invalidation: `send` is bus-driven. The turn emits `messageCommitted` (the user's
  // message) and `turnCompleted` (the reply), each of which runs the full `chatReads` invalidation
  // (getChat + listMessages + listMessageVariants + listChats) through the SSE bus — the sanctioned
  // freshness path (UI-Gates §11.1; `staleTime: Infinity`, the bus drives freshness). Invalidating the
  // same keys here too just double-refetched them (the observed 4-5×/send storm). The bus is authoritative
  // and also covers other participants' turns; a self-only mutation invalidate is a strict, redundant subset.
  busDriven: true,
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
  /** The per-turn generation intent to thread onto the send. Undefined / empty ⇒ no `intent` on the wire
   *  (server default). Dormant today — the composer no longer supplies one; a future Presets/other
   *  intent source is the forward seam this param stays wired for. */
  readonly intent?: Partial<UserIntent> | undefined;
  /** Fires once a draft is promoted to a committed chat (startChat resolved) — the composition
   *  tier's seam to flip its own `ChatHandle` from `draft` to `committed`. */
  readonly onCommitted?: ((chatId: ChatId) => void) | undefined;
  /** Fires the instant the bus confirms the caller's OWN user row committed (a USER-role
   *  `messageCommitted` for this send's chat) — the composer clears its draft HERE, not optimistically
   *  on submit. A send that fails BEFORE that commit never fires this, so the draft naturally survives
   *  for retry with zero restore logic (the race-free replacement for the old phase-gate restore). */
  readonly onDraftCommitted?: (() => void) | undefined;
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

  // CLEAR-ON-`messageCommitted` — the RACE-FREE draft-clear correlation (UI-Gates §11.1). The composer
  // does NOT clear optimistically on submit; it holds the draft until THIS function confirms the user's
  // own row committed durably, then fires `onDraftCommitted`. Correlation is by ORDER + ROLE: exactly one
  // send is in flight at a time, so the NEXT user-role `messageCommitted` bus event for this chat after
  // the commit-producing mutation started is unambiguously "mine". We subscribe SYNCHRONOUSLY right before
  // firing that mutation — JS is single-threaded and any bus delivery needs a real network round-trip, so
  // the subscribe always lands before the event can arrive (no missed-event window). On a send that fails
  // BEFORE the commit, no user-role `messageCommitted` ever fires ⇒ the callback never runs ⇒ the draft
  // survives for retry with zero restore logic and zero race windows. The `send` verb's promise stays open
  // for the WHOLE turn, so this signal fires MID-await (the row commits strictly before generation), which
  // is exactly right: the draft clears the instant the user's line lands, not when the turn finishes.
  //
  // For a DRAFT handle the chat id isn't known until `startChat` resolves, and the user row is committed by
  // the SUBSEQUENT `send` — so we subscribe AFTER startChat, keyed on the new id, before `send` fires
  // (startChat's own seeded-greeting `messageCommitted`s are assistant-role and pre-subscribe — neither
  // could satisfy the role==="user" gate). A `startChat` rejection is always pre-commit → draft survives.
  const runSend = async (trimmed: string): Promise<void> => {
    let committedChatId: ChatId | null = isCommitted(opts.handle) ? opts.handle.id : null;
    let unsubscribe: (() => void) | null = null;
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
      // Subscribe BEFORE the send mutate (synchronous — no await between here and the fire), so the user
      // row's `messageCommitted` can't race past. The listener clears the composer's draft.
      unsubscribe = subscribeUserMessageCommitted(committedChatId, () => opts.onDraftCommitted?.());
      // Thread the per-turn intent only when it carries something (an empty object would send a bare
      // `intent: {}` — harmless but noise; omit it so "auto" is a clean no-intent send).
      const hasIntent = opts.intent !== undefined && Object.keys(opts.intent).length > 0;
      await sendMutation.mutateAsync({
        chatId: committedChatId,
        content: trimmed,
        ...(hasIntent ? { intent: opts.intent } : {}),
      });
    } finally {
      unsubscribe?.();
    }
  };

  const send = (content: string): void => {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return; // continue-on-empty is a documented future enhancement (lib/continue-on-empty.ts)
    }
    setError(null);
    setIsPending(true);
    runSend(trimmed)
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
