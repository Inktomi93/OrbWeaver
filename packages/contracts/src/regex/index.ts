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
//   • `minDepth`/`maxDepth` are GONE (D107 dead-switch: stored, defaulted, and never executed — orbweaver
//     applies AI_OUTPUT/USER_INPUT at PERSIST time, so there is no depth axis to gate). Unknown keys are
//     stripped by zod's default object behavior, so an ST card carrying them still imports.

import type { CharacterId, ChatId, PresetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { RegexPlacement } from "@orb/kit/regex";
import { MAX_FIND_REGEX_LENGTH, REGEX_PLACEMENTS, SubstituteFindRegex } from "@orb/kit/regex";
import { z } from "zod";

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

/** What a script DOES — the `regex_scripts.behavior` JSON column. `name`/`enabled` are promoted columns
 *  and live on the ROW, not here (no doubling). */
export const regexScriptBehaviorSchema = z.object({
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
});

export type RegexScriptBehavior = z.infer<typeof regexScriptBehaviorSchema>;

/** The flat library-row wire view — a `regex_scripts` row projected for every reader. */
export const regexScriptSchema = regexScriptBehaviorSchema.extend({
  id: typeIdSchema(ID_PREFIX.regexScript),
  name: z.string().max(MAX_NAME_LENGTH),
  enabled: z.boolean().default(true),
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

export const regexScriptCardSchema = regexScriptCardFieldsSchema.transform(({ enabled, disabled, ...rest }) => ({
  ...rest,
  enabled: enabled ?? disabled !== true,
}));

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
 *  fields it is not changing; the verb merges over the stored body. */
export const updateRegexScriptSchema = createRegexScriptSchema.partial();

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
// does not, and flagged every `case` of a switch over the inferred type as unreachable. ONE declared union
// keeps BOTH tools seeing the same four arms; the `satisfies` keeps the schema honest against it.
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

/** The PORTABLE file shape — one script per `regex/*.json` in a backup bundle. `global` is the only
 *  attachment carried: it is a property of the script itself (the `global_regex_scripts` PK-is-the-script
 *  junction), where character/preset/chat attachments point at rows the bundle does not guarantee. */
export const portableRegexScriptSchema = createRegexScriptSchema.extend({
  global: z.boolean().default(false),
});

export type PortableRegexScript = z.infer<typeof portableRegexScriptSchema>;
