// B6/MR2 — the reaction pill row's `message-footer` surface contribution (§6c/M8).
//
// WHY CHAT GRAFTS ONTO CHAT'S OWN ANCHOR, which reads odd until you name what the seam buys: the anchor
// mounts ONCE PER COMMITTED ROW, against a settled `MessageView`. The streaming GHOST row and the
// pre-commit draft-greeting row never reach it — the first has no committed variant, the second passes no
// `surfaceContributors` at all (`message-row.tsx`) — so "reactions only exist on canon" is a STRUCTURAL
// property of the mount rather than a predicate this file could forget to write. Reaching for the row's own
// JSX instead would put that gate back in a branch.
//
// THE `when` PREDICATE IS THE CHEAP STRUCTURAL FACT ONLY (the rpg tool-calls precedent): every committed row
// is reactable, so it is always true and is omitted. The DATA applicability — does THIS variant carry any
// reactions — lives in the body, which returns `null` when it does not.

import type { ChatSurfaceContribution } from "#lib";
import { MessageReactions } from "../components/message-reactions.tsx";

/** The stable contribution id (the registry key + the row's React key). */
const MESSAGE_REACTIONS_SURFACE_ID = "chat-message-reactions";

/** The per-row reaction pills. Added at the `authed-app.tsx` door. */
export const chatMessageReactionsSurface: ChatSurfaceContribution = {
  id: MESSAGE_REACTIONS_SURFACE_ID,
  anchor: "message-footer",
  body: ({ message }) => <MessageReactions message={message} />,
};
