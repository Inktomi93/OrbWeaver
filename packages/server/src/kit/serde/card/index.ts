// The one home for the character-card serde core: the tolerant in-adapter (cardFromJson), the strict
// out-emitter (buildCardV3 + the character_book entry mapper exportBookEntry), and the card content hash
// (cardContentHash). Co-located so the round-trip is a one-file invariant. Server-only pure: no DB, no
// logger, no fs — it maps an already-JSON-parsed card object into/out of the canonical contracts/character
// shape and hashes a canonical card's semantic fields. `cardContentHash` is the single home of the hash;
// the IN/OUT halves hash-mirror so a re-import of an app-emitted card hashes identically to the original.
//
// Character-Card V2 AND V3 are read first-class into the ONE canonical model: V3 is a strict SUPERSET of V2,
// so the shared `data.*` reads cover both, and cardFromJson captures the source `spec` so buildCardV3
// round-trips it (V2→V2, V3→V3). V3-native content is now DECOMPOSED into typed columns: `nickname`/`source`/
// `creation_date`/`modification_date` are first-class card fields (read here, emitted by buildCardV3).
// `creator_notes_multilingual` has NO typed column: it rides the `residualData` passthrough verbatim and only
// FEEDS `creator_notes` when that is empty (#266 D-1 — it was promoted out of residual and never folded, so a
// map-only card imported with its notes destroyed; the `en`-first pick is a display fallback, not a locale
// policy). `assets` remains on the `residualData` passthrough (preserved verbatim,
// non-lossy) pending its own lane; `group_only_greetings` folds into the `greetings` array (`groupOnly:true`
// entries — V3 promotion Phase B), re-split on export. V3 `data.assets[]` is PARSED + PRESERVED only:
// resolving an asset URI (charx ZIP embed, `http(s)`, `ccdefault:`) → expression sprites / the gallery is a
// SEPARATE later chunk that MUST ride the H1 egress firewall (a card is untrusted — an asset fetch is an
// SSRF surface). This reader stays pure parse-and-validate, zero I/O.

import { createHash } from "node:crypto";
import type { AttachedBookRef, CardDepthPrompt, CardSpec, CharacterCard, CharacterCardV3, Greeting } from "@orb/contracts/character";
import { ATTACHED_BOOKS_WIRE_KEY, CHARA_CARD_V2_SPEC, CHARA_CARD_V3_SPEC, characterCardV3Schema } from "@orb/contracts/character";
import type { AttachedRegexScriptRef, RegexScriptCard } from "@orb/contracts/regex";
import { ATTACHED_REGEX_SCRIPTS_WIRE_KEY, regexScriptCardSchema, toRegexScriptCardWire } from "@orb/contracts/regex";
import { isPlainObject } from "@orb/kit/guards";
import { messageRoleFromSt, messageRoleToSt } from "@orb/kit/message-role";
import { stableStringify } from "@orb/kit/stable-stringify";
import { resolveEntryInjection, resolveEntryKeyMode, resolveEntryScope } from "@orb/kit/world-info";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
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
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// A permissive typed view over the dynamic, multi-spec card JSON. Every field is optional `unknown` (cards
// are untrusted); dot access documents exactly what we read while keeping the index-signature lint quiet.
interface RawCard {
  spec?: unknown;
  data?: unknown;
  name?: unknown;
  description?: unknown;
  personality?: unknown;
  scenario?: unknown;
  first_mes?: unknown;
  mes_example?: unknown;
  system_prompt?: unknown;
  post_history_instructions?: unknown;
  creator?: unknown;
  creator_notes?: unknown;
  creator_notes_multilingual?: unknown;
  creatorcomment?: unknown;
  alternate_greetings?: unknown;
  group_only_greetings?: unknown;
  character_version?: unknown;
  // V3-additive `data.*` promotions read into typed columns.
  nickname?: unknown;
  source?: unknown;
  creation_date?: unknown;
  modification_date?: unknown;
  // Pygmalion Gradio variant.
  char_name?: unknown;
  char_persona?: unknown;
  char_greeting?: unknown;
  example_dialogue?: unknown;
  world_scenario?: unknown;
  extensions?: {
    depth_prompt?: unknown;
    regex_scripts?: unknown;
    fav?: unknown;
    [key: string]: unknown;
  } | null;
  // V2-era cards put `regex_scripts` at the data root (no extensions wrapper); V3 nests it under
  // `data.extensions.regex_scripts`. We accept either.
  regex_scripts?: unknown;
}

