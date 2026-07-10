// infra/providers/backends/agent-sdk/session/frames — SEED-FRAME SYNTHESIS (the load-bearing shape) +
// the reseed-when-stale comparator. Synthesizes SDK `SessionStore` frames from plain canon (role + text)
// so a FRESH session resumes coherently — for the canon-seeding paths (raw→sdk continuation, import,
// cold-cache recovery) where we hold the transcript but none of the SDK's runtime bookkeeping.
//
// THE SHAPE IS EMPIRICALLY VALIDATED (providers.md Esoteric §3; neo `seed-probe` against the live sub):
//   • bare frames (type/uuid/parentUuid/message) → SDK rejects: "No conversation found".
//   • + per-frame metadata (sessionId/isSidechain/cwd/version/userType + promptId/requestId/timestamp)
//     → RESUMES + recalls a seeded fact ✓  ← the load-bearing bundle.
//   • an ASSISTANT-FIRST seed (a greeting with no preceding user turn) does NOT resume (the model won't
//     own a message it has no memory of generating) → a synthetic user stub is prefixed so the session
//     always starts user-first.
// Determinism: ids + timestamps derive from `sessionId` + frame index (NOT randomUUID / Date.now), so the
// SAME canon under the SAME sessionId yields BYTE-IDENTICAL frames → the agent-sdk prompt cache survives a
// reseed (random per-seed values were a cache-buster). If the SDK is upgraded, re-run the probe.
//
// NOTE (orbweaver vs neo): neo also stamped `authorName` + ran a `prefixNames` load-time pass to label
// multi-character turns. Orbweaver does NOT — each participant owns an egocentric view the view-builder
// renders BEFORE the prompt reaches this backend (participants-agents-identity.md §0/§5), so seed frames
// carry plain pre-rendered text. The name-stamping quartet is deliberately gone, not forgotten.

import { createHash } from "node:crypto";
import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk";
import { AGENT_PROMPT_TAIL_JOINER } from "../../../contract";

/** One canon turn to seed (already macro-resolved + view-rendered by the domain). */
export interface SeedTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
  /** The model that produced an assistant turn (provenance only — not load-bearing for resume). */
  readonly model?: string | null;
}

/**
 * The "invisible user" stub. A greeting is an assistant opening with NO preceding user turn, but a
 * session must start user-first to resume cleanly, so this SESSION-ONLY stub is prefixed → the validated
 * user→assistant shape. It is NEVER persisted to canon (the UI never shows it); it only frames the
 * greeting so the model owns it on resume.
 */
export const GREETING_USER_STUB = "*The scene begins.*";

const SEED_VERSION = "2.0.0";
const SEED_CWD = "/";
// Fixed base for deterministic frame timestamps (epoch ms). The SDK needs only a present, monotonically
// ordered ISO timestamp per frame to resume — not a real wall-clock time. `new Date(ms)` parses a known
// value (allowed by the clock gate); the constant base + per-frame offset keeps reseeds byte-identical.
const SEED_TS_BASE_MS = 1_704_067_200_000; // 2024-01-01T00:00:00.000Z
const SEED_TS_STEP_MS = 1000;
/** Provenance placeholder on an assistant seed frame when the canon turn carries no model (resume does
 *  not depend on this value — only the validated metadata bundle does). */
const SEED_FALLBACK_MODEL = "claude";

// Hash-slice offsets for the uuid-v4-shaped deterministic id (named per noMagicNumbers).
const HEX_8 = 8;
const HEX_12 = 12;
const HEX_13 = 13;
const HEX_16 = 16;
const HEX_17 = 17;
const HEX_20 = 20;
const HEX_32 = 32;

/** Deterministic uuid-v4-SHAPED id from a stable seed string (replaces randomUUID so rebuilds are
 *  reproducible). Not cryptographically meaningful — just a stable, valid-shaped id. */
