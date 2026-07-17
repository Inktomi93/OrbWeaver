// The one home for the character-card serde core: the tolerant in-adapter (cardFromJson), the strict
// out-emitter (buildCardV3 + the character_book entry mapper exportBookEntry), and the card content hash
// (cardContentHash). Co-located so the round-trip is a one-file invariant. Server-only pure: no DB, no
// logger, no fs — it maps an already-JSON-parsed card object into/out of the canonical contracts/character
// shape and hashes a canonical card's semantic fields. `cardContentHash` is the single home of the hash;
// the IN/OUT halves hash-mirror so a re-import of an app-emitted card hashes identically to the original.

import { createHash } from "node:crypto";
import type { AttachedBookRef, CardDepthPrompt, CharacterCard, CharacterCardV3 } from "@orb/contracts/character";
import { ATTACHED_BOOKS_WIRE_KEY, CHARA_CARD_V3_SPEC, characterCardV3Schema } from "@orb/contracts/character";
import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import { isPlainObject } from "@orb/kit/guards";
import { messageRoleFromSt, messageRoleToSt } from "@orb/kit/message-role";
import { resolveEntryInjection, resolveEntryScope } from "@orb/kit/world-info";

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
// biome-ignore-start lint/style/useNamingConvention: Character-Card wire field names (snake_case).
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
  creatorcomment?: unknown;
  alternate_greetings?: unknown;
  character_version?: unknown;
  // Pygmalion Gradio variant.
  char_name?: unknown;
  char_persona?: unknown;
  char_greeting?: unknown;
  example_dialogue?: unknown;
  world_scenario?: unknown;
  extensions?: {
    depth_prompt?: unknown;
    regex_scripts?: unknown;
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
// biome-ignore-end lint/style/useNamingConvention: Character-Card wire field names (snake_case).

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

/** The card's typed `regexScripts` column. The raw blob is V3 `data.extensions.regex_scripts` or the V2
 *  root `data.regex_scripts`; each candidate is parsed through the canonical `regexScriptSchema` and only
 *  the valid ones survive (tolerant IN — a foreign-shaped ST script is dropped rather than thrown, and an
 *  orbweaver-emitted card round-trips its scripts back cleanly). */
function parseRegexScripts(data: RawCard): CharacterCard["regexScripts"] {
  const v3 = Array.isArray(data.extensions?.regex_scripts) ? data.extensions.regex_scripts : null;
  const v2 = Array.isArray(data.regex_scripts) ? data.regex_scripts : null;
  const src = v3 ?? v2 ?? [];
  const out: CharacterCard["regexScripts"] = [];
  for (const candidate of src) {
    const parsed = regexScriptSchema.safeParse(candidate);
    if (parsed.success) {
      out.push(parsed.data);
    }
  }
  return out;
}

/** `data.extensions` MINUS the fields promoted to typed columns (`depth_prompt`, `regex_scripts`) — only
 *  genuinely-unknown vendor extras. Null when nothing is left (the §7.3 lossiness fix: no `raw` blob). */
function residualExtensions(data: RawCard): Record<string, unknown> | null {
  const ext = data.extensions;
  if (ext === undefined || ext === null || typeof ext !== "object" || Array.isArray(ext)) {
    return null;
  }
  const { depth_prompt: _dp, regex_scripts: _rs, ...rest } = ext;
  return Object.keys(rest).length > 0 ? rest : null;
}

// Every field with a typed home on `CharacterCard`/`ExportCardFields` — MINUS from the top-level `data.*`
// object to isolate genuinely-unknown keys (PD-127). Kept as a Set (not destructured) because the raw
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
  "extensions",
  "regex_scripts",
  "tags",
  "character_book",
  // PD-144: the attached-book references are an external junction (re-linked by id on import), not residual
  // `data.*` — keep them out of the preserved blob so they don't double-emit on a round-trip.
  ATTACHED_BOOKS_WIRE_KEY,
]);

/** TOP-LEVEL `data.*` keys MINUS the ones with a typed column (PD-127 — the top-level sibling of
 *  {@link residualExtensions}, which only covers `data.extensions.*`). ST-V3 puts real fields here
 *  (`source`, `creation_date`, `creator_notes_multilingual`, `nickname`, `group_only_greetings`) that have
 *  no typed home yet; this stops import→export from silently eating them. Null when nothing is left. */
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

