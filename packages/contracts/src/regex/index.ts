// The regex SCRIPT LIBRARY wire shapes (D121-E — the library is a first-class owner-stamped store with
// per-type FK junctions; the three embed-by-value carriers are GONE). Three shapes, ONE behavior body:
//
//   • `regexScriptBehaviorSchema` — what a script DOES (find/replace/placement/flags). Stored as the
//     `regex_scripts.behavior` typed JSON column (the world_entries "behavior in JSON, not columns"
//     precedent); `name`/`enabled` are promoted to real columns and therefore live OUTSIDE the body.
//   • `regexScriptSchema` / `RegexScriptRow` — the flat library-row wire view (`id` is the `regex_script_…`
//     TypeID brand). This is what every consumer (the chat legs, the client library surface) reads, and it
//     is the shape `@orb/kit/regex`'s executor consumes: `RegexScriptRow satisfies RegexScriptInput`,
//     pinned in the contract test.
//   • `regexScriptCardSchema` / `RegexScriptCard` — the ST CARD-WIRE shape only (`data.extensions.
//     regex_scripts`, V2 root `data.regex_scripts`). Its `id` is a foreign client-minted UUID, never a
//     library id; the import LIFT mints a real row from it and the export RE-EMBED projects back onto it.
//
// THE TWO ACCEPT-AND-DROP HEALS (both card-boundary only, both ruled by the regex-model review):
//   • `placement` parses leniently — an unknown member (ST's `SLASH_COMMAND`, which has no orbweaver leg
//     and was struck from `REGEX_PLACEMENTS`) is dropped from the ARRAY rather than failing the whole
//     script. A strict enum would silently delete the entire script instead of the dead value.
//   • ST's flat `minDepth`/`maxDepth` are still GONE from the card wire (unknown keys are stripped by zod's
//     default object behavior, so an ST card carrying them still imports). Their SEMANTIC came back with the
//     `PROMPT_HISTORY` leg as `historyDepth` — a nested object on the behavior body, see below. The lift
//     deliberately does NOT map the ST pair onto it: ST scopes depth on its USER_INPUT/AI_OUTPUT placements
//     (which are prompt-time there and PERSIST-time here), so mapping them would move an imported script
//     onto a different leg than the card asked for. Re-scoping an imported script is one chip in the editor.
//
// THE DEPTH-IS-ONLY-A-PROMPT_HISTORY-THING CHECK (`historyDepthMatchesPlacement`). `placement` is a SET, not
// a discriminant, so a discriminated union CANNOT express "these fields exist only on this placement" — a
// script legitimately runs on `USER_INPUT` and `PROMPT_HISTORY` at once. The honest shape available is
// therefore: ONE nested optional object (so the bounds can never half-exist), refused by a schema-level
// check unless `PROMPT_HISTORY` is in the set AND required when it is. The pairing is total in BOTH
// directions, so "a depth field on a leg that cannot execute it" and "the depth-scoped leg with no depth
// scope" are equally unrepresentable, and the client derives the pair at its ONE save boundary (the
// `withDerivedTierFlags` precedent) rather than validating it in a form.