/** Pygmalion-Gradio (`char_name`…) → the V2 `{ data }` field set. */
function fromPygmalion(card: RawCard): RawCard {
  return {
    data: {
      name: card.char_name ?? "",
      description: card.char_persona ?? "",
      first_mes: card.char_greeting ?? "",
      mes_example: card.example_dialogue ?? "",
      scenario: card.world_scenario ?? "",
      personality: "",
      creator: card.creator ?? "",
      creator_notes: card.creator_notes ?? card.creatorcomment ?? "",
    },
  };
}

/** V1 (root-level fields) → the V2 `{ data }` field set. */
function fromV1(card: RawCard): RawCard {
  return {
    data: {
      name: card.name ?? "",
      description: card.description ?? "",
      personality: card.personality ?? "",
      scenario: card.scenario ?? "",
      first_mes: card.first_mes ?? "",
      mes_example: card.mes_example ?? "",
      creator: card.creator ?? "",
      creator_notes: card.creatorcomment ?? card.creator_notes ?? "",
    },
  };
}

/** Normalize V1 / Pygmalion-Gradio card JSON to the V2 `{ data: {...} }` shape. Detection ORDER
 *  (spec/data → char_name Pygmalion → name V1) matches the canonical reader; without it ~5–15% of a
 *  real corpus fails to import silently. */
function normalizeCardJson(card: RawCard): RawCard {
  if ("spec" in card || "data" in card) {
    return card; // already V2/V3
  }
  if ("char_name" in card) {
    return fromPygmalion(card);
  }
  if ("name" in card) {
    return fromV1(card);
  }
  return card;
}

// ST default for the Character's Note depth when absent / non-numeric.
const ST_DEFAULT_DEPTH = 4;

// ST `data.extensions.depth_prompt = { prompt, depth, role }`. Role defaults to `system` (via the ST
// bimap) to match neo card behaviour.
function parseDepthPrompt(raw: unknown): CharacterCard["depthPrompt"] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const dp = raw as Record<string, unknown>;
  const prompt = str(dp["prompt"]).trim();
  if (prompt.length === 0) {
    return null;
  }
  const depthNum = Number(dp["depth"]);
  const depth = Number.isFinite(depthNum) && depthNum >= 0 ? Math.floor(depthNum) : ST_DEFAULT_DEPTH;
  return { prompt, depth, role: messageRoleFromSt(dp["role"]) ?? "system" };
}

/** The card's ST regex scripts (the LIFT payload — D121-E: there is no `regexScripts` column any more; the
 *  importer hands these to the regex domain). The raw blob is V3 `data.extensions.regex_scripts` or the V2
 *  root `data.regex_scripts`; each candidate is parsed through `regexScriptCardSchema` and only the valid
 *  ones survive (tolerant IN — a foreign-shaped ST script is dropped rather than thrown, and an
 *  orbweaver-emitted card round-trips its scripts back cleanly). The card schema's accept-and-drop heals run
 *  here: an ST `SLASH_COMMAND` placement and any `min_depth`/`max_depth` keys are stripped from an otherwise
 *  valid script instead of taking the whole script down with them. */
function parseRegexScripts(data: RawCard): RegexScriptCard[] {
  const v3 = Array.isArray(data.extensions?.regex_scripts) ? data.extensions.regex_scripts : null;
  const v2 = Array.isArray(data.regex_scripts) ? data.regex_scripts : null;
  const src = v3 ?? v2 ?? [];
  const out: RegexScriptCard[] = [];
  for (const candidate of src) {
    const parsed = regexScriptCardSchema.safeParse(candidate);
    if (parsed.success) {
      out.push(parsed.data);
    }
  }
  return out;
}

