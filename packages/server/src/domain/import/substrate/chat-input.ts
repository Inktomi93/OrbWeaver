// domain/import/substrate/chat-input — pure ST→canonical mapping: translate a parsed ST chat into the
// canonical BulkImportChatInput that chat's injected bulkImportChats op writes. Zero I/O; owning chat
// domain never sees SillyTavern. updatedAt = max(send_dates), not last and not import `now`; the selected
// variant's content is always the rendered `mes`, even when the active swipe was empty-dropped.
//
// TWO ARMS over ONE body: the solo arm (`buildBulkImportChatInput`) and the GROUP arm
// (`buildGroupChatInput`), which is the solo result plus the room's extra seats, the per-slot speaker
// attribution and the room-behavior blob. The group arm DELEGATES rather than re-deriving, so a change to
// dates/variants/persona attribution can never apply to only one kind of room.

import type { BulkImportChatInput, BulkImportInjectionInput, BulkImportMessageInput, BulkImportVariantInput } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { msToWallClock } from "@orb/kit/time";
import type { ParsedChat, ParsedChatMessage, ParsedNotePlacement } from "#kit/serde/chat";
import { ST_DEFAULT_WALL_CLOCK_ZONE } from "#kit/serde/chat";
import type { CollectedChat, GroupChatInputDeps, ImportUnresolvedPinnedPersona } from "../contract/views.ts";

const JSONL_EXT = /\.jsonl$/i;

/** Multi-swipe message uses its swipe pool; when the active swipe was empty-dropped or there is no pool,
 *  a variant carrying the rendered `mes` is appended and selected. */
function buildVariantColumns(m: ParsedChatMessage): {
  readonly variants: BulkImportVariantInput[];
  readonly selectedIdx: number;
} {
  if (m.variants.length > 0 && m.activeVariantIdx !== null) {
    const variants = m.variants.map(
      (v): BulkImportVariantInput => ({
        idx: v.idx,
        content: v.content,
        model: v.model,
        provider: v.provider,
        tokensIn: v.tokensIn,
        tokensOut: v.tokensOut,
        reasoning: v.reasoning,
        ttftMs: null,
        genStartedAt: v.genStarted,
        genFinishedAt: v.genFinished,
        metadata: v.metadata,
      }),
    );
    const selected = variants[m.activeVariantIdx];
    if (selected !== undefined) {
      return {
        variants: variants.map((v) => (v.idx === m.activeVariantIdx ? { ...v, ttftMs: m.ttftMs } : v)),
        selectedIdx: m.activeVariantIdx,
      };
    }
  }
  const alternates = m.variants.map(
    (v): BulkImportVariantInput => ({
      idx: v.idx,
      content: v.content,
      model: v.model,
      provider: v.provider,
      tokensIn: v.tokensIn,
      tokensOut: v.tokensOut,
      reasoning: v.reasoning,
      ttftMs: null,
      genStartedAt: v.genStarted,
      genFinishedAt: v.genFinished,
      metadata: v.metadata,
    }),
  );
  const mesIdx = alternates.length;
  alternates.push({
    idx: mesIdx,
    content: m.content,
    model: m.model,
    provider: m.provider,
    tokensIn: m.tokensIn,
    tokensOut: m.tokensOut,
    reasoning: m.reasoning,
    ttftMs: m.ttftMs,
    genStartedAt: m.genStarted,
    genFinishedAt: m.genFinished,
    metadata: m.metadata,
  });
  return { variants: alternates, selectedIdx: mesIdx };
}

/** A user turn credits the pre-resolved chat persona; other roles carry no persona. The parsed row's DECLARED
 *  kind (D129) rides through unchanged — the serde already resolved it (`extra.type`, defaulting to `standard`
 *  for a plain ST transcript), and re-deriving it here would be a second, divergeable answer. */
function toMessageInput(m: ParsedChatMessage, createdAt: number, chatPersonaId: PersonaId | null): BulkImportMessageInput {
  const { variants, selectedIdx } = buildVariantColumns(m);
  return {
    role: m.role,
    kind: m.kind,
    createdAt,
    personaId: m.role === "user" ? chatPersonaId : null,
    variants,
    selectedIdx,
  };
}

// ── ST author's note → orb's injection system (the CONVERSION, owner ruling) ──────────────────
//
// orb has its own author's note: a `chat_injections` row. ST's note is one slot plus four recorded knobs, and
// the importer used to ignore all four — `import-write.ts` hardcoded the HOUSE REGISTER ("near enough to
// steer, far enough not to dominate": `in_chat`, depth 4, `system`; chat-crew-design/04) onto every imported
// note. That ruling is about orb-AUTHORED notes; applying it to a note whose author already SAID where it
// goes is a misattribution of placement, so the recorded value wins and the house register becomes the
// fallback. This is a conversion INTO orb's model: no ST knob mints a new orb placement concept.

