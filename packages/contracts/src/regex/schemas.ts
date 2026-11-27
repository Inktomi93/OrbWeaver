// The regex SCRIPT LIBRARY wire shapes (D121-E — the library is a first-class owner-stamped store with
// per-type FK junctions; scripts are not embedded by value in three carriers). Three shapes, ONE behavior body:
//
//   • `regexScriptBehaviorSchema` — what a script DOES. Stored as the `regex_scripts.behavior` typed JSON column
//     (the world_entries "behavior in JSON, not columns" precedent); `name`/`enabled` are promoted to real columns
//     and therefore live OUTSIDE the body.
//   • `regexScriptSchema` / `RegexScriptRow` — the flat library-row wire view (`id` is the `regex_script_…`
//     TypeID brand). This is what every consumer (the chat passes, the client library surface) reads, and it
//     is the shape `@orb/kit/regex`'s executor consumes: `RegexScriptRow satisfies RegexScriptInput`.
//   • `regexScriptCardSchema` / `RegexScriptCard` — the CARD-WIRE shape (`data.extensions.regex_scripts`, V2 root
//     `data.regex_scripts`, a preset's `extensions.regex_scripts`, SillyTavern's global list and a single exported
//     script). Its `id` is a foreign client-minted UUID, never a library id; the import LIFT mints a real row from
//     it and the export RE-EMBED projects back onto it.
//
// TWO AXES (`@orb/kit/regex` states the model): `targets` say what text a script touches and `passes` say when it
// runs. Depth and an author scope are legal only beside an ephemeral pass (display or prompt).
//
// THE SILLYTAVERN LIFT translates at this boundary only, by SillyTavern's own fields: its numeric placement is the
// target list, and its two switches are the passes (`markdownOnly` is display, `promptOnly` is prompt, both is
// both, neither is save). `minDepth` and `maxDepth` become `depth` with SillyTavern's sentinels (a floor below -1
// or a ceiling below 0 is no bound). A script is in the SillyTavern dialect when its placement holds numbers; the
// orbweaver dialect names its targets and passes.
//
// WHERE COHERENCE IS CHECKED. `.claude/rules/db.md`: "A refine on a parse-on-read schema bricks already-stored rows.
// Put coherence checks at the write-producing verb, not the reader's schema." So the read schema
// (`regexScriptBehaviorSchema`, the shape the stored-row seam parses) carries no cross-field check, and the
// pairing rules (`behaviorCoheres`) ride the write schemas: create, the update verb's re-parse of the merged body,
// and the card wire every import parses. Stored rows hold only the two-axis shape; the old placement-set shape is
// lifted at the file boundaries, where an older export still arrives.

