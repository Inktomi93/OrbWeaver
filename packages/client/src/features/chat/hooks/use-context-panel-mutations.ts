// The CONTEXT-panel write verbs (task #28), each a module-scope `createEntityMutation` (§13.1 — the ONE
// mutation home; a call site never hand-rolls `useMutation` + cache surgery). Invalidation follows the
// mutation-vs-bus rule (data/invalidation.ts):
//   • setRoomOverrides → `busDriven`: the verb emits `chatUpdated` on the OPEN chat (→ chatReads covers getChat,
//     where the room-overrides read rides `ChatDetail.roomOverrides`), delivered by the active subscription.
//   • setChatInjection / deleteChatInjection → KEEP `listChatInjections`: NO bus event covers that read
//     (the manager's own list; `chatUpdated`/`chatReads` don't touch it).
// TData is `unknown` on all three (the appearance-mutation precedent): the return value is never read.
// TVars derive from the router input so a params reshape breaks here at compile time (§5.5).

import type { ChatInjectionInput } from "@orb/contracts/chat";
import { USER_MACRO_UNKNOWN_PICK_OP_CODE } from "@orb/contracts/chat";
import type { ChoiceBlockValues, UserMacroValues } from "@orb/contracts/preset";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";
import { trpcErrorReason } from "#lib";

type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

/** `chat.setRoomOverrides` — the host-only four-field allowlist + the target chat. */
export const useSetRoomOverrides = createEntityMutation<inferInput<Trpc["chat"]["setRoomOverrides"]>, unknown>({
  options: (trpc) => trpc.chat.setRoomOverrides.mutationOptions(),
  // `busDriven` on the OPEN chat: the verb emits `chatUpdated` (→ chatReads covers getChat), delivered by
  // the active subscription. Re-invalidating getChat here just double-refetched (the mutation-vs-bus rule).
  busDriven: true,
  errorToast: "Couldn't save the chat overrides.",
});

/** `chat.setHostDisplayScripts` (D121-E) — the host's per-room display-tier broadcast option. */
export const useSetHostDisplayScripts = createEntityMutation<inferInput<Trpc["chat"]["setHostDisplayScripts"]>, unknown>({
  options: (trpc) => trpc.chat.setHostDisplayScripts.mutationOptions(),
  // `busDriven` on the OPEN chat: the verb emits `chatUpdated` (→ chatReads covers getChat, where the flag
  // reads back via `ChatDetail.hostDisplayScripts`) — the setToolRecurseLimit twin.
  busDriven: true,
  errorToast: "Couldn't change who sees your display scripts.",
});

/** `chat.setOfferChoices` (B1) — the host's per-room offer-choices posture. */
export const useSetOfferChoices = createEntityMutation<inferInput<Trpc["chat"]["setOfferChoices"]>, unknown>({
  options: (trpc) => trpc.chat.setOfferChoices.mutationOptions(),
  // `busDriven` on the OPEN chat: the verb emits `chatUpdated` (→ chatReads covers getChat, where the
  // posture reads back via `ChatDetail.offerChoices`) — the setHostDisplayScripts twin.
  busDriven: true,
  errorToast: "Couldn't change whether this chat offers choices.",
});

/** `chat.setCharactersCanReact` (B7) — the host's per-room react-tool attach posture. */
export const useSetCharactersCanReact = createEntityMutation<inferInput<Trpc["chat"]["setCharactersCanReact"]>, unknown>({
  options: (trpc) => trpc.chat.setCharactersCanReact.mutationOptions(),
  // The setOfferChoices twin: `chatUpdated` → getChat → `ChatDetail.charactersCanReact`.
  busDriven: true,
  errorToast: "Couldn't change whether characters can react here.",
});

/** `chat.setReactionsEnabled` (B7) — the host's per-room reaction-plane master posture. */
export const useSetReactionsEnabled = createEntityMutation<inferInput<Trpc["chat"]["setReactionsEnabled"]>, unknown>({
  options: (trpc) => trpc.chat.setReactionsEnabled.mutationOptions(),
  // `chatUpdated` covers the toggle's own read-back; the pills/doors follow on the next `listReactions`
  // read (chatReads invalidation reaches it via the same bus round).
  busDriven: true,
  errorToast: "Couldn't change whether this chat has reactions.",
});

/** `chat.setMemberPersonaLore` — the host's switch for members' persona-attached lore. */
export const useSetMemberPersonaLore = createEntityMutation<inferInput<Trpc["chat"]["setMemberPersonaLore"]>, unknown>({
  options: (trpc) => trpc.chat.setMemberPersonaLore.mutationOptions(),
  // `chatUpdated` → getChat → `ChatDetail.memberPersonaLore`.
  busDriven: true,
  errorToast: "Couldn't change whether members' persona lore joins this chat.",
});

/** `chat.setToolRecurseLimit` (Phase A L3, ⑦) — the host's per-chat tool-call recursion cap (int
 *  1..20, server-re-validated) + the target chat. Host-gated INSIDE the verb (`requireHost`). */
export const useSetToolRecurseLimit = createEntityMutation<inferInput<Trpc["chat"]["setToolRecurseLimit"]>, unknown>({
  options: (trpc) => trpc.chat.setToolRecurseLimit.mutationOptions(),
  // `busDriven` on the OPEN chat: the verb emits `chatUpdated` (→ chatReads covers getChat, where the cap
  // reads back via `ChatDetail.toolRecurseLimit`), delivered by the active subscription (the setRoomOverrides twin).
  busDriven: true,
  errorToast: "Couldn't save the tool round limit.",
});

