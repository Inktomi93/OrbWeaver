// Seed-frame synthesis + the reseed-when-stale comparator. Synthesizes SDK SessionStore frames from plain
// canon (role + text) so a fresh session resumes coherently; bare frames get SDK-rejected, the full
// metadata bundle resumes. Ids + timestamps derive from sessionId + frame index (never randomUUID/Date.now).

import { createHash } from "node:crypto";
import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk";
import { AGENT_PROMPT_TAIL_JOINER } from "../../../contract";

export interface SeedTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly model?: string | null;
}

// Session-only stub, never persisted to canon: a greeting has no preceding user turn, but a session must
// start user-first to resume cleanly.
export const GREETING_USER_STUB = "*The scene begins.*";

const SEED_VERSION = "2.0.0";
const SEED_CWD = "/";
// The SDK needs only a present, monotonically ordered ISO timestamp per frame — not real wall-clock time.
const SEED_TS_BASE_MS = 1_704_067_200_000; // 2024-01-01T00:00:00.000Z
const SEED_TS_STEP_MS = 1000;
const SEED_FALLBACK_MODEL = "claude";

const HEX_8 = 8;
const HEX_12 = 12;
const HEX_13 = 13;
const HEX_16 = 16;
const HEX_17 = 17;
const HEX_20 = 20;
const HEX_32 = 32;

