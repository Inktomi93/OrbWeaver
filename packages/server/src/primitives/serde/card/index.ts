// The one home for the character-card serde core: the tolerant in-adapter (readCardJson), the strict
// out-emitter (buildCardV3 + the character_book entry mapper exportBookEntry), and the card content hash
// (cardContentHash). Co-located so the round-trip is a one-file invariant. Server-only pure: no DB, no
// logger, no fs — it maps an already-JSON-parsed card object into/out of the canonical contracts/character
// shape and hashes a canonical card's semantic fields. `cardContentHash` is the single home of the hash;
// the IN/OUT halves hash-mirror so a re-import of an app-emitted card hashes identically to the original.
// `cardImportHash` is the IMPORT identity (owner ruling): the parsed content PLUS the art, so one text under
// two pictures is two characters (an alt-art version). The one exception, a JSON card followed by its PNG,
// is the import verb's: the row takes the art when it has none.
//
// The import reads every card field through its own schema in `@orb/contracts/character`, the shapes buildCardV3
// validates its output by, so the two halves cannot drift. A field the card spells wrong drops to its default and is
// named in the read's notes; it never refuses the card, and no key outside the schema enters the read.
//
// Character-Card V2 AND V3 are read first-class into the ONE canonical model: V3 is a strict SUPERSET of V2,
// so the shared `data.*` reads cover both, and readCardJson captures the source `spec` so buildCardV3
// round-trips it (V2→V2, V3→V3). V3-native content is now DECOMPOSED into typed columns: `nickname`/`source`/
// `creation_date`/`modification_date` are first-class card fields (read here, emitted by buildCardV3).
// `creator_notes_multilingual` has NO typed column: it rides the `residualData` passthrough verbatim and only
// FEEDS `creator_notes` when that is empty (it was promoted out of residual and never folded, so a
// map-only card imported with its notes destroyed; the `en`-first pick is a display fallback, not a locale
// policy). `assets` remains on the `residualData` passthrough (preserved verbatim,
// non-lossy) pending its own lane; `group_only_greetings` folds into the `greetings` array (`groupOnly:true`
// entries — V3 promotion Phase B), re-split on export. V3 `data.assets[]` is PARSED + PRESERVED only:
// resolving an asset URI is outside this parser. URI fetches must use the network egress guard because a
// card is untrusted. This reader stays pure parse-and-validate, zero I/O.

import { createHash } from "node:crypto";
import type { AttachedBookRef, CardDepthPrompt, CardSpec, CharacterCard, CharacterCardV3, Greeting } from "@orb/contracts/character";
import {
  ATTACHED_BOOKS_WIRE_KEY,
  CHARA_CARD_V2_SPEC,
  CHARA_CARD_V3_SPEC,
  CHARACTER_BACKGROUND_WIRE_KEY,
  CHARACTER_HANDLE_WIRE_KEY,
  characterBookEntryFields,
  characterBookFields,
  characterCardDataFields,
  characterCardV3Fields,
  characterCardV3Schema,
  portableCharacterHandle,
} from "@orb/contracts/character";
import type { AttachedRegexScriptRef, RegexScriptCard } from "@orb/contracts/regex";
import { ATTACHED_REGEX_SCRIPTS_WIRE_KEY, toRegexScriptCardWire } from "@orb/contracts/regex";
import type { ThemeBackground } from "@orb/contracts/theme";
import { canonicalBackgroundSource } from "@orb/contracts/theme";
import type { BulkImportLorebookInput, BulkImportLoreEntryInput } from "@orb/contracts/world-info";
import { isPlainObject } from "@orb/kit/guards";
import type { CharacterHandle } from "@orb/kit/ids";
import { MAX_INJECTION_DEPTH } from "@orb/kit/injection";
import type { JsonObject, JsonValue } from "@orb/kit/json";
import { jsonObjectOf } from "@orb/kit/json";
import { messageRoleFromSt, messageRoleToSt } from "@orb/kit/message-role";
import { stableStringify } from "@orb/kit/stable-stringify";
import type { EntryPosition, StSeatlessPosition } from "@orb/kit/world-info";
import {
  ANCHOR_POSITIONS,
  ENTRY_POSITIONS,
  entryPositionOfStSlot,
  inertActivationFields,
  resolveEntryInjection,
  resolveEntryKeyMode,
  resolveEntryPosition,
  resolveEntryScope,
  resolveEntryStSlot,
  ST_SEATLESS_POSITIONS,
  ST_SLOT_METADATA_KEY,
  ST_SLOT_OF_ENTRY_POSITION,
  ST_WORLD_INFO_POSITION,
} from "@orb/kit/world-info";
import { z } from "zod";
import type { StScriptNote } from "#primitives/serde/regex";
import { readStScriptList, stScriptListNotes } from "#primitives/serde/regex";

function nullIfEmpty(s: string): string | null {
  return s.trim().length > 0 ? s : null;
}
function firstNonEmpty(...vals: string[]): string | null {
  for (const v of vals) {
    if (v.trim().length > 0) {
      return v;
    }
  }
  return null;
}

// ── The tolerant field read ──────────────────────────────────────────────────────────────────────────────
// Every card field is read through its own schema in `@orb/contracts/character`, one field at a time, so a field the
// card spells wrong drops to its default alone and never refuses the card. A value that is absent or JSON `null` has
// nothing to drop. A list (or the multilingual map) keeps every item its schema reads.

/** How a field that fails its schema keeps what it can: a list item by item, a map entry by entry. */
type FieldHeal = "items" | "entries";

const MALFORMED_FIELD = "not a readable value for this field, so it was left out";

function lostItems(lost: number, total: number): string {
  return `${String(lost)} of its ${String(total)} items are not readable values for this field, so they were left out`;
}

// A caught schema (one ending in `.catch`) answers success with `undefined` for a value it refused.
function readsAs(schema: z.core.$ZodType, value: unknown): boolean {
  const parsed = z.safeParse(schema, value);
  return parsed.success && parsed.data !== undefined;
}

/** One field read: where it sits, the notes a drop is named in, and how a failing value keeps what it can. `notes` is
 *  null where a drop loses nothing the owner wrote: the raw value is kept whole elsewhere (the residue, an entry's
 *  metadata), or the field is a reference the app carries for itself ({@link CARRIED_FIELDS}). */
interface FieldRead {
  readonly value: unknown;
  readonly field: string;
  readonly notes: StScriptNote[] | null;
  readonly heal?: FieldHeal | undefined;
}

/** The part of the value its schema reads, as the card spelled it, or undefined when none is. */
function keptRaw(schema: z.core.$ZodType, { value, field, notes, heal }: FieldRead): unknown {
  if (value === undefined || value === null || readsAs(schema, value)) {
    return value ?? undefined;
  }
  if (heal === "items" && Array.isArray(value)) {
    const kept = value.filter((item) => readsAs(schema, [item]));
    notes?.push({ field, reason: lostItems(value.length - kept.length, value.length) });
    return kept;
  }
  if (heal === "entries" && isPlainObject(value)) {
    const entries = Object.entries(value);
    const kept = entries.filter(([key, item]) => readsAs(schema, { [key]: item }));
    notes?.push({ field, reason: lostItems(entries.length - kept.length, entries.length) });
    return Object.fromEntries(kept);
  }
  notes?.push({ field, reason: MALFORMED_FIELD });
  return undefined;
}

function readValue<T>(schema: z.ZodType<T>, read: FieldRead): T | undefined {
  const kept = keptRaw(schema, read);
  return kept === undefined ? undefined : schema.parse(kept);
}

/** Every field of a partial field object, each read through its own schema. The object parse then reads only what
 *  each field schema already read, so it cannot refuse. */
