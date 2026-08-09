// The one chat-JSONL serde core: the ST chat interchange grammar with both directions in one home, so
// build + parse can never drift. Pure: zero I/O, zero db, zero id-resolution — it maps `ParsedChat` (a
// name-level canonical shape) to/from the ST .jsonl string. The relational work stays out of here: export
// resolves character/persona ids → names before buildChatJsonl; import maps names → ids after
// parseChatJsonl. So the serde only ever sees speakerName/characterName/userName strings.
//
// Load-bearing esoterica (carried verbatim from the corpus study — do not re-derive):
//   • the filename date wins over the header create_date (ST re-save rewrites the header to migration time).
//   • buildVariants drops empty swipe slots + remaps the active index; `mes` is authoritative regardless.
//   • dates emit in the legacy human form (minute precision); parseStDate reads it back. That form is a
//     ZONE-LESS LOCAL WALL CLOCK in ST, so both halves take a `wallClockZone` (default "UTC" — see
//     ST_DEFAULT_WALL_CLOCK_ZONE); the ST interchange DOORS pass `hostTimeZone()`. Absolute encodings
//     (epoch / ISO) ignore it.
//   • ST's ONE `extra.token_count` is the row's own text count, not API usage: it routes to tokensOut on an
//     assistant line and tokensIn on a user/system line (`tokenColumns`), and un-routes on build.
//   • swipe arrays build only when >1 variant, matching the parser's real-swipe gate.
//   • a variant's `metadata` is ONE canonical shape on both paths — ST's FLAT `extra`, with the swipe entry's
//     non-sidecar residue merged under it (`variantMetadata`). The nested `swipe_info[i]` shape this used to
//     store made the column's `$.reasoning_duration` readers resolve NULL on every swiped row.
//   • main_chat/note_prompt round-trip the branch parent filename + author's note, omitted when null; the
//     note's PLACEMENT knobs (note_depth/position/role/interval) and `chat_metadata.variables` round-trip
//     beside them, each omitted when the chat records none. The knobs stay in ST's NUMERIC vocabulary here —
//     translating them onto orb's injection axis is the import mapper's job.
//
// Round-trip drift guard: buildChatJsonl(parseChatJsonl(buildChatJsonl(p))) === buildChatJsonl(p).

import type { MessageKind } from "@orb/contracts/chat";
import { DEFAULT_MESSAGE_KIND } from "@orb/contracts/chat";
import type { MessageRole } from "@orb/kit/message-role";
import { epochToMs, isoToMs, msToWallClock, wallClockToMs } from "@orb/kit/time";
import { z } from "zod";

// ── the canonical shape (NAME-level; the serde owns its wire shape, server/kit type-home-exempt) ──────────

/** RAG/analytics relevance class of a parsed chat (the `classify` output). Import EVERYTHING, but the
 *  memory-backfill (PD-78) enqueues over `real_conversation` chats ONLY. `greeting_only` = no user turn;
 *  `all_empty_msgs` = system-only rows (blank rows are stripped or swipe-promoted at parse); `header_only` = no message lines at all. */
export const CHAT_BUCKETS = ["header_only", "all_empty_msgs", "greeting_only", "real_conversation"] as const;
export type ChatBucket = (typeof CHAT_BUCKETS)[number];

/** One swipe in a message's variant pool (0-based `idx` after the empty-slot drop + re-index). `metadata` is
 *  the take's generation sidecar in the ONE canonical shape both import paths write — see
 *  {@link variantMetadata} (parse side; build ignores it — the economics ride the fields). */
export interface ParsedVariant {
  readonly idx: number;
  readonly content: string;
  readonly model: string | null;
  readonly provider: string | null;
  /** ST's `extra.token_count` when this row's text is INBOUND (a user/system line) — see
   *  {@link ParsedChatMessage.tokensIn}. Exactly one of `tokensIn`/`tokensOut` is ever non-null here. */
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly reasoning: string | null;
  readonly genStarted: number | null;
  readonly genFinished: number | null;
  readonly metadata: Record<string, unknown> | null;
}

/** Provenance for an AGENT-authored assistant row (D60 self-attribution; PD-17). An agent principal voices
 *  with NO character card, so the only honest speaker source is the agent's own identity. This carries ONLY
 *  what a shared export may reveal: the agent's DISPLAY `name` + its `sourceKind` label (e.g. `"buddy"`).
 *  Deliberately NOT here: the owner (the agent `handle` embeds `ownerUserId` — never read), the soul
 *  system-prompt, and any credential/secret. `sourceKind` is `string` (not the `AgentSourceKind` union) —
 *  on the parse side it is a free-text provenance label off a possibly-foreign export, not a local enum. */
export interface ParsedAgentAuthor {
  readonly name: string;
  readonly sourceKind: string;
}

/** One parsed/serializable chat message. `content` is `mes` (the RENDERED text — authoritative). `speakerName`
 *  is the per-turn author display NAME (the JSONL `name` field): the voicing character for an assistant row,
 *  the authoring persona for a user row — export RESOLVES it from ids before build; parse READS it off the
 *  line; import does NOT use it for attribution (it re-resolves via `personaByUserName`). `variants` is the
 *  multi-swipe pool (empty on the parse side when ≤1 real generation); `activeVariantIdx` is `swipe_id`
 *  remapped onto the surviving pool. `agentAuthor` is present ONLY on an agent-authored assistant row (PD-17);
 *  absent for every human + character-voiced turn (so those export byte-identically). On IMPORT the field
 *  round-trips through the serde but the import DOMAIN never re-links it to a local agent principal — a
 *  foreign install has no matching agent, so the label stays provenance-only and no local agent is fabricated. */
