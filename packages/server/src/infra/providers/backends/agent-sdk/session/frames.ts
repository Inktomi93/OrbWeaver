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

/** Extract a frame's first text-block content (the comparison key for staleness). */
function frameText(entry: SessionStoreEntry): string {
  const message = (entry as { message?: { content?: Array<{ type?: string; text?: string }> } })
    .message;
  const block = message?.content?.find((b) => b.type === "text");
  return block?.text ?? "";
}

/**
 * Reseed-when-stale comparator: do the freshly-rebuilt seed frames differ from what the store already
 * holds for this session? Because {@link buildSeedFrames} is deterministic, equal canon → identical
 * frames → not stale (the prompt cache survives). A length/uuid/text mismatch means canon moved under the
 * session and the caller must rebuild. Pure — no I/O.
 */
export function seedFramesAreStale(
  existing: readonly SessionStoreEntry[],
  rebuilt: readonly SessionStoreEntry[],
): boolean {
  if (existing.length !== rebuilt.length) {
    return true;
  }
  return existing.some((entry, i) => {
    const other = rebuilt[i];
    return (
      other === undefined || entry.uuid !== other.uuid || frameText(entry) !== frameText(other)
    );
  });
}