function readFields<Shape extends z.core.$ZodShape>(fields: z.ZodObject<Shape>, read: (key: string) => FieldRead): z.output<z.ZodObject<Shape>> {
  const kept: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(fields.shape)) {
    kept[key] = keptRaw(schema, read(key));
  }
  return fields.parse(kept);
}

// ── The card's data block in the card schema's shape ─────────────────────────────────────────────────────

const CARD_DATA = characterCardDataFields.shape;
type CardDataKey = keyof typeof CARD_DATA;

// The book is read apart ({@link CardBookRead}): its entries keep their whole source spelling as metadata.
const cardDataRead = characterCardDataFields.omit({ character_book: true }).partial();

/** The card's `data` block in the card schema's shape: only the schema's own keys, each read through its own
 *  schema, whatever spec the card was written in. The embedded book is {@link CardBookRead}. */
export type CardData = z.output<typeof cardDataRead>;

const CARD_DATA_HEAL: Readonly<Partial<Record<string, FieldHeal>>> = {
  ["alternate_greetings"]: "items",
  ["group_only_greetings"]: "items",
  tags: "items",
  source: "items",
  assets: "items",
  [ATTACHED_BOOKS_WIRE_KEY]: "items",
  [ATTACHED_REGEX_SCRIPTS_WIRE_KEY]: "items",
  ["creator_notes_multilingual"]: "entries",
} satisfies Partial<Record<CardDataKey, FieldHeal>>;

/** The schema fields with no typed column: they ride {@link residualData} verbatim, so a read of them loses nothing. */
const RESIDUE_FIELDS = ["assets", "creator_notes_multilingual"] as const satisfies readonly CardDataKey[];

function isResidueField(key: string): boolean {
  return RESIDUE_FIELDS.some((field) => field === key);
}

/** The references an export of this app carries beside the card: a foreign or malformed one is no card content, and
 *  the restore goes on without it (a handle falls back to the name slug, a reference attaches nothing). */
const CARRIED_FIELDS = [
  ATTACHED_BOOKS_WIRE_KEY,
  ATTACHED_REGEX_SCRIPTS_WIRE_KEY,
  CHARACTER_HANDLE_WIRE_KEY,
  CHARACTER_BACKGROUND_WIRE_KEY,
] as const satisfies readonly CardDataKey[];

// The notes a field's drop is named in, or null when the drop loses nothing the owner wrote.
function notesFor(key: string, notes: StScriptNote[]): StScriptNote[] | null {
  return isResidueField(key) || CARRIED_FIELDS.some((field) => field === key) ? null : notes;
}

/** Where one card field sits in the file: its value and its path, the path a note names it by. */
interface CardField {
  readonly value: unknown;
  readonly field: string;
}

// A card written before the `data` block (V1, Pygmalion-Gradio) spells some fields under other root keys. Each card
// field reads the first of its root keys holding a value; a field without a row is not read from such a card.
// Keyed by schema field (each table `satisfies` that); a read looks a field up by the key the field object iterates.
type LegacyFieldKeys = Readonly<Partial<Record<string, readonly string[]>>>;
type LegacyFieldTable = Partial<Record<CardDataKey, readonly string[]>>;

// Not card content: the planes an import carries beside it, read where the card's root holds them.
const LEGACY_CARRIED_KEYS: LegacyFieldKeys = {
  tags: ["tags"],
  ["character_book"]: ["character_book"],
  [ATTACHED_BOOKS_WIRE_KEY]: [ATTACHED_BOOKS_WIRE_KEY],
  [ATTACHED_REGEX_SCRIPTS_WIRE_KEY]: [ATTACHED_REGEX_SCRIPTS_WIRE_KEY],
  [CHARACTER_HANDLE_WIRE_KEY]: [CHARACTER_HANDLE_WIRE_KEY],
  [CHARACTER_BACKGROUND_WIRE_KEY]: [CHARACTER_BACKGROUND_WIRE_KEY],
} satisfies LegacyFieldTable;

const V1_FIELD_KEYS: LegacyFieldKeys = {
  name: ["name"],
  description: ["description"],
  personality: ["personality"],
  scenario: ["scenario"],
  ["first_mes"]: ["first_mes"],
  ["mes_example"]: ["mes_example"],
  creator: ["creator"],
  ["creator_notes"]: ["creatorcomment", "creator_notes"],
  ...LEGACY_CARRIED_KEYS,
} satisfies LegacyFieldTable;

const PYGMALION_FIELD_KEYS: LegacyFieldKeys = {
  name: ["char_name"],
  description: ["char_persona"],
  ["first_mes"]: ["char_greeting"],
  ["mes_example"]: ["example_dialogue"],
  scenario: ["world_scenario"],
  creator: ["creator"],
  ["creator_notes"]: ["creator_notes", "creatorcomment"],
  ...LEGACY_CARRIED_KEYS,
} satisfies LegacyFieldTable;

/** Where a card's fields sit. `data` is the container a V2 or V3 card holds them in (its `data` block, else its root),
 *  and null for a card the legacy tables read. */
interface CardLayout {
  readonly at: (key: string) => CardField;
  readonly root: Readonly<Record<string, unknown>>;
  readonly data: Readonly<Record<string, unknown>> | null;
}

function legacyLayout(root: Readonly<Record<string, unknown>>, table: LegacyFieldKeys): CardLayout {
  return {
    root,
    data: null,
    at: (key): CardField => {
      const keys = table[key] ?? [];
      const hit = keys.find((candidate) => root[candidate] !== undefined && root[candidate] !== null) ?? keys[0];
      return hit === undefined ? { value: undefined, field: key } : { value: root[hit], field: hit };
    },
  };
}

/** Detection ORDER (spec/data → char_name Pygmalion → name V1) matches the canonical reader; without it a share of a
 *  real corpus fails to import silently. */
function cardLayout(raw: JsonValue): CardLayout {
  const root = isPlainObject(raw) ? raw : {};
  if (!("spec" in root || "data" in root)) {
    if ("char_name" in root) {
      return legacyLayout(root, PYGMALION_FIELD_KEYS);
    }
    if ("name" in root) {
      return legacyLayout(root, V1_FIELD_KEYS);
    }
  }
  const data = cardDataContainer(raw, root);
  const prefix = data === root ? "" : "data.";
  return { root, data, at: (key) => ({ value: data[key], field: `${prefix}${key}` }) };
}

// The `data` block when it is an object, else the root. An array `data` block (or an array card) holds no field.
function cardDataContainer(raw: JsonValue, root: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const nested = root["data"];
  if (isPlainObject(nested)) {
    return nested;
  }
  return Array.isArray(nested) || Array.isArray(raw) ? {} : root;
}

function readCardData(layout: CardLayout, notes: StScriptNote[]): CardData {
  return readFields(cardDataRead, (key) => ({ ...layout.at(key), notes: notesFor(key, notes), heal: CARD_DATA_HEAL[key] }));
}

// ST default for the Character's Note depth when absent / non-numeric.
const ST_DEFAULT_DEPTH = 4;

// ST `data.extensions.depth_prompt = { prompt, depth, role }`. Role defaults to `system` (via the ST
// bimap) to match neo card behaviour.
function parseDepthPrompt(raw: unknown): CharacterCard["depthPrompt"] {
  if (!isPlainObject(raw)) {
    return null;
  }
  const prompt = typeof raw["prompt"] === "string" ? raw["prompt"].trim() : "";
  if (prompt.length === 0) {
    return null;
  }
  const depthNum = Number(raw["depth"]);
  const depth = Number.isFinite(depthNum) && depthNum >= 0 ? Math.floor(depthNum) : ST_DEFAULT_DEPTH;
  return { prompt, depth, role: messageRoleFromSt(raw["role"]) ?? "system" };
}