/** The house author's-note register — the placement an imported note takes when ST recorded none. */
const HOUSE_NOTE_DEPTH = 4;
const HOUSE_NOTE_POSITION: BulkImportInjectionInput["position"] = "in_chat";
const HOUSE_NOTE_ROLE: MessageRole = "system";

/** ST `extension_prompt_types` → orb's injection position (SOURCE-PINNED, SillyTavern `public/script.js`).
 *  `0 IN_PROMPT` appends to the dynamic suffix, `1 IN_CHAT` splices at depth, `2 BEFORE_PROMPT` prepends to
 *  the static block — each is exactly one of orb's four. DELIBERATELY UNMAPPED: `-1 NONE` (ST's "do not
 *  inject at all"), which orb's model has no way to express — a `chat_injections` row is always live — so it
 *  falls through to the house register like an unrecorded knob. orb's `in_static` has no ST counterpart. */
const ST_NOTE_POSITIONS: Readonly<Record<number, BulkImportInjectionInput["position"]>> = {
  0: "in_prompt",
  1: "in_chat",
  2: "before_prompt",
};

/** ST `extension_prompt_roles` → orb's canonical `MessageRole` (SOURCE-PINNED, same file). */
const ST_NOTE_ROLES: Readonly<Record<number, MessageRole>> = { 0: "system", 1: "user", 2: "assistant" };

/** The depth orb stores for a note at `position`. Depth is meaningful ONLY on the at-depth splice
 *  (`ChatInjection.depth`'s own contract), so any other position stores the column's own 0 rather than
 *  carrying a number no reader consults. A missing//negative ST depth on an `in_chat` note takes the house
 *  register's 4. */
function noteDepthFor(position: BulkImportInjectionInput["position"], recorded: number | null): number {
  if (position !== "in_chat") {
    return 0;
  }
  return recorded !== null && recorded >= 0 ? recorded : HOUSE_NOTE_DEPTH;
}

/** ST's `note_prompt` converted to the ONE `chat_injections` row it becomes, or null when the chat carries no
 *  note text. `note_interval` (ST's "re-insert every N messages") is DROPPED: orb's injection system has no
 *  periodic-insertion concept and inventing one here would be a new placement knob, not a conversion. The
 *  corpus records interval 1 (= every message, i.e. always present) on 1,068 of 1,070 note-bearing chats, so
 *  orb's always-present injection is the faithful reading for effectively all of them. */
function importedNoteInjection(notePrompt: string | null, placement: ParsedNotePlacement | null, createdAt: number): BulkImportInjectionInput | null {
  if (notePrompt === null) {
    return null;
  }
  const recordedPosition = placement?.position ?? null;
  const position = (recordedPosition === null ? undefined : ST_NOTE_POSITIONS[recordedPosition]) ?? HOUSE_NOTE_POSITION;
  const recordedRole = placement?.role ?? null;
  const role = (recordedRole === null ? undefined : ST_NOTE_ROLES[recordedRole]) ?? HOUSE_NOTE_ROLE;
  return {
    position,
    depth: noteDepthFor(position, placement?.depth ?? null),
    role,
    content: notePrompt,
    order: null,
    createdAt,
  };
}

// ── The imported chat's DISPLAY TITLE ────────────────────────────────────────────────────────────────────
//
// ST's filename IS its chat name, and it is a machine token: "Emily Singleton - 2025-5-7 @22h 52m 11s
// 856ms". Importing it verbatim put that string in every chat list row. orb's own convention (client
// `lib/chat-summary-row.ts`) is that a room shows its CAST and a date stamp, and its list date form is
// `formatDate`'s `Mon D, YYYY` — so an imported chat gets the same two facts, composed once, here.
// The raw filename is not lost: `chats.importedFrom` is its provenance seat (and the branch-lineage key).

/** `Intl`-free short month names — this string is STORED (a title, like a rename), not rendered at the
 *  display edge, so it must be stable across ICU builds and locales. Matches the client's `formatDate` form. */
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
/** Name and date are joined by an em dash — the name is not part of a date range, it is a separate fact. */
const TITLE_SEPARATOR = "—";

