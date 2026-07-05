// The CONTEXT-panel write verbs (task #28), each a module-scope `createEntityMutation` (§13.1 — the ONE
// mutation home; a call site never hand-rolls `useMutation` + cache surgery). All three route their
// settle-invalidation through the central seam:
//   • setRoomOverrides → refetch `getChat` (the room-overrides read rides `ChatDetail.roomOverrides`).
//   • setChatInjection / deleteChatInjection → refetch `listChatInjections` (the manager's own read).
// TData is `unknown` on all three (the appearance-mutation precedent): the return value is never read —
// invalidation drives the refetch, and the autosave form's `save` seam ignores the resolved value.
// TVars reuse the CONTRACT wire types (`RoomOverrides`, `ChatInjectionInput`) so a params reshape breaks
// here at compile time, never a re-spelled union at the call site (§5.5).

import type { ChatInjectionInput, RoomOverrides } from "@orb/contracts/chat";
import type { ChatId, ChatInjectionId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

/** `chat.setRoomOverrides` vars — the host-only four-field allowlist + the target chat. */
interface SetRoomOverridesVars {
  readonly chatId: ChatId;
  readonly overrides: RoomOverrides;
}

export const useSetRoomOverrides = createEntityMutation<SetRoomOverridesVars, unknown>({
  options: (trpc) => trpc.chat.setRoomOverrides.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.getChat.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't save the chat overrides.",
});

/** `chat.setChatInjection` vars — the authored injection fields (`ChatInjectionInput`: id?/position/
 *  depth/role/content/order?) + the target chat. `id` present ⇒ update; absent ⇒ create (upsert). */
type SetChatInjectionVars = ChatInjectionInput & { readonly chatId: ChatId };

export const useSetChatInjection = createEntityMutation<SetChatInjectionVars, unknown>({
  options: (trpc) => trpc.chat.setChatInjection.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.listChatInjections.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't save the injection.",
});

/** `chat.deleteChatInjection` vars — the host-only drop of one positional injection. */
interface DeleteChatInjectionVars {
  readonly chatId: ChatId;
  readonly injectionId: ChatInjectionId;
}

export const useDeleteChatInjection = createEntityMutation<DeleteChatInjectionVars, unknown>({
  options: (trpc) => trpc.chat.deleteChatInjection.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.listChatInjections.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't remove the injection.",
});