// A value the card holds (not absent, not JSON null) in a shape its reader cannot read is named and left out.
function noteUnreadable(value: unknown, readable: boolean, field: string, notes: StScriptNote[]): void {
  if (value !== undefined && value !== null && !readable) {
    notes.push({ field, reason: MALFORMED_FIELD });
  }
}

const ST_SCRIPTS_KEY = "regex_scripts";

/** The card's ST regex scripts (the LIFT payload — D121-E: there is no `regexScripts` column any more; the
 *  importer hands these to the regex domain), and a note for each script refused or each placement lost, by its
 *  position. The list is V3 `data.extensions.regex_scripts`, else the V2 root `data.regex_scripts`, which no
 *  schema field holds. */
function parseRegexScripts(extensions: CardData["extensions"], layout: CardLayout, notes: StScriptNote[]): RegexScriptCard[] {
  const nested = extensions?.[ST_SCRIPTS_KEY];
  const nestedField = `${layout.at("extensions").field}.${ST_SCRIPTS_KEY}`;
  noteUnreadable(nested, Array.isArray(nested), nestedField, notes);
  if (Array.isArray(nested)) {
    const read = readStScriptList(nested, nestedField, "scoped");
    notes.push(...stScriptListNotes(read));
    return read.scripts;
  }
  const atRoot = layout.data?.[ST_SCRIPTS_KEY];
  const rootField = layout.at(ST_SCRIPTS_KEY).field;
  noteUnreadable(atRoot, Array.isArray(atRoot), rootField, notes);
  const read = readStScriptList(Array.isArray(atRoot) ? atRoot : [], rootField, "scoped");
  notes.push(...stScriptListNotes(read));
  return read.scripts;
}

// The extension keys a card's typed columns own: the Character's Note, the favourite flag and the scripts. Each one the
// card holds in a shape its reader cannot read is named and left out.
function extensionPlanes(
  extensions: CardData["extensions"],
  layout: CardLayout,
  notes: StScriptNote[],
): Pick<CharacterCard, "depthPrompt" | "starred" | "regexScripts"> {
  const at = layout.at("extensions").field;
  const depthPrompt = extensions?.["depth_prompt"];
  noteUnreadable(depthPrompt, isPlainObject(depthPrompt) && ["string", "undefined"].includes(typeof depthPrompt["prompt"]), `${at}.depth_prompt`, notes);
  const fav = extensions?.["fav"];
  noteUnreadable(fav, typeof fav === "boolean", `${at}.fav`, notes);
  // ST's favorite flag → `characters.starred` (strict `true` only — ST writes booleans).
  return { depthPrompt: parseDepthPrompt(depthPrompt), starred: fav === true, regexScripts: parseRegexScripts(extensions, layout, notes) };
}

/** `data.extensions` MINUS the fields promoted to typed columns (`depth_prompt`, `regex_scripts`, `fav`) —
 *  only genuinely-unknown vendor extras. Null when nothing is left (the §7.3 lossiness fix: no `raw` blob). */
function residualExtensions(data: CardDataJson | null): JsonObject | null {
  const ext = data === null || Array.isArray(data) ? null : jsonObjectOf(data["extensions"]);
  if (ext === null) {
    return null;
  }
  const { depth_prompt: _dp, regex_scripts: _rs, fav: _fav, ...rest } = ext;
  return Object.keys(rest).length > 0 ? rest : null;
}

// The top-level `data.*` keys with a typed home, which the residue leaves out so they never double-emit on a
// round-trip: every card schema field but the column-less ones, which ride the residue verbatim, plus the V2 root
// `regex_scripts`. The carried planes are among them: the handle and background are not card content, and a residual
// copy of the handle would enter the import hash, so a renamed character would stop deduping against itself.
const PROMOTED_DATA_KEYS: ReadonlySet<string> = new Set([...characterCardDataFields.keyof().options.filter((key) => !isResidueField(key)), "regex_scripts"]);

/** TOP-LEVEL `data.*` keys MINUS the ones with a typed column (the top-level sibling of
 *  {@link residualExtensions}, which only covers `data.extensions.*`): genuinely-unknown vendor residue PLUS the
 *  column-less V3 fields kept verbatim ({@link RESIDUE_FIELDS}). Null when nothing is left. */
function residualData(data: CardDataJson | null): JsonObject | null {
  const rest: JsonObject = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (!PROMOTED_DATA_KEYS.has(key)) {
      rest[key] = value;
    }
  }
  return Object.keys(rest).length > 0 ? rest : null;
}

/** The card's `data` block as the JSON it was decoded from, for the residue: the same container the typed reads
 *  use (`data` when it is an object or array, else the root, an array root included). A V1 or Pygmalion card is
 *  read through its legacy table into promoted fields only, so it carries no residue and this is null for it. */
type CardDataJson = JsonObject | JsonValue[];
function cardDataJson(raw: JsonValue, layout: CardLayout): CardDataJson | null {
  if (layout.data === null) {
    return null;
  }
  if (Array.isArray(raw)) {
    return raw;
  }
  const root = jsonObjectOf(raw);
  if (root === null) {
    return null;
  }
  const nested = root["data"];
  if (Array.isArray(nested)) {
    return nested;
  }
  return jsonObjectOf(nested) ?? root;
}

// ST stamps this placeholder in `creator_notes`; strip it so it doesn't ride into the canonical card.
const ST_CREATOR_NOTES_PLACEHOLDER = "Creator's notes go here.";

// The language whose note is preferred when `creator_notes` is empty and the V3 map has to supply one. The
// app is single-language, so this is a DISPLAY fallback, not a locale policy — a real per-user language
// preference (V3 says the app should pick the reader's language) is an owner call and would live in settings.
const DEFAULT_NOTES_LANGUAGE = "en";

/** V3 `data.creator_notes_multilingual` → the ONE note to display when `creator_notes` carries none (a
 *  map-only card would otherwise import with its notes destroyed). `en` first, else the first non-empty value
 *  in key order. The map itself is NOT consumed — it rides `residualData` verbatim and re-emits on export, so the
 *  fold is additive, never lossy. */
function foldMultilingualNotes(notes: CardData["creator_notes_multilingual"]): string {
  const preferred = notes?.[DEFAULT_NOTES_LANGUAGE] ?? "";
  if (preferred.trim().length > 0) {
    return preferred;
  }
  return Object.values(notes ?? {}).find((note) => note.trim().length > 0) ?? "";
}

/** The wire spec a card was READ from — keyed on the top-level `spec` marker (ST's discriminator). V2/V3 are
 *  preserved so export round-trips them; V1 / Pygmalion / app-authored cards (no `spec`) return null and export
 *  defaults to V3. An unknown spec is no note: no card content is lost, and the export writes V3. */
function detectSpec(layout: CardLayout): CardSpec | null {
  const spec = characterCardV3Fields.shape.spec.safeParse(layout.root["spec"]);
  return spec.success ? spec.data : null;
}

/** A V2 or V3 card that keeps a field at its root as well as in its `data` block: the root's copy is read when the
 *  block's is empty. Null for a card whose fields sit at the root. */
function rootFallback<T>(layout: CardLayout, schema: z.ZodType<T>, key: CardDataKey, notes: StScriptNote[]): T | undefined {
  if (layout.data === null || layout.data === layout.root) {
    return undefined;
  }
  return readValue(schema, { value: layout.root[key], field: key, notes, heal: CARD_DATA_HEAL[key] });
}