/** `data.extensions` MINUS the fields promoted to typed columns (`depth_prompt`, `regex_scripts`, `fav`) —
 *  only genuinely-unknown vendor extras. Null when nothing is left (the §7.3 lossiness fix: no `raw` blob). */
function residualExtensions(data: RawCard): Record<string, unknown> | null {
  const ext = data.extensions;
  if (ext === undefined || ext === null || typeof ext !== "object" || Array.isArray(ext)) {
    return null;
  }
  const { depth_prompt: _dp, regex_scripts: _rs, fav: _fav, ...rest } = ext;
  return Object.keys(rest).length > 0 ? rest : null;
}

// Every field with a typed home on `CharacterCard`/`ExportCardFields` — MINUS from the top-level `data.*`
// object to isolate genuinely-unknown keys. Kept as a Set (not destructured) because the raw
// `data` object is typed `RawCard` (fixed shape), not a generic record.
const PROMOTED_DATA_KEYS = new Set([
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "system_prompt",
  "post_history_instructions",
  "creator",
  "creator_notes",
  "character_version",
  "alternate_greetings",
  // Folded into the `greetings` array (`groupOnly:true` entries) by cardFromJson — kept out of `residualData`
  // so it doesn't double-ride the residual passthrough AND re-emit on export (V3 promotion Phase B).
  "group_only_greetings",
  // V3-additive `data.*` fields with a typed column now (were residual until the card-import expansion). Kept
  // out of `residualData` so they don't double-emit on a round-trip. `creator_notes_multilingual` is NOT here
  // (#266 D-1): it has no typed column, so promoting it out DESTROYED it — it rides the residual passthrough
  // and only FEEDS `creatorNotes` as a fallback (see {@link foldMultilingualNotes}).
  "nickname",
  "source",
  "creation_date",
  "modification_date",
  "extensions",
  "regex_scripts",
  "tags",
  "character_book",
  // the attached-book references are an external junction (re-linked by id on import), not residual
  // `data.*` — keep them out of the preserved blob so they don't double-emit on a round-trip.
  ATTACHED_BOOKS_WIRE_KEY,
  // D121-E twin of the line above: the attached SCRIPT references are an external junction too.
  ATTACHED_REGEX_SCRIPTS_WIRE_KEY,
]);

/** TOP-LEVEL `data.*` keys MINUS the ones with a typed column (the top-level sibling of
 *  {@link residualExtensions}, which only covers `data.extensions.*`). The known ST-V3 `data.*` fields
 *  (`nickname`/`source`/`creation_date`/`modification_date`) are promoted OUT via {@link PROMOTED_DATA_KEYS};
 *  what remains here is genuinely-unknown vendor residue PLUS the column-less V3 fields kept verbatim
 *  (`assets` pending its lane; `creator_notes_multilingual`, #266 D-1; `group_only_greetings` folds into the
 *  `greetings` array). Null when nothing is left. */
function residualData(data: RawCard): Record<string, unknown> | null {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!PROMOTED_DATA_KEYS.has(key)) {
      rest[key] = value;
    }
  }
  return Object.keys(rest).length > 0 ? rest : null;
}

// ST stamps this placeholder in `creator_notes`; strip it so it doesn't ride into the canonical card.
const ST_CREATOR_NOTES_PLACEHOLDER = "Creator's notes go here.";

// The language whose note is preferred when `creator_notes` is empty and the V3 map has to supply one. The
// app is single-language, so this is a DISPLAY fallback, not a locale policy — a real per-user language
// preference (V3 says the app should pick the reader's language) is an owner call and would live in settings.
const DEFAULT_NOTES_LANGUAGE = "en";