import type { CharacterId, ChatId, PresetId, RegexScriptId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { MESSAGE_KINDS, PARTICIPANT_KINDS, PARTICIPANT_ROLES } from "@orb/kit/message-author";
import type { RegexAuthorScope, RegexAuthorSelector, RegexDepth, RegexPass, RegexTarget } from "@orb/kit/regex";
import {
  EPHEMERAL_REGEX_PASSES,
  findPatternCompiles,
  findPatternLimitBreak,
  MAX_FIND_REGEX_LENGTH,
  REGEX_DEPTH_FLOOR,
  REGEX_DEPTH_MAX,
  REGEX_PASSES,
  REGEX_TARGETS,
  regexBehaviorReachesText,
  SubstituteFindRegex,
} from "@orb/kit/regex";
import { z } from "zod";
// The chat MODULE FILE, not the `#chat` barrel: `chat/assemble.ts` imports this module, so routing through
// the barrel would close a cycle (`no-circular`). The shape's home is unchanged — chat owns it.
import type { VisibleRoomRef } from "../chat/visible-rooms.ts";
import { visibleRoomRefSchema } from "../chat/visible-rooms.ts";

// ── Field caps (named so the literals aren't bare magic numbers) ──────────────
const MIN_CARD_ID_LENGTH = 1;
const MAX_CARD_ID_LENGTH = 128;
/** The cap on a script name. */
export const REGEX_SCRIPT_NAME_MAX = 200;
/** The cap on a stored replacement. It bounds storage only: a replacement is inert text until it renders, and the
 *  render tier is its guard, so it is set to fit a public HUD preset's largest panel. */
export const MAX_REPLACE_LENGTH = 65_536;
const MAX_TRIM_STRING_LENGTH = 2000;
const MAX_TRIM_STRINGS = 100;
/** The cap on an author scope's selectors, per list. */
const MAX_AUTHOR_SELECTORS = 64;

/** The target list: strict, so a stored behavior re-parses to itself. */
const regexTargetListSchema = z.array(z.enum(REGEX_TARGETS)).max(REGEX_TARGETS.length) satisfies z.ZodType<RegexTarget[]>;

/** The pass list: strict, so a stored behavior re-parses to itself. */
const regexPassListSchema = z.array(z.enum(REGEX_PASSES)).max(REGEX_PASSES.length) satisfies z.ZodType<RegexPass[]>;

// Strip mode: also reads imported files and stored rows; the wire parses a strict form (`strictTwin` or a `.strict()` view).
// The two bounds live in ONE nested object so they cannot half-exist.
const regexDepthSchema = z
  .object({
    min: z.int().min(REGEX_DEPTH_FLOOR).max(REGEX_DEPTH_MAX).default(REGEX_DEPTH_FLOOR),
    max: z.int().min(0).max(REGEX_DEPTH_MAX).nullable().default(null),
  })
  .strip() satisfies z.ZodType<RegexDepth>;

const regexAuthorSelectorSchema = z.discriminatedUnion("by", [
  z.strictObject({ by: z.literal("participant"), participant: z.enum(PARTICIPANT_KINDS) }),
  z.strictObject({ by: z.literal("standing"), standing: z.enum(PARTICIPANT_ROLES) }),
  z.strictObject({ by: z.literal("kind"), kind: z.enum(MESSAGE_KINDS) }),
  z.strictObject({ by: z.literal("character"), characterId: typeIdSchema(ID_PREFIX.character) }),
  z.strictObject({ by: z.literal("persona"), personaId: typeIdSchema(ID_PREFIX.persona) }),
  z.strictObject({ by: z.literal("user"), userId: brandedId("UserId") }),
]) satisfies z.ZodType<RegexAuthorSelector>;

const regexAuthorScopeSchema = z
  .object({
    include: z.array(regexAuthorSelectorSchema).max(MAX_AUTHOR_SELECTORS).default([]),
    exclude: z.array(regexAuthorSelectorSchema).max(MAX_AUTHOR_SELECTORS).default([]),
  })
  .strip() satisfies z.ZodType<RegexAuthorScope>;

// Strip mode: also reads imported files and stored rows; the wire parses a strict form (`strictTwin` or a `.strict()` view).
/** The behavior FIELDS, un-checked: the base every `.extend()`/`.partial()` derives from, and the read schema. */
const regexScriptBehaviorFields = z
  .object({
    // Storage-boundary cap == execution cap (`@orb/kit/regex` MAX_FIND_REGEX_LENGTH) so an over-long
    // pattern can't even be persisted (it would otherwise only be rejected at execution).
    findRegex: z.string().max(MAX_FIND_REGEX_LENGTH),
    replaceString: z.string().max(MAX_REPLACE_LENGTH),
    targets: regexTargetListSchema,
    passes: regexPassListSchema,
    runOnEdit: z.boolean().default(false),
    trimStrings: z.array(z.string().max(MAX_TRIM_STRING_LENGTH)).max(MAX_TRIM_STRINGS).default([]),

    // How macros run on the FIND pattern before it is compiled (kit `SubstituteFindRegex`: none/raw/escaped).
    // Multi-value `z.literal([...])` (zod 4.x) — one node, one `invalid_value` issue naming all three options,
    // where a three-arm `z.union` emits a nested `invalid_union`. Same accepted set.
    substituteRegex: z.literal([SubstituteFindRegex.none, SubstituteFindRegex.raw, SubstituteFindRegex.escaped]).default(SubstituteFindRegex.none),

    depth: regexDepthSchema.optional(),
    authors: regexAuthorScopeSchema.optional(),
  })
  .strip();

function runsEphemeral(passes: readonly RegexPass[]): boolean {
  return passes.some((pass) => (EPHEMERAL_REGEX_PASSES as readonly RegexPass[]).includes(pass));
}

/** The write-time pairing rules: the save pass alone or the ephemeral passes, never both (SillyTavern's two switches
 *  give exactly these four choices); depth and an author scope only beside a display or prompt pass, since no other
 *  pass has a position or a row author to read; and a ceiling no shallower than its floor. */
function behaviorCoheres(
  behavior: { readonly passes: readonly RegexPass[]; readonly depth?: RegexDepth | undefined; readonly authors?: RegexAuthorScope | undefined },
  ctx: z.RefinementCtx,
): void {
  const ephemeral = runsEphemeral(behavior.passes);
  // A saved rewrite already changed what display and prompt read, so a script is either saved or ephemeral.
  if (ephemeral && behavior.passes.includes("save")) {
    ctx.addIssue({ code: "custom", message: "a script runs when saved or on screen and in the prompt, not both", path: ["passes"] });
  }
  if (behavior.depth !== undefined && !ephemeral) {
    ctx.addIssue({ code: "custom", message: "depth applies only on the display or prompt pass", path: ["depth"] });
  }
  if (behavior.authors !== undefined && !ephemeral) {
    ctx.addIssue({ code: "custom", message: "an author scope applies only on the display or prompt pass", path: ["authors"] });
  }
  if (behavior.depth !== undefined && behavior.depth.max !== null && behavior.depth.max < behavior.depth.min) {
    ctx.addIssue({ code: "custom", message: "maximum depth must not be shallower than the minimum", path: ["depth", "max"] });
  }
}

/** What a script DOES — the `regex_scripts.behavior` JSON column, as the stored-row seam reads it. `name`/`enabled`
 *  are promoted columns and live on the ROW, not here. No cross-field check: see the header. */
export const regexScriptBehaviorSchema = regexScriptBehaviorFields;

/** The behavior as a write accepts it: the read shape plus the pairing rules. The update verb re-parses the merged
 *  body through this. */
export const regexScriptBehaviorWriteSchema = regexScriptBehaviorFields.superRefine(behaviorCoheres);

export type RegexScriptBehavior = z.infer<typeof regexScriptBehaviorSchema>;

/** The flat library-row wire view — a `regex_scripts` row projected for every reader.
 *
 *  `updatedAt` is the EDITED stamp the library list renders (`Add script` mints every row named
 *  "New script", so without a per-row discriminator a library of them is unreadable — the preset list
 *  carries the same stamp). It rides on the ROW rather than on a separate list-summary shape
 *  because the library has no separate summary: `regex.listScripts` returns exactly this. */
export const regexScriptSchema = regexScriptBehaviorSchema.extend({
  id: typeIdSchema(ID_PREFIX.regexScript),
  name: z.string().max(REGEX_SCRIPT_NAME_MAX),
  enabled: z.boolean().default(true),
  updatedAt: z.int(),
});

export type RegexScriptRow = z.infer<typeof regexScriptSchema>;

// Outputs validate already-normalized rows without changing the storage or foreign-card grammars.
export const regexScriptViewSchema = regexScriptSchema.strict().safeExtend({
  depth: regexDepthSchema.strict().optional(),
  authors: regexAuthorScopeSchema.strict().optional(),
}) satisfies z.ZodType<RegexScriptRow>;

/** The CARD-WIRE script. Its `id` is a FOREIGN client-minted UUID — the lift mints a real `regex_script_…` row from
 *  it and the carried-refs key re-links a same-install re-import, so this id is provenance, never a library
 *  identity.
 *
 *  THE ENABLED/DISABLED POLARITY IS SILLYTAVERN'S, NOT OURS. That wire has no `enabled` field at all: its editor
 *  writes `disabled` (`input[name="disabled"]`) and its executor skips on `!!regexScript.disabled`. Reading
 *  only `enabled` would therefore make a card's switched-OFF script arrive switched ON — a find/replace the
 *  card's author had deliberately parked, silently rewriting canon on the first turn after import. Both
 *  keys are accepted, SillyTavern's winning in its dialect (`liftStScriptWire`), and `toRegexScriptCardWire`
 *  writes both back out so a foreign SillyTavern reading our card honours the state too. */
const regexScriptCardFieldsSchema = regexScriptBehaviorFields.extend({
  id: z.string().min(MIN_CARD_ID_LENGTH).max(MAX_CARD_ID_LENGTH),
  name: z.string().max(REGEX_SCRIPT_NAME_MAX),
  enabled: z.boolean().optional(),
  disabled: z.boolean().optional(),
});

// A card script in SillyTavern's own spelling: every field is written beside the two axes on export
// ({@link stRegexScriptFields}), and the lift reads each one back through its own schema ({@link stSpelling}).
const stRegexScriptFieldsSchema = z
  .object({
    scriptName: z.string(),
    disabled: z.boolean(),
    placement: z.array(z.number()),
    markdownOnly: z.boolean(),
    promptOnly: z.boolean(),
    minDepth: z.number().nullable(),
    maxDepth: z.number().nullable(),
  })
  .strip();

/** A card script in SillyTavern's own spelling, written beside the two axes. */
export type StRegexScriptFields = Readonly<z.output<typeof stRegexScriptFieldsSchema>>;

/** SillyTavern's spelling as one card-wire script carries it: a field that fails its own schema reads as absent. */
type StSpelling = { readonly [K in keyof StRegexScriptFields]: StRegexScriptFields[K] | undefined };

function stField<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

// The placement keeps only its numbered members, one at a time: a member of this app's own spelling (a target name)
// sits beside them in an older file, and SillyTavern's dialect is the list that holds a number.
function stSpelling(obj: Readonly<Record<string, unknown>>): StSpelling {
  const fields = stRegexScriptFieldsSchema.shape;
  const placement = obj["placement"];
  return {
    scriptName: stField(fields.scriptName, obj["scriptName"]),
    disabled: stField(fields.disabled, obj["disabled"]),
    placement: Array.isArray(placement) ? placement.flatMap((member) => stField(fields.placement.element, member) ?? []) : undefined,
    markdownOnly: stField(fields.markdownOnly, obj["markdownOnly"]),
    promptOnly: stField(fields.promptOnly, obj["promptOnly"]),
    minDepth: stField(fields.minDepth, obj["minDepth"]),
    maxDepth: stField(fields.maxDepth, obj["maxDepth"]),
  };
}

/** SillyTavern's NUMERIC placement → orbweaver's target (SillyTavern `public/scripts/extensions/regex/engine.js`
 *  `regex_placement`: MD_DISPLAY 0 · USER_INPUT 1 · AI_OUTPUT 2 · SLASH_COMMAND 3 · WORLD_INFO 5 · REASONING 6).
 *  `0` is absent: it is SillyTavern's retired display member ({@link ST_RETIRED_DISPLAY_PLACEMENT}). `3` is absent: it is
 *  slash-command text and SillyTavern's typed narrator line, neither of which exists here (D107). Every import door
 *  names a script that loses a member this way ({@link stPlacementsWithoutTarget}), and a script left with no target
 *  is imported switched off. */
const ST_REGEX_TARGET_BY_NUMBER: Readonly<Record<number, RegexTarget>> = {
  1: "USER_INPUT",
  2: "AI_OUTPUT",
  5: "WORLD_INFO",
  6: "REASONING",
};

/** SillyTavern's retired display placement. Its loader rewrites it on the global list only: dropped from a list that
 *  holds another member, or read alone as every placement, with both display and prompt switches set either way. A
 *  preset's or a card's script is never rewritten, and no call passes 0, so there it is a placement with no target. */
const ST_RETIRED_DISPLAY_PLACEMENT = 0;

/** Which SillyTavern list a script was read from: the global list (`extension_settings.regex`), or a scoped one (a
 *  preset's, a card's, or a single exported script). Only the global list's loader rewrites
 *  {@link ST_RETIRED_DISPLAY_PLACEMENT}. */
export type StScriptList = "global" | "scoped";

function readsRetiredDisplay(list: StScriptList, member: number): boolean {
  return list === "global" && member === ST_RETIRED_DISPLAY_PLACEMENT;
}

/** The numbered SillyTavern placements a card-wire script holds that have no target here, in its own order; empty
 *  for a script in this app's own spelling. Every import door names them. */
export function stPlacementsWithoutTarget(candidate: unknown, list: StScriptList): readonly number[] {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return [];
  }
  const placement = stSpelling(candidate as Record<string, unknown>).placement ?? [];
  return placement.filter((member) => !readsRetiredDisplay(list, member) && ST_REGEX_TARGET_BY_NUMBER[member] === undefined);
}