// greetings[0] is THE first message; the rest are alternates (`groupOnly` absent), then the group-only greetings
// (`groupOnly:true`, the folded ST `group_only_greetings`). Keep the [0] slot whenever there is any greeting content
// (even an empty first_mes alongside real alternates/group-only greetings), else an empty list.
function cardGreetings(data: CardData): CharacterCard["greetings"] {
  const first = data["first_mes"] ?? "";
  const alternates = data["alternate_greetings"] ?? [];
  const groupOnly = data["group_only_greetings"] ?? [];
  const hasGreetingContent = first.trim().length > 0 || alternates.length > 0 || groupOnly.length > 0;
  const greetings: CharacterCard["greetings"] = hasGreetingContent ? [{ text: first }, ...alternates.map((text) => ({ text }))] : [];
  for (const text of groupOnly) {
    greetings.push({ text, groupOnly: true });
  }
  return greetings;
}

/** One embedded book entry as the import reads it: the entry columns through the entry schema, and the whole source
 *  entry kept as its metadata ({@link loreEntryMetadata}). */
export interface CardBookEntryRead {
  readonly columns: LoreEntryColumns;
  readonly metadata: Record<string, unknown>;
}

/** The card's embedded `character_book` read through the book schema. Null when the card carries no entry. */
export interface CardBookRead {
  readonly name: string | undefined;
  readonly description: string | undefined;
  readonly entries: readonly CardBookEntryRead[];
}

/** What one card file holds, read through the card schema. The notes name each field the read left out, each script
 *  it refused and each placement it lost. They are never part of the card, so a card's import identity
 *  ({@link cardImportHash}) is the same with or without them. */
export interface CardRead {
  readonly card: CharacterCard;
  readonly data: CardData;
  readonly book: CardBookRead | null;
  readonly notes: readonly StScriptNote[];
}

// The card's free-text fields: an empty one is no value.
function cardText(
  data: CardData,
): Pick<
  CharacterCard,
  | "description"
  | "personality"
  | "scenario"
  | "exampleMessages"
  | "systemPrompt"
  | "postHistoryInstructions"
  | "creatorNotes"
  | "creator"
  | "cardVersion"
  | "nickname"
> {
  return {
    description: nullIfEmpty(data.description ?? ""),
    personality: nullIfEmpty(data.personality ?? ""),
    scenario: nullIfEmpty(data.scenario ?? ""),
    exampleMessages: nullIfEmpty(data["mes_example"] ?? ""),
    systemPrompt: nullIfEmpty(data["system_prompt"] ?? ""),
    postHistoryInstructions: nullIfEmpty(data["post_history_instructions"] ?? ""),
    // The placeholder-stripped `creator_notes` is the one home; the V3 multilingual map only fills an EMPTY
    // one. The map survives regardless — it rides `residualData`.
    creatorNotes: firstNonEmpty(
      (data["creator_notes"] ?? "").replace(ST_CREATOR_NOTES_PLACEHOLDER, "").trim(),
      foldMultilingualNotes(data["creator_notes_multilingual"]),
    ),
    creator: nullIfEmpty(data.creator ?? ""),
    cardVersion: nullIfEmpty(data["character_version"] ?? ""),
    nickname: nullIfEmpty(data.nickname ?? ""),
  };
}

/**
 * Normalize an already-JSON-parsed card object (any spec: V1/Pygmalion/V2/V3) into the canonical
 * `CharacterCard`: the tolerant in half of the serde. `avatarAssetId`/`refinery` are not on the card wire, so both
 * are null; tags, the embedded lorebook and the carried planes are external junctions, read into `data` and `book`
 * for the import to attach.
 */
export function readCardJson(raw: JsonValue, fallbackName: string): CardRead {
  const layout = cardLayout(raw);
  const notes: StScriptNote[] = [];
  const read = readCardData(layout, notes);
  const tags = (read.tags ?? []).length > 0 ? read.tags : rootFallback(layout, CARD_DATA.tags, "tags", notes);
  const data: CardData = { ...read, ...(tags === undefined ? {} : { tags }) };
  const book = readCardBook(layout, notes);
  const residue = cardDataJson(raw, layout);
  const spec = detectSpec(layout);

  const card: CharacterCard = {
    name: firstNonEmpty(data.name ?? "") ?? firstNonEmpty(rootFallback(layout, CARD_DATA.name, "name", notes) ?? "") ?? fallbackName,
    ...cardText(data),
    greetings: cardGreetings(data),
    // `source` is a NULLABLE list (absent ⇒ null, distinct from `[]`), so a V2 card omits it cleanly on re-export.
    source: data.source ?? null,
    creationDate: data["creation_date"] ?? null,
    modificationDate: data["modification_date"] ?? null,
    ...extensionPlanes(data.extensions, layout, notes),
    extensions: residualExtensions(residue),
    residualData: residualData(residue),
    avatarAssetId: null,
    refinery: null,
    // V2/V3 preserved so export round-trips the source spec; omitted (not `undefined`) for a specless card so
    // it satisfies `exactOptionalPropertyTypes` and export defaults to V3.
    ...(spec !== null ? { spec } : {}),
  };
  return { card, data, book, notes };
}

// cardContentHash — the one home; character imports it from here, no private copy.
// stableStringify — the deterministic key-sorted serialize this hash relies on — moved to
// `@orb/kit/stable-stringify` (shared with the forms layer's draft-baseline hash).

/** The semantic content subset that IDENTIFIES a card. EXCLUDED (deliberate — re-attributing/re-deriving a
 *  card must NOT change its identity): creator, creatorNotes, cardVersion, extensions, refinery,
 *  avatarAssetId, and (D121-E) regexScripts (scripts are attached LIBRARY ROWS, not card content, so a
 *  stored projection has none while a freshly-parsed card does — hashing them would make one card hash
 *  differently before and after import and break the re-import content dedup). INCLUDED: the content a
 *  reader experiences.
 *
 *  IT IS A TUPLE, not an object literal, because the EXCLUSIONS are load-bearing to other code: a
 *  caller fencing a write on "the card I read" needs to know which fields this hash cannot witness, and
 *  deriving that from a list beats every reader re-transcribing the exclusion set (the refinery's
 *  stale-basis fence does exactly this, under a compile-forced type). Key ORDER is not semantic — the hash
 *  stable-stringifies. */
export const CARD_IDENTITY_FIELDS = [
  "name",
  "description",
  "personality",
  "scenario",
  "greetings",
  "exampleMessages",
  "systemPrompt",
  "postHistoryInstructions",
  "depthPrompt",
] as const;
export type CardIdentityField = (typeof CARD_IDENTITY_FIELDS)[number];

function semanticFields(card: CharacterCard): Record<string, unknown> {
  return Object.fromEntries(CARD_IDENTITY_FIELDS.map((field) => [field, card[field]]));
}

/** sha-256 hex of the stable-stringified semantic fields — the card's `content_hash` (the stale-basis key). */
export function cardContentHash(card: CharacterCard): string {
  return createHash("sha256")
    .update(stableStringify(semanticFields(card)))
    .digest("hex");
}

/** What a card IS for import identity: the whole parsed card (its scripts ride inside it), its embedded
 *  book and its ART — never the file bytes, so a re-saved PNG or a re-ordered JSON of one card is one
 *  character, and one text under a different picture is another. Tags are an overlay plane the library
 *  attaches by name, not card content, so a card exported without them re-imports as itself. */
export interface CardImportIdentity {
  readonly card: CharacterCard;
  readonly book: BulkImportLorebookInput | null;
  /** sha-256 hex of the card's art (the PNG minus its card chunks), null for a card that carries none. */
  readonly artHash: string | null;
}