import type { CharacterId, ChatId, PresetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { RegexHistoryDepth, RegexPlacement } from "@orb/kit/regex";
import { HISTORY_DEPTH_PLACEMENT, MAX_FIND_REGEX_LENGTH, REGEX_PLACEMENTS, SubstituteFindRegex } from "@orb/kit/regex";
import { z } from "zod";
// The chat MODULE FILE, not the `#chat` barrel: `chat/assemble.ts` imports this module, so routing through
// the barrel would close a cycle (`no-circular`). The shape's home is unchanged — chat owns it.
import type { VisibleRoomRef } from "../chat/visible-rooms.ts";

// ── Field caps (named so the literals aren't bare magic numbers) ──────────────
const MIN_CARD_ID_LENGTH = 1;
const MAX_CARD_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 200;
const MAX_REPLACE_LENGTH = 10_000;
const MAX_TRIM_STRING_LENGTH = 2000;
const MAX_TRIM_STRINGS = 100;

const PLACEMENT_SET: ReadonlySet<string> = new Set(REGEX_PLACEMENTS);

function isRegexPlacement(value: string): value is RegexPlacement {
  return PLACEMENT_SET.has(value);
}

/** The placement list, parsed LENIENTLY: unknown members are dropped from the array (see the header's
 *  accept-and-drop clause) instead of rejecting the script. Capped at the tuple length AFTER filtering —
 *  no value can repeat usefully. */
const placementSchema = z
  .array(z.string())
  .transform((values): RegexPlacement[] => values.filter(isRegexPlacement))
  .pipe(z.array(z.enum(REGEX_PLACEMENTS)).max(REGEX_PLACEMENTS.length));

/** The STRICT placement-list wire shape — the REGX2 bulk-placement verb's input. Unlike the lenient
 *  {@link placementSchema} above (which drops unknown members for the ST card-boundary heal), this rejects a
 *  non-member: the only caller is the first-party bulk dialog, which sends canonical `RegexPlacement`s off
 *  the shared `REGEX_PLACEMENT_ITEMS`, so a garbage value is a bug to surface, not a card to salvage. The
 *  server re-derives each script's tier flags + history-depth scope FROM this set (`@orb/kit/regex`), so no
 *  flag or depth rides the wire. */
export const regexPlacementListSchema = z.array(z.enum(REGEX_PLACEMENTS)).max(REGEX_PLACEMENTS.length) satisfies z.ZodType<RegexPlacement[]>;

/** How deep in the assembled history a `PROMPT_HISTORY` script applies — DEPTH 0 IS THE NEWEST MESSAGE,
 *  counting backwards (the kit `RegexHistoryDepth` header cites the ST source for the semantic). The two
 *  bounds live in ONE nested object rather than beside each other on the body so they cannot half-exist:
 *  a stored `min` with no `max` was the ST shape, and it made "unbounded" spellable four ways. */
export const regexHistoryDepthSchema = z
  .object({
    min: z.number().int().min(0).default(0),
    max: z.number().int().min(0).nullable().default(null),
  })
  .superRefine((scope, ctx): void => {
    if (scope.max !== null && scope.max < scope.min) {
      ctx.addIssue({ code: "custom", message: "maximum depth must not be shallower than the minimum", path: ["max"] });
    }
  }) satisfies z.ZodType<RegexHistoryDepth>;

/** The behavior FIELDS, un-checked — the base every `.extend()`/`.partial()` derives from. The pairing
 *  check rides {@link regexScriptBehaviorSchema}; zod refuses `.partial()` on a refined object, so the
 *  patch schema has to descend from this one. */
const regexScriptBehaviorFields = z.object({
  // Storage-boundary cap == execution cap (`@orb/kit/regex` MAX_FIND_REGEX_LENGTH) so an over-long
  // pattern can't even be persisted (it would otherwise only be rejected at execution).
  findRegex: z.string().max(MAX_FIND_REGEX_LENGTH),
  replaceString: z.string().max(MAX_REPLACE_LENGTH),
  placement: placementSchema,

  // Options mimicking the legacy ST card-format. `markdownOnly` = the per-user DISPLAY tier (D53's
  // preserved clause — the flags ARE the tier discriminant); `promptOnly` is its complement.
  markdownOnly: z.boolean().default(false),
  promptOnly: z.boolean().default(false),
  runOnEdit: z.boolean().default(false),
  trimStrings: z.array(z.string().max(MAX_TRIM_STRING_LENGTH)).max(MAX_TRIM_STRINGS).default([]),

  // How macros run on the FIND pattern before it is compiled (kit `SubstituteFindRegex`: none/raw/escaped).
  // Multi-value `z.literal([...])` (zod 4.x) — one node, one `invalid_value` issue naming all three options,
  // where the old three-arm `z.union` emitted a nested `invalid_union`. Same accepted set.
  substituteRegex: z.literal([SubstituteFindRegex.none, SubstituteFindRegex.raw, SubstituteFindRegex.escaped]).default(SubstituteFindRegex.none),

  // Present IFF `placement` carries `PROMPT_HISTORY` — enforced in both directions below.
  historyDepth: regexHistoryDepthSchema.optional(),
});

/** The depth scope and the depth-scoped LEG are one fact, so they are validated as one (see the header's
 *  check clause). Both arms are stated: depth without the leg would be a knob that governs nothing (D107),
 *  and the leg without depth would leave "the whole history" spelled by ABSENCE, which no reader can
 *  distinguish from "the author never got to that field". */
function historyDepthMatchesPlacement(
  behavior: { placement: readonly RegexPlacement[]; historyDepth?: RegexHistoryDepth | undefined },
  ctx: z.RefinementCtx,
): void {
  const runsOnHistory = behavior.placement.includes(HISTORY_DEPTH_PLACEMENT);
  if (behavior.historyDepth !== undefined && !runsOnHistory) {
    ctx.addIssue({ code: "custom", message: `historyDepth is only meaningful on the ${HISTORY_DEPTH_PLACEMENT} leg`, path: ["historyDepth"] });
  }
  if (behavior.historyDepth === undefined && runsOnHistory) {
    ctx.addIssue({ code: "custom", message: `a ${HISTORY_DEPTH_PLACEMENT} script must state its historyDepth scope`, path: ["historyDepth"] });
  }
}

/** What a script DOES — the `regex_scripts.behavior` JSON column. `name`/`enabled` are promoted columns
 *  and live on the ROW, not here (no doubling). The ONE behavior gate: the tRPC create input extends it,
 *  the update verb re-parses the merged body through it, and the read seam parses stored blobs with it. */
export const regexScriptBehaviorSchema = regexScriptBehaviorFields.superRefine(historyDepthMatchesPlacement);

export type RegexScriptBehavior = z.infer<typeof regexScriptBehaviorSchema>;

/** The flat library-row wire view — a `regex_scripts` row projected for every reader.
 *
 *  `updatedAt` is the EDITED stamp the library list renders (X-16: `Add script` mints every row named
 *  "New script", so without a per-row discriminator a library of them is unreadable — the preset list has
 *  carried this since its own F5 finding). It rides on the ROW rather than on a separate list-summary shape
 *  because the library has no separate summary: `regex.listScripts` returns exactly this. */
export const regexScriptSchema = regexScriptBehaviorSchema.extend({
  id: typeIdSchema(ID_PREFIX.regexScript),
  name: z.string().max(MAX_NAME_LENGTH),
  enabled: z.boolean().default(true),
  updatedAt: z.number().int(),
});

export type RegexScriptRow = z.infer<typeof regexScriptSchema>;

/** The ST CARD-WIRE script (`data.extensions.regex_scripts`). Its `id` is a FOREIGN client-minted UUID —
 *  the lift mints a real `regex_script_…` row from it and the carried-refs key re-links a same-install
 *  re-import, so this id is provenance, never a library identity.
 *
 *  THE ENABLED/DISABLED POLARITY IS THE ST WIRE'S, NOT OURS. ST has no `enabled` field at all: its editor
 *  writes `disabled` (`input[name="disabled"]`) and its executor skips on `!!regexScript.disabled`. Reading
 *  only `enabled` therefore made an ST card's switched-OFF script arrive switched ON — a find/replace the
 *  card's author had deliberately parked, silently rewriting canon on the first turn after import. Both
 *  keys are accepted, ours winning when present (so an orbweaver-exported card round-trips exactly), and
 *  `toRegexScriptCardWire` writes both back out so a foreign ST reading our card honours the state too. */
const regexScriptCardFieldsSchema = regexScriptBehaviorSchema.extend({
  id: z.string().min(MIN_CARD_ID_LENGTH).max(MAX_CARD_ID_LENGTH),
  name: z.string().max(MAX_NAME_LENGTH),
  enabled: z.boolean().optional(),
  disabled: z.boolean().optional(),
});

/** ST's NUMERIC placement enum → orb's member (SOURCE-PINNED, SillyTavern
 *  `public/scripts/extensions/regex/engine.js:281` — MD_DISPLAY 0 · USER_INPUT 1 · AI_OUTPUT 2 ·
 *  SLASH_COMMAND 3 · WORLD_INFO 5 · REASONING 6; 4 is a struck legacy sendAs arm). `3`/`4` are
 *  DELIBERATELY absent — orb has no slash-command text leg (D107; the header's accept-and-drop clause),
 *  so they fall through the lenient placement filter like the string `"SLASH_COMMAND"` does. */
const ST_REGEX_PLACEMENT_BY_NUMBER: Readonly<Record<number, RegexPlacement>> = {
  0: "DISPLAY",
  1: "USER_INPUT",
  2: "AI_OUTPUT",
  5: "WORLD_INFO",
  6: "REASONING",
};

/** Normalize the GENUINE ST spelling onto the orb wire before the schema parses. ST's editor writes
 *  `scriptName` (`extensions/regex/index.js:850`) and INTEGER placements — the orb-exported dialect
 *  (`name`, string placements) is what the fields schema reads, so a real ST script failed `safeParse`
 *  wholesale and the lift silently dropped it (measured: all 15 corpus preset scripts). Ours wins when
 *  both spellings are present (the enabled/disabled precedent above); an unmapped placement NUMBER is
 *  stringified so the lenient filter drops the MEMBER, never the script. */
function normalizeStScriptWire(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return raw;
  }
  const obj = raw as Record<string, unknown>;
  const name = obj["name"] ?? obj["scriptName"];
  const placement = Array.isArray(obj["placement"])
    ? obj["placement"].map((member) => (typeof member === "number" ? (ST_REGEX_PLACEMENT_BY_NUMBER[member] ?? String(member)) : member))
    : obj["placement"];
  return {
    ...obj,
    ...(name === undefined ? {} : { name }),
    ...(placement === undefined ? {} : { placement }),
  };
}