export interface ParsedChatMessage {
  readonly role: MessageRole;
  /** The row's DECLARED PURPOSE (D129) — carried through the interchange so an orbweaver export→import round
   *  trip restores what a row IS, not just what it looked like. REQUIRED (not defaulted at the type level) so
   *  every producer states its answer out loud; the wire spelling is `extra.type` and the default is
   *  {@link DEFAULT_MESSAGE_KIND} — see `kindOf`/`extraTypeFor`. */
  readonly kind: MessageKind;
  readonly speakerName: string | null;
  /** ST's per-line `original_avatar` — the SPEAKING CHARACTER'S CARD FILENAME (`"Bengal.png"`), written by
   *  ST on every group-chat assistant line. It is the ONLY per-turn speaker signal in the interchange that is
   *  an IDENTITY rather than a display label: the group importer resolves it against the collect-time card
   *  filename → characterId map, which is handle-suffix-safe (two cards named "Emily" disambiguate to
   *  `emily`/`emily-2` but keep distinct filenames), where a `speakerName` match would seat the wrong card.
   *  ABSENT on a solo transcript and on pre-group-era exports — the importer falls back to a roster-SCOPED
   *  display-name match there. Emitted on build only when present, so a solo line stays byte-identical. */
  readonly originalAvatar?: string | null;
  readonly content: string;
  readonly sendDate: number | null;
  readonly model: string | null;
  readonly provider: string | null;
  /** ST's `extra.token_count` for a row whose text is INBOUND to a generation — a `user` or `system` line.
   *  ST's field is the token count of THIS ROW'S OWN TEXT, not an API usage figure (SOURCE-PINNED:
   *  `script.js` `message.extra.token_count = await getTokenCountAsync(message.mes, 0)` on the user-send
   *  path), so on a user/system line it is an INPUT count and landing it in `tokensOut` (which this did
   *  until the 2026-08-08 import-fidelity audit) credits typed text as model OUTPUT in every economics
   *  rollup. Exactly one of `tokensIn`/`tokensOut` is non-null: the axis is chosen by ROLE. */
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly reasoning: string | null;
  readonly genStarted: number | null;
  readonly genFinished: number | null;
  readonly ttftMs: number | null;
  readonly metadata: Record<string, unknown> | null;
  readonly activeVariantIdx: number | null;
  readonly variants: readonly ParsedVariant[];
  readonly agentAuthor?: ParsedAgentAuthor;
}

/** The author's-note PLACEMENT knobs ST records beside `note_prompt`, in ST's OWN vocabulary — raw numbers,
 *  untranslated. The serde owns the ST grammar; translating these onto orb's `chat_injections`
 *  position/depth/role axis is the IMPORT mapper's job (`domain/import/substrate/chat-input.ts`), so the two
 *  vocabularies never blur into one half-converted shape here. SOURCE-PINNED spellings (SillyTavern
 *  `public/scripts/authors-note.js` `metadata_keys` + `public/script.js` `extension_prompt_types` /
 *  `extension_prompt_roles`): `position` is `-1 NONE | 0 IN_PROMPT | 1 IN_CHAT | 2 BEFORE_PROMPT`; `role` is
 *  `0 SYSTEM | 1 USER | 2 ASSISTANT`; `depth` is a message count from the tail; `interval` is "insert every N
 *  messages". Each field is null when the file records none. */
export interface ParsedNotePlacement {
  readonly depth: number | null;
  readonly position: number | null;
  readonly role: number | null;
  readonly interval: number | null;
}

/** One parsed/serializable ST chat. `createDate` is the FILENAME date first (survives ST re-save/migration),
 *  then the header `create_date`, then null. `parentRef` is the normalized `chat_metadata.main_chat` (the
 *  branch edge; falls back to the filename lineage). `bucket` is the memory-backfill gate (PD-78).
 *  `sourceMetadata` is the full `chat_metadata` (lossless sidecar; null on the build side). */
export interface ParsedChat {
  readonly characterName: string;
  readonly userName: string | null;
  readonly createDate: number | null;
  readonly isBranch: boolean;
  readonly parentRef: string | null;
  readonly notePrompt: string | null;
  /** The recorded placement for {@link notePrompt}, in ST's vocabulary. Null when the file records no knob at
   *  all (the mapper then uses orb's house register). Parsed even when `notePrompt` is empty — 1,070 of the
   *  1,097 real-corpus chats carry the knobs and ZERO carry note TEXT, so the two are genuinely independent. */
  readonly notePlacement: ParsedNotePlacement | null;
  /** ST's `chat_metadata.variables` — the per-chat `{{setvar}}`/`{{getvar}}` store (494 of 1,097 corpus
   *  chats). STRING VALUES ONLY: orb's seat (`chats.variableValues`) is a flat `Record<string,string>` and
   *  ST's own macro engine stores strings, so a non-string value from a foreign/extension writer is dropped
   *  rather than stringified into a shape no reader could interpret. Null when the chat records none. */
  readonly variables: Record<string, string> | null;
  readonly bucket: ChatBucket;
  readonly sourceMetadata: Record<string, unknown> | null;
  readonly messages: readonly ParsedChatMessage[];
}

