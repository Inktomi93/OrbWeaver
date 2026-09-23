// kit/macro/builtin-metadata — the backfilled DX metadata for every builtin the DEFAULT registry
// registers (no metadata-less macro survives, so the browser is complete from birth). Keyed by
// the registry's lowercase lookup name; `volatile` is intentionally ABSENT (MacroMetadataInput) — the
// registry composes it from the `registerVolatileMacros` set so the two can't drift (D51). A completeness
// test (tests/kit/macro/metadata.test.ts) asserts every default-registered name has an entry here.
// NOTE: block capability is UNIVERSAL — any macro takes a `{{name::args}}body{{/name}}` body
// (the resolved body arrives as its last unnamed arg) — so there is deliberately NO per-macro
// "block-capable" field; the flag vocabulary the browser documents is `MACRO_FLAG_DEFS` (types.ts).

import type { MacroArgDef, MacroCategory, MacroListSpec, MacroMetadataInput } from "./types.ts";

// Common arg shapes — the var-op family repeats these; naming them keeps the table's intent legible.
const KEY_ARG = { name: "key", type: "string", optional: false } as const;
const VALUE_ARG = { name: "value", type: "string", optional: false } as const;
const VALUE_ARG_OPT = { name: "value", type: "string", optional: true, default: "" } as const;

// Builder that fills the boilerplate (returnType, empty args/aliases, non-variadic) so each entry below
// stays a single readable line — the fields that vary ride `extra`.
function meta(
  name: string,
  category: MacroCategory,
  description: string,
  extra: { args?: readonly MacroArgDef[]; aliases?: readonly string[]; variadic?: boolean; list?: MacroListSpec } = {},
): MacroMetadataInput {
  return {
    name,
    description,
    category,
    args: extra.args ?? [],
    returnType: "string",
    aliases: extra.aliases ?? [],
    variadic: extra.variadic ?? false,
    ...(extra.list !== undefined ? { list: extra.list } : {}),
  };
}