/** sha-256 hex over the normalized parsed content — the import dedup key stored as `characters.importHash`.
 *  Two files that parse to the same card hash the same; two cards that differ anywhere (a note, a script, a
 *  book entry, the art) do not, even when they share a name; a tag set is not identity. Three things that are NOT identity: a script's
 *  `id` (ST's client-minted id on the way in, the library row id on the way out), the wire `spec` (a V2
 *  card re-saved as V3 is the same character, and the row keeps no spec) and the star (`extensions.fav`, the
 *  owner's mark on the library, which an export writes from the live row), so an export re-imports as itself. */
export function cardImportHash(identity: CardImportIdentity): string {
  const { regexScripts, spec: _spec, ...parsed } = identity.card;
  // Pinned rather than dropped: every identity already stored was hashed with the key present, and an
  // unstarred card must keep the hash it was stored under.
  const card = { ...parsed, starred: false };
  const scripts = (regexScripts ?? []).map(({ id: _id, ...behavior }) => behavior);
  // The book by its entry identities (order-independent, residue-free), so an export's book is its import's.
  const book =
    identity.book === null
      ? null
      : {
          name: identity.book.name,
          description: identity.book.description,
          entries: identity.book.entries.map((entry) => stableStringify(loreEntryIdentity(entry))).sort(),
        };
  return createHash("sha256")
    .update(stableStringify({ card, scripts, book, art: identity.artHash }))
    .digest("hex");
}

// The OUT half — buildCardV3 + exportBookEntry.

/** The live-card columns the card emitter projects to the V3 wire (the OUT-emitter input). `greetings[0]`
 *  is the first message; the rest are alternate greetings, and `groupOnly` entries re-split to
 *  `data.group_only_greetings` on export. `tags` are the ACCEPTED `character_tags` names
 *  (pending tags are NOT serialized). The typed promotions (`creator` / `cardVersion` /
 *  `regexScripts` / `extensions` / `depthPrompt`) are read straight off the flat row — no `raw` blob.
 *  `residualData` is the preserved top-level `data.*` blob — re-emitted at the `data` root, backed by
 *  the `characters.residual_data` column. Optional so an export call site with nothing to preserve (a
 *  synthesized/app-authored card) can omit it. */
export interface ExportCardFields {
  /** The per-owner handle, emitted under `data.orbweaver_handle` so a restore keeps the name its chats use. */
  readonly handle: CharacterHandle;
  readonly name: string;
  /** The embedded book's own name (`character_book.name`), so a re-import names it as it is here, not by
   *  the import's fallback. Absent or null emits the entries without a name. */
  readonly bookName?: string | null;
  /** The embedded book's own description (`character_book.description`), part of the card's import identity.
   *  Absent or null emits none. */
  readonly bookDescription?: string | null;
  readonly description: string | null;
  readonly personality: string | null;
  readonly scenario: string | null;
  readonly greetings: Greeting[];
  readonly exampleMessages: string | null;
  readonly systemPrompt: string | null;
  readonly postHistoryInstructions: string | null;
  readonly creatorNotes: string | null;
  readonly creator: string | null;
  readonly cardVersion: string | null;
  /** V3 content promotions — emitted to `data.*` only when non-null (a V2 / app-authored card omits them
   *  cleanly, the round-trip property). */
  readonly nickname: string | null;
  readonly source: string[] | null;
  readonly creationDate: number | null;
  readonly modificationDate: number | null;
  /** The LIVE `characters.starred` — emitted as ST's `extensions.fav`, so a star toggled in orb exports
   *  truthfully instead of replaying the imported byte (the residue drops the key on import). */
  readonly starred: boolean;
  readonly tags: string[];
  readonly extensions: Record<string, unknown> | null;
  readonly residualData?: Record<string, unknown> | null;
  readonly regexScripts: readonly RegexScriptCard[];
  /** D121-E: attached regex-script REFERENCES — the OUT-emitter rides them under
   *  `data.orbweaver_attached_regex_scripts`. Optional/absent-empty (the `attachedBooks` shape). */
  readonly attachedRegexScripts?: readonly AttachedRegexScriptRef[];
  readonly depthPrompt: CardDepthPrompt | null;
  /** Attached world-info book REFERENCES — the OUT-emitter rides them under
   *  `data.orbweaver_attached_books`. Optional/absent-empty: a card with no attached books emits no key. */
  readonly attachedBooks?: readonly AttachedBookRef[];
  /** The card's carried background (`characters.background_override`), emitted under
   *  `data.orbweaver_background` only when it names an asset. */
  readonly backgroundOverride?: ThemeBackground | null;
  /** The wire spec to EMIT (`chara_card_v2`/`chara_card_v3`). Omitted ⇒ V3 (the canonical default). Set from
   *  the imported card's `CharacterCard.spec` to round-trip V2→V2 / V3→V3. */
  readonly spec?: CardSpec;
}

/** One attached lore entry projected for the OUT mapper. Carries the full round-trip payload — typed
 *  columns PLUS the preserved `metadata` blob — so import → export → reimport doesn't strip
 *  `constant` / `position` / vendor extensions. */
export type ExportWorldEntry = Readonly<Omit<BulkImportLoreEntryInput, "description" | "keys" | "metadata">> & {
  readonly keys: string[];
  // A stored row's metadata as a read carries it: parsed, not narrowed for the column.
  readonly metadata: Readonly<Record<string, unknown>> | null;
};

// ST's at-depth directive lives under `extensions.position = 4` with a sibling `depth`/`role` (the
// world-info-at-depth encoding).
const ST_POSITION_AT_DEPTH = ST_WORLD_INFO_POSITION.atDepth;
// The card book's V2 position string, as SillyTavern's own card writer spells it from the numeric slot
// (`convertWorldInfoToCharacterBook`, src/endpoints/characters.js in SillyTavern): only before-character is `before_char`.
const ST_CARD_POSITION_BEFORE = "before_char";
const ST_CARD_POSITION_AFTER = "after_char";

function storedBucket(meta: Readonly<Record<string, unknown>>): EntryPosition | null {
  return ENTRY_POSITIONS.find((position) => position === meta["position"]) ?? null;
}

/** The numeric SillyTavern slot one stored entry fills: at-depth for an inject directive; the slot the import
 *  kept while the entry still sits in the bucket it was placed in; else the slot of its seat. */
function stWorldPosition(meta: Readonly<Record<string, unknown>>, injects: boolean): number {
  if (injects) {
    return ST_POSITION_AT_DEPTH;
  }
  const kept = resolveEntryStSlot(meta);
  const stored = storedBucket(meta);
  return kept !== null && kept.placed === stored
    ? ST_WORLD_INFO_POSITION[kept.slot]
    : ST_WORLD_INFO_POSITION[ST_SLOT_OF_ENTRY_POSITION[resolveEntryPosition(meta)]];
}

// The `spec_version` emitted per spec marker. V3 is "3.0"; a V2-sourced card round-trips as "2.0".
const SPEC_VERSION_BY_SPEC = { [CHARA_CARD_V2_SPEC]: "2.0", [CHARA_CARD_V3_SPEC]: "3.0" } as const;

/**
 * Map one live world-info entry → an ST V3 `character_book` entry (the OUT half). Preserves the entry's
 * metadata blob as the base (so unknown ST fields ride through a round-trip), then overrides the keys the
 * typed columns own. A depth-injecting entry is re-encoded into ST's `{position:4, depth, role}` (role
 * through the bimap); `constant` derives from the resolved scope (`always` ⇒ `true`, the keyless-always-on
 * heuristic vanilla ST needs to fire a keyless entry). This is the ONE place the at-depth encoding is
 * written (load-bearing — preserve it).
 */
/** The typed columns of one lore entry, as every identity reads them. */
export type LoreEntryIdentityInput = Readonly<Omit<BulkImportLoreEntryInput, "keys" | "metadata">> & {
  readonly keys: BulkImportLoreEntryInput["keys"] | null;
  readonly metadata: unknown;
};