const ST_SUBSTITUTE_MODES: readonly unknown[] = Object.values(SubstituteFindRegex);

function isSubstituteMode(value: unknown): value is SubstituteFindRegex {
  return ST_SUBSTITUTE_MODES.includes(value);
}

/** Whether a card-wire script's find pattern compiles; true for a script in this app's own spelling, which is stored
 *  as written. SillyTavern keeps a script that does not compile and never runs it, so the lift imports it switched
 *  off, and every import door names it. */
export function stScriptPatternCompiles(candidate: unknown): boolean {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return true;
  }
  const obj = candidate as Record<string, unknown>;
  const findRegex = obj["findRegex"];
  if (!isStDialect(stSpelling(obj)) || typeof findRegex !== "string") {
    return true;
  }
  const mode = obj["substituteRegex"] === undefined ? undefined : stSubstituteRegex(obj["substituteRegex"]);
  return findPatternCompiles({ findRegex, substituteRegex: isSubstituteMode(mode) ? mode : undefined });
}

/** SillyTavern's older BOOLEAN spelling of `substituteRegex`: `true` substituted macros into the pattern raw, `false`
 *  did not. Any other value is the current enum form and passes through to the schema. */
function stSubstituteRegex(value: unknown): unknown {
  if (typeof value !== "boolean") {
    return value;
  }
  return value ? SubstituteFindRegex.raw : SubstituteFindRegex.none;
}

