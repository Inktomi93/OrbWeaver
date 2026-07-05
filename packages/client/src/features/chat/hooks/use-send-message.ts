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
import { isCommitted } from "#state";
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

  const send = (content: string): void => {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return; // continue-on-empty is a documented future enhancement (lib/continue-on-empty.ts)
    }
    setError(null);
    setIsPending(true);
    const run = async (): Promise<void> => {
      if (isCommitted(opts.handle)) {
        await sendMutation.mutateAsync({ chatId: opts.handle.id, content: trimmed });
        return;
      }
      // Draft: no server row yet. Lazily create the room, then commit the typed text as its first send.
      const result = await startChatMutation.mutateAsync({
        characterIds: [...(opts.draftSeed?.characterIds ?? [])],
        anchorPersonaId: opts.draftSeed?.anchorPersonaId ?? null,
        title: opts.draftSeed?.title ?? null,
      });
      const chatId = result.chat.id;
      opts.onCommitted?.(chatId);
      await sendMutation.mutateAsync({ chatId, content: trimmed });
    };
    run()
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
