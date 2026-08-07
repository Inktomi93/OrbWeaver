// domain/chat/assembly/names — the SHAPE name-stamp pass. It runs on the SPLICED history and its output is
// what gets squashed: `shape.ts` is `runSquash(applyNamesBehavior(injected, …))` — NAME FIRST, THEN SQUASH.
// (This header claimed "Applied AFTER squash" until 2026-08-07. It was false in the other direction, and the
// ordering is the whole subject of the paragraph below — a reader who believed the header would conclude the
// `completion`-mode exception could not be needed. The invariant it was reaching for is still true and is the
// reason the pass sits here at all: the label is applied by the ASSEMBLY, at a step no USER_INPUT/AI_OUTPUT
// regex can reach, so a `Name:` prefix on the wire is un-forgeable by chat content.)
//
//   • "none"       — strip names entirely.
//   • "default"    — prefix only a user turn whose author differs from the active persona, and — in a
//                    multi-character room — an assistant turn with its character's name. Solo → no prefix.
//   • "content"    — always prefix `${author}: ${content}`.
//   • "completion" — set the OpenAI-spec `name` field; content untouched. UNLESS the effective role-handling
//                    strategy MERGES adjacent same-role rows, in which case the speaker is inlined like
//                    "content" and no `name` field is emitted.
//
// WHY THAT EXCEPTION (SillyTavern `prompt-converters.js::mergeMessages`, pass 1): ST folds a message's own
// `name` into its content as a `Name: ` prefix, then DELETES the name field — before the squash pass runs.
// By the time it merges, no name field exists to interfere with anything.
//
// Ours kept it, and `squashSameRole` refuses to merge two rows carrying distinct names. Two consequences,
// both live:
//   • On a model whose `roleHandlingFloor` is `strict` (Anthropic hard-errors on adjacent same-role, and an
//     UNSET floor clamps to strict — so this is the DEFAULT), a multi-speaker round emitted a request the
//     provider rejects.
//   • In a MULTI-HUMAN room, two people speaking back-to-back are adjacent `user` rows with distinct names,
//     so they could never merge either. Inlining satisfies both requirements at once: the rows merge AND
//     each speaker stays attributable inside the merged content.
// The same surviving name also let a demoted instruction inherit the player's name after a merge — the
// out-of-band twin of INJECT-NAMED-AS-PLAYER.
//
// Measured by the matrix in `tests/.../shape.test.ts`: before this, 12 of 84 cells failed, ALL `completion`.

import type { NamesBehavior } from "@orb/contracts/preset";
import type { MessageId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

/** The delivered wire-row role axis. `system` rows exist only as capability-kept depth-0 injections
 *  (`turns.midConversationSystem`) — they are the operator/system channel, not a speaker, so every
 *  names mode passes them through untouched (no prefix, no completion `name`). */
type WireRole = MessageRole;

/** The two axes beyond mode/speakers, bundled so the signature stays inside the parameter budget. NOT
 *  exported — it is this function's call shape, not a domain type, so it stays out of the contract home. */
interface NamesOptions {
  /** True when the history carries \>1 distinct authoring character. Absent/false → solo, byte-identical. */
  readonly multiCharacter?: boolean;
  /** Whether the effective role-handling strategy merges adjacent same-role rows. When it does, `completion`
   *  inlines the speaker instead of emitting an out-of-band `name` — a surviving name blocks the merge and
   *  the provider gets the adjacent same-role pair it rejects. Absent ⇒ true (the floor is `strict`). */
  readonly mergesAdjacent?: boolean;
}

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
  opts: NamesOptions = {},
): NamedRow[] {
  const { multiCharacter = false, mergesAdjacent = true } = opts;
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
    return mergesAdjacent
      ? { role: m.role, content: `${author}: ${m.content}`, messageId: m.messageId }
      : { role: m.role, content: m.content, name: author, messageId: m.messageId };
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