/** The passes SillyTavern's two switches name: neither is the save pass, each switch its own ephemeral pass. */
function stPasses(markdownOnly: boolean, promptOnly: boolean): RegexPass[] {
  if (!(markdownOnly || promptOnly)) {
    return ["save"];
  }
  return [...(markdownOnly ? (["display"] as const) : []), ...(promptOnly ? (["prompt"] as const) : [])];
}

/** SillyTavern's depth pair, by its own gate: a floor applies when it is a number of at least -1, a ceiling when it
 *  is a number of at least 0. No bound at all is no depth. */
function stDepth(minDepth: number | null | undefined, maxDepth: number | null | undefined): RegexDepth | undefined {
  const min = typeof minDepth === "number" && Number.isInteger(minDepth) && minDepth >= REGEX_DEPTH_FLOOR ? minDepth : REGEX_DEPTH_FLOOR;
  const max = typeof maxDepth === "number" && Number.isInteger(maxDepth) && maxDepth >= 0 ? maxDepth : null;
  return min === REGEX_DEPTH_FLOOR && max === null ? undefined : { min, max };
}

/** Translate one SillyTavern-dialect script (numeric placement) onto the two axes. Its name, polarity and macro mode
 *  are SillyTavern's spellings too, and each wins over this app's own beside it, so a file exported here and edited
 *  there comes back as edited. Depth and an author scope ride only beside an ephemeral pass, since SillyTavern's save
 *  calls pass neither; the author scope is this app's alone and is carried through. */
function liftStScriptWire(
  obj: Record<string, unknown>,
  st: StSpelling & { readonly placement: readonly number[] },
  list: StScriptList,
): Record<string, unknown> {
  const {
    placement: _placement,
    markdownOnly: _markdownOnly,
    promptOnly: _promptOnly,
    minDepth: _minDepth,
    maxDepth: _maxDepth,
    scriptName: _scriptName,
    targets: _t,
    passes: _p,
    depth: _d,
    authors,
    ...rest
  } = obj;
  const retired = st.placement.some((member) => readsRetiredDisplay(list, member));
  const passes = retired ? stPasses(true, true) : stPasses(st.markdownOnly === true, st.promptOnly === true);
  const ephemeral = runsEphemeral(passes);
  const depth = ephemeral ? stDepth(st.minDepth, st.maxDepth) : undefined;
  const members = st.placement.filter((member) => !readsRetiredDisplay(list, member));
  const targets =
    retired && members.length === 0
      ? [...REGEX_TARGETS]
      : REGEX_TARGETS.filter((target) => members.some((member) => ST_REGEX_TARGET_BY_NUMBER[member] === target));
  return {
    ...rest,
    name: st.scriptName ?? rest["name"],
    ...(st.disabled === undefined ? {} : { enabled: !st.disabled }),
    // A script whose passes read none of its targets, or whose pattern does not compile, runs nowhere: it is kept, so
    // the owner can fix it, but switched off, so the library never shows an enabled script that does nothing.
    ...(regexBehaviorReachesText({ targets, passes }) && stScriptPatternCompiles(obj) ? {} : { enabled: false }),
    targets,
    passes,
    ...(depth === undefined ? {} : { depth }),
    ...(ephemeral && authors !== undefined ? { authors } : {}),
    ...(rest["substituteRegex"] === undefined ? {} : { substituteRegex: stSubstituteRegex(rest["substituteRegex"]) }),
  };
}

/** Whether a card-wire script is in SillyTavern's dialect: its placement holds numbers. A file exported here carries
 *  both spellings, and SillyTavern's wins, so an edit made there comes back; its spelling holds every axis but the
 *  author scope, which the lift carries through untouched. */
function isStDialect(st: StSpelling): st is StSpelling & { readonly placement: readonly number[] } {
  return st.placement !== undefined && st.placement.length > 0;
}