/** "Emily Singleton — May 7, 2025" for one imported room. `zone` is the SAME ST wall-clock zone the dates
 *  were parsed in, so the rendered day is the day the ST filename spelled rather than a UTC-shifted one.
 *  Null only when neither fact exists (no cast name AND an unformattable instant) — the caller then keeps the
 *  source filename, which is worse-looking but never blank. */
function importedChatTitle(name: string, createdAt: number, zone: string): string | null {
  const trimmed = name.trim();
  const wc = msToWallClock(createdAt, zone);
  const date = wc === null ? null : `${SHORT_MONTHS[wc.month - 1]} ${wc.day}, ${wc.year}`;
  if (trimmed.length > 0) {
    return date === null ? trimmed : `${trimmed} ${TITLE_SEPARATOR} ${date}`;
  }
  return date;
}

/** Suffix duplicate titles within ONE import run — a character with three chats on one day would otherwise
 *  show three identical rows. Numeric from 2 and never merging, the same rule the card collector's handle
 *  `disambiguate` applies (`loader/collect.ts`); the spelling is ` (2)` rather than `-2` because this is
 *  PROSE a human reads, not a slug. Order-stable: the first file to claim a title keeps it bare. */
export function disambiguateChatTitles(inputs: readonly BulkImportChatInput[]): BulkImportChatInput[] {
  const taken = new Set<string>();
  return inputs.map((ci) => {
    let title = ci.title;
    let n = 2;
    while (taken.has(title)) {
      title = `${ci.title} (${n})`;
      n += 1;
    }
    taken.add(title);
    return title === ci.title ? { ...ci } : { ...ci, title };
  });
}

// ── the anchor persona (§5.7 — ST's chat-bound persona pick) ─────────────────────────────────────────────
//
// orb has ONE seat, `chats.anchorPersonaId`, and ST offers TWO signals for it. The header `user_name` is the
// ambient persona at save time; `chat_metadata.pinnedPersona` is the author's explicit chat-bound pick. The
// PIN WINS, for two independent reasons: ST's own resolver prefers the chat lock over the ambient persona
// (`public/scripts/personas.js` — "Using locked persona"), and on the real corpus the ambient signal is not
// even present on a pinned chat (71/71 pinned chats carry the literal sentinel `user_name: "unused"`, so
// those chats had NO anchor and NO user-turn attribution before this).
//
// An UNRESOLVABLE pin — a name no persona in this run or library carries — resolves to NOTHING and is
// REPORTED. It never near-matches, and it never blocks the chat: ST likewise drops a dangling lock and falls
// back to the ambient persona, so `user_name` is still consulted underneath.

/** Lowercased name → the run's persona-id key. One spelling, so the pin and `user_name` can never key
 *  differently. */
function personaKey(name: string | null): string | undefined {
  const key = name?.trim().toLowerCase();
  return key !== undefined && key.length > 0 ? key : undefined;
}

/** The chat's anchor persona: the chat-bound PIN first, then the header `user_name`, then none. */
function resolveAnchorPersona(pc: ParsedChat, personaByUserName: ReadonlyMap<string, PersonaId>): PersonaId | null {
  const pinned = personaKey(pc.pinnedPersonaName);
  const byPin = pinned === undefined ? undefined : personaByUserName.get(pinned);
  if (byPin !== undefined) {
    return byPin;
  }
  const ambient = personaKey(pc.userName);
  return (ambient === undefined ? undefined : personaByUserName.get(ambient)) ?? null;
}

/**
 * The chats in this batch whose ST pin named a persona that does not exist here — the report's raw material.
 * Computed at the VERB over the whole batch (the same place the group wave computes its skipped members),
 * so the mapper below stays a pure `CollectedChat → BulkImportChatInput` function with no second return
 * channel. A chat with no pin, or a pin that resolved, contributes nothing.
 */
export function unresolvedPinnedPersonas(chats: readonly CollectedChat[], personaByUserName: ReadonlyMap<string, PersonaId>): ImportUnresolvedPinnedPersona[] {
  return chats.flatMap((ci) => {
    const name = ci.parsed.pinnedPersonaName;
    const key = personaKey(name);
    if (name === null || key === undefined || personaByUserName.get(key) !== undefined) {
      return [];
    }
    return [{ chat: ci.importedFrom, persona: name }];
  });
}

/** The chat-level facts every arm shares: the resolved instants, the anchor persona, the prose plane and the
 *  display title. `displayName` is the room's own name for the title — the header character for a solo
 *  transcript, the ST group's name for a room. */
