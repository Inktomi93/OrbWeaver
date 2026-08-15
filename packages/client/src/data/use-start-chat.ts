// `useStartChat` — THE client seam for creating a chat (chat-creation-draft-mode-replacement.md §4.1).
//
// A chat row exists from the creation CLICK. Every launcher — the new-chat picker, the home quick-picks
// tile, "New chat with same cast", the character library's Start-chat — fires THIS, awaits the real
// `chat.startChat`, and lands in the real room. There is no client-side draft plane behind any of them any
// more, so there is no second commit path that has to stay byte-identical with this one.
//
// It lives in `#data`, not `features/chat`, because chat AND character both launch chats and a feature may
// never import another feature (the `useCarriedAppearanceCast` / `useDisplayScripts` precedent — same
// reasoning, same tier). `data/` may reach `state/`, so the post-create navigation is the same
// intent-named module action the rest of the app calls.
//
// THE FIRST FRAME IS WARM. `StartChatResult.chat` is a full `ChatDetail` — byte-identical to what
// `chat.getChat` serves — so the response SEEDS that read's cache key and the room paints its roster, title
// and carried theme with ZERO extra round-trips. (Not the factory's `echo` arm: that seeds a key with the
// whole mutation DATA, and this response wraps the row alongside `opening`.) Cache surgery
// is legal here and only here (`client-cache-surgery-only-in-data`).

import type { CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import { useQueryClient } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { NewChatIntent } from "#state";
import { enterCreatedChat, setActiveSection } from "#state";
import { createEntityMutation } from "./create-entity-mutation.ts";
import type { Trpc } from "./trpc.ts";
import { useTRPC } from "./trpc.ts";
import { useInvalidation } from "./use-invalidation.ts";

/** The wire vars — the CREATION-INTENT fields only. Mutable arrays match the wire schema's inferred type
 *  under exactOptionalPropertyTypes (the `characterIds` precedent). */
interface StartChatVars {
  characterIds: CharacterId[];
  anchorPersonaId?: PersonaId | null | undefined;
  title?: string | null | undefined;
  temporary?: true | undefined;
}

// The verb's own output — derived, never re-spelled: `result.chat` must stay byte-compatible with what
// `chat.getChat` serves, because it is SEEDED into that read's cache key below. A wire reshape breaks here
// at compile time instead of silently seeding a partial row.
type StartChatResult = inferOutput<Trpc["chat"]["startChat"]>;

const useStartChatMutation = createEntityMutation<StartChatVars, StartChatResult>({
  options: (trpc) => trpc.chat.startChat.mutationOptions(),
  // The verb fans `chatCreated` + `chatChanged`; the list refetch a hidden husk triggers is a row-wise no-op.
  busDriven: true,
  errorToast: "Couldn't start the chat.",
});

export interface UseStartChatResult {
  /** Create the room and enter it. Resolves to the new chat id; rejects only if the caller wants to know —
   *  the failure is already toasted by the mutation's own `errorToast`. */
  readonly startChat: (intent: NewChatIntent) => Promise<ChatId>;
  /** True for the one round-trip between the click and the room — launchers render their pending state
   *  off this rather than letting the click look dead. */
  readonly isPending: boolean;
}

export function useStartChat(): UseStartChatResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const queryClient = useQueryClient();
  const mutation = useStartChatMutation({ trpc, invalidation });

  return {
    isPending: mutation.isPending,
    startChat: async (intent): Promise<ChatId> => {
      const result = await mutation.mutateAsync({
        characterIds: [...(intent.characterIds ?? [])],
        anchorPersonaId: intent.anchorPersonaId ?? null,
        title: intent.title ?? null,
        ...(intent.temporary === true ? { temporary: true as const } : {}),
      });
      const chatId = result.chat.id;
      // The echo seed (see the header): the response IS the row `getChat` serves.
      queryClient.setQueryData(trpc.chat.getChat.queryKey({ chatId }), result.chat);
      enterCreatedChat(chatId);
      setActiveSection("chats");
      return chatId;
    },
  };
}