// ── pure-string helpers (dependency-free) ────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function nullIfEmpty(s: string): string | null {
  return s.trim().length > 0 ? s : null;
}
function asObj(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

// Permissive typed views over ST's external JSON (snake_case by spec). Each field is `unknown` and every
// consuming helper coerces + guards, so the schemas VALIDATE the object SHAPE (is this a record at all?),
// not reject fields. `.loose()` keeps unmodelled keys; a non-object fails `safeParse` → null (skip/abort).
// biome-ignore-start lint/style/useNamingConvention: ST chat-JSONL wire field names (snake_case).
const rawHeaderSchema = z
  .object({
    user_name: z.unknown(),
    character_name: z.unknown(),
    create_date: z.unknown(),
    chat_metadata: z.unknown(),
  })
  .partial()
  .loose();

const rawExtraSchema = z
  .object({
    model: z.unknown(),
    api: z.unknown(),
    token_count: z.unknown(),
    reasoning: z.unknown(),
    time_to_first_token: z.unknown(),
    // The row-PURPOSE marker (D129). ST's own `extra.type` slot, whose vocabulary we intersect rather than
    // extend — `narrator` is ST's spelling for a narrator-voiced line, and an unrecognised value is not our
    // business (it falls through to the default, never a fabricated kind).
    type: z.unknown(),
  })
  .partial()
  .loose();

const rawSwipeInfoSchema = z.object({ extra: z.unknown(), gen_started: z.unknown(), gen_finished: z.unknown() }).partial().loose();

// The orb-specific agent-provenance sidecar (PD-17). Only `name`/`source_kind` are modelled; `.loose()` keeps
// (but never emits) any foreign residue. A non-object → null (skip), same as every other wire view here.
const rawAgentAuthorSchema = z.object({ name: z.unknown(), source_kind: z.unknown() }).partial().loose();

const rawMessageSchema = z
  .object({
    name: z.unknown(),
    is_user: z.unknown(),
    is_system: z.unknown(),
    mes: z.unknown(),
    send_date: z.unknown(),
    extra: z.unknown(),
    swipes: z.unknown(),
    swipe_id: z.unknown(),
    swipe_info: z.unknown(),
    gen_started: z.unknown(),
    gen_finished: z.unknown(),
    agent_author: z.unknown(),
    original_avatar: z.unknown(),
  })
  .partial()
  .loose();
type RawMessage = z.infer<typeof rawMessageSchema>;
// biome-ignore-end lint/style/useNamingConvention: ST chat-JSONL wire field names (snake_case).

/** Validate a value's object shape against a lenient schema; null on a non-object. */
function asTyped<T>(v: unknown, schema: z.ZodType<T>): T | null {
  const result = schema.safeParse(v);
  return result.success ? result.data : null;
}

// ── the ST date codec (the inverse pair — one home) ──────────────────────────────────────────────────────

const ST_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

// Guard a numeric-string epoch to ≥10 digits so a bare "2025" isn't misread as 2025 epoch-seconds.
const NUMERIC_EPOCH = /^\d{10,}$/;
// ST create_date / message dates / chat filenames: "2025-07-03@14h56m48s" (+ optional "989ms").
// The digit counts are 1-2 and EVERY separator is space-tolerant because ST itself writes several spellings
// and reads all of them — SOURCE-PINNED to `public/scripts/utils.js parseTimestamp`, whose three "humanized"
// patterns are `(\d{4})-(\d{1,2})-(\d{1,2})@…`, the same with a trailing ms group, and
// `(\d{4})-(\d{1,2})-(\d{1,2}) @(\d{1,2})h (\d{1,2})m (\d{1,2})s (\d{1,3})ms`. A stricter 2-digit/no-space
// pattern is NOT a safe subset: 76 of the 1,097 real-corpus chat files carry a form it rejects
// ("Emily Singleton - 2025-5-7 @22h 52m 11s 856ms.jsonl"), and a filename miss silently degrades the chat's
// createdAt to the first send_date or — with no dated message either — to the import clock.
const ST_AT_DATE = /(\d{4})-\s*(\d{1,2})-\s*(\d{1,2})\s*@\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s/;
// The filename creation token — the same shape, embedded in "Char - 2023-11-11@09h41m32s538ms.jsonl". Kept
// as a separate NON-capturing twin (it feeds its whole match back through parseStDate), so it must stay
// exactly as permissive as ST_AT_DATE or a filename it matches would fail the re-parse.
const FILENAME_DATE = /\d{4}-\s*\d{1,2}-\s*\d{1,2}\s*@\s*\d{1,2}h\s*\d{1,2}m\s*\d{1,2}s/;
const NOON = 12;

/** Numeric-string epoch (≥10 digits) → ms, else null. */
function parseNumericEpoch(s: string): number | null {
  if (!NUMERIC_EPOCH.test(s)) {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? epochToMs(n) : null;
}

/** ST "2025-07-03\@14h56m48s" → ms, resolving the zone-less wall clock in `zone`, else null. */
function parseAtDate(s: string, zone: string): number | null {
  const at = ST_AT_DATE.exec(s);
  if (!at) {
    return null;
  }
  const [, y, mo, d, h, mi, se] = at;
  return wallClockToMs({ year: Number(y), month: Number(mo), day: Number(d), hour: Number(h), minute: Number(mi), second: Number(se) }, zone);
}

/** 12h → 24h given the am/pm marker (ST's human date uses 12h). */
function to24Hour(hour12: number, ap: string): number {
  if (ap === "pm" && hour12 !== NOON) {
    return hour12 + NOON;
  }
  if (ap === "am" && hour12 === NOON) {
    return 0;
  }
  return hour12;
}

// Precompiled per-month human-date patterns (with-time + date-only) — avoids rebuilding a RegExp per parse.
const MONTH_PATTERNS: {
  readonly name: string;
  readonly mo: number;
  readonly withTime: RegExp;
  readonly dateOnly: RegExp;
}[] = Object.entries(MONTHS).map(([name, mo]) => ({
  name,
  mo,
  withTime: new RegExp(`${name}\\s+(\\d{1,2}),?\\s+(\\d{4})\\s+(\\d{1,2}):(\\d{2})(am|pm)`),
  dateOnly: new RegExp(`${name}\\s+(\\d{1,2}),?\\s+(\\d{4})`),
}));

/** Parse "<Month> D, YYYY H:MMam/pm" → ms (wall clock resolved in `zone`), else null. */
function parseMonthWithTime(lower: string, pat: (typeof MONTH_PATTERNS)[number], zone: string): number | null {
  const withTime = pat.withTime.exec(lower);
  if (!withTime) {
    return null;
  }
  const [, d, y, hh, mm, ap] = withTime;
  return wallClockToMs({ year: Number(y), month: pat.mo, day: Number(d), hour: to24Hour(Number(hh), String(ap)), minute: Number(mm), second: 0 }, zone);
}

/** Parse the date-only "<Month> D, YYYY" → ms (midnight of that wall-clock day in `zone`), else null. */
function parseMonthDateOnly(lower: string, pat: (typeof MONTH_PATTERNS)[number], zone: string): number | null {
  const dateOnly = pat.dateOnly.exec(lower);
  if (!dateOnly) {
    return null;
  }
  const [, d, y] = dateOnly;
  return wallClockToMs({ year: Number(y), month: pat.mo, day: Number(d), hour: 0, minute: 0, second: 0 }, zone);
}

/** "August 27, 2025 6:36pm" (with or without the time) → ms, else null. Once a month NAME is found, this
 *  commits to the human form (the neo `break`): a parse miss returns null. */
function parseHumanDate(lower: string, zone: string): number | null {
  for (const pat of MONTH_PATTERNS) {
    if (lower.includes(pat.name)) {
      return parseMonthWithTime(lower, pat, zone) ?? parseMonthDateOnly(lower, pat, zone);
    }
  }
  return null;
}

/** The wall-clock zone this serde reads/writes ST's zone-less date forms in when a caller names none.
 *  `"UTC"` keeps the codec a PURE function of its arguments (no ambient zone read down here) and keeps every
 *  orb-authored fixture — the demo-chat seeder's jsonl, the round-trip drift guard — byte-identical. The ST
 *  INTERCHANGE DOORS (the import collectors, the single-file import routes, the chat export) override it with
 *  {@link hostTimeZone}, because THOSE bytes were written by SillyTavern against a local clock. */
export const ST_DEFAULT_WALL_CLOCK_ZONE = "UTC";

/** Parse ST's many date encodings → epoch ms. Numeric epoch (number OR ≥10-digit string) · ISO 8601 ·
 *  ST "2025-07-03\@14h56m48s[989ms]" · "August 27, 2025 6:36pm".
 *
 *  Two CLASSES, not one. An epoch and an offset-bearing/naive ISO are ABSOLUTE — they resolve through the
 *  shared `@orb/kit/time` parsers exactly as before, and `zone` cannot move them. ST's two human forms are a
 *  zone-less LOCAL WALL CLOCK (SOURCE-PINNED: `RossAscends-mods.js humanizedDateTime` builds them from
 *  `Date.getHours()`, and ST reads the meridiem form back through a NAIVE moment in its own
 *  `parseTimestamp`), so they resolve in `zone`. Reading them as UTC — which this did until the 2026-08-08
 *  import-fidelity audit — shifts every such timestamp by the writing box's UTC offset; measured against the
 *  real corpus, 231 files at exactly +7h and 110 at exactly +6h (America/Denver, both DST arms). */
export function parseStDate(v: unknown, zone: string = ST_DEFAULT_WALL_CLOCK_ZONE): number | null {
  if (v === null || v === undefined || v === "") {
    return null;
  }
  if (typeof v === "number") {
    return epochToMs(v);
  }
  const s = String(v).trim();
  if (s.length === 0) {
    return null;
  }
  const iso = s.includes("T") ? isoToMs(s) : null;
  return parseNumericEpoch(s) ?? iso ?? parseAtDate(s, zone) ?? parseHumanDate(s.toLowerCase(), zone);
}

const NOON_HOUR = 12;

/** Format an epoch-ms instant as ST's human send_date string (MINUTE precision) e.g. "August 27, 2025 6:36pm".
 *  The exact inverse of {@link parseStDate}'s human arm in the SAME `zone` — the two must agree or an
 *  export→import round trip drifts by the offset, and ST itself would render an exported transcript shifted
 *  (its reader resolves this form locally). */
export function formatStDate(ms: number | null, zone: string = ST_DEFAULT_WALL_CLOCK_ZONE): string | null {
  if (ms === null || !Number.isFinite(ms)) {
    return null;
  }
  const wc = msToWallClock(ms, zone);
  if (wc === null) {
    return null;
  }
  const month = ST_MONTHS[wc.month - 1];
  const minute = String(wc.minute).padStart(2, "0");
  const ap = wc.hour >= NOON_HOUR ? "pm" : "am";
  const hour12 = wc.hour % NOON_HOUR === 0 ? NOON_HOUR : wc.hour % NOON_HOUR;
  return `${month} ${wc.day}, ${wc.year} ${hour12}:${minute}${ap}`;
}

/** ST encodes a chat's creation timestamp in its FILENAME — the most reliable ORIGINAL-creation signal
 *  (re-saving rewrites the header + every `send_date`; the filename token survives). Null when absent. */
function parseFilenameDate(fileName: string, zone: string): number | null {
  const m = FILENAME_DATE.exec(fileName);
  return m ? parseStDate(m[0], zone) : null;
}

/** A `chat_metadata` numeric knob → a finite integer, else null. ST writes these as JSON numbers, but a
 *  hand-edited profile can carry the string form, so both are accepted; anything else records "not set". */
function parseNoteKnob(v: unknown): number | null {
  if (typeof v !== "number" && typeof v !== "string") {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** ST's author's-note placement knobs off `chat_metadata`, or null when the file records NONE of them (which
 *  is what tells the import mapper to fall back to orb's house register rather than to a fabricated zero). */
function parseNotePlacement(meta: Record<string, unknown> | null): ParsedNotePlacement | null {
  if (meta === null) {
    return null;
  }
  const placement: ParsedNotePlacement = {
    depth: parseNoteKnob(meta["note_depth"]),
    position: parseNoteKnob(meta["note_position"]),
    role: parseNoteKnob(meta["note_role"]),
    interval: parseNoteKnob(meta["note_interval"]),
  };
  return Object.values(placement).some((v) => v !== null) ? placement : null;
}

/** ST's `chat_metadata.variables` → the flat string map orb's `chats.variableValues` column is. Non-string
 *  values are DROPPED (see {@link ParsedChat.variables}); an empty/absent/all-dropped bag is null, so the
 *  column keeps meaning "this chat has no variable store" rather than gaining a second empty spelling. */
function parseChatVariables(meta: Record<string, unknown> | null): Record<string, string> | null {
  const raw = asObj(meta?.["variables"]);
  if (raw === null) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") {
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Normalize a `chat_metadata.main_chat` ref to filename form (ST stores it without ".jsonl"). */
function normalizeParentRef(mainChat: string): string | null {
  if (mainChat.length === 0) {
    return null;
  }
  return mainChat.endsWith(".jsonl") ? mainChat : `${mainChat}.jsonl`;
}

/** Fallback parent derivation from the filename: "CharName - <date> - Branch #N.jsonl" →
 *  "CharName - <date>.jsonl". Used when `chat_metadata.main_chat` is absent. */
function deriveParentFromFilename(fileName: string): string | null {
  const i = fileName.indexOf(" - Branch #");
  return i >= 0 ? `${fileName.slice(0, i)}.jsonl` : null;
}

// ── parse (JSONL string → ParsedChat) ────────────────────────────────────────────────────────────────────

/** The economics off one `extra` blob. `tokenCount` is ST's ROLE-AGNOSTIC `extra.token_count` — the count of
 *  the row's own text; {@link tokenColumns} decides which axis it belongs on. */
function extractExtra(extra: unknown): {
  model: string | null;
  provider: string | null;
  tokenCount: number | null;
  reasoning: string | null;
  ttftMs: number | null;
} {
  const e = asTyped(extra, rawExtraSchema);
  const tc = e ? Number(e.token_count) : Number.NaN;
  const ttft = e ? Number(e.time_to_first_token) : Number.NaN;
  return {
    model: nullIfEmpty(str(e?.model)),
    provider: nullIfEmpty(str(e?.api)),
    tokenCount: Number.isFinite(tc) && tc > 0 ? tc : null,
    reasoning: nullIfEmpty(str(e?.reasoning)),
    ttftMs: Number.isFinite(ttft) && ttft >= 0 ? Math.round(ttft) : null,
  };
}

/** Route ST's one `extra.token_count` onto the in/out axis by the row's ROLE: an `assistant` line's text was
 *  GENERATED (output), a `user`/`system` line's text was typed/injected and only ever enters a prompt (input).
 *  ST has exactly one field and no axis of its own, so the role is the only signal — and it is a reliable one
 *  (`roleOf` reads ST's own `is_user`/`is_system`). */
function tokenColumns(tokenCount: number | null, role: MessageRole): { tokensIn: number | null; tokensOut: number | null } {
  if (tokenCount === null) {
    return { tokensIn: null, tokensOut: null };
  }
  return role === "assistant" ? { tokensIn: null, tokensOut: tokenCount } : { tokensIn: tokenCount, tokensOut: null };
}

/** Coerce the `agent_author` sidecar → provenance, or null when absent/blank (PD-17). Both fields must be
 *  non-empty strings — a partial/garbage sidecar degrades to "no provenance" (the row exports as a plain
 *  assistant line), never a fabricated half-identity. */
function parseAgentAuthor(v: unknown): ParsedAgentAuthor | null {
  const a = asTyped(v, rawAgentAuthorSchema);
  if (a === null) {
    return null;
  }
  const name = nullIfEmpty(str(a.name));
  const sourceKind = nullIfEmpty(str(a.source_kind));
  return name !== null && sourceKind !== null ? { name, sourceKind } : null;
}

function roleOf(m: RawMessage): MessageRole {
  if (m.is_system === true) {
    return "system";
  }
  return m.is_user === true ? "user" : "assistant";
}

/** ST's `extra.type` value for a narrator-voiced line — SOURCE-PINNED to SillyTavern
 *  `public/scripts/system-messages.js` `system_message_types.NARRATOR = 'narrator'`, the key ST's own group
 *  and prompt code tests (`openai.js` l.589/603, `group-chats.js` l.1138/1208). Our narrator kind and ST's
 *  narrator marker mean the same thing, so the interchange uses ST's spelling rather than minting a private
 *  `orb_kind` sidecar. */
const ST_NARRATOR_TYPE = "narrator";

/** The row's DECLARED PURPOSE off the line (D129). ONLY the narrator marker is recognised — a plain ST
 *  transcript declares no purpose, and the explicit answer for it is `DEFAULT_MESSAGE_KIND` (`standard`).
 *
 *  DELIBERATELY NOT MAPPED: `is_system: true` → `comment`. The design's §R4 proposes it, and it is a real
 *  candidate (ST's `is_system` is a visibility filter, which is close to our OOC-comment semantic), but
 *  `is_system` already decides the ROLE here (`roleOf`) and feeds `classifyChat`'s `all_empty_msgs` bucket —
 *  re-pointing it at the purpose axis moves an imported row's wire role, not just its label, and that is a
 *  behavior change the `comment` writer's own lane should own (there is no `comment` writer yet, D41).
 *  Until then an ST system row keeps landing exactly as it does today.
 *
 *  ROLE-GATED, and that gate is a real belt rather than defensive noise: the db CHECK `messages_kind_shape`
 *  enforces `kind='narrator' ⇒ role='assistant'` (D129(C)), and this parses a FOREIGN file — a hand-edited or
 *  foreign-tool export carrying the marker on a user/system line would otherwise abort the whole import at the
 *  write. The honest degrade is the default kind on a row we keep, never a refused transcript. */
function kindOf(m: RawMessage, role: MessageRole): MessageKind {
  if (role !== "assistant") {
    return DEFAULT_MESSAGE_KIND;
  }
  const e = asTyped(m.extra, rawExtraSchema);
  return str(e?.type) === ST_NARRATOR_TYPE ? "narrator" : DEFAULT_MESSAGE_KIND;
}

// The `swipe_info[i]` keys that are NOT part of the take's generation sidecar: `extra` is unwrapped INTO the
// blob, and the two timings are promoted to their own columns (`genStarted`/`genFinished`), exactly as a
// single-take row's line-level `gen_started`/`gen_finished` are. Everything else — `send_date` (78,407 corpus
// entries) and any foreign residue — rides along untouched, so flattening is not a drop.
const SWIPE_INFO_NON_SIDECAR_KEYS: ReadonlySet<string> = new Set(["extra", "gen_started", "gen_finished"]);

/** ONE canonical shape for a variant's `metadata`, on BOTH parse paths: ST's FLAT `extra` blob, with the
 *  swipe entry's non-sidecar residue merged underneath it.
 *
 *  This existed as TWO shapes until the 2026-08-08 import-fidelity audit: a single-take row stored `extra`
 *  flat while a swipe-bearing row stored the whole `swipe_info[i]`, which NESTS `extra`. The column's readers
 *  address it by PATH — `json_extract(metadata, '$.reasoning_duration')` in `domain/stats`'s rebuild and the
 *  live `substrate/stats-delta` twin — so the nested shape resolved to NULL and reasoning time was lost for
 *  every swipe-bearing imported message (12,718 of 24,824 corpus rows; `reasoning_duration` is present on
 *  75,309 of 76,238 swipe entries). The fix is one shape at the WRITER, never dual-shape readers.
 *
 *  `extra` wins on a key collision: it is the authoritative generation sidecar, the residue is context. */
function variantMetadata(swipeEntry: unknown): Record<string, unknown> | null {
  const si = asObj(swipeEntry);
  if (si === null) {
    return null;
  }
  const merged: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(si)) {
    if (!SWIPE_INFO_NON_SIDECAR_KEYS.has(k)) {
      merged[k] = v;
    }
  }
  return { ...merged, ...(asObj(si["extra"]) ?? {}) };
}

// Fewer than this many SURVIVING swipes ⇒ no real alternates (the lone generation lives on the message's
// primary variant, not a redundant one-element pool).
const MIN_REAL_SWIPES = 2;

/** Build the variant pool from a message's `swipes[]` + parallel `swipe_info[]`, DROPPING genuinely-empty
 *  swipe slots and remapping the active index onto what survives (esoterica 3). `mes` (the rendered content)
 *  is authoritative regardless — an active slot that was itself empty simply yields `activeVariantIdx: null`. */
function buildVariants(args: {
  readonly swipes: readonly unknown[];
  readonly swipeInfo: unknown;
  readonly activeSwipeId: number | null;
  /** The parent row's role — the token in/out axis is a per-ROW fact, so the pool inherits it. */
  readonly role: MessageRole;
  readonly zone: string;
}): { variants: ParsedVariant[]; activeVariantIdx: number | null } {
  const { swipes, swipeInfo, activeSwipeId, role, zone } = args;
  const info = Array.isArray(swipeInfo) ? swipeInfo : [];
  const kept = swipes.map((content, originIdx) => ({ content: str(content), originIdx, si: info[originIdx] })).filter((s) => s.content.trim().length > 0);
  if (kept.length < MIN_REAL_SWIPES) {
    return { variants: [], activeVariantIdx: null };
  }
  const variants = kept.map((s, idx): ParsedVariant => {
    const si = asTyped(s.si, rawSwipeInfoSchema); // swipe_info can be shorter than swipes
    const ex = extractExtra(si?.extra);
    return {
      idx,
      content: s.content,
      model: ex.model,
      provider: ex.provider,
      ...tokenColumns(ex.tokenCount, role),
      reasoning: ex.reasoning,
      genStarted: si ? parseStDate(si.gen_started, zone) : null,
      genFinished: si ? parseStDate(si.gen_finished, zone) : null,
      metadata: variantMetadata(s.si),
    };
  });
  const newActive = kept.findIndex((s) => s.originIdx === activeSwipeId);
  return { variants, activeVariantIdx: newActive >= 0 ? newActive : null };
}

/** Classify a chat into the 4 buckets: import everything, but embed/analyze only `real_conversation`
 *  (PD-78). `greeting_only` = no user turn; `all_empty_msgs` = system-only rows (parseMessageLine never
 *  emits a blank non-system row — stripped or swipe-promoted); `header_only` = no lines. */
export function classifyChat(messages: readonly ParsedChatMessage[]): ChatBucket {
  if (messages.length === 0) {
    return "header_only";
  }
  const substantive = messages.filter((m) => m.role !== "system" && m.content.trim().length > 0);
  if (substantive.length === 0) {
    return "all_empty_msgs";
  }
  if (!substantive.some((m) => m.role === "user")) {
    return "greeting_only";
  }
  return "real_conversation";
}

function parseJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// ST attachment spellings across export eras: modern `extra.media[]` / `extra.files[]`, which ST's own
// `migrateMediaToArray` builds FROM the legacy `image` / `image_swipes` / `file` / `video` keys — an export
// on disk can carry any era's spelling, so the debris test must know them all. A text-empty row that
// carries media is a VALID message (an image post), never debris.
const MEDIA_EXTRA_KEYS = ["media", "files", "image_swipes", "image", "file", "video"] as const;
function carriesMedia(extra: Record<string, unknown> | null): boolean {
  if (extra === null) {
    return false;
  }
  return MEDIA_EXTRA_KEYS.some((k) => {
    const v = extra[k];
    if (Array.isArray(v)) {
      return v.length > 0;
    }
    if (typeof v === "string") {
      return v.trim().length > 0;
    }
    return v !== null && typeof v === "object";
  });
}

/** Resolve a message's PRIMARY content when `mes` is blank: promote the active (else first) surviving
 *  swipe (a real generation whose rendered copy lives in the pool — never an empty canon row), else the
 *  lone below-MIN_REAL_SWIPES take, else keep a media-bearing row with empty content (the attachment IS
 *  the message). No text and no media anywhere ⇒ null: a blank narrator post / rpg state-anchor export /
 *  pre-D124 debris is unrepresentable at the write boundary and skipped, not minted as an empty row. */
function resolvePrimary(args: {
  readonly mes: string;
  readonly variants: readonly ParsedVariant[];
  readonly remappedActive: number | null;
  readonly swipes: readonly unknown[];
  readonly extra: unknown;
}): { content: string; activeVariantIdx: number | null } | null {
  const { mes, variants, remappedActive, swipes, extra } = args;
  if (mes.trim().length > 0) {
    return { content: mes, activeVariantIdx: remappedActive };
  }
  const promoted = variants[remappedActive ?? 0];
  if (promoted !== undefined) {
    return { content: promoted.content, activeVariantIdx: remappedActive ?? 0 };
  }
  const lone = swipes.map((s) => str(s)).find((s) => s.trim().length > 0);
  if (lone !== undefined) {
    return { content: lone, activeVariantIdx: remappedActive };
  }
  return carriesMedia(asObj(extra)) ? { content: "", activeVariantIdx: remappedActive } : null;
}

/** Parse ONE message line → a `ParsedChatMessage`, or null for a corrupt line (skipped, not fatal) or a
 *  no-text-no-media debris row (see `resolvePrimary`). */
function parseMessageLine(line: string, zone: string): ParsedChatMessage | null {
  const parsed = asTyped(parseJson(line), rawMessageSchema);
  if (parsed === null) {
    return null;
  }
  const ex = extractExtra(parsed.extra);
  const role = roleOf(parsed);
  const swipes = Array.isArray(parsed.swipes) ? parsed.swipes : [];
  // swipe_id is a position in the ORIGINAL swipes array; buildVariants remaps it onto the drop-filtered pool.
  const sid = parsed.swipe_id;
  const rawActive = typeof sid === "number" && sid >= 0 && sid < swipes.length ? sid : null;
  const { variants, activeVariantIdx: remappedActive } = buildVariants({ swipes, swipeInfo: parsed.swipe_info, activeSwipeId: rawActive, role, zone });
  const primary = resolvePrimary({ mes: str(parsed.mes), variants, remappedActive, swipes, extra: parsed.extra });
  if (primary === null) {
    return null;
  }
  const { content, activeVariantIdx } = primary;
  const agentAuthor = parseAgentAuthor(parsed.agent_author);
  // `role` is resolved EARLIER (above `buildVariants`) — the swipe pool and the token in/out axis both need
  // it before the return object is built. This is the only reason it is not declared here beside its sibling.
  const originalAvatar = nullIfEmpty(str(parsed.original_avatar));
  return {
    role,
    kind: kindOf(parsed, role),
    speakerName: nullIfEmpty(str(parsed.name)),
    // Omitted (exactOptional) when the line carries none — a solo transcript declares no per-turn identity.
    ...(originalAvatar !== null ? { originalAvatar } : {}),
    content,
    sendDate: parseStDate(parsed.send_date, zone),
    model: ex.model,
    provider: ex.provider,
    ...tokenColumns(ex.tokenCount, role),
    reasoning: ex.reasoning,
    genStarted: parseStDate(parsed.gen_started, zone),
    genFinished: parseStDate(parsed.gen_finished, zone),
    ttftMs: ex.ttftMs,
    metadata: asObj(parsed.extra),
    activeVariantIdx,
    variants,
    // Present only when the export carried a valid provenance sidecar; omitted (exactOptional) otherwise.
    ...(agentAuthor !== null ? { agentAuthor } : {}),
  };
}

// UTF-8 BOM prefix (Windows exports) — stripped before line-splitting.
const BOM = /^﻿/;

/**
 * Parse one ST chat `.jsonl` → a `ParsedChat`. `fileName` (the Branch-prefix + filename-date hint) and
 * `charDirName` (the "unused"/empty `character_name` fallback) are caller context. Returns null ONLY when the
 * header line itself is unparseable. Resilient: a corrupt message line is SKIPPED, never fatal.
 */
export function parseChatJsonl(
  text: string,
  opts: { readonly fileName: string; readonly charDirName: string; readonly wallClockZone?: string },
): ParsedChat | null {
  const zone = opts.wallClockZone ?? ST_DEFAULT_WALL_CLOCK_ZONE;
  const lines = text.replace(BOM, "").trim().split("\n");
  const first = lines[0];
  if (first === undefined || first.length === 0) {
    return null;
  }
  const header = asTyped(parseJson(first), rawHeaderSchema);
  if (header === null) {
    return null;
  }

  const meta = asObj(header.chat_metadata);
  const rawCharName = str(header.character_name);
  const characterName = rawCharName.length === 0 || rawCharName === "unused" ? opts.charDirName : rawCharName;

  const messages: ParsedChatMessage[] = [];
  for (const line of lines.slice(1)) {
    const t = line.trim();
    if (t.length === 0) {
      continue;
    }
    const message = parseMessageLine(t, zone);
    if (message !== null) {
      messages.push(message);
    }
  }

  return {
    characterName,
    userName: nullIfEmpty(str(header.user_name)),
    // Filename date FIRST (survives re-save/migration), then the header create_date, then null.
    createDate: parseFilenameDate(opts.fileName, zone) ?? parseStDate(header.create_date, zone),
    // "Branch #" ANYWHERE — catches both "Branch #N - date.jsonl" AND "CharName - date - Branch #N.jsonl".
    isBranch: opts.fileName.includes("Branch #"),
    parentRef: normalizeParentRef(str(meta?.["main_chat"])) ?? deriveParentFromFilename(opts.fileName),
    notePrompt: nullIfEmpty(str(meta?.["note_prompt"])),
    notePlacement: parseNotePlacement(meta),
    variables: parseChatVariables(meta),
    bucket: classifyChat(messages),
    sourceMetadata: meta,
    messages,
  };
}

// ── build (ParsedChat → JSONL / TXT string) ──────────────────────────────────────────────────────────────
// biome-ignore-start lint/style/useNamingConvention: ST chat-JSONL wire field names (snake_case) are the format.

/**
 * Serialize a `ParsedChat` to the ST chat-JSONL interchange (the inverse of `parseChatJsonl`). One header
 * line (user/character names + create_date + the branch/note metadata), then one line per message. Swipe
 * arrays only when a message carries `>1` variant. `speakerName` is emitted as the per-line `name` (group
 * fidelity). PURE.
 */
/** The `extra.type` fragment for a row's declared kind — the BUILD half of {@link kindOf}, total over
 *  `MessageKind` so a fourth member cannot ship without deciding whether it round-trips (spine §5.5). An empty
 *  fragment means "this kind has no interchange marker", which is the honest state for `standard` (the
 *  default; a marker would be noise on every line) and for `comment` (no ST spelling — a LOSSY export edge,
 *  and per D116's one-way-honest posture it is named here rather than silently faked as something else). */
function extraTypeFor(kind: MessageKind): { readonly type?: string } {
  switch (kind) {
    case "narrator":
      return { type: ST_NARRATOR_TYPE };
    case "standard":
    case "comment":
      return {};
    default:
      return assertNeverMessageKind(kind);
  }
}

function assertNeverMessageKind(kind: never): never {
  throw new Error(`buildChatJsonl: unhandled MessageKind ${JSON.stringify(kind)}`);
}

/** The `extra` blob for one built line. Split out of {@link buildChatJsonl} purely for legibility — the line
 *  builder accreted three independently-optional fragments (reasoning, the D129 kind marker, the role-routed
 *  token count) and crossed the cognitive-complexity bar once group fidelity landed beside them. */
function buildExtra(m: ParsedChatMessage): Record<string, unknown> {
  return {
    model: m.model,
    api: m.provider,
    // ST has ONE token field and no in/out axis; the parse half routes it by role, so the build half
    // un-routes it the same way. `??` (not `+`) because exactly one side is ever non-null.
    token_count: m.tokensOut ?? m.tokensIn,
    // `reasoning` is the ST thinking-trace field; only emitted when present so a no-reasoning turn stays
    // clean and re-imports as null.
    ...(m.reasoning !== null ? { reasoning: m.reasoning } : {}),
    // The row's DECLARED purpose (D129), in ST's own `extra.type` vocabulary. Emitted ONLY for a narrator
    // row, so every standard row's line stays BYTE-IDENTICAL to what this serde built before the kind axis
    // existed (which is what keeps the round-trip drift guard and the ST golden corpus honest). `comment`
    // has no ST spelling and no writer yet — when it gains one it declares its wire form HERE, in the one
    // place both directions live, rather than as a second marker somewhere else.
    ...extraTypeFor(m.kind),
  };
}

/** The `swipes`/`swipe_id`/`swipe_info` triple, or `{}` for a single-take row (the \>1-variant gate — a lone
 *  generation lives on the line itself, never a redundant one-element pool). */
function buildSwipeFields(m: ParsedChatMessage): Record<string, unknown> {
  if (m.variants.length <= 1) {
    return {};
  }
  return {
    swipes: m.variants.map((v) => v.content),
    swipe_id: m.activeVariantIdx ?? 0,
    swipe_info: m.variants.map((v) => ({
      extra: {
        model: v.model,
        api: v.provider,
        token_count: v.tokensOut ?? v.tokensIn,
        ...(v.reasoning !== null ? { reasoning: v.reasoning } : {}),
      },
      gen_started: v.genStarted,
      gen_finished: v.genFinished,
    })),
  };
}

/** ONE serialized message line. `zone` resolves the wall-clock `send_date`; `chatCreateDate` is the fallback
 *  instant for a row that carries none. */
function buildMessageLine(m: ParsedChatMessage, chatCreateDate: number | null, zone: string): Record<string, unknown> {
  return {
    // The PER-MESSAGE speaker (group fidelity) — the voicing character / authoring persona of THIS turn,
    // resolved by the caller (export); NOT the single header `characterName`.
    name: m.speakerName,
    is_user: m.role === "user",
    is_system: m.role === "system",
    // The per-turn speaker IDENTITY (ST's own group-fidelity field). Emitted ONLY when the row carries one,
    // so a solo transcript's line stays byte-identical to what this serde built before the field existed —
    // which is also what keeps the round-trip drift guard honest (parse reads back exactly what build wrote).
    ...(m.originalAvatar !== undefined && m.originalAvatar !== null ? { original_avatar: m.originalAvatar } : {}),
    mes: m.content,
    send_date: formatStDate(m.sendDate ?? chatCreateDate, zone),
    extra: buildExtra(m),
    gen_started: m.genStarted,
    gen_finished: m.genFinished,
    // PD-17 provenance sidecar — emitted ONLY for an agent-authored row, so every human/character turn
    // stays byte-identical. NO owner id, NO soul prompt: just the agent's display name + its source kind.
    ...(m.agentAuthor !== undefined ? { agent_author: { name: m.agentAuthor.name, source_kind: m.agentAuthor.sourceKind } } : {}),
    ...buildSwipeFields(m),
  };
}

/** The author's-note placement fragment for the built header — the inverse of {@link parseNotePlacement}, in
 *  ST's own numeric vocabulary. Each knob is emitted ONLY when the chat records it, so a chat that carried
 *  none stays byte-identical to what this serde built before the knobs were parsed. */
function notePlacementFields(placement: ParsedNotePlacement | null): Record<string, number> {
  if (placement === null) {
    return {};
  }
  return {
    ...(placement.depth !== null ? { note_depth: placement.depth } : {}),
    ...(placement.position !== null ? { note_position: placement.position } : {}),
    ...(placement.role !== null ? { note_role: placement.role } : {}),
    ...(placement.interval !== null ? { note_interval: placement.interval } : {}),
  };
}

export function buildChatJsonl(chat: ParsedChat, opts: { readonly wallClockZone?: string } = {}): string {
  // The same zone the parse half resolves in — an export door that emits UTC while the import door reads a
  // local wall clock drifts a round trip by the offset, and ST (whose reader is naive/local) would render the
  // exported transcript shifted. One value, both directions.
  const zone = opts.wallClockZone ?? ST_DEFAULT_WALL_CLOCK_ZONE;
  const header = {
    user_name: chat.userName,
    character_name: chat.characterName,
    create_date: formatStDate(chat.createDate, zone),
    chat_metadata: {
      ...(chat.parentRef !== null ? { main_chat: chat.parentRef } : {}),
      ...(chat.notePrompt !== null ? { note_prompt: chat.notePrompt } : {}),
      ...notePlacementFields(chat.notePlacement),
      // The `{{setvar}}` store rides BOTH directions (the Defect-A precedent: an interchange field with a
      // seat on each side travels both ways or the round trip is lossy in one). Omitted when null, so a
      // variable-less chat's header stays byte-identical.
      ...(chat.variables !== null ? { variables: chat.variables } : {}),
    },
  };
  const lines = [JSON.stringify(header), ...chat.messages.map((m) => JSON.stringify(buildMessageLine(m, chat.createDate, zone)))];
  return `${lines.join("\n")}\n`;
}

// Speaker label for the plain-text transcript: the per-message speaker name (group fidelity), with "System"
// reserved for system turns and a "Character"/"User" floor when a name is absent.
function txtAuthor(m: ParsedChatMessage): string {
  if (m.role === "system") {
    return "System";
  }
  return m.speakerName ?? (m.role === "user" ? "User" : "Character");
}

/**
 * Serialize a `ParsedChat` to a human-readable plain-text transcript — the `txt` export format. One
 * `Author: message` block per turn, blank line between. Only the ACTIVE variant's text (`content`) is emitted
 * (a transcript shows what was said, not the re-rolls). PURE.
 */
export function buildChatTxt(chat: ParsedChat): string {
  const blocks = chat.messages.map((m) => `${txtAuthor(m)}: ${m.content}`);
  return `${blocks.join("\n\n")}\n`;
}
// biome-ignore-end lint/style/useNamingConvention: end ST wire-name block.