function chatShell(
  ci: CollectedChat,
  displayName: string,
  deps: { readonly now: () => number; readonly personaByUserName: Map<string, PersonaId>; readonly wallClockZone?: string },
): BulkImportChatInput {
  const pc: ParsedChat = ci.parsed;
  const created = pc.createDate ?? pc.messages.find((m) => m.sendDate !== null)?.sendDate ?? deps.now();
  const sendDates = pc.messages.flatMap((m) => (m.sendDate !== null ? [m.sendDate] : []));
  const updatedAt = sendDates.length > 0 ? Math.max(...sendDates) : created;
  const chatPersonaId = resolveAnchorPersona(pc, deps.personaByUserName);
  const note = importedNoteInjection(pc.notePrompt, pc.notePlacement, created);

  return {
    title: importedChatTitle(displayName, created, deps.wallClockZone ?? ST_DEFAULT_WALL_CLOCK_ZONE) ?? ci.importedFrom.replace(JSONL_EXT, ""),
    importedFrom: ci.importedFrom,
    importHash: ci.importHash,
    anchorPersonaId: chatPersonaId,
    createdAt: created,
    updatedAt,
    parentRef: pc.parentRef,
    // The ONE prose door. Omitted (not an empty list) when the chat carries no note, so a note-less ST
    // transcript lands byte-identically to what it landed before the conversion existed.
    ...(note === null ? {} : { injections: [note] }),
    // ST's `{{setvar}}` store → orb's config-plane picks bag. The assembly env seed OVERLAYS the runtime
    // fold over the resolved config picks and `resolveChoiceVariables` orphan-PRESERVES a stored key no
    // preset declares, so an imported variable is readable by `{{getvar}}` on the very first turn. The
    // runtime column is derived (re-folded from per-variant deltas) and is deliberately NOT seeded.
    variableValues: pc.variables,
    isRealConversation: pc.bucket === "real_conversation",
    messages: pc.messages.map((m) => toMessageInput(m, m.sendDate ?? created, chatPersonaId)),
  };
}

/** createDate is the filename date first, then the first message send date, then `now`. */
export function buildBulkImportChatInput(
  ci: CollectedChat,
  deps: {
    readonly now: () => number;
    readonly personaByUserName: Map<string, PersonaId>;
    /** The zone ST's wall-clock dates were written in — the title's date is rendered in the SAME one. */
    readonly wallClockZone?: string;
  },
): BulkImportChatInput {
  return chatShell(ci, ci.parsed.characterName, deps);
}

/** WHICH seat voices this assistant slot. `original_avatar` (the card filename ST stamps on every group line)
 *  is the IDENTITY match and wins; a roster-scoped display-name match is the fallback; absent both, the slot
 *  falls through to the room's primary by returning null (the write op's own documented "absent ⇒ primary").
 *  Never resolves a `user` slot — attribution there is the persona. */
function groupSpeakerFor(m: ParsedChatMessage, deps: GroupChatInputDeps): CharacterId | null {
  if (m.role !== "assistant") {
    return null;
  }
  const byFile = m.originalAvatar === undefined || m.originalAvatar === null ? undefined : deps.speakerByFile.get(m.originalAvatar);
  if (byFile !== undefined) {
    return byFile;
  }
  const name = m.speakerName?.trim().toLowerCase();
  return (name !== undefined && deps.speakerByName.get(name)) || null;
}

/**
 * Map one collected GROUP transcript onto the canonical bulk-import input: the same shape a solo chat produces,
 * plus the room's extra seats (`roster`), the per-slot speaker attribution, and the room-behavior blob carried
 * off the ST group definition. The write op ownership-gates every seat and refuses an unseated speaker, so this
 * mapper only ever proposes ids the caller already resolved out of the room's own cast.
 */
export function buildGroupChatInput(ci: CollectedChat, deps: GroupChatInputDeps): BulkImportChatInput {
  // The room's TITLE is the group's own name, not the header `character_name` a group transcript carries
  // (ST writes the first member there, which would title a five-hander after one seat).
  const base = chatShell(ci, deps.roomName, {
    now: deps.now,
    personaByUserName: deps.personaByUserName,
    ...(deps.wallClockZone === undefined ? {} : { wallClockZone: deps.wallClockZone }),
  });
  const messages = base.messages.map((message, i): BulkImportMessageInput => {
    const parsed = ci.parsed.messages[i];
    const speaker = parsed === undefined ? null : groupSpeakerFor(parsed, deps);
    // ABSENT (not null) when unresolved: the field's own contract says absent ⇒ the run's primary, and an
    // explicit null would say the same thing in a second spelling.
    return speaker === null ? message : { ...message, characterId: speaker };
  });
  return { ...base, messages, roster: deps.roster, metadata: deps.metadata };
}