export const regexScriptCardSchema = z.preprocess(
  normalizeStScriptWire,
  regexScriptCardFieldsSchema.transform(({ enabled, disabled, ...rest }) => ({
    ...rest,
    enabled: enabled ?? disabled !== true,
  })),
);

export type RegexScriptCard = z.output<typeof regexScriptCardSchema>;

/** Project a card script back onto the ST wire — `disabled` beside our `enabled`, so the card is readable
 *  by both engines with one meaning. The ONE emit-side home for the polarity (the parse side is above). */
export function toRegexScriptCardWire(card: RegexScriptCard): RegexScriptCard & { readonly disabled: boolean } {
  return { ...card, disabled: !card.enabled };
}

// ── The CRUD wire inputs (the tRPC router + the domain verbs validate against exactly these) ──────────

/** Create one library script. `id`/`ownerId`/`createdAt` are the server's (an app-minted TypeID + the
 *  principal), so the wire carries only authored content. */
export const createRegexScriptSchema = regexScriptBehaviorSchema.extend({
  name: z.string().max(MAX_NAME_LENGTH),
  enabled: z.boolean().default(true),
});

export type CreateRegexScriptInput = z.infer<typeof createRegexScriptSchema>;

/** Patch one library script. Every field optional — omitted ⇒ unchanged (never "clear"). The BEHAVIOR is
 *  patched as a WHOLE (the blob is rewritten from the merge), so a partial behavior patch still carries the
 *  fields it is not changing; the verb merges over the stored body.
 *
 *  Descends from the UN-refined shape because zod refuses `.partial()` on a refined object — and that is
 *  the correct seam anyway: a patch is not a behavior, so the depth/placement pairing is checked on the
 *  MERGED body (`updateScript` re-parses through `regexScriptBehaviorSchema`), where it is actually true. */