/** The metadata keys that are identity on their own: the engine's, never the lossless residue of the source. */
const ENTRY_IDENTITY_METADATA_KEYS = ["scopeMode", "keyMode", "position", "inject"] as const;

/** One lore entry reduced to what decides identity: the typed columns, the engine's own metadata keys, and
 *  the SillyTavern activation fields the entry keeps inert (`inertActivationFields`, which answers only a
 *  field set to a non-default value, so a missing field equals its ST default and an export that writes the
 *  default does not change the hash). The rest of the stored metadata is the lossless residue of the raw
 *  entry, and an export writes the normalized spellings of fields the source never carried (`enabled`,
 *  `constant`, `use_regex`, `extensions`), so a residue-keyed identity would make every export a different
 *  book; `keys` collapses empty→null the way the writer's column does. The embedded-book half of
 *  `cardImportHash` and the world-info dedup both read this. */
export function loreEntryIdentity(entry: LoreEntryIdentityInput): Record<string, unknown> {
  const raw = isPlainObject(entry.metadata) ? entry.metadata : {};
  const metadata: Record<string, unknown> = {};
  for (const key of ENTRY_IDENTITY_METADATA_KEYS) {
    if (raw[key] !== undefined) {
      metadata[key] = raw[key];
    }
  }
  // A kept ST activation value is the owner's data (it is shown as kept, not active): an edit to it in
  // SillyTavern is a different book.
  for (const { field, value } of inertActivationFields(raw)) {
    metadata[field] = value;
  }
  return {
    title: entry.title,
    description: entry.description,
    content: entry.content,
    keys: entry.keys !== null && entry.keys.length > 0 ? [...entry.keys] : null,
    enabled: entry.enabled,
    priority: entry.priority,
    ignoreBudget: entry.ignoreBudget,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
  };
}

// A stored entry's metadata is its whole source entry, so a field the entry schema types can sit there as the source
// spelled it. The export writes such a field only when its own schema reads it (the import named the drop), so a
// malformed source value never refuses the export.
function carriedEntryFields(meta: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const fields = Object.entries(characterBookEntryFields.shape);
  return Object.fromEntries(
    Object.entries(meta).filter(([key, value]) => {
      const schema = fields.find(([field]) => field === key)?.[1];
      return schema === undefined || readsAs(schema, value);
    }),
  );
}

/** One lore entry on the `character_book` entry wire, the shape a standalone SillyTavern world file adapts. */
export function exportBookEntry(entry: ExportWorldEntry): Record<string, unknown> {
  const meta: Readonly<Record<string, unknown>> = entry.metadata ?? {};
  const scope = resolveEntryScope(meta, entry.keys.length > 0);
  const inject = resolveEntryInjection(meta);
  const { [ST_SLOT_METADATA_KEY]: _kept, ...carried } = carriedEntryFields(meta);
  const baseExtensions = isPlainObject(meta["extensions"]) ? meta["extensions"] : {};
  const position = stWorldPosition(meta, inject !== null);
  const stored = storedBucket(meta);
  // SillyTavern reads the slot from `extensions` first (`convertCharacterBook`, public/scripts/world-info.js), and an
  // outlet entry fires only with its outlet name.
  const outletName = position === ST_WORLD_INFO_POSITION.outlet && typeof meta["outletName"] === "string" ? { ["outlet_name"]: meta["outletName"] } : {};
  const extensions = {
    ...baseExtensions,
    position,
    ...outletName,
    ...(inject === null ? {} : { depth: inject.depth, role: messageRoleToSt(inject.role) }),
  };
  return {
    ...carried,
    // Written only for a stored bucket, so an entry that names none re-imports naming none and keeps its identity.
    ...(stored === null ? {} : { position: stored === "before" ? ST_CARD_POSITION_BEFORE : ST_CARD_POSITION_AFTER }),
    keys: entry.keys,
    content: entry.content,
    enabled: entry.enabled,
    insertion_order: entry.priority,
    comment: entry.title,
    constant: scope === "always",
    // The V3 key-compile flag, re-derived from the RESOLVED mode (the `constant` precedent) so an entry whose
    // keys are patterns says so on the wire even if the stored blob only carries orb's `keyMode`.
    use_regex: resolveEntryKeyMode(meta) === "regex",
    ...(entry.ignoreBudget ? { ignoreBudget: true } : {}),
    extensions,
  };
}

// The lorebook IN half — the byte-identical inverse of exportBookEntry, co-located here. Pure — no DB, no
// domain types.

/** The `world_entries` column projection derived from ONE ST `character_book` entry (everything but the
 *  `metadata` blob, which {@link loreEntryMetadata} builds). `keys` keeps its string items (ST keys are
 *  free-form JSON); the writer null-collapses an empty list to honor the `world_entries.keys` NULL-vs-`[]`
 *  asymmetry. `title`/`description`/`content`/`enabled`/`priority`/`ignoreBudget` mirror the typed columns. */
export type LoreEntryColumns = Readonly<Omit<BulkImportLoreEntryInput, "metadata" | "keys">> & { readonly keys: string[] };

const BOOK = characterBookFields.shape;
const bookEntryRead = characterBookEntryFields.partial();

/** `character_book.entries` is a dict OR a list in the wild (ST V2 used a keyed object, V3 a list): every slot, in
 *  order, by the path a note names it by. */
function lorebookSlots(book: Readonly<Record<string, unknown>>, field: string): { readonly at: string; readonly entry: unknown }[] {
  const entries = book["entries"];
  if (Array.isArray(entries)) {
    return entries.map((entry, i) => ({ at: `${field}.entries[${String(i)}]`, entry }));
  }
  return isPlainObject(entries) ? Object.entries(entries).map(([key, entry]) => ({ at: `${field}.entries.${key}`, entry })) : [];
}

/** `character_book.entries` as every entry OBJECT, order-preserving, dropping non-object junk. */
export function extractLorebook(book: unknown): Record<string, unknown>[] {
  if (!isPlainObject(book)) {
    return [];
  }
  return lorebookSlots(book, "").flatMap(({ entry }) => (isPlainObject(entry) ? [entry] : []));
}

/** Pick the best `character_book` when a card carries MULTIPLE candidates (V3 cards in the wild sometimes
 *  embed a book at BOTH `data.character_book` AND the root `character_book`, one a real book + one an empty
 *  stub). Most-NAMED-entries wins (a non-empty `name`), then most entries, then the first non-empty. Returns
 *  `undefined` when no candidate holds any entries. */
export function selectBestCharacterBook(...candidates: unknown[]): unknown {
  let best: { book: unknown; named: number; total: number } | undefined;
  for (const candidate of candidates) {
    const entries = extractLorebook(candidate);
    if (entries.length === 0) {
      continue;
    }
    const named = entries.filter(
      (entry) => (readValue(characterBookEntryFields.shape.name, { value: entry["name"], field: "", notes: null }) ?? "").trim().length > 0,
    ).length;
    if (best === undefined || named > best.named || (named === best.named && entries.length > best.total)) {
      best = { book: candidate, named, total: entries.length };
    }
  }
  return best?.book;
}

/** The title of a lore entry that carries no comment, name or key. */
export const UNTITLED_LORE_ENTRY_TITLE = "Untitled";

/** Project one ST `character_book` entry → the `world_entries` typed columns, each read through the entry schema; a
 *  field that fails it drops to its default and is named in `notes` under `at`. ST uses `comment` (falling back to
 *  `name`, then the first key) as the author-facing memo → our `title`; when `comment` differs from the resolved
 *  title it is ALSO kept as `description` (lossless). `insertion_order` → `priority`. */
