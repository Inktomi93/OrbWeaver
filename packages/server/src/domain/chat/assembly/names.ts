// domain/chat/assembly/names — the SHAPE name-stamp pass. Applied AFTER squash, so the trusted `Name:`
// label lands at a step no USER_INPUT/AI_OUTPUT regex can reach — un-forgeable.
//
//   • "none"       — strip names entirely.
//   • "default"    — prefix only a user turn whose author differs from the active persona, and — in a
//                    multi-character room — an assistant turn with its character's name. Solo → no prefix.
//   • "content"    — always prefix `${author}: ${content}`.
//   • "completion" — set the OpenAI-spec `name` field; content untouched.

import type { NamesBehavior } from "@orb/contracts/preset";
import type { MessageId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

/** The `user | assistant` subset of the canonical `MessageRole` (system never reaches the wire history). */
type WireRole = Exclude<MessageRole, "system">;

interface NamedRow {
  role: WireRole;
  content: string;
  name?: string;
  messageId?: MessageId | undefined;
}

export function applyNamesBehavior(
  history: readonly {
    role: WireRole;
    content: string;
    authorName?: string | null;
    messageId?: MessageId | undefined;
  }[],
  mode: NamesBehavior,
  speakers: { user: string; assistant: string },
  /** True when the history carries \>1 distinct authoring character. Absent/false → solo, byte-identical. */
  multiCharacter = false,
): NamedRow[] {
  if (mode === "none") {
    return history.map((m) => ({ role: m.role, content: m.content, messageId: m.messageId }));
  }
  return history.map((m): NamedRow => {
    const author = m.authorName ?? (m.role === "user" ? speakers.user : speakers.assistant);
    if (mode === "default") {
      if (m.role === "user" && author !== speakers.user) {
        return { role: m.role, content: `${author}: ${m.content}`, messageId: m.messageId };
      }
      if (
        m.role === "assistant" &&
        multiCharacter &&
        m.authorName !== null &&
        m.authorName !== undefined
      ) {
        return { role: m.role, content: `${author}: ${m.content}`, messageId: m.messageId };
      }
      return { role: m.role, content: m.content, messageId: m.messageId };
    }
    if (mode === "content") {
      return { role: m.role, content: `${author}: ${m.content}`, messageId: m.messageId };
    }
    return { role: m.role, content: m.content, name: author, messageId: m.messageId };
  });
}