export const BUILTIN_MACRO_METADATA = {
  // ── identity ──
  char: meta("char", "identity", "The active character's name.", { aliases: ["charName"] }),
  charname: meta("charName", "identity", "The active character's name (alias of char).", { aliases: ["char"] }),
  user: meta("user", "identity", "The active persona (user) name.", { aliases: ["userName"] }),
  username: meta("userName", "identity", "The active persona name (alias of user).", { aliases: ["user"] }),
  persona: meta("persona", "identity", "The active persona's description, with its own macros resolved."),
  scenario: meta("scenario", "identity", "The scenario text for the chat.", { aliases: ["charScenario"] }),
  group: meta("group", "identity", "Every character in the room (including muted), comma-joined.", { aliases: ["charIfNotGroup"] }),
  charifnotgroup: meta("charIfNotGroup", "identity", "Every character in the room, comma-joined (char for a solo chat).", { aliases: ["group"] }),
  groupnotmuted: meta("groupNotMuted", "identity", "The active (non-muted) characters, comma-joined."),
  notchar: meta("notChar", "identity", "The room's characters minus the current speaker, comma-joined."),

  // ── card ──
  description: meta("description", "card", "The character's description field.", { aliases: ["charDescription"] }),
  chardescription: meta("charDescription", "card", "The character's description (alias of description).", { aliases: ["description"] }),
  personality: meta("personality", "card", "The character's personality field.", { aliases: ["charPersonality"] }),
  charpersonality: meta("charPersonality", "card", "The character's personality (alias of personality).", { aliases: ["personality"] }),
  charscenario: meta("charScenario", "card", "The character card's scenario field.", { aliases: ["scenario"] }),
  appearance: meta("appearance", "card", "The character's appearance field."),
  backstory: meta("backstory", "card", "The character's backstory field."),
  example: meta("example", "card", "The character's example-message dialogue.", { aliases: ["mesExamples"] }),
  mesexamples: meta("mesExamples", "card", "The character's example dialogue (alias of example).", { aliases: ["example"] }),
  charsysinfo: meta("charSysInfo", "card", "The card's system-prompt override."),
  charposthistory: meta("charPostHistory", "card", "The card's post-history instructions."),
  original: meta("original", "system", "The preset-level Main Prompt/Jailbreak the card marker wraps."),
  charfirstmessage: meta("charFirstMessage", "card", "The character's greeting (first message)."),

  // ── system / context ──
  model: meta("model", "system", "The model id for the current turn."),
  chatid: meta("chatId", "system", "The current chat's id."),
  compact_summary: meta("compact_summary", "system", "The staged compact conversation summary."),
  memory: meta("memory", "system", "The staged long-term memory recall."),
  databank: meta("databank", "system", "The staged databank retrieval, or empty when nothing retrieved."),
  // ── rpg (data-fed; empty outside a game) ──
  rpgworld: meta("rpgWorld", "system", "The RPG world overview + genre/setting/tone/difficulty frame (empty outside a game)."),
  rpgsecrets: meta("rpgSecrets", "system", "The GM-only story arc + plot twists + hidden clocks (empty outside a game)."),
  rpgcontinuity: meta("rpgContinuity", "system", "The RPG session summaries + latest carryover detail (empty outside a game)."),
  rpgcast: meta("rpgCast", "system", "The RPG party sheets/arcs + tracked NPCs (empty outside a game)."),
  rpgscenestate: meta("rpgSceneState", "system", "The resolved RPG scene: clock/location/weather/present/recent (empty outside a game)."),
  rpgmap: meta("rpgMap", "system", "The active RPG map: current + connected locations (empty outside a game)."),
  rpgperception: meta("rpgPerception", "system", "The server-computed RPG passive-perception hints (empty outside a game)."),
  rpgmorale: meta("rpgMorale", "system", "The RPG party-morale tier + prose (empty outside a game)."),
  rpgquests: meta("rpgQuests", "system", "The active RPG quests + open objectives (empty outside a game)."),
  rpgdelta: meta("rpgDelta", "system", "The RPG changes-since-last-beat delta line (empty outside a game / on a quiet turn)."),
  idle_duration: meta("idle_duration", "conversation", "Time since the last chat activity as human text (empty on a fresh chat)."),
  guided_instruction: meta("guided_instruction", "system", "The staged guided-generation instruction."),
  if: meta("if", "system", "Conditional block: renders its body when the predicate passes, else the {{else}} branch.", {
    args: [{ name: "predicate", type: "string", optional: true }],
    variadic: true,
  }),
  else: meta("else", "system", "Marks the alternate branch inside an {{if}}…{{/if}} block."),
  newline: meta("newline", "system", "Renders a single newline."),
  space: meta("space", "system", "Renders a single space."),
  noop: meta("noop", "system", "Renders nothing (a no-op placeholder)."),
  banned: meta("banned", "system", "Strips its contents (legacy compatibility)."),
  trim: meta("trim", "system", "Trims whitespace from both ends of its block body."),
  trimstart: meta("trimStart", "system", "Trims leading whitespace from its block body."),
  trimend: meta("trimEnd", "system", "Trims trailing whitespace from its block body."),
  uppercase: meta("uppercase", "system", "Upper-cases its block body (locale-independent)."),
  lowercase: meta("lowercase", "system", "Lower-cases its block body (locale-independent)."),

  // ── conversation ──
  input: meta("input", "conversation", "The in-flight user turn being answered."),
  lastmessage: meta("lastMessage", "conversation", "The most recent message of any role (excl. the in-flight one)."),
  lastusermessage: meta("lastUserMessage", "conversation", "The most recent user message."),
  lastcharmessage: meta("lastCharMessage", "conversation", "The most recent character message."),

  // ── variables ──
  getvar: meta("getvar", "variables", "Reads a runtime variable (empty when unset).", { args: [KEY_ARG], aliases: ["get"] }),
  get: meta("get", "variables", "Reads a runtime variable (alias of getvar).", { args: [KEY_ARG], aliases: ["getvar"] }),
  setvar: meta("setvar", "variables", "Sets a runtime variable; renders nothing.", { args: [KEY_ARG, VALUE_ARG_OPT] }),
  addvar: meta("addvar", "variables", "Appends to a runtime variable (string concat); renders nothing.", { args: [KEY_ARG, VALUE_ARG] }),
  incvar: meta("incvar", "variables", "Increments a runtime variable by one and renders the result.", { args: [KEY_ARG] }),
  decvar: meta("decvar", "variables", "Decrements a runtime variable by one and renders the result.", { args: [KEY_ARG] }),
  hasvar: meta("hasvar", "variables", 'Renders "true" when a runtime variable exists, else empty.', { args: [KEY_ARG] }),
  deletevar: meta("deletevar", "variables", "Removes a runtime variable; renders nothing.", { args: [KEY_ARG] }),
  getglobalvar: meta("getglobalvar", "variables", "Reads a per-user global variable (cross-chat; empty when unset).", { args: [KEY_ARG] }),
  setglobalvar: meta("setglobalvar", "variables", "Sets a per-user global variable at turn commit (not variant-scoped); renders nothing.", {
    args: [KEY_ARG, VALUE_ARG_OPT],
  }),

  // ── time ──
  time: meta("time", "time", "The current time as HH:mm:ss."),
  date: meta("date", "time", "The current date as yyyy-MM-dd."),
  weekday: meta("weekday", "time", "The current weekday name."),
  isodate: meta("isodate", "time", "The current date in ISO format."),
  isotime: meta("isotime", "time", "The current instant in ISO format."),
  datetimeformat: meta("datetimeformat", "time", "Formats the current instant with a Luxon format string (ISO when omitted).", {
    args: [{ name: "format", type: "string", optional: true }],
  }),

  // ── random ──
  random: meta("random", "random", "Random number (0-100), integer in a range, or a picked option.", {
    args: [
      { name: "minOrOption", type: "string", optional: true },
      { name: "max", type: "string", optional: true },
    ],
    variadic: true,
  }),
  // The LIST spec in action: a {{pick}} of nothing is an authoring mistake — min 1 makes it an
  // author-time diagnostic (the render still degrades to "" per the fail-open posture).
  pick: meta("pick", "random", "Picks one of the given options under the injected PRNG.", {
    args: [{ name: "option", type: "string", optional: true }],
    variadic: true,
    list: { min: 1 },
  }),
  roll: meta("roll", "random", "Rolls dice: {{roll::NdM}} sums N M-sided dice, {{roll::N}} rolls 1..N.", {
    args: [{ name: "spec", type: "string", optional: false }],
  }),

  // ── expression ──
  expr: meta("expr", "expression", "Evaluates a CEL expression over the runtime env; renders its result (structures as JSON).", {
    args: [{ name: "cel", type: "string", optional: false }],
    variadic: true, // the arg splitter breaks a CEL body on `::`; treat the reassembled tail as one source
  }),
} as const satisfies Record<string, MacroMetadataInput>;
