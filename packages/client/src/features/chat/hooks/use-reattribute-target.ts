// Whether a transcript row offers "Reattribute from here", and to which persona. The verb restamps only the
// caller's own user lines, so the item exists only on those; the target is the viewer's current chat persona.

import type { MessageView } from "@orb/contracts/chat";
import type { PersonaId } from "@orb/kit/ids";
import { useGatedQuery, useTRPC } from "#data";

/** Where the restamp would point: the viewer's current persona in this chat, or `null` with none picked. */
export interface ReattributeTarget {
  readonly personaId: PersonaId | null;
}

/** `null` on any row that is not the viewer's own user line, and while the room read is unsettled. */
export function useReattributeTarget(message: MessageView): ReattributeTarget | null {
  const trpc = useTRPC();
  const { data: chat } = useGatedQuery(message.chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  // Optional-chained throughout: the CT harness answers an unlisted proc with `null`.
  const viewerUserId = chat?.viewerUserId;
  if (viewerUserId === undefined || message.role !== "user" || message.authorUserId !== viewerUserId) {
    return null;
  }
  return { personaId: chat?.viewerActivePersonaId ?? null };
}
