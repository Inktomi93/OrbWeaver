// @orb/server/kit/serde/card — the ONE home for the character-card serde IN-adapter + the card content
// hash (shared-dissolution §1; import.md Movement "card hash homes in server/kit/serde"; PD-33). Server-
// only PURE: no DB, no logger, no fs — it maps an already-JSON-parsed card object INTO the canonical
// `@orb/contracts/character` shape, and hashes a canonical card's semantic fields. The byte surgery (PNG
// tEXt extraction) is `@orb/kit/png-card-chunk`; the JSON.parse + the null-on-failure contract is the
// import parser's job (`domain/import/substrate/card`). This file is the strict-shape pivot both directions
// share — `cardFromJson` is the tolerant IN adapter (import); the strict OUT emitter (`buildCardV3`, export)
// will live here too when `domain/export` lands (invariant 2 — the serde core is single-homed).
//
// PD-33: `cardContentHash` is the SINGLE home of the card semantic-fields hash. `domain/character`
// (`substrate/content-hash.ts`) currently duplicates it byte-for-byte (its FLAG[PD-33] notes the promotion);
// character imports THIS module as its follow-up. The two hash the SAME 10 semantic fields, so a re-import
// of an app-authored card and the original hash identically (the dedup property the determinism tests pin).

import { createHash } from "node:crypto";
import type { CharacterCard } from "@orb/contracts/character";
import { regexScriptSchema } from "@orb/contracts/regex";
import { messageRoleFromSt } from "@orb/kit/message-role";

// ── small pure string folds (dependency-free) ──────────────────────────────
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
  };
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
 *  real corpus fails to import silently (import.md §Esoteric 1). */
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

// ST default for the Character's Note depth when absent / non-numeric (import.md §Esoteric).
const ST_DEFAULT_DEPTH = 4;

// ST `data.extensions.depth_prompt = { prompt, depth, role }`. Empty/whitespace prompt ⇒ null (no note);
// depth defaults to ST's 4; role via the canonical ST bimap, defaulting to system (neo card behaviour).
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
  const depth =
    Number.isFinite(depthNum) && depthNum >= 0 ? Math.floor(depthNum) : ST_DEFAULT_DEPTH;
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

// ST stamps this placeholder in `creator_notes`; strip it so it doesn't ride into the canonical card.
const ST_CREATOR_NOTES_PLACEHOLDER = "Creator's notes go here.";

/**
 * Normalize an already-JSON-parsed card object (any spec: V1 / Pygmalion / V2 / V3) into the canonical
 * `CharacterCard` (`@orb/contracts/character`). The tolerant IN half of the serde — `parseCardPng` /
 * `parseCardJson` (import) wrap it with chunk/byte decoding. `avatarAssetId` + `refinery` are not on the
 * card wire (the avatar is stored separately at import; refinery is pipeline-derived), so both are null;
 * tags + the embedded lorebook are external junctions in orbweaver (not card columns) and are NOT carried
 * here (the world-info / tag junction writes are the full importCharacter path — see import.md Movement).
 */
export function cardFromJson(raw: unknown, fallbackName: string): CharacterCard {
  const cardJson = normalizeCardJson((raw ?? {}) as RawCard);
  const data: RawCard =
    typeof cardJson.data === "object" && cardJson.data !== null
      ? (cardJson.data as RawCard)
      : cardJson;

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
    creatorNotes: nullIfEmpty(
      str(data.creator_notes).replace(ST_CREATOR_NOTES_PLACEHOLDER, "").trim(),
    ),
    creator: nullIfEmpty(str(data.creator)),
    cardVersion: nullIfEmpty(str(data.character_version)),
    regexScripts: parseRegexScripts(data),
    extensions: residualExtensions(data),
    avatarAssetId: null,
    refinery: null,
  };
}

// ── cardContentHash (PD-33 — the one home; mirrors domain/character/substrate/content-hash.ts) ─────────

/** Deterministic JSON: object keys sorted recursively (arrays keep order), so two logically-identical
 *  cards serialize identically regardless of key insertion order — the property the determinism +
 *  re-import-dedup tests rely on. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
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