// ── THE PLACEMENT-SET SHAPE, lifted at the file boundaries ─────────────────────────────────────────────────────
// The older shape: a script held one `placement` set in which `DISPLAY` and `PROMPT_HISTORY` stood beside the
// save-time members, with `markdownOnly`, `promptOnly` and `historyDepth` beside it. A file exported then still
// imports, and the numbered migration rewrites stored rows by this same mapping
// (`tests/contracts/regex/legacy-behavior-lift.contract.test.ts` pins each shape). Two readings, in order:
//   • A `DISPLAY` or `PROMPT_HISTORY` member means the editor here wrote the row, since the legacy lift never did.
//     With a save member (`USER_INPUT`, `AI_OUTPUT`, `REASONING`) the save reading wins: the save pass on those
//     members alone, its other members dropped, since a script is saved or ephemeral and the save pass is the one
//     that has been changing stored text. With none, `DISPLAY` is the display pass and `PROMPT_HISTORY` or
//     `WORLD_INFO` the prompt pass, and a target is kept only where every kept pass reached it before, so the lift
//     never widens a script's reach; `PROMPT_HISTORY` brings its depth.
//   • Otherwise the flags are read at their word, with SillyTavern's meaning: `markdownOnly` is display,
//     `promptOnly` is prompt, both is both, neither is save. An editor-written save-time script also carries
//     `promptOnly: true` (the legacy derive set it whenever `DISPLAY` was absent), so it reads as prompt-only: owner
//     ruling, accepted because only the owner has installed the app.
const LEGACY_DISPLAY = "DISPLAY";
const LEGACY_PROMPT_HISTORY = "PROMPT_HISTORY";
const LEGACY_SAVE_TARGETS: readonly RegexTarget[] = ["USER_INPUT", "AI_OUTPUT", "REASONING"];
/** The old depth floor: 0 meant every message, which is -1 now that a continue's reply sits there. */
const LEGACY_NO_FLOOR = 0;

/** Whether a card-wire or portable script is in the placement-set shape: a `placement` list and no `targets`. */
function isPlacementSetShape(obj: Record<string, unknown>): obj is Record<string, unknown> & { readonly placement: readonly unknown[] } {
  return Array.isArray(obj["placement"]) && obj["targets"] === undefined;
}

function legacyDepth(historyDepth: unknown): RegexDepth | undefined {
  if (typeof historyDepth !== "object" || historyDepth === null) {
    return;
  }
  const { min, max } = historyDepth as Record<string, unknown>;
  const floor = typeof min === "number" && min !== LEGACY_NO_FLOOR ? min : REGEX_DEPTH_FLOOR;
  const ceiling = typeof max === "number" ? max : null;
  return floor === REGEX_DEPTH_FLOOR && ceiling === null ? undefined : { min: floor, max: ceiling };
}

/** An editor-written row (the section header). The legacy history pass read user and AI rows, the legacy display
 *  pass every row's text including reasoning, and world info was read only as the prompt was built. */
function legacyNativeAxes(members: readonly string[], historyDepth: unknown): { targets: RegexTarget[]; passes: RegexPass[]; depth?: RegexDepth } {
  const save = LEGACY_SAVE_TARGETS.filter((target) => members.includes(target));
  if (save.length > 0) {
    return { targets: REGEX_TARGETS.filter((target) => save.includes(target)), passes: ["save"] };
  }
  const worldInfo = members.includes("WORLD_INFO");
  const display = members.includes(LEGACY_DISPLAY);
  const history = members.includes(LEGACY_PROMPT_HISTORY);
  const userAndAi = history || (display && !worldInfo);
  const kept = (target: RegexTarget): boolean => {
    switch (target) {
      case "WORLD_INFO":
        return worldInfo;
      case "REASONING":
        return display && !history && !worldInfo;
      case "USER_INPUT":
      case "AI_OUTPUT":
        return userAndAi;
    }
  };
  const passes = REGEX_PASSES.filter((pass) => ({ save: false, display: display && (history || !worldInfo), prompt: history || worldInfo })[pass]);
  const depth = history ? legacyDepth(historyDepth) : undefined;
  return { targets: REGEX_TARGETS.filter(kept), passes, ...(depth === undefined ? {} : { depth }) };
}

/** Lift one placement-set script onto the two axes. */
function liftPlacementSetShape(obj: Record<string, unknown>, placement: readonly unknown[]): Record<string, unknown> {
  const { placement: _placement, markdownOnly, promptOnly, historyDepth, ...rest } = obj;
  const members = placement.filter((member): member is string => typeof member === "string");
  const native = members.includes(LEGACY_DISPLAY) || members.includes(LEGACY_PROMPT_HISTORY);
  const axes = native
    ? legacyNativeAxes(members, historyDepth)
    : { targets: REGEX_TARGETS.filter((target) => members.includes(target)), passes: stPasses(markdownOnly === true, promptOnly === true) };
  return { ...rest, ...axes };
}

/** Lift a stored or exported behavior in the placement-set shape onto the two axes; any other value passes
 *  through. The numbered migration's data rewrite follows this mapping. */
function liftPlacementSetBehavior(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return raw;
  }
  const obj = raw as Record<string, unknown>;
  return isPlacementSetShape(obj) ? liftPlacementSetShape(obj, obj.placement) : obj;
}

function normalizeCardScriptWire(raw: unknown, list: StScriptList): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return raw;
  }
  const obj = raw as Record<string, unknown>;
  const st = stSpelling(obj);
  return isStDialect(st) ? liftStScriptWire(obj, st, list) : liftPlacementSetBehavior(obj);
}

const liftedCardScriptSchema = regexScriptCardFieldsSchema.superRefine(behaviorCoheres).transform(({ enabled, disabled, ...rest }) => ({
  ...rest,
  enabled: enabled ?? disabled !== true,
}));

/** A card-wire script from a scoped list: a card's, a preset's, a single exported script, or this app's own file. */
export const regexScriptCardSchema = z.preprocess((raw) => normalizeCardScriptWire(raw, "scoped"), liftedCardScriptSchema);

/** A card-wire script from SillyTavern's global list, read the way its loader rewrites that list. */
export const stGlobalRegexScriptCardSchema = z.preprocess((raw) => normalizeCardScriptWire(raw, "global"), liftedCardScriptSchema);

export type RegexScriptCard = z.output<typeof regexScriptCardSchema>;