/**
 * Normalize an already-JSON-parsed card object (any spec: V1/Pygmalion/V2/V3) into the canonical
 * `CharacterCard`. The tolerant in half of the serde — `parseCardPng`/`parseCardJson` wrap it with
 * chunk/byte decoding. `avatarAssetId`/`refinery` are not on the card wire, so both are null; tags and
 * the embedded lorebook are external junctions and are not carried here.
 */
export function cardFromJson(raw: unknown, fallbackName: string): CharacterCard {
  const cardJson = normalizeCardJson((raw ?? {}) as RawCard);
  const data: RawCard = typeof cardJson.data === "object" && cardJson.data !== null ? (cardJson.data as RawCard) : cardJson;

  const first = str(data.first_mes);
  const alternates = strArray(data.alternate_greetings);
  // greetings[0] is THE first message; the rest are alternates. Keep the [0] slot whenever there is any
  // greeting content (even an empty first_mes alongside real alternates), else an empty list.
  const greetings = first.trim().length > 0 || alternates.length > 0 ? [first, ...alternates] : [];

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
    creatorNotes: nullIfEmpty(str(data.creator_notes).replace(ST_CREATOR_NOTES_PLACEHOLDER, "").trim()),
    creator: nullIfEmpty(str(data.creator)),
    cardVersion: nullIfEmpty(str(data.character_version)),
    regexScripts: parseRegexScripts(data),
    extensions: residualExtensions(data),
    residualData: residualData(data),
    avatarAssetId: null,
    refinery: null,
  };
}

// cardContentHash — the one home; character imports it from here, no private copy.

/** Deterministic JSON: object keys sorted recursively (arrays keep order), so two logically-identical
 *  cards serialize identically regardless of key insertion order — the property the determinism +
 *  re-import-dedup tests rely on. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    // lib.es5.d.ts types `JSON.stringify` as always returning `string`, but it really returns
    // `undefined` for `undefined`/function/symbol values (e.g. an explicit `{ a: undefined }`
    // field surviving from a partially-populated CharacterCard) — a real runtime gap the TS lib
    // misses, not a redundant guard.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see comment above; JSON.stringify(undefined) is `undefined` at runtime despite the `string` lib type
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}

/** The semantic content subset that IDENTIFIES a card. EXCLUDED (deliberate — re-attributing/re-deriving a
 *  card must NOT change its identity): creator, creatorNotes, cardVersion, extensions, refinery,
 *  avatarAssetId. INCLUDED: the content a reader experiences. */