function deterministicId(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, HEX_8)}-${h.slice(HEX_8, HEX_12)}-4${h.slice(HEX_13, HEX_16)}-8${h.slice(HEX_17, HEX_20)}-${h.slice(HEX_20, HEX_32)}`;
}

/**
 * Convert canon rows → the `SeedTurn[]` {@link buildSeedFrames} consumes: keep user/assistant turns (a
 * system row rides in the assembled system prompt, not the transcript), then prefix a {@link
 * GREETING_USER_STUB} user turn when the first kept turn is an assistant (the SDK's resume needs the
 * user→assistant pairing). Empty when no user/assistant rows survive.
 */
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

/** Inputs to a single seed-frame build (one object so the param count stays in bounds). */
interface FrameArgs {
  readonly turn: SeedTurn;
  readonly index: number;
  readonly sessionId: string;
  readonly parentUuid: string | null;
  readonly common: Record<string, unknown>;
}

/** Build a single seed frame (user or assistant) — the validated content-block shape. */
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

/**
 * Build the SDK session frames for `canon` under `sessionId` (which MUST be a valid uuidv4 — the SDK
 * rejects arbitrary resume ids). Frames chain via `parentUuid`; every frame carries `sessionId` + the
 * validated metadata bundle. The caller persists them (`SessionStore.append`) under the same sessionId.
 */
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

/** Extract a frame's text content (the comparison key for the transcript↔seed match). Handles BOTH
 *  content shapes a stored frame can carry: our synthesized block arrays AND the SDK's own appended
 *  frames, whose `message.content` may be a plain string. Joins every text block (an assistant frame
 *  can carry [thinking, text] — thinking is excluded from the comparison on purpose: seeds never have
 *  it, and the model-visible transcript identity is the prose). */
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

/** One merged role-run of a transcript — the comparison unit for {@link sessionMatchesSeed}. */
interface TranscriptRun {
  readonly role: "user" | "assistant";
  readonly text: string;
}

/** Reduce transcript-shaped rows (role + text) into merged role-RUNS: consecutive same-role rows fold
 *  into one. This is what makes the comparator robust to (a) the SDK splitting ONE logical assistant
 *  reply across several stored frames (per content block — contiguous text, joined with "") and (b) a
 *  multi-row prompt tail stored as ONE joined user frame (joined with the contract's
 *  {@link AGENT_PROMPT_TAIL_JOINER} — the same joiner the entry bridge sends). Empty texts are dropped
 *  before joining so they can't skew separators. */
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
    // TRIMMED: the runner trims the reply before it reaches canon, while the session's mirrored frame
    // keeps the model's raw trailing whitespace — an untrimmed compare would false-diverge (and reseed)
    // on every turn the model emits a trailing newline.
    text: r.parts
      .filter((p) => p.length > 0)
      .join(r.role === "user" ? AGENT_PROMPT_TAIL_JOINER : "")
      .trim(),
  }));
}

/** A stored entry's transcript row, or null for non-transcript frames (system/summary/meta — the SDK
 *  appends bookkeeping frames our seed never contains; they are identity-neutral). */
function entryRow(entry: SessionStoreEntry): { role: "user" | "assistant"; text: string } | null {
  const kind = (entry as { type?: unknown }).type;
  if (kind !== "user" && kind !== "assistant") {
    return null;
  }
  // Meta frames (caveats, command echoes) are runtime bookkeeping, not conversation identity.
  if ((entry as { isMeta?: boolean }).isMeta === true) {
    return null;
  }
  return { role: kind, text: frameText(entry) };
}

/** Reduce a stored session's entries to merged transcript role-runs (the shared normalization the resume
 *  gate + the branch detector compare on). Non-transcript / meta frames drop out. */
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

/**
 * Does the stored session transcript still MATCH the freshly-rendered seed? The resume gate: a match
 * means the session's model-visible history equals what the domain says the model should see, so the
 * runner resumes it (prompt-cache survival); a mismatch (edit/swipe/window-slide/injection shift) means
 * the caller must reseed a FRESH session. Compared as merged role-runs of text (robust to the SDK's
 * per-block frame splits and its non-transcript bookkeeping frames). EXACT match required — a session
 * holding MORE than the seed (e.g. the rejected reply of a swipe) must NOT be resumed. Pure — no I/O.
 */
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

/**
 * Is the freshly-rendered seed a full LEADING PREFIX of the stored session's transcript — i.e. does the
 * stored lineage hold EXACTLY the seed (the {@link sessionMatchesSeed} case) OR the seed followed by MORE
 * turns the SDK appended live (a grown superset)? Compared on the same merged role-runs. This is the
 * re-adoption gate the deterministic candidate-id probe uses: after a turn runs, the live subprocess
 * APPENDS its own user+assistant frames to the lineage, so a swipe-back that re-derives that lineage's id
 * finds it GROWN past the pre-turn seed — an exact-only compare would false-diverge and re-fork (probe s9,
 * 2026-07-10: A→B→A re-forked instead of re-adopting). A seed that is a clean leading prefix means the
 * lineage is the same conversation the seed describes; adopting it is safe (the extra tail is that same
 * conversation's own continuation, which the next turn will resume against). Pure — no I/O.
 */
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

/**
 * Is the DIVERGENCE between a stored session and the new seed a BRANCH — i.e. do they share a non-trivial
 * common prefix and THEN diverge (a swipe / edit), as opposed to an unrelated / window-slid transcript
 * that shares nothing to preserve? Compared on the same merged role-runs as {@link sessionMatchesSeed}.
 *
 * "Non-trivial" = at least one FULLY-equal leading role-run in common — so an assistant-first greeting's
 * lone user stub, or a coincidental first-word match, does not by itself class as a branch. The caller uses
 * this to choose FORK (preserve the stored lineage; seed the branch under its own deterministic id so a
 * later swipe-back re-adopts the original) over destructive in-place reseed. Assumes the two already
 * diverged (the caller checks {@link sessionMatchesSeed} first); an exact match still reports its shared
 * prefix truthfully but is not a divergence.
 */
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

/** Deterministic, uuid-v4-shaped session id for a chat's seed state (+ a collision `salt` — the caller
 *  bumps it when the store already holds a DIVERGED transcript under the unsalted id, e.g. a reverted
 *  edit landing back on a previously-used canon state). Same chat + same seed + same salt → the same id,
 *  so a reseed of unchanged canon yields byte-identical frames under the same session (cache survival). */
export function seedSessionId(chatId: string, seed: readonly SeedTurn[], salt = 0): string {
  const body = seed.map((t) => `${t.role}\u0001${t.content}`).join("\u0002");
  return deterministicId(`${chatId}\u0000${salt}\u0000${body}`);
}