/** The content identity of one script: its name and its behavior under a stable key order, since a JSON blob's key
 *  order is not semantic. Its switch is not part of it: a library row holds one switch for every carrier it is
 *  attached to. An import reuses an owned row by this key, and a preset's import identity is built from it. */
export function regexScriptContentKey(name: string, behavior: RegexScriptBehavior): string {
  const entries = Object.entries(behavior).sort(([a], [b]) => (a < b ? -1 : 1));
  return `${name} ${JSON.stringify(entries)}`;
}

/** {@link regexScriptContentKey} of a card-wire script; its foreign id is provenance, not content. */
export function regexScriptCardContentKey(script: RegexScriptCard): string {
  const { id: _id, name, enabled: _enabled, ...behavior } = script;
  return regexScriptContentKey(name, regexScriptBehaviorSchema.parse(behavior));
}

/** The stored-length cap an imported script broke. `max` is the largest value the cap admits. */
export interface RegexScriptLimitBreak {
  readonly limit: "find-length" | "replace-length";
  readonly max: number;
  readonly actual: number;
}

/** The guard a candidate script breaks, read before the card schema parses it, so an import names the limit instead
 *  of reporting a malformed script. Null when no guard is broken. */
export function regexScriptLimitBreak(candidate: unknown): RegexScriptLimitBreak | null {
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }
  const { findRegex, replaceString } = candidate as Record<string, unknown>;
  if (typeof replaceString === "string" && replaceString.length > MAX_REPLACE_LENGTH) {
    return { limit: "replace-length", max: MAX_REPLACE_LENGTH, actual: replaceString.length };
  }
  return typeof findRegex === "string" ? findPatternLimitBreak(findRegex) : null;
}

/** What one card hands the regex lift. `carried` are the orbweaver-namespaced references (the attached-book twin) - each is
 *  attached DIRECTLY when it names a row this owner already has, and ignored otherwise. `scripts` is the
 *  SillyTavern by-value payload, lifted for everything `carried` did not cover. */
export interface ImportCardScriptsArgs {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly scripts: readonly RegexScriptCard[];
  readonly carried: readonly RegexScriptId[];
}

/** The preset lift's input: SillyTavern's preset-scoped scripts. The SillyTavern preset wire has no carried-reference channel, so the
 *  by-value payload always content-dedups. */
export interface ImportPresetScriptsArgs {
  readonly ownerId: UserId;
  readonly presetId: PresetId;
  readonly scripts: readonly RegexScriptCard[];
}

/** The global lift's input: SillyTavern's `extension_settings.regex` array onto the owner's library. */
export interface ImportGlobalScriptsArgs {
  readonly ownerId: UserId;
  readonly scripts: readonly RegexScriptCard[];
}

/** A script an import left out, by its file's name, and why. */
export interface RegexScriptRefusal {
  readonly name: string;
  readonly reason: string;
}

/** What a regex lift did - the counts the import report surfaces. */
export interface ImportCardScriptsResult {
  /** Fresh library rows minted from the by-value payload. */
  readonly created: number;
  /** Candidates that matched an existing owned row (carried reference OR content-equal) and were attached
   *  rather than cloned. */
  readonly reused: number;
  /** Candidates refused at the write door (their find pattern costs too much to compile), neither stored nor
   *  attached. */
  readonly refused: readonly RegexScriptRefusal[];
}

/** The card RE-EMBED: the character's attached library rows projected back onto the SillyTavern card-wire shape, in junction
 *  `position` order, plus the reference list the same-install re-import re-links by. */
export interface ExportedCardScripts {
  readonly scripts: readonly RegexScriptCard[];
  readonly carried: readonly RegexScriptId[];
}

// The wire output is normalized already: foreign aliases/polarity are input-only, not output fields.
export const regexScriptCardViewSchema = regexScriptBehaviorFields
  .strict()
  .extend({
    id: regexScriptCardFieldsSchema.shape.id,
    name: regexScriptCardFieldsSchema.shape.name,
    enabled: z.boolean(),
    depth: regexDepthSchema.strict().optional(),
    authors: regexAuthorScopeSchema.strict().optional(),
  })
  .superRefine(behaviorCoheres) satisfies z.ZodType<RegexScriptCard>;

const ST_NUMBER_BY_TARGET = new Map(Object.entries(ST_REGEX_TARGET_BY_NUMBER).map(([number, target]) => [target, Number(number)]));

/**
 * A script's SillyTavern spelling: its numbered placement, its two switches and its depth pair, written beside the
 * two axes on every file this app exports, so the file runs where its author meant in both apps. The ONE emit-side
 * home for the polarity and the placement numbers (the parse side is above).
 *
 * @remarks An author scope has no SillyTavern spelling, so SillyTavern runs such a script on every row of its targets.
 */
export function stRegexScriptFields(
  script: Pick<RegexScriptCard, "name" | "enabled" | "targets" | "passes"> & { readonly depth?: RegexDepth | undefined },
): StRegexScriptFields {
  return {
    scriptName: script.name,
    disabled: !script.enabled,
    // A script on no pass has no SillyTavern spelling (neither switch reads as the save pass), so it writes no
    // placement: SillyTavern runs it nowhere, and the import here reads the two axes back as they are.
    placement: script.passes.length === 0 ? [] : script.targets.flatMap((target) => ST_NUMBER_BY_TARGET.get(target) ?? []),
    markdownOnly: script.passes.includes("display"),
    promptOnly: script.passes.includes("prompt"),
    minDepth: script.depth === undefined || script.depth.min === REGEX_DEPTH_FLOOR ? null : script.depth.min,
    maxDepth: script.depth?.max ?? null,
  };
}

/** Project a card script onto the card wire in both dialects ({@link stRegexScriptFields}). */
export function toRegexScriptCardWire(card: RegexScriptCard): RegexScriptCard & StRegexScriptFields {
  return { ...card, ...stRegexScriptFields(card) };
}

