// `useGuidedActions` — the composer wand's dispatch (chat-surface-lane task #27, guided generations:
// the USER's ephemeral steering, distinct from crew's persistent guides). There is NO server-side
// per-kind registry to consume: `contracts/preset`'s `GUIDED_ACTION_IMPLS` is aspirational prose in a
// header comment (never actually built — grepped repo-wide before writing this file) — the real
// dispatch is simply "which already-built domain verb carries this turn's `guided` steer", which is
// exactly what this hook is. Branches on the `ChatHandle` DISCRIMINANT (never an ambient boolean,
// UI-Gates §11.3):
//   • DRAFT   — no committed turn exists yet to steer, so the one action is the degenerate "Guide the
//     opening": `chat.startChat` with `opening:"generate"` FORCED (the verbatim first-message/greet-all
//     paths never resolve a guided template — see `runGeneratedOpening`, domain/chat/verbs/start-chat.ts)
//     + `guided:{action:"opening", input}`. Promotes the handle via `onCommitted` (the useSendMessage
//     commit-first-message precedent).
//   • COMMITTED — per-kind:
//       response    -> chat.generate      (lock-free fresh assistant turn, no new user row)
//       swipe       -> chat.swipe         (reroll the TAIL assistant slot)
//       continue    -> chat.continueTurn  (extend the TAIL assistant slot in place)
//       impersonate -> chat.impersonate   (a role:"user" slot in the active persona's voice; `person`
//                      picks the {{person}} word — 1st/2nd/3rd — the kit resolver defaults to "first")
// swipe/continue need the tail ASSISTANT message id (`MessageView` carries only the SELECTED variant per
// slot, D26 — there is no target without a real read). Resolved via a SEPARATE `useGatedQuery` on the
// exact same `chat.listMessages` key `ChatRoomSurface`/`MessageListSurface` already read — one shared
// cache entry, not a second network round-trip (the `chat-room-surface.tsx` `ComposerTailGate`
// precedent) — rather than threading a new prop through the off-limits `surfaces/` tier for this lane.

import type { GuidedActionKind, GuidedImpersonatePerson } from "@orb/contracts/preset";
import type { CharacterId, ChatId, MessageId, PersonaId } from "@orb/kit/ids";
import { useMemo, useState } from "react";
import { createEntityMutation, useGatedQuery, useInvalidation, useTRPC } from "#data";
import type { ChatHandle, DraftSeed } from "#state";
import { clearDraftConfig, isCommitted } from "#state";
import type { DraftCarry } from "../lib/draft-commit";
import { resolveDraftCommit } from "../lib/draft-commit";

/** The wire shape every guided verb accepts as its `guided` param (domain `GuidedSteer`, mirrored
 *  client-side — the router validates it as `z.any()`, so this is a type-only contract, not a schema). */
interface GuidedSteerInput {
  readonly action: GuidedActionKind;
  readonly input: string;
  readonly person?: GuidedImpersonatePerson | undefined;
}

interface GuidedTurnVars {
  readonly chatId: ChatId;
  readonly guided: GuidedSteerInput;
}

interface GuidedSlotVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly guided: GuidedSteerInput;
}

// Module-scope factories (§13.1 pattern — the returned hooks have a stable identity). BUS-DRIVEN (TData
// `unknown`, never read back here): every one of these is a turn on the OPEN chat whose verb emits a canon
// event on it — generate/continue/impersonate → messageCommitted+turnCompleted, swipe → turnCompleted (all
// → chatReads) — delivered by the active subscription → the seam refetches. So all four are `busDriven`:
// re-invalidating the bus's own keys just double-refetched (the mutation-vs-bus rule, invalidation.ts).
const useGuidedGenerateMutation = createEntityMutation<GuidedTurnVars, unknown>({
  options: (trpc) => trpc.chat.generate.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't generate a guided response.",
});

const useGuidedSwipeMutation = createEntityMutation<GuidedSlotVars, unknown>({
  options: (trpc) => trpc.chat.swipe.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't generate that guided swipe.",
});

const useGuidedContinueMutation = createEntityMutation<GuidedSlotVars, unknown>({
  options: (trpc) => trpc.chat.continueTurn.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't continue with that guidance.",
});

const useGuidedImpersonateMutation = createEntityMutation<GuidedTurnVars, unknown>({
  options: (trpc) => trpc.chat.impersonate.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't impersonate with that guidance.",
});

interface GuidedStartChatVars extends DraftCarry {
  characterIds: CharacterId[];
  anchorPersonaId?: PersonaId | null | undefined;
  title?: string | null | undefined;
  opening: "generate";
  guided: GuidedSteerInput;
}

/** Mirrors `use-send-message.ts`'s own minimal `StartChatResult` read shape (no `@orb/contracts` wire-DTO
 *  home for `ChatDetail` — see that file's header for why a structural local shape is correct here too). */
interface GuidedStartChatResult {
  readonly chat: { readonly id: ChatId };
}

