// domain/import/substrate/chat — the ST chat-JSONL parser (PD-77). PURE: one file's text in → a `ParsedChat`
// out (or null when the HEADER line itself is unparseable), same null-on-unparseable contract as
// `substrate/card.ts`. No DB, no fs, no clock. The cross-file branch-TREE reconstruction is NOT here (it
// needs all of a character's chats at once — that is the chat-writer's pass-2); this maps ONE file.
//
// JSONL layout: line 0 = header `{user_name, character_name, create_date, chat_metadata}`; lines 1+ =
// messages `{name, is_user, is_system, mes, send_date, extra, swipes, swipe_id, swipe_info, gen_started,
// gen_finished}`. Resilient: a corrupt message line is SKIPPED (partial writes / docker-cp truncation
// happen), never fatal.
//
// THE LOAD-BEARING ESOTERICA (carried verbatim from the corpus study — `import-st-profile-waves.md` §"Chat
// parser esoterica"; do NOT re-derive):
//   1. `parseStDate` — the FILENAME date WINS. ST re-save/migration rewrites the header `create_date` AND
//      every message `send_date` to the migration time; the chat's TRUE creation date survives ONLY in the
//      filename token. Filename FIRST, then header, then null.
//   3. `buildVariants` DROPS empty swipe slots + remaps the active index (aborted generations leave empty
//      strings mid-pool; `mes` is authoritative regardless).
// (esoterica 2 — `updatedAt = Math.max(send_dates)` — is the CHAT WRITER's; 4/5 — dedup + the bucket gate —
// are the writer's / PD-78's.)

import type { MessageRole } from "@orb/kit/message-role";
import { epochToMs, isoToMs } from "@orb/kit/time";
import { z } from "zod";
import type { ChatBucket, ParsedChat, ParsedChatMessage, ParsedVariant } from "../contract/views";

// File-local pure-string helpers (the substrate stays dependency-free; same shape as substrate/card.ts).
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function nullIfEmpty(s: string): string | null {
  return s.trim().length > 0 ? s : null;
}
function asObj(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

// Permissive typed views over ST's external JSON (snake_case by spec). Each field is `unknown` and every
// consuming helper coerces (str/parseStDate/Number) + guards, so the schemas VALIDATE the object SHAPE (is
// this a record at all?) — replacing blind casts — not reject fields. `.loose()` keeps unmodelled keys; a
// non-object fails `safeParse` → null (skip/abort).
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
  })
  .partial()
  .loose();

const rawSwipeInfoSchema = z
  .object({ extra: z.unknown(), gen_started: z.unknown(), gen_finished: z.unknown() })
  .partial()
  .loose();

