// domain/chat/assembly/names — the SHAPE name-stamp pass. It runs on the SPLICED history and its output is
// what gets squashed: `shape.ts` is `runSquash(applyNamesBehavior(injected, …))` — NAME FIRST, THEN SQUASH.
// The label is applied by the ASSEMBLY, at a step no USER_INPUT/AI_OUTPUT regex can reach, so a `Name:`
// prefix on the wire is un-forgeable by chat content.
//
// The MODE decides HOW a labellable row is labelled; the row's DECLARED KIND decides WHETHER it may be
// labelled at all (`mayBeLabelled`, D129) — two questions, two dispatches, and the kind one runs first.
//
//   • "none"       — strip names entirely. In a room with more than one human or character it runs as
//                    "default" instead (`effectiveMode`).
//   • "default"    — prefix a user turn whose author differs from the active persona (every user turn once
//                    the room seats more than one human), and — in a multi-character room — an assistant
//                    turn with its character's name. Solo → no prefix.
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

import type { MessageKind } from "@orb/contracts/chat";
import type { NamesBehavior } from "@orb/contracts/preset";
import type { MessageId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

/** The delivered wire-row role axis. `system` rows exist only as capability-kept INJECTIONS — at the tail
 *  (`turns.midConversationSystem`) or mid-array (`turns.historySystemRows`). They are the operator/system
 *  channel, not a speaker, so every names mode passes them through untouched (no prefix, no completion
 *  `name`). A CANON row is never one: the D129(B) narrator→`system` delivery that briefly rode the mid-array
 *  bit was OWNER-RULED OUT 2026-08-18 ("if you mean group chat narration mode then that is the wrong
 *  behavior") — a narrator row is assistant-voiced here and takes no label because of its KIND, which is a
 *  separate, still-live policy. */
type WireRole = MessageRole;

/** The two axes beyond mode/speakers, bundled so the signature stays inside the parameter budget. NOT
 *  exported — it is this function's call shape, not a domain type, so it stays out of the contract home. */
interface NamesOptions {
  /** True when the history carries \>1 distinct authoring character. Absent/false → solo, byte-identical. */
  readonly multiCharacter?: boolean;
  /** True when the room seats \>1 present human (`AssembleContext.multiHuman`). Absent/false → solo. */
  readonly multiHuman?: boolean;
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

/**
 * THE LABEL POLICY, BY DECLARED KIND (D217) — may a canon row of this purpose take a speaker label at all?
 * Total over `MessageKind` with an `assertNever` tail (spine §5.5). `undefined` is the SYNTHETIC row (the
 * appended user turn, a nudge — never a canon row) and takes the `standard` answer.
 *
 *   • `standard`  — yes: the mode decides (this is every row today's behavior covers).
 *   • `narrator`  — NO. A narrator row is ONE generation voicing all the seated characters, and its body already carries
 *     each speaker's own `NAME:` attribution (converted from the stored `<speaker>` tags at `toShapeCanon`).
 *     A row-level prefix on top of that is a SECOND, WRONG label: it names the whole multi-speaker block after
 *     one identity — the synthetic `__group__` card ("Group"), or, once that card's name does not resolve
 *     through the identity producer, the turn's `speakers.assistant` fallback, i.e. some seated character gets credited
 *     with everyone else's lines. That is the assistant-side twin of INJECT-NAMED-AS-PLAYER, and `default`
 *     mode only escaped it by accident (a narrator room's rows all share one characterId, so the
 *     `multiCharacter` gate happened to be false); `content` and `completion` mislabelled every narrator row.
 *   • `comment`   — NO, and it is unreachable: `MESSAGE_KIND_POLICY.comment.prompt === "never"`, so the shape
 *     dispatch dropped the row before this pass. Answered anyway, because an unlabelled OOC row is the right
 *     answer if a future delivery path ever carries one, and totality is what makes a fourth kind a tsc error.
 */
function mayBeLabelled(kind: MessageKind | undefined): boolean {
  switch (kind) {
    case undefined:
    case "standard":
      return true;
    case "narrator":
    case "comment":
      return false;
    default:
      return assertNeverMessageKind(kind);
  }
}

function assertNeverMessageKind(kind: never): never {
  throw new Error(`applyNamesBehavior: unhandled MessageKind ${JSON.stringify(kind)}`);
}

// An unattributed canon reply (an agent seat's row) has no name of its own; borrowing the current speaker's
// would relabel it on every call.
function isUnattributedReply(m: { readonly role: WireRole; readonly authorName?: string | null; readonly messageId?: MessageId | undefined }): boolean {
  return m.role === "assistant" && m.messageId !== undefined && (m.authorName ?? null) === null;
}

// Owner ruling: "none" in a room with more than one human or more than one character leaves the model unable to
// tell who said what, so there it runs as "default". A solo room keeps a true "none". The stored preset is untouched.
function effectiveMode(mode: NamesBehavior, room: { readonly multiCharacter: boolean; readonly multiHuman: boolean }): NamesBehavior {
  return mode === "none" && (room.multiCharacter || room.multiHuman) ? "default" : mode;
}

export function applyNamesBehavior(
  history: readonly {
    role: WireRole;
    content: string;
    authorName?: string | null;
    messageId?: MessageId | undefined;
    /** The canon row's DECLARED purpose (D129) — the label policy's dispatch key. Absent on a synthetic row
     *  SHAPE built for this turn (no slot, no declared purpose) and on a spliced injection (which the
     *  `speakerless` marker already covers). */
    kind?: MessageKind | undefined;
    /** Set by the injection splice on a row that carries NO speaker — an instruction/operator injection
     *  that had to take a participant wire role because the backend refuses mid-conversation system. */
    speakerless?: true | undefined;
    /** A character's line the scoped fold re-roled to `user`. Its speaker already rides inline, so it takes no
     *  second label — least of all the human's. */
    folded?: true | undefined;
  }[],
  presetMode: NamesBehavior,
  speakers: { user: string; assistant: string },
  opts: NamesOptions = {},
): NamedRow[] {
  const { multiCharacter = false, multiHuman = false, mergesAdjacent = true } = opts;
  const mode = effectiveMode(presetMode, { multiCharacter, multiHuman });
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
    // THREE ways to be unlabellable, and they are three different planes: a real `system` wire ROW, a
    // DEMOTED injection (the `speakerless` marker — assembly-internal, spliced rows have no slot and so can
    // never carry a kind), and now the row's own declared PURPOSE (`mayBeLabelled`). The kind arm is the one
    // that answers for CANON rows, which is the half neither of the other two could ever see.
    if (m.role === "system" || m.speakerless === true || m.folded === true || !mayBeLabelled(m.kind)) {
      // The marker is CONSUMED here, not forwarded: it exists to answer "may this row be labelled?", and
      // that question is now answered. Forwarding it would let a later squash merge stamp it onto a row that
      // contains the player's real text (the depth-1 re-frame merges the user tail INTO the injection), and
      // a wire row carrying an internal assembly flag is a field no backend asked for.
      return { role: m.role, content: m.content, messageId: m.messageId };
    }
    if (isUnattributedReply(m)) {
      return { role: m.role, content: m.content, messageId: m.messageId };
    }
    const author = m.authorName ?? (m.role === "user" ? speakers.user : speakers.assistant);
    if (mode === "default") {
      return defaultModeRow(m, author, speakers, { multiCharacter, multiHuman });
    }
    if (mode === "content") {
      return { role: m.role, content: `${author}: ${m.content}`, messageId: m.messageId };
    }
    return mergesAdjacent
      ? { role: m.role, content: `${author}: ${m.content}`, messageId: m.messageId }
      : { role: m.role, content: m.content, name: author, messageId: m.messageId };
  });
}

// The "default" mode rule: prefix a user turn whose author differs from the active persona, or every CANON user
// turn in a multi-human room (the active persona is one human's, so an unprefixed row would claim to be theirs;
// a synthetic tail row has no author to name), and — in a multi-character room — an assistant turn with its
// character's name; otherwise untouched.
function defaultModeRow(
  m: { role: WireRole; content: string; authorName?: string | null; messageId?: MessageId | undefined },
  author: string,
  speakers: { user: string; assistant: string },
  room: { readonly multiCharacter: boolean; readonly multiHuman: boolean },
): NamedRow {
  if (m.role === "user" && ((room.multiHuman && m.messageId !== undefined) || author !== speakers.user)) {
    return { role: m.role, content: `${author}: ${m.content}`, messageId: m.messageId };
  }
  if (m.role === "assistant" && room.multiCharacter && m.authorName !== null && m.authorName !== undefined) {
    return { role: m.role, content: `${author}: ${m.content}`, messageId: m.messageId };
  }
  return { role: m.role, content: m.content, messageId: m.messageId };
}
