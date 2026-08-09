// The one chat-JSONL serde core: the ST chat interchange grammar with both directions in one home, so
// build + parse can never drift. Pure: zero I/O, zero db, zero id-resolution — it maps `ParsedChat` (a
// name-level canonical shape) to/from the ST .jsonl string. The relational work stays out of here: export
// resolves character/persona ids → names before buildChatJsonl; import maps names → ids after
// parseChatJsonl. So the serde only ever sees speakerName/characterName/userName strings.
//
// Load-bearing esoterica (carried verbatim from the corpus study — do not re-derive):
//   • the filename date wins over the header create_date (ST re-save rewrites the header to migration time).
//   • buildVariants drops empty swipe slots + remaps the active index; `mes` is authoritative regardless.
//   • dates emit in the legacy human form (UTC, minute precision); parseStDate reads it back.
//   • swipe arrays build only when >1 variant, matching the parser's real-swipe gate.
//   • main_chat/note_prompt round-trip the branch parent filename + author's note, omitted when null.
//
// Round-trip drift guard: buildChatJsonl(parseChatJsonl(buildChatJsonl(p))) === buildChatJsonl(p).

import type { MessageKind } from "@orb/contracts/chat";
import { DEFAULT_MESSAGE_KIND } from "@orb/contracts/chat";
import type { MessageRole } from "@orb/kit/message-role";
import { epochToMs, isoToMs } from "@orb/kit/time";
import { z } from "zod";

// ── the canonical shape (NAME-level; the serde owns its wire shape, server/kit type-home-exempt) ──────────

/** RAG/analytics relevance class of a parsed chat (the `classify` output). Import EVERYTHING, but the
 *  memory-backfill (PD-78) enqueues over `real_conversation` chats ONLY. `greeting_only` = no user turn;
 *  `all_empty_msgs` = system-only rows (blank rows are stripped or swipe-promoted at parse); `header_only` = no message lines at all. */
export const CHAT_BUCKETS = ["header_only", "all_empty_msgs", "greeting_only", "real_conversation"] as const;
export type ChatBucket = (typeof CHAT_BUCKETS)[number];

/** One swipe in a message's variant pool (0-based `idx` after the empty-slot drop + re-index). `metadata` is
 *  the lossless full `swipe_info[idx]` sidecar (parse side; build ignores it — the economics ride the fields). */
export interface ParsedVariant {
  readonly idx: number;
  readonly content: string;
  readonly model: string | null;
  readonly provider: string | null;
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
// ST create_date / message dates: "2025-07-03@14h56m48s" (+ optional "989ms"), whitespace-tolerant.
const ST_AT_DATE = /(\d{4})-(\d{2})-(\d{2})\s*@\s*(\d{2})h\s*(\d{2})m\s*(\d{2})s/;
// The filename creation token — same shape, embedded in "Char - 2023-11-11@09h41m32s538ms.jsonl".
const FILENAME_DATE = /\d{4}-\d{2}-\d{2}\s*@\s*\d{2}h\d{2}m\d{2}s/;
const NOON = 12;

/** Numeric-string epoch (≥10 digits) → ms, else null. */
function parseNumericEpoch(s: string): number | null {
  if (!NUMERIC_EPOCH.test(s)) {
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? epochToMs(n) : null;
}

/** ST "2025-07-03\@14h56m48s" → ms (UTC), else null. */
function parseAtDate(s: string): number | null {
  const at = ST_AT_DATE.exec(s);
  if (!at) {
    return null;
  }
  const [, y, mo, d, h, mi, se] = at;
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se));
  return Number.isNaN(t) ? null : t;
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

/** Parse "<Month> D, YYYY H:MMam/pm" → ms (UTC), else null. */
function parseMonthWithTime(lower: string, pat: (typeof MONTH_PATTERNS)[number]): number | null {
  const withTime = pat.withTime.exec(lower);
  if (!withTime) {
    return null;
  }
  const [, d, y, hh, mm, ap] = withTime;
  const t = Date.UTC(Number(y), pat.mo - 1, Number(d), to24Hour(Number(hh), String(ap)), Number(mm));
  return Number.isNaN(t) ? null : t;
}

/** Parse the date-only "<Month> D, YYYY" → ms (UTC, midnight), else null. */
function parseMonthDateOnly(lower: string, pat: (typeof MONTH_PATTERNS)[number]): number | null {
  const dateOnly = pat.dateOnly.exec(lower);
  if (!dateOnly) {
    return null;
  }
  const [, d, y] = dateOnly;
  const t = Date.UTC(Number(y), pat.mo - 1, Number(d));
  return Number.isNaN(t) ? null : t;
}

/** "August 27, 2025 6:36pm" (with or without the time) → ms (UTC), else null. Once a month NAME is found, this
 *  commits to the human form (the neo `break`): a parse miss returns null. */
function parseHumanDate(lower: string): number | null {
  for (const pat of MONTH_PATTERNS) {
    if (lower.includes(pat.name)) {
      return parseMonthWithTime(lower, pat) ?? parseMonthDateOnly(lower, pat);
    }
  }
  return null;
}

/** Parse ST's many date encodings → epoch ms (UTC). Numeric epoch (number OR ≥10-digit string) · ISO 8601 ·
 *  ST "2025-07-03\@14h56m48s[989ms]" · "August 27, 2025 6:36pm". ALL formats interpreted as UTC (the shared
 *  `@orb/kit/time` parsers / `Date.UTC`) — one canonical instant, no server-tz drift. */
export function parseStDate(v: unknown): number | null {
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
  return parseNumericEpoch(s) ?? iso ?? parseAtDate(s) ?? parseHumanDate(s.toLowerCase());
}

const NOON_HOUR = 12;

/** Format an epoch-ms instant as ST's human send_date string, UTC (MINUTE precision). e.g. "August 27, 2025
 *  6:36pm". The inverse `parseStDate` reads it back (minute-aligned instants round-trip byte-identically). */
export function formatStDate(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) {
    return null;
  }
  const d = new Date(ms);
  const month = ST_MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const hour24 = d.getUTCHours();
  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  const ap = hour24 >= NOON_HOUR ? "pm" : "am";
  const hour12 = hour24 % NOON_HOUR === 0 ? NOON_HOUR : hour24 % NOON_HOUR;
  return `${month} ${day}, ${year} ${hour12}:${minute}${ap}`;
}