function readLoreEntry(entry: Readonly<Record<string, unknown>>, at: string, notes: StScriptNote[] | null): LoreEntryColumns {
  const read = readFields(bookEntryRead, (key) => ({ value: entry[key], field: `${at}.${key}`, notes, heal: key === "keys" ? "items" : undefined }));
  const keys = read.keys ?? [];
  const comment = read.comment ?? "";
  const title = firstNonEmpty(comment, read.name ?? "", keys[0] ?? "") ?? UNTITLED_LORE_ENTRY_TITLE;
  return {
    title,
    // `comment` doubles as the memo only when it is NOT already the title (else a null description).
    description: comment.length > 0 && comment !== title ? comment : null,
    content: read.content ?? "",
    keys,
    enabled: read.enabled ?? true,
    priority: read["insertion_order"] ?? 0,
    // App-specific field round-tripped through export (vanilla ST cards never carry it → false).
    ignoreBudget: read.ignoreBudget === true,
  };
}

/** {@link readLoreEntry} for a door with no note channel: a standalone world file's entry. The source entry is kept
 *  whole as its metadata, so a dropped field still rides there. */
export function loreEntryColumns(entry: Record<string, unknown>): LoreEntryColumns {
  return readLoreEntry(entry, "", null);
}

// The card's embedded book: the best of its `data` block's and its root's, read through the book schema. A slot that
// is not an entry object is named and left out.
function readCardBook(layout: CardLayout, notes: StScriptNote[]): CardBookRead | null {
  const inData = layout.at("character_book");
  const atRoot: CardField = { value: layout.root["character_book"], field: "character_book" };
  const candidates = layout.data === null || layout.data === layout.root ? [inData] : [inData, atRoot];
  for (const { value, field } of candidates) {
    noteUnreadable(value, isPlainObject(value), field, notes);
    if (isPlainObject(value)) {
      noteUnreadable(value["entries"], Array.isArray(value["entries"]) || isPlainObject(value["entries"]), `${field}.entries`, notes);
    }
  }
  const picked = selectBestCharacterBook(...candidates.map(({ value }) => value));
  const chosen = candidates.find(({ value }) => value === picked);
  if (chosen === undefined || !isPlainObject(picked)) {
    return null;
  }
  const entries = lorebookSlots(picked, chosen.field).flatMap(({ at, entry }): CardBookEntryRead[] => {
    if (!isPlainObject(entry)) {
      notes.push({ field: at, reason: MALFORMED_FIELD });
      return [];
    }
    return [{ columns: readLoreEntry(entry, at, notes), metadata: loreEntryMetadata(entry) }];
  });
  return {
    name: readValue(BOOK.name, { value: picked["name"], field: `${chosen.field}.name`, notes }),
    description: readValue(BOOK.description, { value: picked["description"], field: `${chosen.field}.description`, notes }),
    entries,
  };
}

/** Map ST's world-info `position` onto the seat it is (or `null` = no seat). ST spells the field THREE
 *  incompatible ways, all of which collide with orb's `metadata.position` enum at the write seam if passed
 *  through raw:
 *    • the chara_card_v2 string enum (`before_char` / `after_char`) — embedded card books;
 *    • ST's numeric `WORLD_INFO_POSITION` (0 before-char · 1 after-char · 2 AN-top · 3 AN-bottom ·
 *      4 at-depth · 5 EM-top · 6 EM-bottom · 7 outlet) — native standalone `worlds/*.json` entries, and the
 *      `extensions.position` of a card entry, which ST reads first;
 *    • our own already-normalized seat names (a re-import of an orb export — the fixpoint).
 *  At-depth (4) is not a seat — it becomes an `inject` directive (below) — and the outlet has none, so both
 *  return `null` here; an empty string / unknown value also returns `null` so the entry carries no `position`
 *  at all. */
function orbEntryPositionFromSt(entry: Record<string, unknown>, rawPosition: unknown): EntryPosition | null {
  // A card entry's before or after slot is spelled by its top-level string, which an export writes only for a stored
  // bucket, so an entry that names none re-imports naming none and keeps its identity. `extensions.position` decides
  // alone for the seats that string cannot spell.
  const ext = isPlainObject(entry["extensions"]) ? entry["extensions"] : undefined;
  const extSeat = entryPositionOfStSlot(ext?.["position"]);
  if (extSeat !== null && !ANCHOR_POSITIONS.some((anchor) => anchor === extSeat)) {
    return extSeat;
  }
  const seat = entryPositionOfStSlot(rawPosition);
  if (seat !== null) {
    return seat;
  }
  if (rawPosition === ST_CARD_POSITION_BEFORE) {
    return "before";
  }
  if (rawPosition === ST_CARD_POSITION_AFTER) {
    return "after";
  }
  return ENTRY_POSITIONS.find((position) => position === rawPosition) ?? null;
}

/** The seatless SillyTavern slot an ST entry names numerically (its card `extensions.position`, else a native world
 *  entry's top-level `position`), or null when it names a slot this model holds or none. */
function stSeatlessSlot(entry: Record<string, unknown>, rawPosition: unknown): StSeatlessPosition | null {
  const ext = isPlainObject(entry["extensions"]) ? entry["extensions"] : undefined;
  const numeric = [ext?.["position"], rawPosition].find((value) => typeof value === "number" && Number.isInteger(value));
  return ST_SEATLESS_POSITIONS.find((slot) => ST_WORLD_INFO_POSITION[slot] === numeric) ?? null;
}

/** Resolve an at-depth `inject` directive from an ST entry, or `null` when it is not at-depth. At-depth is
 *  ST's `extensions.position:4` (embedded chara_card book) or a top-level numeric `position:4` (native ST
 *  world-info entry); `depth`/`role` sit beside whichever encoding carried it (role via the message-role
 *  bimap). A missing, invalid or over-cap depth ⇒ no directive (the entry renders into the system half). */
function stEntryInjectDirective(entry: Record<string, unknown>, rawPosition: unknown): Record<string, unknown> | null {
  const ext = isPlainObject(entry["extensions"]) ? entry["extensions"] : undefined;
  const atDepth = Number(ext?.["position"]) === ST_POSITION_AT_DEPTH || Number(rawPosition) === ST_POSITION_AT_DEPTH;
  if (!atDepth) {
    return null;
  }
  const depth = Number(ext?.["depth"] ?? entry["depth"]);
  // A depth past the injection cap is as unusable as a negative one: no directive, as the persona import reads it.
  if (!(Number.isInteger(depth) && depth >= 0 && depth <= MAX_INJECTION_DEPTH)) {
    return null;
  }
  const role = messageRoleFromSt(ext?.["role"] ?? entry["role"]);
  return { depth, ...(role !== null ? { role } : {}) };
}

/** Build the stored `world_entries.metadata` blob: the WHOLE original ST entry (lossless — `exportBookEntry`
 *  reads it back as the base) EXCEPT `position` (normalized, see below), PLUS the runtime fields derived from
 *  ST's encoding when absent:
 *    • `constant: true` → `scopeMode: "always"` — the runtime reads `scopeMode`, NOT `constant`, so a KEYED
 *      constant entry would otherwise silently demote to keyword scope on import (load-bearing).
 *    • `position` NORMALIZED to orb's seat enum via {@link orbEntryPositionFromSt} — the raw ST
 *      value (v2 string, numeric 0-7, or empty) would otherwise fail `metadata.position` at the write seam
 *      (the whole book import aborts). At-depth / outlet / unknown ⇒ the key is omitted entirely.
 *    • at-depth `{depth, role}` → `metadata.inject` (role via the `@orb/kit/message-role` bimap), read from
 *      ST's `extensions.position:4` (embedded card book) OR a top-level numeric `position:4` (native ST
 *      world-info entry), with `depth`/`role` beside whichever. 4 is ST's `WORLD_INFO_POSITION.atDepth`.
 *  An explicit `scopeMode`/`inject`/`position` already on the entry (a re-import of our OWN export) WINS
 *  (idempotent — `before`/`after` pass through, `inject` short-circuits). */
