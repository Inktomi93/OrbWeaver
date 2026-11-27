// The room's action vocabulary, built like the character action registry: the scope map is the one membership home,
// and a surface types its handler map over exactly the verbs its scope offers, so a verb added to a scope fails that
// surface's compile until it is wired. The chat list row keeps its own menu; the open room's Chat options render the
// `open` slice.

import type { LucideIcon } from "@orb/ui/icons";
import { Archive } from "@orb/ui/icons";
import { chatArchiveToggleName } from "./chat-surface-names.ts";

const CHAT_ACTION_SCOPES = ["open"] as const;

type ChatActionScope = (typeof CHAT_ACTION_SCOPES)[number];

// Which verbs each surface offers, in its render order.
const CHAT_ACTION_SCOPE_IDS = {
  open: ["archive"],
} as const satisfies Readonly<Record<ChatActionScope, readonly string[]>>;

type ChatActionId = (typeof CHAT_ACTION_SCOPE_IDS)[ChatActionScope][number];

type ScopeActionId<S extends ChatActionScope> = (typeof CHAT_ACTION_SCOPE_IDS)[S][number];

/** One verb of the room's vocabulary. */
export interface ChatActionDef<Id extends ChatActionId = ChatActionId> {
  readonly id: Id;
  /** The item's accessible name for the room's current state; a toggle names the verb it would run. */
  readonly label: (state: { readonly archived: boolean }) => string;
  readonly glyph: LucideIcon;
}

// The vocabulary; the mapped `Id` pins each entry's own `id` to its key.
const CHAT_ACTIONS: { readonly [Id in ChatActionId]: ChatActionDef<Id> } = {
  archive: { id: "archive", label: ({ archived }) => chatArchiveToggleName(archived), glyph: Archive },
};

/** The verbs a surface offers, in its declared render order, narrowed to that scope's own ids. */
export function chatActionsForScope<S extends ChatActionScope>(scope: S): readonly ChatActionDef<ScopeActionId<S>>[] {
  const ids: readonly ScopeActionId<S>[] = CHAT_ACTION_SCOPE_IDS[scope];
  return ids.map((id) => CHAT_ACTIONS[id]);
}
