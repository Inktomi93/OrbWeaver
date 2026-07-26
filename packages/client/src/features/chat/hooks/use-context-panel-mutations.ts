// The CONTEXT-panel write verbs (task #28), each a module-scope `createEntityMutation` (§13.1 — the ONE
// mutation home; a call site never hand-rolls `useMutation` + cache surgery). Invalidation follows the
// mutation-vs-bus rule (data/invalidation.ts):
//   • setRoomOverrides → `busDriven`: the verb emits `chatUpdated` on the OPEN chat (→ chatReads covers getChat,
//     where the room-overrides read rides `ChatDetail.roomOverrides`), delivered by the active subscription.
//   • setChatInjection / deleteChatInjection → KEEP `listChatInjections`: NO bus event covers that read
//     (the manager's own list; `chatUpdated`/`chatReads` don't touch it).
// TData is `unknown` on all three (the appearance-mutation precedent): the return value is never read.
// TVars reuse the CONTRACT wire types (`RoomOverrides`, `ChatInjectionInput`) so a params reshape breaks
// here at compile time, never a re-spelled union at the call site (§5.5).

import type { ChatInjectionInput, GroupConfig, RoomOverrides } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { ChatId, ChatInjectionId } from "@orb/kit/ids";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

/** `chat.setRoomOverrides` vars — the host-only four-field allowlist + the target chat. */
interface SetRoomOverridesVars {
  readonly chatId: ChatId;
  readonly overrides: RoomOverrides;
}

export const useSetRoomOverrides = createEntityMutation<SetRoomOverridesVars, unknown>({
  options: (trpc) => trpc.chat.setRoomOverrides.mutationOptions(),
  // `busDriven` on the OPEN chat: the verb emits `chatUpdated` (→ chatReads covers getChat), delivered by
  // the active subscription. Re-invalidating getChat here just double-refetched (the mutation-vs-bus rule).
  busDriven: true,
  errorToast: "Couldn't save the chat overrides.",
});

/** `chat.setToolRecurseLimit` vars (Phase A L3, ⑦) — the host's per-chat tool-call recursion cap (int
 *  1..20, server-re-validated) + the target chat. Host-gated INSIDE the verb (`requireHost`). */
interface SetToolRecurseLimitVars {
  readonly chatId: ChatId;
  readonly limit: number;
}

export const useSetToolRecurseLimit = createEntityMutation<SetToolRecurseLimitVars, unknown>({
  options: (trpc) => trpc.chat.setToolRecurseLimit.mutationOptions(),
  // `busDriven` on the OPEN chat: the verb emits `chatUpdated` (→ chatReads covers getChat, where the cap
  // reads back via `ChatDetail.toolRecurseLimit`), delivered by the active subscription (the setRoomOverrides twin).
  busDriven: true,
  errorToast: "Couldn't save the tool-call limit.",
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

/** `chat.setGroupConfig` vars — the whole rebuilt group config (the DU is a whole-object write) + chat. */
interface SetGroupConfigVars {
  readonly chatId: ChatId;
  readonly config: GroupConfig;
}

export const useSetGroupConfig = createEntityMutation<SetGroupConfigVars, unknown>({
  options: (trpc) => trpc.chat.setGroupConfig.mutationOptions(),
  // KEEP `getGroupConfig`: it is the Group tab's OWN read (the `chats.metadata.group` sub-blob); no bus
  // event covers it (like `listChatInjections`), so the mutation invalidates it directly.
  invalidates: (trpc, vars) => [trpc.chat.getGroupConfig.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't save the group settings.",
});

/** `chat.setChatBackground` vars (BG-C) — the host-only per-chat carried background source + target chat. */
interface SetChatBackgroundVars {
  readonly chatId: ChatId;
  readonly background: ThemeBackground;
}

export const useSetChatBackground = createEntityMutation<SetChatBackgroundVars, unknown, ChatDetail>({
  options: (trpc) => trpc.chat.setChatBackground.mutationOptions(),
  // OPTIMISTIC: this is a discrete-write control OUTSIDE the room-overrides autosave form (no local field
  // state re-seeds it), so the pick must paint before the round trip — patches `getChat`'s cache directly.
  optimistic: {
    readKey: (trpc, vars) => trpc.chat.getChat.queryKey({ chatId: vars.chatId }),
    update: (old, vars) => (old === undefined ? old : { ...old, background: vars.background }),
  },
  // `busDriven` on the OPEN chat: the verb emits `chatUpdated` (→ chatReads covers getChat, where the
  // background read rides `ChatDetail.background`), delivered by the active subscription — the
  // `useSetRoomOverrides` twin. The optimistic write above is never trusted as final (createEntityMutation's
  // onSettled always reconciles); this bus echo is that reconciliation.
  busDriven: true,
  errorToast: "Couldn't save the chat background.",
});