/** V3 `data.creator_notes_multilingual` → the ONE note to display when `creator_notes` carries none (#266
 *  D-1 — a map-only card used to import with its notes destroyed). `en` first, else the first non-empty value
 *  in key order; a malformed map yields "" and never throws (tolerant IN). The map itself is NOT consumed —
 *  it rides `residualData` verbatim and re-emits on export, so the fold is additive, never lossy. */
function foldMultilingualNotes(raw: unknown): string {
  if (!isPlainObject(raw)) {
    return "";
  }
  const preferred = str(raw[DEFAULT_NOTES_LANGUAGE]);
  if (preferred.trim().length > 0) {
    return preferred;
  }
  for (const value of Object.values(raw)) {
    const note = str(value);
    if (note.trim().length > 0) {
      return note;
    }
  }
  return "";
}

/** The wire spec a card was READ from — keyed on the top-level `spec` marker (ST's discriminator). V2/V3 are
 *  preserved so export round-trips them; V1 / Pygmalion / app-authored cards (no `spec`) return `undefined`
 *  and export defaults to V3. Unknown spec strings are treated as `undefined` (tolerant IN — the reader never
 *  throws; a malformed card is caught upstream at the import parser's typed error path). */
function detectSpec(raw: RawCard): CardSpec | null {
  const spec = str(raw.spec);
  return spec === CHARA_CARD_V3_SPEC || spec === CHARA_CARD_V2_SPEC ? spec : null;
}

/**
 * Normalize an already-JSON-parsed card object (any spec: V1/Pygmalion/V2/V3) into the canonical
 * `CharacterCard`. The tolerant in half of the serde — `parseCardPng`/`parseCardJson` wrap it with
 * chunk/byte decoding. `avatarAssetId`/`refinery` are not on the card wire, so both are null; tags and
 * the embedded lorebook are external junctions and are not carried here.
 */
