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

/** The delivered wire-row role axis. `system` rows exist only as capability-kept depth-0 injections
 *  (`turns.midConversationSystem`) — they are the operator/system channel, not a speaker, so every
 *  names mode passes them through untouched (no prefix, no completion `name`). */
type WireRole = MessageRole;

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
    // System rows carry no speaker — never label them (a `Name:` prefix or a completion `name` field
    // would misattribute the system channel to a participant).
    if (m.role === "system") {
      return { role: m.role, content: m.content, messageId: m.messageId };
    }
    const author = m.authorName ?? (m.role === "user" ? speakers.user : speakers.assistant);
    if (mode === "default") {
      return defaultModeRow(m, author, speakers, multiCharacter);
    }
    if (mode === "content") {
      return { role: m.role, content: `${author}: ${m.content}`, messageId: m.messageId };
    }
    return { role: m.role, content: m.content, name: author, messageId: m.messageId };
  });
}

// The "default" mode rule: prefix a user turn whose author differs from the active persona, and — in a
// multi-character room — an assistant turn with its character's name; otherwise untouched.
function defaultModeRow(
  m: { role: WireRole; content: string; authorName?: string | null; messageId?: MessageId | undefined },
  author: string,
  speakers: { user: string; assistant: string },
  multiCharacter: boolean,
): NamedRow {
  if (m.role === "user" && author !== speakers.user) {
    return { role: m.role, content: `${author}: ${m.content}`, messageId: m.messageId };
  }
  if (m.role === "assistant" && multiCharacter && m.authorName !== null && m.authorName !== undefined) {
    return { role: m.role, content: `${author}: ${m.content}`, messageId: m.messageId };
  }
  return { role: m.role, content: m.content, messageId: m.messageId };
}
