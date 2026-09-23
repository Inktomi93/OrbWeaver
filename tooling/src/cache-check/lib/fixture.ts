// The probe fixture: the cards, the rooms, and one step plan per case. Pure data; ops/drive.ts runs it.
// The prefix lives in one long user line in history and the cards stay short, so a call that reads only the
// system block reads almost nothing.
import type { CardSpec, CasePlan, ProbeStep, RoomKind, RoomSpec } from "../contract/plan.ts";
import type { CacheCase } from "../contract/types.ts";
import { FLOOR_CALIBRATION } from "./verdict.ts";

// The floor is a share measured on the calibration prefix, so the fixture is larger than that prefix: a cue-sized
// volatile tail (the narrator cue is the largest) then sits inside the floor with room to spare.
const PREFIX_HEADROOM = 1.5;
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

/**
 * The rooms, by kind.
 *
 * @remarks Per-speaker seats three characters: with two and greet-all, the last greeter is banned from the next
 * round, so `list` runs a single speaker. `cardScope` keeps its default, `merged`, the one roster system block.
 */
export const ROOMS: Readonly<Record<RoomKind, RoomSpec>> = {
  solo: { cards: [MARA], opening: "first-message", group: null },
  "per-speaker": { cards: [MARA, WREN, ANSEL], opening: "greet-all", group: { output: "per-speaker", policy: "list" } },
  narrator: { cards: [MARA, WREN], opening: "greet-all", group: { output: "narrator", policy: "natural" } },
};

// Any in-chat injection at depth 2 or deeper moves the history breakpoint; 4 is where an author's note sits.
const AUTHOR_NOTE_DEPTH = 4;
const AUTHOR_NOTE = "Author's note: keep the tone quiet and cold.";
/** The speakers one per-speaker `list` round runs with the three-character roster. */
const ROUND_SPEAKERS = 2;

const setup = (content: string): ProbeStep => ({ kind: "send", content, measure: "none" });
const measured = (content: string): ProbeStep => ({ kind: "send", content, measure: "all" });

/** One plan per case. Each plan puts the long message into history first, then runs the measured turns. */
export const CASE_PLANS: Readonly<Record<CacheCase, CasePlan>> = {
  solo: { room: "solo", steps: [setup(LONG_USER_LINE), measured("Any ships tonight?"), measured("Tell me about the fog.")] },
  continue: {
    room: "solo",
    steps: [setup(LONG_USER_LINE), setup("Any ships tonight?"), { kind: "continue", measure: "all" }, { kind: "continue", measure: "all" }],
  },
  "deep-note": {
    room: "solo",
    // Three setup sends so the note, four rows up, lands below the long message rather than on it.
    steps: [
      setup(LONG_USER_LINE),
      setup("Any ships tonight?"),
      setup("Tell me about the fog."),
      { kind: "note", depth: AUTHOR_NOTE_DEPTH, content: AUTHOR_NOTE },
      measured("Do you ever sleep?"),
      measured("Should I leave?"),
    ],
  },
  group: {
    room: "per-speaker",
    // The long round's last call opens the judged sequence, so the first pair crosses a round boundary.
    steps: [
      { kind: "send", content: LONG_USER_LINE, measure: "last", speakers: ROUND_SPEAKERS },
      { kind: "send", content: "Hello, all of you.", measure: "all", speakers: ROUND_SPEAKERS },
      { kind: "send", content: "What's the news tonight?", measure: "all", speakers: ROUND_SPEAKERS },
    ],
  },
  narrator: { room: "narrator", steps: [setup(LONG_USER_LINE), measured("What happens next?"), measured("And after that?")] },
};