// ── The CRUD wire inputs (the tRPC router + the domain verbs validate against exactly these) ──────────

/** Create one library script. `id`/`ownerId`/`createdAt` are the server's (an app-minted TypeID + the
 *  principal), so the wire carries only authored content. */
export const createRegexScriptSchema = regexScriptBehaviorFields
  .extend({
    name: z.string().max(REGEX_SCRIPT_NAME_MAX),
    enabled: z.boolean().default(true),
  })
  .superRefine(behaviorCoheres);

export type CreateRegexScriptInput = z.infer<typeof createRegexScriptSchema>;

/** Patch one library script. Every field optional — omitted ⇒ unchanged. `null` on `depth` or `authors` clears it:
 *  each one's "every position" or "every author" is the absent field, so an omitted key cannot say it. The BEHAVIOR is
 *  patched as a WHOLE (the blob is rewritten from the merge), so a partial behavior patch still carries the
 *  fields it is not changing; the verb merges over the stored body.
 *
 *  Descends from the UN-refined shape because zod refuses `.partial()` on a refined object — and that is
 *  the correct seam anyway: a patch is not a behavior, so the pairing rules are checked on the MERGED body
 *  (`updateScript` re-parses through `regexScriptBehaviorWriteSchema`), where they are actually true. */
export const updateRegexScriptSchema = regexScriptBehaviorFields
  .extend({
    name: z.string().max(REGEX_SCRIPT_NAME_MAX),
    enabled: z.boolean(),
    depth: regexDepthSchema.nullable(),
    authors: regexAuthorScopeSchema.nullable(),
  })
  .partial();

export type UpdateRegexScriptInput = z.infer<typeof updateRegexScriptSchema>;

// Strip mode: also reads imported files.
// twin: a portable/exported CARD carries orbweaver-namespaced REFERENCES to the library scripts it is
// attached to, alongside the by-value `regex_scripts` SillyTavern payload. On a same-install re-import the references
// re-link to the existing rows (zero duplicate rows); on a foreign install they resolve to nothing and the
// by-value payload lifts instead. Library scripts are never cloned through the reference channel.
export const attachedRegexScriptRefSchema = z
  .object({
    regexScriptId: typeIdSchema(ID_PREFIX.regexScript),
  })
  .strip();
export type AttachedRegexScriptRef = z.infer<typeof attachedRegexScriptRefSchema>;

/** The V3-wire key the references ride under (orbweaver-namespaced so it never collides with a SillyTavern `data.*`
 *  field). The ONE literal home — the serde OUT-emitter + the import extractor read it from here. */
export const ATTACHED_REGEX_SCRIPTS_WIRE_KEY = "orbweaver_attached_regex_scripts";

// ── WHICH scope an attachment addresses (the ONE spelling, three consumers) ────────────────────────────
// The tRPC router validates against this, the domain's `ApplyScopeOrderParams` types against it, and the
// client picker binds it. The shape is spelled once here: a discriminated
// union written out three times is three chances to add a scope in two of them.
//
// GLOBAL is deliberately ABSENT from the picker-facing arms but present here: the global attachment is a
// property of the script (`global_regex_scripts` PKs on the script id), so it is toggled from the library
// surface, while character/preset/chat are attached from the thing they belong to.
//
// The TS union is DECLARED, not `z.infer`red, and the schema is pinned to it by `satisfies` below. The
// reason is measured, not stylistic: the arms carry `typeIdSchema`, which is a transform-backed `ZodType`
// rather than a `ZodObject` — `tsc` reads the discriminant correctly through it, but biome's type service
// does not, and flagged every `case` of a switch over the inferred type as unreachable. Measured on Biome
// 2.5.1: every `case` trips `noUnnecessaryConditions` (off in `tooling/src/biome-config/policy.config.ts`), single-file and
// cross-module, from untracked files under `packages/contracts/src/` and `packages/server/src/` (never /tmp,
// where zod does not resolve).
// ONE declared union keeps BOTH tools seeing the same four arms. The `satisfies` below is a ONE-WAY
// assignability check; review holds the schema output equal to this union.
export type RegexAttachScope =
  | { readonly kind: "global" }
  | { readonly kind: "character"; readonly characterId: CharacterId }
  | { readonly kind: "preset"; readonly presetId: PresetId }
  | { readonly kind: "chat"; readonly chatId: ChatId };

export const regexAttachScopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("global") }),
  z.strictObject({ kind: z.literal("character"), characterId: typeIdSchema(ID_PREFIX.character) }),
  z.strictObject({ kind: z.literal("preset"), presetId: typeIdSchema(ID_PREFIX.preset) }),
  z.strictObject({ kind: z.literal("chat"), chatId: typeIdSchema(ID_PREFIX.chat) }),
]) satisfies z.ZodType<RegexAttachScope>;

/** The three scopes a PICKER attaches (global is the library surface's own switch — see above). Spelled
 *  out rather than `Exclude<RegexAttachScope, …>` for the same reason the parent union is: a mapped/
 *  conditional type hides the arms from biome's switch-exhaustiveness analysis. */
export type RegexPickerScope =
  | { readonly kind: "character"; readonly characterId: CharacterId }
  | { readonly kind: "preset"; readonly presetId: PresetId }
  | { readonly kind: "chat"; readonly chatId: ChatId };