const rawMessageSchema = z
  .object({
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

// Precompiled per-month human-date patterns (with-time + date-only). Precompiling both avoids rebuilding a
// RegExp per parse AND keeps the `.exec` result properly nullable-typed for the parsers below.
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
  const t = Date.UTC(
    Number(y),
    pat.mo - 1,
    Number(d),
    to24Hour(Number(hh), String(ap)),
    Number(mm),
  );
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

/** "August 27, 2025 6:36pm" (with or without the time) → ms (UTC), else null. Once a month NAME is found in
 *  the string, this commits to the human form (the neo `break`): a parse miss returns null. */
function parseHumanDate(lower: string): number | null {
  for (const pat of MONTH_PATTERNS) {
    if (lower.includes(pat.name)) {
      return parseMonthWithTime(lower, pat) ?? parseMonthDateOnly(lower, pat);
    }
  }
  return null;
}

/** Parse ST's many date encodings → epoch ms (UTC). Numeric epoch (number OR ≥10-digit string) · ISO 8601 ·
 *  ST "2025-07-03\@14h56m48s[989ms]" · "August 27, 2025 6:36pm". ALL formats are interpreted as UTC (the
 *  shared `@orb/kit/time` parsers / `Date.UTC`) — one canonical instant, no server-tz drift; the client
 *  renders in the viewer's zone. */
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

/** ST encodes a chat's creation timestamp in its FILENAME. This is the most reliable ORIGINAL-creation
 *  signal — re-saving/migrating a chat into a new ST instance rewrites the header `create_date` AND every
 *  `send_date` to the migration time (verified in the real corpus), but the filename token survives. Null
 *  when the name has no date token. */
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

function roleOf(m: RawMessage): MessageRole {
  if (m.is_system === true) {
    return "system";
  }
  return m.is_user === true ? "user" : "assistant";
}

// Fewer than this many SURVIVING swipes ⇒ no real alternates (the lone generation lives on the message's
// primary variant, not a redundant one-element pool).
const MIN_REAL_SWIPES = 2;

/** Build the variant pool from a message's `swipes[]` + parallel `swipe_info[]`, DROPPING genuinely-empty
 *  swipe slots and remapping the active index onto what survives (esoterica 3). Real ST corpora leave empty
 *  strings IN the pool (aborted/cleared generations); persisting them would write empty
 *  `message_variants.content` rows. We drop + re-index 0..k, then map `activeSwipeId` (a position in the
 *  ORIGINAL array) onto the filtered pool. `mes` (the rendered content) is authoritative regardless — an
 *  active slot that was itself empty simply yields `activeVariantIdx: null`. */
function buildVariants(
  swipes: unknown[],
  swipeInfo: unknown,
  activeSwipeId: number | null,
): { variants: ParsedVariant[]; activeVariantIdx: number | null } {
  const info = Array.isArray(swipeInfo) ? swipeInfo : [];
  const kept = swipes
    .map((content, originIdx) => ({ content: str(content), originIdx, si: info[originIdx] }))
    .filter((s) => s.content.trim().length > 0);
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
 *  (PD-78). `greeting_only` = no user turn; `all_empty_msgs` = only system/blank; `header_only` = no
 *  message lines. */
function classify(messages: ParsedChatMessage[]): ChatBucket {
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

/** Parse ONE message line → a `ParsedChatMessage`, or null for a corrupt line (skipped, not fatal). */
function parseMessageLine(line: string): ParsedChatMessage | null {
  const parsed = asTyped(parseJson(line), rawMessageSchema);
  if (parsed === null) {
    return null;
  }
  const ex = extractExtra(parsed.extra);
  const swipes = Array.isArray(parsed.swipes) ? parsed.swipes : [];
  // swipe_id is a position in the ORIGINAL swipes array; buildVariants remaps it onto the drop-filtered
  // pool (and decides whether ≥2 real alternates even exist).
  const sid = parsed.swipe_id;
  const rawActive = typeof sid === "number" && sid >= 0 && sid < swipes.length ? sid : null;
  const { variants, activeVariantIdx } = buildVariants(swipes, parsed.swipe_info, rawActive);
  return {
    role: roleOf(parsed),
    content: str(parsed.mes),
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
  };
}

// UTF-8 BOM prefix (Windows exports) — stripped before line-splitting.
const BOM = /^﻿/;

/**
 * Parse one ST chat `.jsonl`. `fileName` (the Branch-prefix + filename-date hint) and `charDirName` (the
 * "unused"/empty `character_name` fallback) are import context the caller supplies. Returns null ONLY when
 * the header line itself is unparseable.
 */
export function parseChatJsonl(
  text: string,
  opts: { readonly fileName: string; readonly charDirName: string },
): ParsedChat | null {
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
  const characterName =
    rawCharName.length === 0 || rawCharName === "unused" ? opts.charDirName : rawCharName;

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
    parentRef:
      normalizeParentRef(str(meta?.["main_chat"])) ?? deriveParentFromFilename(opts.fileName),
    notePrompt: nullIfEmpty(str(meta?.["note_prompt"])),
    bucket: classify(messages),
    sourceMetadata: meta,
    messages,
  };
}
