// Seed-frame synthesis + the reseed-when-stale comparator. Synthesizes SDK SessionStore frames from plain
// canon (role + text) so a fresh session resumes coherently; bare frames get SDK-rejected, the full
// metadata bundle resumes. Ids + timestamps derive from sessionId + frame index (never randomUUID/Date.now).

import { createHash } from "node:crypto";
import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk";
import type { ChatId } from "@orb/kit/ids";
import type { AgentSeedBlock, AgentSeedTurn } from "../../../contract/chat.ts";
import { AGENT_PROMPT_TAIL_JOINER } from "../../../contract/chat.ts";

/** The contract's seed turn plus the assistant model this frame should claim — EXTENDED, never re-spelled, so
 *  the two cannot drift into different content vocabularies. */
export interface SeedTurn extends AgentSeedTurn {
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

export function toSeedTurns(canon: readonly { role: string; content: readonly AgentSeedBlock[]; model?: string | null }[]): SeedTurn[] {
  const kept: SeedTurn[] = [];
  for (const m of canon) {
    if (m.role === "user" || m.role === "assistant") {
      kept.push({ role: m.role, content: m.content, model: m.model ?? null });
    }
  }
  if (kept.length === 0) {
    return [];
  }
  return kept[0]?.role === "assistant" ? [{ role: "user", content: [{ type: "text", text: GREETING_USER_STUB }] }, ...kept] : kept;
}

interface FrameArgs {
  readonly turn: SeedTurn;
  readonly index: number;
  readonly sessionId: string;
  readonly parentUuid: string | null;
  readonly common: Record<string, unknown>;
}

/** A tool result with no bytes still has to be a VALID block: the wire rejects an empty content body, and the
 *  honest stand-in is a host marker saying the tool returned nothing — never a fabricated result. */
const EMPTY_TOOL_RESULT = "[no output]";

/**
 * One seed block in the SDK's own spelling. The Anthropic vocabulary (`tool_use` / `tool_result`, `input`,
 * `tool_use_id`) is minted HERE and nowhere else — the contract's {@link AgentSeedBlock} stays in the
 * transcript's vocabulary, and this backend internalizes its own wire quirks (Tier-3b).
 *
 * An if-chain rather than a `switch` (biome's type service calls every case of a switch over a derived union
 * unreachable), closed by the tool-result arm's PARAMETER TYPE rather than a `never` sink: after the two
 * earlier returns `block` narrows to exactly {@link toSdkToolResult}'s member, so a new `AgentSeedBlock`
 * member fails `tsc` at that call — and no arm re-compares a discriminant tsc has already decided, which is
 * what eslint's `no-unnecessary-condition` reds on a third `if`.
 *
 * `input` MUST be a JSON object on the wire and `arguments` is the raw model-emitted string. An unparseable
 * blob never reaches here — the seam that decides a pair is structural refuses it there, WITH its `tool_result`
 * half, so nothing is orphaned — and if one ever did, an empty input keeps the PAIR valid: a dropped block
 * would leave a `tool_result` answering nothing, which is a hard wire refusal for every later turn on that
 * lineage, where a lost argument blob costs one turn's fidelity.
 */
function toSdkBlock(block: AgentSeedBlock): Record<string, unknown> {
  if (block.type === "text") {
    return { type: "text", text: block.text };
  }
  if (block.type === "tool-call") {
    return { type: "tool_use", id: block.toolCallId, name: block.name, input: toToolInput(block.arguments) ?? {} };
  }
  return toSdkToolResult(block);
}

/** The tool-result arm, typed on its member: this parameter IS the exhaustiveness pin (see {@link toSdkBlock}). */
function toSdkToolResult(block: Extract<AgentSeedBlock, { type: "tool-result" }>): Record<string, unknown> {
  return {
    type: "tool_result",
    tool_use_id: block.toolCallId,
    content: block.content.length > 0 ? block.content : EMPTY_TOOL_RESULT,
    ...(block.isError === true ? { is_error: true } : {}),
  };
}

/** The model-emitted `arguments` string as the wire's `input` object, or `null` when it is not one. Uses
 *  `JSON.parse`, never an object literal: `parse` defines `__proto__` as an OWN property where a literal would
 *  set the prototype. */
function toToolInput(raw: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
    // @orb-waive caught-failure-ownership(catch): malformed model-emitted arguments become `null`, which toSdkBlock maps to an empty object so the tool pair remains wire-valid. Precedent: the gate mustPass fixture packages/server/src/infra/auth/parser.ts proves the same fail-closed parse default. Ends if null loses that owner.
  } catch {
    return null;
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
}

/** A turn's SDK content blocks — TOTAL: every seed block mints one, so a seed's pairing survives the mapping. */
function toSdkBlocks(content: readonly AgentSeedBlock[]): Record<string, unknown>[] {
  return content.map(toSdkBlock);
}

function buildFrame(args: FrameArgs): SessionStoreEntry {
  const { turn, index, sessionId, parentUuid, common } = args;
  const uuid = deterministicId(`${sessionId}:frame:${index}`);
  const timestamp = new Date(SEED_TS_BASE_MS + index * SEED_TS_STEP_MS).toISOString();
  const content = toSdkBlocks(turn.content);
  if (turn.role === "user") {
    return {
      type: "user",
      uuid,
      parentUuid,
      promptId: deterministicId(`${sessionId}:prompt:${index}`),
      timestamp,
      ...common,
      message: { role: "user", content },
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
      content,
      stop_reason: "end_turn",
    },
  };
}

// sessionId must be a valid uuidv4 — the SDK rejects arbitrary resume ids.
export function buildSeedFrames(canon: readonly SeedTurn[], sessionId: string): SessionStoreEntry[] {
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

/**
 * The comparison projection for ONE stored block. Text projects to its bytes; a tool block projects to a
 * NUL-prefixed identity marker naming the exchange it belongs to.
 *
 * WHY A MARKER AND NOT A FILTER (#1605): the comparators below decide resume-vs-reseed by comparing projected
 * text, and this projection used to keep `type === "text"` only. A `tool_result` block would then project to
 * nothing — so a seeded tool exchange and a session that never held one would compare EQUAL, and the frames we
 * wrote would fail to match themselves the moment a run held only tool blocks. The marker restores identity
 * without needing the payload: a tool id is minted once per call and recorded with it, so the id IS the
 * exchange's identity, and a NUL cannot occur in transcript text, so no content can forge a marker.
 *
 * Thinking blocks stay excluded on purpose (they are not transcript identity).
 */
const TOOL_USE_MARK = "\u0000tool_use:";
const TOOL_RESULT_MARK = "\u0000tool_result:";

function blockText(block: { type?: string; text?: string; id?: string; tool_use_id?: string }): string {
  if (block.type === "text") {
    return typeof block.text === "string" ? block.text : "";
  }
  if (block.type === "tool_use") {
    return `${TOOL_USE_MARK}${block.id ?? ""}`;
  }
  if (block.type === "tool_result") {
    return `${TOOL_RESULT_MARK}${block.tool_use_id ?? ""}`;
  }
  return "";
}

// Handles both content shapes a stored frame can carry: our synthesized block arrays and the SDK's own
// appended frames, whose message.content may be a plain string.
function frameText(entry: SessionStoreEntry): string {
  const message = (entry as { message?: { content?: string | Array<{ type?: string; text?: string; id?: string; tool_use_id?: string }> } }).message;
  const content = message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map(blockText).join("");
}

/** The SEED side of the same projection — routed through {@link toSdkBlocks} so both sides of every comparator
 *  read the identical bytes, including the empty-result and unparseable-argument degrades. */
function seedTurnText(turn: SeedTurn): string {
  return toSdkBlocks(turn.content).map(blockText).join("");
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
export function sessionMatchesSeed(entries: readonly SessionStoreEntry[], seed: readonly SeedTurn[]): boolean {
  const stored = sessionRuns(entries);
  const seedR = mergeRuns(seed.map((t) => ({ role: t.role, text: seedTurnText(t) })));
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
export function sessionContainsSeedPrefix(entries: readonly SessionStoreEntry[], seed: readonly SeedTurn[]): boolean {
  const stored = sessionRuns(entries);
  const seedR = mergeRuns(seed.map((t) => ({ role: t.role, text: seedTurnText(t) })));
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
export function isBranchDivergence(entries: readonly SessionStoreEntry[], seed: readonly SeedTurn[]): boolean {
  const stored = sessionRuns(entries);
  const seedR = mergeRuns(seed.map((t) => ({ role: t.role, text: seedTurnText(t) })));
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

export function seedSessionId(chatId: ChatId, seed: readonly SeedTurn[], salt = 0): string {
  return deterministicId(`${chatId}\u0000${salt}\u0000${seedBody(seed)}`);
}

/** The content-addressing body BOTH the lineage id and the staleness hash fold: role + the SAME projection the
 *  comparators use, so an id and a match verdict can never disagree about what a seed IS. */
function seedBody(seed: readonly SeedTurn[]): string {
  return seed.map((t) => `${t.role}\u0001${seedTurnText(t)}`).join("\u0002");
}

// The D8/D25 persisted staleness-gate hash: sha256 over the SAME role+content body `seedSessionId`
// folds into its own id (content-only, no chatId/salt — canonHash names the CONTENT, not one chat's
// lineage of it). A future read-side re-hashes the live canon prefix the same way and compares against
// the stored value to detect a diverged lineage without loading the session's own transcript.
export function canonHashOf(seed: readonly SeedTurn[]): string {
  return createHash("sha256").update(seedBody(seed)).digest("hex");
}