function semanticFields(card: CharacterCard): Record<string, unknown> {
  return {
    name: card.name,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    greetings: card.greetings,
    exampleMessages: card.exampleMessages,
    systemPrompt: card.systemPrompt,
    postHistoryInstructions: card.postHistoryInstructions,
    depthPrompt: card.depthPrompt,
    regexScripts: card.regexScripts,
  };
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
 *  is the first message; the rest are alternate greetings. `tags` are the ACCEPTED `character_tags` names
 *  (pending tags are NOT serialized). The typed promotions (`creator` / `cardVersion` /
 *  `regexScripts` / `extensions` / `depthPrompt`) are read straight off the flat row — no `raw` blob.
 *  `residualData` (PD-127) is the preserved top-level `data.*` blob — re-emitted at the `data` root. There
 *  is NO backing `characters` column yet (hygiene-only at the serde boundary), so it's optional — an
 *  export call site that predates PD-127 doesn't need to source it from anywhere. */
export interface ExportCardFields {
  readonly name: string;
  readonly description: string | null;
  readonly personality: string | null;
  readonly scenario: string | null;
  readonly greetings: string[];
  readonly exampleMessages: string | null;
  readonly systemPrompt: string | null;
  readonly postHistoryInstructions: string | null;
  readonly creatorNotes: string | null;
  readonly creator: string | null;
  readonly cardVersion: string | null;
  readonly tags: string[];
  readonly extensions: Record<string, unknown> | null;
  readonly residualData?: Record<string, unknown> | null;
  readonly regexScripts: RegexScript[];
  readonly depthPrompt: CardDepthPrompt | null;
  /** PD-144: attached world-info book REFERENCES — the OUT-emitter rides them under
   *  `data.orbweaver_attached_books`. Optional/absent-empty: a card with no attached books emits no key. */
  readonly attachedBooks?: readonly AttachedBookRef[];
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

const SPEC_VERSION = "3.0";

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
  // biome-ignore-start lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)
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
    ...(entry.ignoreBudget ? { ignoreBudget: true } : {}),
    extensions,
  };
  // biome-ignore-end lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)
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

/** Build the stored `world_entries.metadata` blob: the WHOLE original ST entry (lossless — `exportBookEntry`
 *  reads it back as the base), PLUS the two runtime fields derived from ST's encoding when absent:
 *    • `constant: true` → `scopeMode: "always"` — the runtime reads `scopeMode`, NOT `constant`, so a KEYED
 *      constant entry would otherwise silently demote to keyword scope on import (load-bearing).
 *    • `extensions.{position:4, depth, role}` (ST's at-depth placement) → `metadata.inject` (role via the
 *      `@orb/kit/message-role` bimap). 4 is ST's `WORLD_INFO_POSITION.atDepth` — the ONE encoding site.
 *  An explicit `scopeMode`/`inject` already on the entry (a re-import of our OWN export) WINS (idempotent). */
export function loreEntryMetadata(entry: Record<string, unknown>): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...entry };
  if (meta["scopeMode"] === undefined && entry["constant"] === true) {
    meta["scopeMode"] = "always";
  }
  if (meta["inject"] === undefined) {
    const ext = isPlainObject(entry["extensions"]) ? entry["extensions"] : undefined;
    const depth = Number(ext?.["depth"]);
    if (ext !== undefined && Number(ext["position"]) === ST_POSITION_AT_DEPTH && Number.isInteger(depth) && depth >= 0) {
      const role = messageRoleFromSt(ext["role"]);
      meta["inject"] = { depth, ...(role !== null ? { role } : {}) };
    }
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
// PD-144: the namespaced attached-book-references field for the OUT wire — an empty object (no key) when the
// card carries none, so `buildCardV3` just spreads it.
function attachedBooksWire(refs: readonly AttachedBookRef[] | undefined): Record<string, unknown> {
  return refs !== undefined && refs.length > 0 ? { [ATTACHED_BOOKS_WIRE_KEY]: refs } : {};
}

export function buildCardV3(fields: ExportCardFields, entries: ExportWorldEntry[]): CharacterCardV3 {
  // biome-ignore-start lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)
  const { depth_prompt: _staleDepthPrompt, regex_scripts: _staleRegexScripts, ...baseExtensions } = fields.extensions ?? {};
  const extensions: Record<string, unknown> = {
    ...baseExtensions,
    regex_scripts: fields.regexScripts,
    ...(fields.depthPrompt ? { depth_prompt: fields.depthPrompt } : {}),
  };
  const data: Record<string, unknown> = {
    // Preserved top-level `data.*` residuals FIRST (PD-127) — the typed keys below always win on collision.
    ...(fields.residualData ?? {}),
    name: fields.name,
    description: fields.description ?? "",
    personality: fields.personality ?? "",
    scenario: fields.scenario ?? "",
    first_mes: fields.greetings[0] ?? "",
    mes_example: fields.exampleMessages ?? "",
    system_prompt: fields.systemPrompt ?? "",
    post_history_instructions: fields.postHistoryInstructions ?? "",
    creator: fields.creator ?? "",
    creator_notes: fields.creatorNotes ?? "",
    character_version: fields.cardVersion ?? "",
    alternate_greetings: fields.greetings.slice(1),
    tags: fields.tags,
    extensions,
    ...(entries.length > 0 ? { character_book: { entries: entries.map(exportBookEntry) } } : {}),
    ...attachedBooksWire(fields.attachedBooks),
  };
  return characterCardV3Schema.parse({
    spec: CHARA_CARD_V3_SPEC,
    spec_version: SPEC_VERSION,
    data,
  });
  // biome-ignore-end lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)
}