// `busDriven` (PD user-bus lane, mirrors use-send-message.ts's `useStartChatMutation`): `startChat` emits
// `chatsChanged` with the new chat's id → `USER_BUS_FILTERS.chatsChanged` covers listChats + getChat.
const useGuidedStartChatMutation = createEntityMutation<GuidedStartChatVars, GuidedStartChatResult>(
  {
    options: (trpc) => trpc.chat.startChat.mutationOptions(),
    busDriven: true, // emits `chatsChanged` → USER_BUS_FILTERS covers listChats + getChat(new chat).
    errorToast: "Couldn't guide the opening.",
  },
);

export interface UseGuidedActionsOptions {
  readonly handle: ChatHandle;
  readonly draftSeed?: DraftSeed | undefined;
  /** Fires once a draft is promoted to a committed chat (the `useSendMessage` commit-first-message
   *  precedent) — the composing surface's seam to flip its own `ChatHandle`. */
  readonly onCommitted?: ((chatId: ChatId) => void) | undefined;
}

export interface UseGuidedActionsResult {
  /** Any guided mutation in flight — combine with the live turn phase for the wand trigger's overall
   *  busy gate (a guided action is itself a turn; firing a second one mid-flight would race). */
  readonly isPending: boolean;
  /** The tail assistant slot's message id — swipe/continue's target. `null` while unknown (a draft, an
   *  empty transcript, still loading, or the tail isn't an assistant row) — mirrors the swipe strip's
   *  own "last assistant message only" gate (mirrors `message-row.tsx`'s `showSwipes`, read-only here). */
  readonly tailAssistantMessageId: MessageId | null;
  /** COMMITTED-only actions — composer-wand only renders/calls these once `isCommitted(handle)` (a call
   *  while `handle` is a draft is a defensive no-op, chatId being null). */
  readonly fireResponse: (input: string) => void;
  readonly fireSwipe: (input: string) => void;
  readonly fireContinue: (input: string) => void;
  readonly fireImpersonate: (input: string, person: GuidedImpersonatePerson) => void;
  /** DRAFT-only — the degenerate "Guide the opening" (forces `opening:"generate"`; see the file header). */
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

  // The tail-read precedent (file header): a separate, gated query on the SAME `listMessages` key —
  // shared cache entry, no extra round-trip. Non-suspense (`useGatedQuery`/`useQuery`) so the wand
  // degrades to "swipe/continue disabled" rather than suspending the whole composer while it settles.
  const tailQuery = useGatedQuery(chatId, (id) =>
    trpc.chat.listMessages.queryOptions({ chatId: id }),
  );
  const tailAssistantMessageId = useMemo<MessageId | null>(() => {
    // `chat.listMessages` returns `MessagesPage { messages, macroNames }` (Chat-Macro-Resolution.md
    // §1/§3) — this read only needs the tail message, never the macro-name producer.
    const tail = tailQuery.data?.messages.at(-1);
    return tail !== undefined && tail.role === "assistant" ? tail.id : null;
  }, [tailQuery.data]);

  // The "opening" degenerate path needs the commit-promotion callback `mutateAsync` gives (the
  // `useSendMessage` precedent) — ONE local pending slot spanning just this path (the other four fire
  // through `.mutate` directly, matching the swipe-strip/use-stop-turn fire-and-forget convention).
  const [openingPending, setOpeningPending] = useState(false);

  const fireOpening = (input: string): void => {
    setOpeningPending(true);
    const run = async (): Promise<void> => {
      // Carry the draft's pre-send config (roster/group/overrides/injections) into creation (P4). The
      // typed/swiped greeting (`seedGreetings`) rides too but is inert here — `opening:"generate"` forces
      // a GENERATED opening (the guided path), so the greeting seed never resolves; the user chose to
      // generate. `clearDraftConfig` after: the edits now live on the created chat.
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
    // The sticky mutation-level `.error` slot (+ `errorToast`) already surfaces a failure — nothing
    // further to do here besides releasing the local pending flag.
    run()
      .catch(() => undefined)
      .finally(() => setOpeningPending(false));
  };

  return {
    isPending:
      generate.isPending ||
      swipe.isPending ||
      continueTurn.isPending ||
      impersonate.isPending ||
      openingPending,
    tailAssistantMessageId,
    fireResponse: (input): void => {
      if (chatId === null) {
        return;
      }
      generate.mutate({ chatId, guided: { action: "response", input } });
    },
    fireSwipe: (input): void => {
      if (chatId === null || tailAssistantMessageId === null) {
        return;
      }
      swipe.mutate({
        chatId,
        messageId: tailAssistantMessageId,
        guided: { action: "swipe", input },
      });
    },
    fireContinue: (input): void => {
      if (chatId === null || tailAssistantMessageId === null) {
        return;
      }
      continueTurn.mutate({
        chatId,
        messageId: tailAssistantMessageId,
        guided: { action: "continue", input },
      });
    },
    fireImpersonate: (input, person): void => {
      if (chatId === null) {
        return;
      }
      impersonate.mutate({ chatId, guided: { action: "impersonate", input, person } });
    },
    fireOpening,
  };
}