/** `chat.setUserMacroValues` vars (#24) — the WHOLE per-chat user-macro pick bag (the verb is a column
 *  flush, so every edit sends the rebuilt bag) + the target chat. Member-gated INSIDE the verb. */
interface SetUserMacroValuesVars {
  readonly chatId: ChatId;
  readonly values: UserMacroValues;
}

type UserMacroPicks = inferOutput<Trpc["chat"]["getUserMacroPicks"]>;

/**
 * `true` when a `setUserMacroValues` flush was refused because a `single-select`/`multi-select` pick names a
 * value the input does not declare (#1356). The refusal is TOTAL — the verb is a whole-column flush, so
 * nothing was stored — and it is the one failure of this write a person can act on, which is why the picks
 * pane renders it beside the control that was moved (WCAG 3.3.1) rather than letting it read as a fault.
 */
export function isUnknownMacroPick(error: unknown): boolean {
  return trpcErrorReason(error) === USER_MACRO_UNKNOWN_PICK_OP_CODE;
}

/**
 * The field-level copy for that refusal, in the pane's OWN vocabulary. The server's message names the macro,
 * the input and the option VALUES — internal spellings the pane never shows — so the copy is client-side and
 * keyed by code (the `character-refusal-notice` precedent), naming the option LABELS the control offers and
 * the fact that nothing was saved.
 */
export function unknownMacroPickCopy(optionLabels: readonly string[]): string {
  return optionLabels.length === 0
    ? "This input no longer offers any options, so nothing can be picked here. Nothing was saved."
    : `That pick is no longer one of this input's options, so nothing was saved. Pick one of: ${optionLabels.join(", ")}.`;
}

export const useSetUserMacroValues = createEntityMutation<SetUserMacroValuesVars, unknown, UserMacroPicks>({
  options: (trpc) => trpc.chat.setUserMacroValues.mutationOptions(),
  // OPTIMISTIC: the picks pane is a set of DISCRETE-write controls outside an autosave form (no local field
  // state re-seeds them), so a pick must paint before the round trip — patch the pane's own read. The
  // declarations half is untouched (only the room's picks changed).
  optimistic: {
    readKey: (trpc, vars) => trpc.chat.getUserMacroPicks.queryKey({ chatId: vars.chatId }),
    update: (old, vars) => (old === undefined ? old : { ...old, values: vars.values }),
  },
  // `busDriven` on the OPEN chat: the verb emits `chatUpdated` (→ the seam's `getUserMacroPicks` row),
  // delivered by the active subscription — that echo is the reconciliation of the optimistic write above.
  busDriven: true,
  // The off-vocabulary refusal is SUPPRESSED here because the pane says it beside the knob that caused it —
  // a toast on top would be one refusal in two spellings (the `isSilencedTurnAbort` precedent for the
  // function form). `useSetUserMacroValues` has exactly one consumer, the picks pane, and that pane always
  // renders the field line for this code, so suppressing it can never leave the refusal unsaid.
  errorToast: (error: unknown): string | null => (isUnknownMacroPick(error) ? null : "Couldn't save the macro picks."),
});

/** `chat.setVariables` vars — the WHOLE per-chat ChoiceBlock pick bag (the verb is a column flush, so every
 *  edit sends the rebuilt map, orphan keys included) + the target chat. Member-gated INSIDE the verb — the
 *  `setUserMacroValues` sibling, the picks pane's second knob family. */
interface SetVariablesVars {
  readonly chatId: ChatId;
  readonly values: ChoiceBlockValues;
}

type VariablePicks = inferOutput<Trpc["chat"]["getVariablePicks"]>;

export const useSetVariables = createEntityMutation<SetVariablesVars, unknown, VariablePicks>({
  options: (trpc) => trpc.chat.setVariables.mutationOptions(),
  // OPTIMISTIC + `busDriven` for the same reasons as `useSetUserMacroValues` above (discrete-write controls
  // outside an autosave form; the verb's `chatUpdated` echo is the reconciliation). Patches only the picks
  // half — the declarations come from the preset and this write never touches them.
  optimistic: {
    readKey: (trpc, vars) => trpc.chat.getVariablePicks.queryKey({ chatId: vars.chatId }),
    update: (old, vars) => (old === undefined ? old : { ...old, values: vars.values }),
  },
  busDriven: true,
  errorToast: "Couldn't save the variable picks.",
});

/** `chat.setChatInjection` vars — the authored injection fields (`ChatInjectionInput`: id?/position/
 *  depth/role/content/order?) + the target chat. `id` present ⇒ update; absent ⇒ create (upsert). */
type SetChatInjectionVars = ChatInjectionInput & { readonly chatId: ChatId };

export const useSetChatInjection = createEntityMutation<SetChatInjectionVars, unknown>({
  options: (trpc) => trpc.chat.setChatInjection.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.listChatInjections.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't save the injection.",
});

/** `chat.deleteChatInjection` — the host-only drop of one positional injection. */
export const useDeleteChatInjection = createEntityMutation<inferInput<Trpc["chat"]["deleteChatInjection"]>, unknown>({
  options: (trpc) => trpc.chat.deleteChatInjection.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.listChatInjections.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't remove the injection.",
});

/** `chat.setGroupConfig` — the whole rebuilt group config (the DU is a whole-object write) + chat. */
export const useSetGroupConfig = createEntityMutation<inferInput<Trpc["chat"]["setGroupConfig"]>, unknown>({
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