export function cardFromJson(raw: unknown, fallbackName: string): CharacterCard {
  const rawCard = (raw ?? {}) as RawCard;
  const spec = detectSpec(rawCard);
  const cardJson = normalizeCardJson(rawCard);
  const data: RawCard = typeof cardJson.data === "object" && cardJson.data !== null ? (cardJson.data as RawCard) : cardJson;

  const first = str(data.first_mes);
  const alternates = strArray(data.alternate_greetings);
  const groupOnly = strArray(data.group_only_greetings);
  // greetings[0] is THE first message; the rest are alternates (`groupOnly` absent), then the group-only
  // greetings (`groupOnly:true`, the folded ST `group_only_greetings` — V3 promotion Phase B). Keep the [0]
  // slot whenever there is any greeting content (even an empty first_mes alongside real alternates/group-only
  // greetings), else an empty list.
  const hasGreetingContent = first.trim().length > 0 || alternates.length > 0 || groupOnly.length > 0;
  const greetings: CharacterCard["greetings"] = hasGreetingContent ? [{ text: first }, ...alternates.map((text) => ({ text }))] : [];
  for (const text of groupOnly) {
    greetings.push({ text, groupOnly: true });
  }

  return {
    name: firstNonEmpty(str(data.name), str(cardJson.name)) ?? fallbackName,
    description: nullIfEmpty(str(data.description)),
    personality: nullIfEmpty(str(data.personality)),
    scenario: nullIfEmpty(str(data.scenario)),
    greetings,
    exampleMessages: nullIfEmpty(str(data.mes_example)),
    systemPrompt: nullIfEmpty(str(data.system_prompt)),
    postHistoryInstructions: nullIfEmpty(str(data.post_history_instructions)),
    depthPrompt: parseDepthPrompt(data.extensions?.depth_prompt),
    // The placeholder-stripped `creator_notes` is the one home; the V3 multilingual map only fills an EMPTY
    // one (#266 D-1). The map survives regardless — it rides `residualData`.
    creatorNotes: firstNonEmpty(
      str(data.creator_notes).replace(ST_CREATOR_NOTES_PLACEHOLDER, "").trim(),
      foldMultilingualNotes(data.creator_notes_multilingual),
    ),
    creator: nullIfEmpty(str(data.creator)),
    cardVersion: nullIfEmpty(str(data.character_version)),
    nickname: nullIfEmpty(str(data.nickname)),
    // `source` is a NULLABLE list (absent ⇒ null, distinct from `[]`) — an absent/non-array value collapses to
    // null, so a V2 card omits it cleanly on re-export.
    source: Array.isArray(data.source) ? strArray(data.source) : null,
    creationDate: typeof data.creation_date === "number" && Number.isFinite(data.creation_date) ? data.creation_date : null,
    modificationDate: typeof data.modification_date === "number" && Number.isFinite(data.modification_date) ? data.modification_date : null,
    // ST's favorite flag → `characters.starred` (strict `true` only — ST writes booleans; a foreign
    // truthy string is not a star). Promoted out of the residue like `depth_prompt`/`regex_scripts`.
    starred: data.extensions?.fav === true,
    regexScripts: parseRegexScripts(data),
    extensions: residualExtensions(data),
    residualData: residualData(data),
    avatarAssetId: null,
    refinery: null,
    // V2/V3 preserved so export round-trips the source spec; omitted (not `undefined`) for a specless card so
    // it satisfies `exactOptionalPropertyTypes` and export defaults to V3.
    ...(spec !== null ? { spec } : {}),
  };
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
 *  IT IS A TUPLE, not an object literal, because the EXCLUSIONS are load-bearing to other code (#1560): a
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

/** sha-256 hex of the stable-stringified semantic fields — the card's `content_hash` + the re-import
 *  content-dedup key (distinct from the whole-file `importHash`). */
export function cardContentHash(card: CharacterCard): string {
  return createHash("sha256")
    .update(stableStringify(semanticFields(card)))
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
  readonly name: string;
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
  /** The wire spec to EMIT (`chara_card_v2`/`chara_card_v3`). Omitted ⇒ V3 (the canonical default). Set from
   *  the imported card's `CharacterCard.spec` to round-trip V2→V2 / V3→V3. */
  readonly spec?: CardSpec;
}

/** One attached lore entry projected for the OUT mapper. Carries the full round-trip payload — typed
 *  columns PLUS the preserved `metadata` blob — so import → export → reimport doesn't strip
 *  `constant` / `position` / vendor extensions. */
export interface ExportWorldEntry {
  readonly keys: string[];
  readonly content: string;
  readonly enabled: boolean;
  readonly priority: number;
  readonly title: string;
  readonly ignoreBudget: boolean;
  readonly metadata: Record<string, unknown> | null;
}

// ST's at-depth directive lives under `extensions.position = 4` with a sibling `depth`/`role` (the
// world-info-at-depth encoding). 4 is ST's WORLD_INFO_POSITION.atDepth.
const ST_POSITION_AT_DEPTH = 4;

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
export function exportBookEntry(entry: ExportWorldEntry): Record<string, unknown> {
  const meta = isPlainObject(entry.metadata) ? entry.metadata : {};
  const scope = resolveEntryScope(meta, entry.keys.length > 0);
  const inject = resolveEntryInjection(meta);
  const baseExtensions = isPlainObject(meta["extensions"]) ? meta["extensions"] : {};
  const extensions = inject
    ? {
        ...baseExtensions,
        position: ST_POSITION_AT_DEPTH,
        depth: inject.depth,
        role: messageRoleToSt(inject.role),
      }
    : baseExtensions;
  return {
    ...meta,
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
 *  `metadata` blob, which {@link loreEntryMetadata} builds). `keys` is filtered to strings (ST keys are
 *  free-form JSON); the writer null-collapses an empty list to honor the `world_entries.keys` NULL-vs-`[]`
 *  asymmetry. `title`/`description`/`content`/`enabled`/`priority`/`ignoreBudget` mirror the typed columns. */
export interface LoreEntryColumns {
  readonly title: string;
  readonly description: string | null;
  readonly content: string;
  readonly keys: string[];
  readonly enabled: boolean;
  readonly priority: number;
  readonly ignoreBudget: boolean;
}

/** `character_book.entries` is a dict OR a list in the wild (ST V2 used a keyed object, V3 a list) — return
 *  every entry OBJECT, order-preserving, dropping non-object junk. */
export function extractLorebook(book: unknown): Record<string, unknown>[] {
  if (!isPlainObject(book)) {
    return [];
  }
  const entries = book["entries"];
  let list: unknown[];
  if (Array.isArray(entries)) {
    list = entries;
  } else if (isPlainObject(entries)) {
    list = Object.values(entries);
  } else {
    return [];
  }
  return list.filter((e): e is Record<string, unknown> => isPlainObject(e));
}

/** Pick the best `character_book` when a card carries MULTIPLE candidates (V3 cards in the wild sometimes
 *  embed a book at BOTH `data.character_book` AND the root `character_book`, one a real book + one an empty
 *  stub). Most-NAMED-entries wins (a non-empty `name`), then most entries, then the first non-empty. Returns
 *  `undefined` when no candidate holds any entries. */
export function selectBestCharacterBook(...candidates: unknown[]): unknown {
  let best: { book: unknown; named: number; total: number } | undefined;
  for (const candidate of candidates) {
    if (!isPlainObject(candidate)) {
      continue;
    }
    const entries = extractLorebook(candidate);
    if (entries.length === 0) {
      continue;
    }
    const named = entries.filter((e) => typeof e["name"] === "string" && e["name"].trim().length > 0).length;
    if (best === undefined || named > best.named || (named === best.named && entries.length > best.total)) {
      best = { book: candidate, named, total: entries.length };
    }
  }
  return best?.book;
}

/** Project one ST `character_book` entry → the `world_entries` typed columns. ST uses `comment` (falling
 *  back to `name`, then the first key) as the author-facing memo → our `title`; when `comment` differs from
 *  the resolved title it is ALSO kept as `description` (lossless). `insertion_order` → `priority`. */
export function loreEntryColumns(entry: Record<string, unknown>): LoreEntryColumns {
  const keys = Array.isArray(entry["keys"]) ? entry["keys"].filter((k): k is string => typeof k === "string") : [];
  const comment = typeof entry["comment"] === "string" ? entry["comment"] : "";
  const name = typeof entry["name"] === "string" ? entry["name"] : "";
  const title = firstNonEmpty(comment, name, keys[0] ?? "") ?? "Untitled";
  const order = Number(entry["insertion_order"]);
  return {
    title,
    // `comment` doubles as the memo only when it is NOT already the title (else a null description).
    description: comment.length > 0 && comment !== title ? comment : null,
    content: typeof entry["content"] === "string" ? entry["content"] : "",
    keys,
    enabled: entry["enabled"] !== false,
    priority: Number.isFinite(order) ? order : 0,
    // App-specific field round-tripped through export (vanilla ST cards never carry it → false).
    ignoreBudget: entry["ignoreBudget"] === true,
  };
}

/** Map ST's world-info `position` onto orb's `before`/`after` anchor bucket (or `null` = no bucket). ST
 *  spells the field THREE incompatible ways, all of which collide with orb's `metadata.position` enum at the
 *  write seam if passed through raw:
 *    • the chara_card_v2 string enum (`before_char` / `after_char`) — embedded card books;
 *    • ST's numeric `WORLD_INFO_POSITION` (0 before-char · 1 after-char · 2 AN-top · 3 AN-bottom ·
 *      4 at-depth · 5 EM-top · 6 EM-bottom) — native standalone `worlds/*.json` entries;
 *    • our own already-normalized `before` / `after` (a re-import of an orb export — the fixpoint).
 *  At-depth (4) is not an anchor bucket — it becomes an `inject` directive (below), so it returns `null`
 *  here; an empty string / unknown value also returns `null` so the entry carries no `position` at all. */
// ST numeric WORLD_INFO_POSITION values that map onto each orb anchor bucket. before-char/AN-top/EM-top all
// render ahead of the anchor; after-char/AN-bottom/EM-bottom after it. `atDepth` (4) is handled as an inject.
// biome-ignore lint/style/noMagicNumbers: these Sets ARE the named extraction — ST's WORLD_INFO_POSITION enum values
const ST_POSITIONS_BEFORE: ReadonlySet<number> = new Set([0, 2, 5]);
// biome-ignore lint/style/noMagicNumbers: these Sets ARE the named extraction — ST's WORLD_INFO_POSITION enum values
const ST_POSITIONS_AFTER: ReadonlySet<number> = new Set([1, 3, 6]);

function orbEntryPositionFromSt(raw: unknown): "before" | "after" | null {
  if (raw === "before" || raw === "after") {
    return raw;
  }
  if (raw === "before_char") {
    return "before";
  }
  if (raw === "after_char") {
    return "after";
  }
  if (typeof raw === "number" && Number.isInteger(raw)) {
    if (ST_POSITIONS_BEFORE.has(raw)) {
      return "before";
    }
    if (ST_POSITIONS_AFTER.has(raw)) {
      return "after";
    }
  }
  return null;
}

/** Resolve an at-depth `inject` directive from an ST entry, or `null` when it is not at-depth. At-depth is
 *  ST's `extensions.position:4` (embedded chara_card book) or a top-level numeric `position:4` (native ST
 *  world-info entry); `depth`/`role` sit beside whichever encoding carried it (role via the message-role
 *  bimap). A missing/invalid depth ⇒ no directive (the entry renders into the system half). */
function stEntryInjectDirective(entry: Record<string, unknown>, rawPosition: unknown): Record<string, unknown> | null {
  const ext = isPlainObject(entry["extensions"]) ? entry["extensions"] : undefined;
  const atDepth = Number(ext?.["position"]) === ST_POSITION_AT_DEPTH || Number(rawPosition) === ST_POSITION_AT_DEPTH;
  if (!atDepth) {
    return null;
  }
  const depth = Number(ext?.["depth"] ?? entry["depth"]);
  if (!(Number.isInteger(depth) && depth >= 0)) {
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
 *    • `position` NORMALIZED to orb's `before`/`after` enum via {@link orbEntryPositionFromSt} — the raw ST
 *      value (v2 string, numeric 0-6, or empty) would otherwise fail `metadata.position` at the write seam
 *      (the whole book import aborts). At-depth / unknown ⇒ the key is omitted entirely.
 *    • at-depth `{depth, role}` → `metadata.inject` (role via the `@orb/kit/message-role` bimap), read from
 *      ST's `extensions.position:4` (embedded card book) OR a top-level numeric `position:4` (native ST
 *      world-info entry), with `depth`/`role` beside whichever. 4 is ST's `WORLD_INFO_POSITION.atDepth`.
 *  An explicit `scopeMode`/`inject`/`position` already on the entry (a re-import of our OWN export) WINS
 *  (idempotent — `before`/`after` pass through, `inject` short-circuits). */
export function loreEntryMetadata(entry: Record<string, unknown>): Record<string, unknown> {
  // `position` is normalized (not passed through raw), so drop the source key from the lossless base and
  // re-add only a valid orb value — a `delete` would trip `performance/noDelete`.
  const { position: rawPosition, ...rest } = entry;
  const meta: Record<string, unknown> = { ...rest };
  if (meta["scopeMode"] === undefined && entry["constant"] === true) {
    meta["scopeMode"] = "always";
  }
  const orbPosition = orbEntryPositionFromSt(rawPosition);
  if (orbPosition !== null) {
    meta["position"] = orbPosition;
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
    ...(entries.length > 0 ? { character_book: { entries: entries.map(exportBookEntry) } } : {}),
    ...attachedBooksWire(fields.attachedBooks),
    ...attachedRegexScriptsWire(fields.attachedRegexScripts),
  };
  const spec = fields.spec ?? CHARA_CARD_V3_SPEC;
  return characterCardV3Schema.parse({
    spec,
    spec_version: SPEC_VERSION_BY_SPEC[spec],
    data,
  });
}