export const updateRegexScriptSchema = regexScriptBehaviorFields.extend({ name: z.string().max(MAX_NAME_LENGTH), enabled: z.boolean() }).partial();

export type UpdateRegexScriptInput = z.infer<typeof updateRegexScriptSchema>;

// PD-144 twin: a portable/exported CARD carries orbweaver-namespaced REFERENCES to the library scripts it is
// attached to, alongside the by-value `regex_scripts` ST payload. On a same-install re-import the references
// re-link to the existing rows (zero duplicate rows); on a foreign install they resolve to nothing and the
// by-value payload lifts instead. Library scripts are never cloned through the reference channel.
export const attachedRegexScriptRefSchema = z.object({
  regexScriptId: typeIdSchema(ID_PREFIX.regexScript),
});
export type AttachedRegexScriptRef = z.infer<typeof attachedRegexScriptRefSchema>;

/** The V3-wire key the references ride under (orbweaver-namespaced so it never collides with an ST `data.*`
 *  field). The ONE literal home — the serde OUT-emitter + the import extractor read it from here. */
export const ATTACHED_REGEX_SCRIPTS_WIRE_KEY = "orbweaver_attached_regex_scripts";

// ── WHICH scope an attachment addresses (the ONE spelling, three consumers) ────────────────────────────
// The tRPC router validates against this, the domain's `ApplyScopeOrderParams` types against it, and the
// client picker binds it. Before it lived here the shape was re-spelled in all three — a discriminated
// union written out three times is three chances to add a scope in two of them.
//
// GLOBAL is deliberately ABSENT from the picker-facing arms but present here: the global attachment is a
// property of the script (`global_regex_scripts` PKs on the script id), so it is toggled from the library
// surface, while character/preset/chat are attached from the thing they belong to.
//
// The TS union is DECLARED, not `z.infer`red, and the schema is pinned to it by `satisfies` below. The
// reason is measured, not stylistic: the arms carry `typeIdSchema`, which is a transform-backed `ZodType`
// rather than a `ZodObject` — `tsc` reads the discriminant correctly through it, but biome's type service
// does not, and flagged every `case` of a switch over the inferred type as unreachable. Re-measured on Biome
// 2.5.1 (2026-09-23): still every `case`, `lint/suspicious/noUnnecessaryConditions`, single-file and
// cross-module, from untracked files under `packages/contracts/src/` and `packages/server/src/` (never /tmp,
// where zod does not resolve).
// ONE declared union keeps BOTH tools seeing the same four arms. The `satisfies` below is a ONE-WAY
// assignability check; the `zod-output-twin-parity` gate proves the schema output equals this union exactly.
export type RegexAttachScope =
  | { readonly kind: "global" }
  | { readonly kind: "character"; readonly characterId: CharacterId }
  | { readonly kind: "preset"; readonly presetId: PresetId }
  | { readonly kind: "chat"; readonly chatId: ChatId };

export const regexAttachScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("global") }),
  z.object({ kind: z.literal("character"), characterId: typeIdSchema(ID_PREFIX.character) }),
  z.object({ kind: z.literal("preset"), presetId: typeIdSchema(ID_PREFIX.preset) }),
  z.object({ kind: z.literal("chat"), chatId: typeIdSchema(ID_PREFIX.chat) }),
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
// attachment junction; regex re-derives from it rather than re-spelling it (promoted 2026-08-19, when
// databank + preset became the second and third consumers).

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

/** The PORTABLE file shape — one script per `regex/*.json` in a backup bundle. `global` is the only
 *  attachment carried: it is a property of the script itself (the `global_regex_scripts` PK-is-the-script
 *  junction), where character/preset/chat attachments point at rows the bundle does not guarantee. */
export const portableRegexScriptSchema = createRegexScriptSchema.extend({
  global: z.boolean().default(false),
});

export type PortableRegexScript = z.infer<typeof portableRegexScriptSchema>;
