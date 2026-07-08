// domain/chat/assembly/names — the SHAPE name-stamp pass.
//
// Speaker-name pass for the wire history, applied AFTER squash (so the trusted `Name:` label lands at a
// step no USER_INPUT/AI_OUTPUT regex can reach — un-forgeable). `authorName` is the stored authoring
// name per row (persona on a user row, the authoring character on an assistant row); null on the
// in-flight turn + the egocentric-folded user rows. Falls back to the active speaker, so a
// single-persona / single-character chat always has author === active name → no prefix.
//
//   • "none"       — strip names entirely.
//   • "default"    — prefix ONLY a user turn whose author differs from the active persona (written under
//                    a since-switched persona), AND — in a MULTI-character room (the `multiCharacter`
//                    gate) — an assistant turn with its character's name so a merged transcript is
//                    legible. SOLO (one character) → no assistant prefix, byte-identical.
//   • "content"    — always prefix `${author}: ${content}`.
//   • "completion" — set the OpenAI-spec `name` field; content untouched.

import type { NamesBehavior } from "@orb/contracts/preset";
import type { MessageId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

/** The wire-history role axis — derive-don't-respell the `user | assistant` subset of the canonical
 *  `MessageRole` (system never reaches the delivered history; the splice converts it). */
type WireRole = Exclude<MessageRole, "system">;

/** One name-stamped wire row. File-local (feature types that cross a boundary live in contract/; this is
 *  the SHAPE pass's internal output, consumed by shape.ts via inference). */
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
  // True when the history carries >1 distinct authoring character (the group case). Drives the
  // per-character assistant prefix under "default". Absent/false → SOLO behavior, byte-identical.
  multiCharacter = false,
): NamedRow[] {
  if (mode === "none") {
    return history.map((m) => ({ role: m.role, content: m.content, messageId: m.messageId }));
  }
  return history.map((m): NamedRow => {
    const author = m.authorName ?? (m.role === "user" ? speakers.user : speakers.assistant);
    if (mode === "default") {
      // Disambiguate a user turn whose authoring persona differs from the active one, AND — in a
      // multi-character room — an assistant turn (prefix it with its character's name). A solo chat
      // (multiCharacter=false) prefixes nothing on the assistant side → byte-identical.
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
