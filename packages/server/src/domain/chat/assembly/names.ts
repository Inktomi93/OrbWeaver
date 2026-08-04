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
    /** Set by the injection splice on a row that carries NO speaker — an instruction/operator injection
     *  that had to take a participant wire role because the backend refuses mid-conversation system. */
    speakerless?: true | undefined;
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
    // Rows that carry no speaker — never label them (a `Name:` prefix or a completion `name` field would
    // misattribute the system channel to a participant). TWO ways to be speakerless: a real `system` row,
    // or an injection the splice DEMOTED to a participant role because the backend cannot take
    // mid-conversation system. Keying on the role alone missed the second — the demote happens upstream, so
    // by the time this pass ran the row looked like an ordinary user turn and got the player's name
    // (INJECT-NAMED-AS-PLAYER). The marker is the fix; the role check alone can never see it.
    if (m.role === "system" || m.speakerless === true) {
      // The marker is CONSUMED here, not forwarded: it exists to answer "may this row be labelled?", and
      // that question is now answered. Forwarding it would let a later squash merge stamp it onto a row that
      // contains the player's real text (the depth-1 re-frame merges the user tail INTO the injection), and
      // a wire row carrying an internal assembly flag is a field no backend asked for.
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