function deterministicId(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, HEX_8)}-${h.slice(HEX_8, HEX_12)}-4${h.slice(HEX_13, HEX_16)}-8${h.slice(HEX_17, HEX_20)}-${h.slice(HEX_20, HEX_32)}`;
}

export function toSeedTurns(
  canon: readonly { role: string; content: string; model?: string | null }[],
): SeedTurn[] {
  const kept: SeedTurn[] = [];
  for (const m of canon) {
    if (m.role === "user" || m.role === "assistant") {
      kept.push({ role: m.role, content: m.content, model: m.model ?? null });
    }
  }
  if (kept.length === 0) {
    return [];
  }
  return kept[0]?.role === "assistant"
    ? [{ role: "user", content: GREETING_USER_STUB }, ...kept]
    : kept;
}

interface FrameArgs {
  readonly turn: SeedTurn;
  readonly index: number;
  readonly sessionId: string;
  readonly parentUuid: string | null;
  readonly common: Record<string, unknown>;
}

function buildFrame(args: FrameArgs): SessionStoreEntry {
  const { turn, index, sessionId, parentUuid, common } = args;
  const uuid = deterministicId(`${sessionId}:frame:${index}`);
  const timestamp = new Date(SEED_TS_BASE_MS + index * SEED_TS_STEP_MS).toISOString();
  if (turn.role === "user") {
    return {
      type: "user",
      uuid,
      parentUuid,
      promptId: deterministicId(`${sessionId}:prompt:${index}`),
      timestamp,
      ...common,
      message: { role: "user", content: [{ type: "text", text: turn.content }] },
    };
  }
  return {
    type: "assistant",
    uuid,
    parentUuid,
    requestId: `req_seed_${index}`,
    timestamp,
    ...common,
    message: {
      role: "assistant",
      model: turn.model ?? SEED_FALLBACK_MODEL,
      id: `msg_seed_${index}`,
      type: "message",
      content: [{ type: "text", text: turn.content }],
      stop_reason: "end_turn",
    },
  };
}

// sessionId must be a valid uuidv4 — the SDK rejects arbitrary resume ids.
export function buildSeedFrames(
  canon: readonly SeedTurn[],
  sessionId: string,
): SessionStoreEntry[] {
  const common = {
    isSidechain: false,
    cwd: SEED_CWD,
    version: SEED_VERSION,
    sessionId,
    userType: "external",
  };
  const frames: SessionStoreEntry[] = [];
  let parentUuid: string | null = null;
  canon.forEach((turn, index) => {
    const frame = buildFrame({ turn, index, sessionId, parentUuid, common });
    frames.push(frame);
    parentUuid = typeof frame.uuid === "string" ? frame.uuid : null;
  });
  return frames;
}

// Handles both content shapes a stored frame can carry: our synthesized block arrays and the SDK's own
// appended frames, whose message.content may be a plain string. Thinking blocks are excluded on purpose.
function frameText(entry: SessionStoreEntry): string {
  const message = (
    entry as { message?: { content?: string | Array<{ type?: string; text?: string }> } }
  ).message;
  const content = message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

interface TranscriptRun {
  readonly role: "user" | "assistant";
  readonly text: string;
}

// Consecutive same-role rows fold into one run — robust to the SDK splitting one assistant reply across
// several stored frames, and to a multi-row prompt tail stored as one joined user frame.
function mergeRuns(rows: readonly { role: "user" | "assistant"; text: string }[]): TranscriptRun[] {
  const runs: { role: "user" | "assistant"; parts: string[] }[] = [];
  for (const row of rows) {
    const last = runs.at(-1);
    if (last !== undefined && last.role === row.role) {
      last.parts.push(row.text);
    } else {
      runs.push({ role: row.role, parts: [row.text] });
    }
  }
  return runs.map((r) => ({
    role: r.role,
    // Trimmed: the runner trims the reply before canon, but the session's mirrored frame keeps raw trailing whitespace.
    text: r.parts
      .filter((p) => p.length > 0)
      .join(r.role === "user" ? AGENT_PROMPT_TAIL_JOINER : "")
      .trim(),
  }));
}

function entryRow(entry: SessionStoreEntry): { role: "user" | "assistant"; text: string } | null {
  const kind = (entry as { type?: unknown }).type;
  if (kind !== "user" && kind !== "assistant") {
    return null;
  }
  if ((entry as { isMeta?: boolean }).isMeta === true) {
    return null;
  }
  return { role: kind, text: frameText(entry) };
}

function sessionRuns(entries: readonly SessionStoreEntry[]): TranscriptRun[] {
  const rows: { role: "user" | "assistant"; text: string }[] = [];
  for (const entry of entries) {
    const row = entryRow(entry);
    if (row !== null) {
      rows.push(row);
    }
  }
  return mergeRuns(rows);
}

// The resume gate: exact match required — a session holding MORE than the seed (e.g. a swipe's rejected reply) must NOT be resumed.
export function sessionMatchesSeed(
  entries: readonly SessionStoreEntry[],
  seed: readonly SeedTurn[],
): boolean {
  const stored = sessionRuns(entries);
  const seedR = mergeRuns(seed.map((t) => ({ role: t.role, text: t.content })));
  if (stored.length !== seedR.length) {
    return false;
  }
  return stored.every((run, i) => {
    const other = seedR[i];
    return other !== undefined && run.role === other.role && run.text === other.text;
  });
}

// Is the seed a leading prefix of the stored transcript (exact match, or the seed plus turns the SDK
// appended live)? The re-adoption gate: after a turn runs the subprocess appends its own frames, so a
// swipe-back finds the lineage grown past the pre-turn seed — an exact-only compare would false-diverge and re-fork.
export function sessionContainsSeedPrefix(
  entries: readonly SessionStoreEntry[],
  seed: readonly SeedTurn[],
): boolean {
  const stored = sessionRuns(entries);
  const seedR = mergeRuns(seed.map((t) => ({ role: t.role, text: t.content })));
  if (seedR.length === 0 || stored.length < seedR.length) {
    return false;
  }
  return seedR.every((run, i) => {
    const other = stored[i];
    return other !== undefined && run.role === other.role && run.text === other.text;
  });
}

// A branch shares a non-trivial common prefix then diverges (swipe/edit), vs. an unrelated/window-slid
// transcript sharing nothing. "Non-trivial" = at least one fully-equal leading role-run in common.
export function isBranchDivergence(
  entries: readonly SessionStoreEntry[],
  seed: readonly SeedTurn[],
): boolean {
  const stored = sessionRuns(entries);
  const seedR = mergeRuns(seed.map((t) => ({ role: t.role, text: t.content })));
  const limit = Math.min(stored.length, seedR.length);
  let shared = 0;
  for (let i = 0; i < limit; i++) {
    const a = stored[i];
    const b = seedR[i];
    if (a === undefined || b === undefined || a.role !== b.role || a.text !== b.text) {
      break;
    }
    shared += 1;
  }
  return shared >= 1;
}

export function seedSessionId(chatId: string, seed: readonly SeedTurn[], salt = 0): string {
  const body = seed.map((t) => `${t.role}\u0001${t.content}`).join("\u0002");
  return deterministicId(`${chatId}\u0000${salt}\u0000${body}`);
}