export function loreEntryMetadata(entry: Record<string, unknown>): Record<string, unknown> {
  // `position` is normalized (not passed through raw), so drop the source key from the lossless base and
  // re-add only a valid orb value — a `delete` would trip `performance/noDelete`.
  const { position: rawPosition, [ST_SLOT_METADATA_KEY]: _forged, ...rest } = entry;
  const meta: Record<string, unknown> = { ...rest };
  if (meta["scopeMode"] === undefined && entry["constant"] === true) {
    meta["scopeMode"] = "always";
  }
  const orbPosition = orbEntryPositionFromSt(entry, rawPosition);
  if (orbPosition !== null) {
    meta["position"] = orbPosition;
  }
  const slot = stSeatlessSlot(entry, rawPosition);
  if (slot !== null) {
    meta[ST_SLOT_METADATA_KEY] = { slot, placed: orbPosition };
  }
  if (meta["inject"] === undefined) {
    const inject = stEntryInjectDirective(entry, rawPosition);
    if (inject !== null) {
      meta["inject"] = inject;
    }
  }
  if (meta["keyMode"] === undefined && entry["use_regex"] === true) {
    meta["keyMode"] = "regex";
  }
  return meta;
}

/**
 * Build the strict ST V3 character card (the OUT emitter). The typed columns OWN their `extensions` keys:
 * any stale `depth_prompt`/`regex_scripts` in the preserved blob is stripped first, then the columns'
 * values are written (a null `depthPrompt` therefore DROPS the key — the §7.3 lossiness fix). The result
 * is `characterCardV3Schema.parse`d so a malformed projection fails loud at the boundary, not silently on
 * the wire.
 */
// the namespaced attached-book-references field for the OUT wire — an empty object (no key) when the
// card carries none, so `buildCardV3` just spreads it.
function attachedBooksWire(refs: readonly AttachedBookRef[] | undefined): Record<string, unknown> {
  return refs !== undefined && refs.length > 0 ? { [ATTACHED_BOOKS_WIRE_KEY]: refs } : {};
}

// D121-E twin of `attachedBooksWire` — the namespaced attached-SCRIPT references for the OUT wire.
function attachedRegexScriptsWire(refs: readonly AttachedRegexScriptRef[] | undefined): Record<string, unknown> {
  return refs !== undefined && refs.length > 0 ? { [ATTACHED_REGEX_SCRIPTS_WIRE_KEY]: refs } : {};
}

// The carried background for the OUT wire — only an asset source travels (a stored override is an asset or
// none; `canonicalBackgroundSource` keeps the persisted shape), so a card without one emits no key.
function backgroundWire(background: ThemeBackground | null | undefined): Record<string, unknown> {
  return background !== undefined && background !== null && background.kind === "asset" && background.assetHash.length > 0
    ? { [CHARACTER_BACKGROUND_WIRE_KEY]: canonicalBackgroundSource(background) }
    : {};
}

// The V3 content promotions (`nickname`/`source`/`creation_date`/`modification_date`) emitted to `data.*`
// only when non-null — a V2 / app-authored card omits the key entirely (the clean-omit round-trip property).
// Extracted so `buildCardV3` stays under the cognitive-complexity gate. Keys are set via bracket-assignment
// (not object-literal declarations) so the snake_case wire names need no `useNamingConvention` suppression.
function v3Promotions(fields: ExportCardFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (fields.nickname !== null) {
    out["nickname"] = fields.nickname;
  }
  if (fields.source !== null) {
    out["source"] = fields.source;
  }
  if (fields.creationDate !== null) {
    out["creation_date"] = fields.creationDate;
  }
  if (fields.modificationDate !== null) {
    out["modification_date"] = fields.modificationDate;
  }
  // The group-only greetings re-split from the folded array (V3 promotion Phase B) — emitted only when
  // present so a card with none omits the key (the clean V2/no-group-only round-trip). Bracket-assigned so
  // the snake_case wire name needs no `useNamingConvention` suppression.
  const groupOnlyGreetings = fields.greetings.filter((g) => g.groupOnly === true).map((g) => g.text);
  if (groupOnlyGreetings.length > 0) {
    out["group_only_greetings"] = groupOnlyGreetings;
  }
  return out;
}

/** The `character_book` wire: the entries under the book's own name when it has one; nothing for a card
 *  without entries. Bracket-assigned so the snake_case wire name needs no `useNamingConvention` suppression. */
function embeddedBookWire(fields: ExportCardFields, entries: ExportWorldEntry[]): Record<string, unknown> {
  if (entries.length === 0) {
    return {};
  }
  const book: Record<string, unknown> = {};
  if (fields.bookName !== undefined && fields.bookName !== null) {
    book["name"] = fields.bookName;
  }
  if (fields.bookDescription !== undefined && fields.bookDescription !== null) {
    book["description"] = fields.bookDescription;
  }
  book["entries"] = entries.map(exportBookEntry);
  const out: Record<string, unknown> = {};
  out["character_book"] = book;
  return out;
}

export function buildCardV3(fields: ExportCardFields, entries: ExportWorldEntry[]): CharacterCardV3 {
  const { depth_prompt: _staleDepthPrompt, regex_scripts: _staleRegexScripts, fav: _staleFav, ...baseExtensions } = fields.extensions ?? {};
  const extensions: Record<string, unknown> = {
    ...baseExtensions,
    // Emitted through the ST-polarity projector: our `enabled` PLUS ST's `disabled`, so a card exported
    // from here means the same thing in SillyTavern as it does on re-import (contracts/regex).
    regex_scripts: fields.regexScripts.map(toRegexScriptCardWire),
    // ST's favorite flag, from the LIVE row (always written — ST itself always writes the key).
    fav: fields.starred,
    ...(fields.depthPrompt ? { depth_prompt: fields.depthPrompt } : {}),
  };
  const data: Record<string, unknown> = {
    // Preserved top-level `data.*` residuals FIRST — the typed keys below always win on collision.
    ...(fields.residualData ?? {}),
    name: fields.name,
    description: fields.description ?? "",
    personality: fields.personality ?? "",
    scenario: fields.scenario ?? "",
    first_mes: fields.greetings[0]?.text ?? "",
    mes_example: fields.exampleMessages ?? "",
    system_prompt: fields.systemPrompt ?? "",
    post_history_instructions: fields.postHistoryInstructions ?? "",
    creator: fields.creator ?? "",
    creator_notes: fields.creatorNotes ?? "",
    character_version: fields.cardVersion ?? "",
    // V3 promotions (nickname/source/creation_date/modification_date) — emitted only when non-null.
    ...v3Promotions(fields),
    alternate_greetings: fields.greetings
      .slice(1)
      .filter((g) => g.groupOnly !== true)
      .map((g) => g.text),
    tags: fields.tags,
    extensions,
    ...embeddedBookWire(fields, entries),
    ...attachedBooksWire(fields.attachedBooks),
    ...attachedRegexScriptsWire(fields.attachedRegexScripts),
    ...backgroundWire(fields.backgroundOverride),
    [CHARACTER_HANDLE_WIRE_KEY]: portableCharacterHandle(fields.handle),
  };
  const spec = fields.spec ?? CHARA_CARD_V3_SPEC;
  return characterCardV3Schema.parse({
    spec,
    spec_version: SPEC_VERSION_BY_SPEC[spec],
    data,
  });
}