// ── The REVERSE rosters ("who attaches this script") ──────────────────────────────────────────────────
// The forward reads (`listForPreset`/`listForCharacter`/`listForChat`) answer "what does THIS carrier
// attach". The library's context pane asks the OTHER direction — "where does this script already run" — and
// no amount of layout can derive that from the forward lists without an N-query fan-out over every preset
// and character the owner has. `listScriptUsage` is that read.
//
// NAMES, NOT COUNTS — the difference from the `BookWithUsage`/`TagWithUsage` rollups one domain over. Those
// answer "attached ×3" for EVERY owned row (a library-list decoration); this answers "which three" for ONE
// row (a context-pane roster). "Attached by presets · 2" over two names is a statement a reader can act on;
// "2" alone sends them opening presets until they find it.

/** One carrier that attaches a script, as the roster prints it: the id it is keyed by and the name it shows.
 *  Generic in the id so each scope's array keeps its own brand — a `PresetId` can never land in the
 *  characters roster (the `VersionedConfigDef<T>` precedent for a one-shape/many-instantiations contract). */
export interface RegexAttachmentRef<TId extends PresetId | CharacterId | ChatId> {
  readonly id: TId;
  readonly name: string;
}

// A ROOM row is deliberately NOT a `RegexAttachmentRef`, and it is not regex's shape either. A preset and a
// character HAVE a name — one authored string the server can hand over finished. A chat does not: its title
// is a fallback CHAIN the client owns, and WHICH rooms may even be named is chat's membership question
// (D18). Both halves are `#chat`'s `VisibleRoomRef`, shared with every other library that keeps a chat-scope
// attachment junction; regex reads it rather than re-spelling it (its consumers are databank, preset and regex).

/** Where one script already runs, read from the SCRIPT's side — the three roster scopes.
 *  GLOBAL is absent on purpose: it is a property of the script itself (`global_regex_scripts` PKs on the
 *  script id), so the context pane reads it off `listGlobal` and renders it as a switch, not a roster.
 *  ROOMS are membership-scoped (D18 — chats carry no ownerId): a room the caller cannot see is not listed,
 *  even when the script it attaches is the caller's own. Presets and characters arrive in NAME order (the
 *  server can sort what it can name); rooms arrive newest-first, because their name is the client's to
 *  derive and `chats.updatedAt` is the order the chats list itself uses. */
export interface RegexScriptUsage {
  readonly presets: readonly RegexAttachmentRef<PresetId>[];
  readonly characters: readonly RegexAttachmentRef<CharacterId>[];
  readonly rooms: readonly VisibleRoomRef[];
}

export const regexScriptUsageSchema = z.strictObject({
  presets: z.array(z.strictObject({ id: typeIdSchema(ID_PREFIX.preset), name: z.string() })).readonly(),
  characters: z.array(z.strictObject({ id: typeIdSchema(ID_PREFIX.character), name: z.string() })).readonly(),
  rooms: z.array(visibleRoomRefSchema).readonly(),
}) satisfies z.ZodType<RegexScriptUsage>;

/** The PORTABLE file shape — one script per `regex/*.json` in a backup bundle. `global` is the only
 *  attachment carried: it is a property of the script itself (the `global_regex_scripts` PK-is-the-script
 *  junction), where character/preset/chat attachments point at rows the bundle does not guarantee. */
export const portableRegexScriptSchema = z.preprocess(
  (raw) => normalizeCardScriptWire(raw, "scoped"),
  regexScriptBehaviorFields
    .extend({
      name: z.string().max(REGEX_SCRIPT_NAME_MAX),
      enabled: z.boolean().default(true),
      global: z.boolean().default(false),
    })
    .superRefine(behaviorCoheres),
);

export type PortableRegexScript = z.output<typeof portableRegexScriptSchema>;

/** Every BULK verb's answer: how many of the requested scripts the operation actually changed.
 *  It is NOT the requested count — a foreign id, an id another device already deleted, and an id that was
 *  already in the requested state all fall out, and the caller's toast should say what happened rather than
 *  what was asked. */
export interface BulkResult {
  readonly affected: number;
}

export const bulkResultSchema = z.strictObject({ affected: z.number() }) satisfies z.ZodType<BulkResult>;

/** How many scripts one request may name: far above any real selection or preset, low enough to bound the statement a
 *  single request can build. */
const REGEX_SCRIPT_IDS_MAX = 500;

/** The script ids one request names: a bulk gesture, or the scripts a preset delete takes with it. */
export const regexScriptIdsInputSchema = z.array(typeIdSchema(ID_PREFIX.regexScript)).max(REGEX_SCRIPT_IDS_MAX);

/** Both axes a bulk gesture sets on every listed script, paired as a write pairs them. */
export const regexAxesWriteSchema = z.strictObject({ targets: regexTargetListSchema, passes: regexPassListSchema }).superRefine(behaviorCoheres);

/** The bulk axes verb's answer: the changed count, and the scripts a move to the save pass cleared a depth or
 *  an author scope from, so the gesture can name them. */
export interface BulkAxesResult extends BulkResult {
  readonly cleared: readonly RegexScriptId[];
}

export const bulkAxesResultSchema = z.strictObject({
  affected: z.number(),
  cleared: z.array(typeIdSchema(ID_PREFIX.regexScript)).readonly(),
}) satisfies z.ZodType<BulkAxesResult>;

/** `notes` names what the import left behind, such as a SillyTavern placement with no target here. */
export const importScriptFileResultSchema = z.strictObject({ created: z.boolean(), notes: z.array(z.string()).readonly() });
export type ImportScriptFileResult = z.output<typeof importScriptFileResultSchema>;

export const regexScriptIdInputSchema = z.strictObject({ scriptId: typeIdSchema(ID_PREFIX.regexScript) });

export const regexCharacterInputSchema = z.strictObject({ characterId: typeIdSchema(ID_PREFIX.character) });

export const regexPresetInputSchema = z.strictObject({ presetId: typeIdSchema(ID_PREFIX.preset) });

export const regexChatInputSchema = z.strictObject({ chatId: typeIdSchema(ID_PREFIX.chat) });