/** ST encodes a chat's creation timestamp in its FILENAME — the most reliable ORIGINAL-creation signal
 *  (re-saving rewrites the header + every `send_date`; the filename token survives). Null when absent. */
function parseFilenameDate(fileName: string): number | null {
  const m = FILENAME_DATE.exec(fileName);
  return m ? parseStDate(m[0]) : null;
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

function extractExtra(extra: unknown): {
  model: string | null;
  provider: string | null;
  tokensOut: number | null;
  reasoning: string | null;
  ttftMs: number | null;
} {
  const e = asTyped(extra, rawExtraSchema);
  const tc = e ? Number(e.token_count) : Number.NaN;
  const ttft = e ? Number(e.time_to_first_token) : Number.NaN;
  return {
    model: nullIfEmpty(str(e?.model)),
    provider: nullIfEmpty(str(e?.api)),
    tokensOut: Number.isFinite(tc) && tc > 0 ? tc : null,
    reasoning: nullIfEmpty(str(e?.reasoning)),
    ttftMs: Number.isFinite(ttft) && ttft >= 0 ? Math.round(ttft) : null,
  };
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

// Fewer than this many SURVIVING swipes ⇒ no real alternates (the lone generation lives on the message's
// primary variant, not a redundant one-element pool).
const MIN_REAL_SWIPES = 2;

/** Build the variant pool from a message's `swipes[]` + parallel `swipe_info[]`, DROPPING genuinely-empty
 *  swipe slots and remapping the active index onto what survives (esoterica 3). `mes` (the rendered content)
 *  is authoritative regardless — an active slot that was itself empty simply yields `activeVariantIdx: null`. */
function buildVariants(swipes: unknown[], swipeInfo: unknown, activeSwipeId: number | null): { variants: ParsedVariant[]; activeVariantIdx: number | null } {
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
      tokensOut: ex.tokensOut,
      reasoning: ex.reasoning,
      genStarted: si ? parseStDate(si.gen_started) : null,
      genFinished: si ? parseStDate(si.gen_finished) : null,
      metadata: asObj(s.si),
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
function parseMessageLine(line: string): ParsedChatMessage | null {
  const parsed = asTyped(parseJson(line), rawMessageSchema);
  if (parsed === null) {
    return null;
  }
  const ex = extractExtra(parsed.extra);
  const swipes = Array.isArray(parsed.swipes) ? parsed.swipes : [];
  // swipe_id is a position in the ORIGINAL swipes array; buildVariants remaps it onto the drop-filtered pool.
  const sid = parsed.swipe_id;
  const rawActive = typeof sid === "number" && sid >= 0 && sid < swipes.length ? sid : null;
  const { variants, activeVariantIdx: remappedActive } = buildVariants(swipes, parsed.swipe_info, rawActive);
  const primary = resolvePrimary({ mes: str(parsed.mes), variants, remappedActive, swipes, extra: parsed.extra });
  if (primary === null) {
    return null;
  }
  const { content, activeVariantIdx } = primary;
  const agentAuthor = parseAgentAuthor(parsed.agent_author);
  const role = roleOf(parsed);
  const originalAvatar = nullIfEmpty(str(parsed.original_avatar));
  return {
    role,
    kind: kindOf(parsed, role),
    speakerName: nullIfEmpty(str(parsed.name)),
    // Omitted (exactOptional) when the line carries none — a solo transcript declares no per-turn identity.
    ...(originalAvatar !== null ? { originalAvatar } : {}),
    content,
    sendDate: parseStDate(parsed.send_date),
    model: ex.model,
    provider: ex.provider,
    tokensOut: ex.tokensOut,
    reasoning: ex.reasoning,
    genStarted: parseStDate(parsed.gen_started),
    genFinished: parseStDate(parsed.gen_finished),
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
export function parseChatJsonl(text: string, opts: { readonly fileName: string; readonly charDirName: string }): ParsedChat | null {
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
    const message = parseMessageLine(t);
    if (message !== null) {
      messages.push(message);
    }
  }

  return {
    characterName,
    userName: nullIfEmpty(str(header.user_name)),
    // Filename date FIRST (survives re-save/migration), then the header create_date, then null.
    createDate: parseFilenameDate(opts.fileName) ?? parseStDate(header.create_date),
    // "Branch #" ANYWHERE — catches both "Branch #N - date.jsonl" AND "CharName - date - Branch #N.jsonl".
    isBranch: opts.fileName.includes("Branch #"),
    parentRef: normalizeParentRef(str(meta?.["main_chat"])) ?? deriveParentFromFilename(opts.fileName),
    notePrompt: nullIfEmpty(str(meta?.["note_prompt"])),
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

export function buildChatJsonl(chat: ParsedChat): string {
  const header = {
    user_name: chat.userName,
    character_name: chat.characterName,
    create_date: formatStDate(chat.createDate),
    chat_metadata: {
      ...(chat.parentRef !== null ? { main_chat: chat.parentRef } : {}),
      ...(chat.notePrompt !== null ? { note_prompt: chat.notePrompt } : {}),
    },
  };

  const lines = [JSON.stringify(header)];
  for (const m of chat.messages) {
    const hasVariants = m.variants.length > 1;
    const line = {
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
      send_date: formatStDate(m.sendDate ?? chat.createDate),
      // `reasoning` is the ST thinking-trace field; only emitted when present so a no-reasoning turn stays
      // clean and re-imports as null.
      extra: {
        model: m.model,
        api: m.provider,
        token_count: m.tokensOut,
        ...(m.reasoning !== null ? { reasoning: m.reasoning } : {}),
        // The row's DECLARED purpose (D129), in ST's own `extra.type` vocabulary. Emitted ONLY for a narrator
        // row, so every standard row's line stays BYTE-IDENTICAL to what this serde built before the kind axis
        // existed (which is what keeps the round-trip drift guard and the ST golden corpus honest). `comment`
        // has no ST spelling and no writer yet — when it gains one it declares its wire form HERE, in the one
        // place both directions live, rather than as a second marker somewhere else.
        ...extraTypeFor(m.kind),
      },
      gen_started: m.genStarted,
      gen_finished: m.genFinished,
      // PD-17 provenance sidecar — emitted ONLY for an agent-authored row, so every human/character turn
      // stays byte-identical. NO owner id, NO soul prompt: just the agent's display name + its source kind.
      ...(m.agentAuthor !== undefined ? { agent_author: { name: m.agentAuthor.name, source_kind: m.agentAuthor.sourceKind } } : {}),
      ...(hasVariants
        ? {
            swipes: m.variants.map((v) => v.content),
            swipe_id: m.activeVariantIdx ?? 0,
            swipe_info: m.variants.map((v) => ({
              extra: {
                model: v.model,
                api: v.provider,
                token_count: v.tokensOut,
                ...(v.reasoning !== null ? { reasoning: v.reasoning } : {}),
              },
              gen_started: v.genStarted,
              gen_finished: v.genFinished,
            })),
          }
        : {}),
    };
    lines.push(JSON.stringify(line));
  }
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
