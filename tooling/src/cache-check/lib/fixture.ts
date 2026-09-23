// The probe fixture: the cards, the rooms, and one step plan per case. Pure data; ops/drive.ts runs it.
// The prefix lives in one long user line in history and the cards stay short, so a call that reads only the
// system block reads almost nothing. Cases that share a room share one chat, so the prefix is written once.
import type { CardSpec, CasePlan, ProbeStep, RoomKind, RoomRun, RoomSpec } from "../contract/plan.ts";
import { ROOM_KINDS } from "../contract/plan.ts";
import type { CacheCase } from "../contract/types.ts";
import { FLOOR_CALIBRATION } from "./verdict.ts";

// The floor is a share measured on the calibration prefix, so the fixture is larger than that prefix. The largest
// healthy loss is the narrator cue (about 230 tokens), which the calibration prefix alone would just cover; a
// quarter more keeps it inside the floor while every call's cache read and the room's one write stay small.
const PREFIX_HEADROOM = 1.25;
// Measured on Claude's tokenizer for the record template below.
const LORE_RECORD_TOKENS = 52;
const LORE_RECORDS = Math.ceil((FLOOR_CALIBRATION.prefixTokens * PREFIX_HEADROOM) / LORE_RECORD_TOKENS);
/** The output cap for every probe turn. A narrator reply voices every character and runs past a few hundred
 *  tokens, and the agent-sdk route turns a capped reply into continuation calls and an error, not a truncation. */
export const REPLY_MAX_TOKENS = 1024;

const MONTHS = ["thaw", "bloom", "high", "ember", "frost"] as const;
const WINDS = ["north", "east", "south", "west"] as const;
const DAYS_PER_MONTH = 28;
const SHIP_SPREAD = 9;
const SHIP_BASE = 3;
const STORM_SPREAD = 4;

function lore(): string {
  return Array.from(
    { length: LORE_RECORDS },
    (_, i) =>
      `Harbor record ${i + 1}: on the ${(i % DAYS_PER_MONTH) + 1}th of the ${MONTHS[i % MONTHS.length]} month the keeper ` +
      `logged ${SHIP_BASE + (i % SHIP_SPREAD)} ships, ${i % STORM_SPREAD} storms and one lamp trim, noting the wind ` +
      `from the ${WINDS[i % WINDS.length]}.`,
  ).join(" ");
}

const BREVITY = "Reply with one short sentence of at most eight words.";

function card(key: string, name: string, description: string): CardSpec {
  return { key, name, description, greeting: `${name} looks up.`, systemPrompt: `Stay in character as ${name}. ${BREVITY}` };
}

const MARA = card("mara", "Mara", "Mara keeps the lighthouse on a cold northern coast.");
const WREN = card("wren", "Wren", "Wren pilots the harbor ferry and talks about the tide.");
const ANSEL = card("ansel", "Ansel", "Ansel runs the harbor tavern and trades gossip.");

/** The long user message: the bulk of every case's prefix. */
const LONG_USER_LINE = `Here is my copy of the harbor log; keep it in mind. ${lore()}`;

// Committed without a reply, then answered by a generate: a turn with no row of its own pins its history
// breakpoint on the last canon row, so the one paid call writes the long line into the cache rather than
// sending it uncached first.
const PREFIX_STEPS: readonly ProbeStep[] = [
  { kind: "commit", content: LONG_USER_LINE },
  { kind: "generate", measure: "none" },
];
// In a per-speaker room the opening's last call opens the group case's judged sequence, so the pair into the
// first measured round crosses a round boundary.
const ROUND_PREFIX_STEPS: readonly ProbeStep[] = [
  { kind: "commit", content: LONG_USER_LINE },
  { kind: "generate", measure: "last" },
];

/**
 * The rooms, by kind.
 *
 * @remarks Per-speaker seats three characters: with two and greet-all, the last greeter is banned from the next
 * round, so `list` runs a single speaker. `cardScope` keeps its default, `merged`, the one roster system block.
 */
export const ROOMS: Readonly<Record<RoomKind, RoomSpec>> = {
  solo: { cards: [MARA], opening: "first-message", group: null, prefixSteps: PREFIX_STEPS },
  "per-speaker": {
    cards: [MARA, WREN, ANSEL],
    opening: "greet-all",
    group: { output: "per-speaker", policy: "list" },
    prefixSteps: ROUND_PREFIX_STEPS,
  },
  narrator: { cards: [MARA, WREN], opening: "greet-all", group: { output: "narrator", policy: "natural" }, prefixSteps: PREFIX_STEPS },
};

// Any in-chat injection at depth 2 or deeper moves the history breakpoint; 4 is where an author's note sits.
const AUTHOR_NOTE_DEPTH = 4;
const AUTHOR_NOTE = "Author's note: keep the tone quiet and cold.";
/** The speakers one per-speaker `list` round runs with the three-character roster. */
const ROUND_SPEAKERS = 2;

const setup = (content: string): ProbeStep => ({ kind: "send", content, measure: "none" });
const measured = (content: string): ProbeStep => ({ kind: "send", content, measure: "all" });

/** One plan per case. Each plan runs after its room's prefix steps and sets up whatever else it needs itself. */
export const CASE_PLANS: Readonly<Record<CacheCase, CasePlan>> = {
  solo: { room: "solo", steps: [measured("Any ships tonight?"), measured("Tell me about the fog.")] },
  continue: { room: "solo", steps: [setup("Is the lamp lit?"), { kind: "continue", measure: "all" }, { kind: "continue", measure: "all" }] },
  "deep-note": {
    room: "solo",
    // Two setup sends so the note, four rows up, lands below the long message rather than on it.
    steps: [
      setup("Any wind tonight?"),
      setup("Where is the ferry?"),
      { kind: "note", depth: AUTHOR_NOTE_DEPTH, content: AUTHOR_NOTE },
      measured("Do you ever sleep?"),
      measured("Should I leave?"),
    ],
  },
  group: {
    room: "per-speaker",
    steps: [
      { kind: "send", content: "Hello, all of you.", measure: "all", speakers: ROUND_SPEAKERS },
      { kind: "send", content: "What's the news tonight?", measure: "all", speakers: ROUND_SPEAKERS },
    ],
  },
  narrator: { room: "narrator", steps: [measured("What happens next?"), measured("And after that?")] },
};

// The order cases run in. The deep note stays in the chat once set, so it runs after the other solo-room cases.
const RUN_ORDER: readonly CacheCase[] = ["solo", "continue", "deep-note", "group", "narrator"];

/** Group the selected cases by room, one chat per room, each room's cases in run order. */
export function roomRuns(cases: readonly CacheCase[]): readonly RoomRun[] {
  return ROOM_KINDS.flatMap((room) => {
    const inRoom = RUN_ORDER.filter((c) => cases.includes(c) && CASE_PLANS[c].room === room);
    return inRoom.length > 0 ? [{ room, cases: inRoom }] : [];
  });
}
