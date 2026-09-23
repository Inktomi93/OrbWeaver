#!/usr/bin/env node

/**
 * pnpm probe:f4-cache-proof — what a chat at its context cap sends, turn after turn, before and after the chunked
 * history fit. Writes its report under `reports/f4-proof/`. No network, no model call, deterministic output.
 *
 * One over-cap chat runs K consecutive send turns through the REAL turn pipeline (`runTurnPipeline`: build, shape,
 * convert, fit) twice, each in its own child process:
 *   - `base`: the history fit exactly as it shipped at {@link BASE_REF}. A module load hook serves that commit's
 *     `history-budget.ts` in place of the current one, so no product code carries a flag for this probe.
 *   - `chunked`: the current tree.
 * The parent then reads each turn the way the provider cache does. The cache is an exact prefix: a turn reads the
 * previous turn's history cache only when every row up to that turn's deepest breakpoint repeats byte for byte.
 * The runner places the pair at depth d and d+2 (`computeCacheBreakpointPlacements`); token counts are the kit
 * estimator plus the fit's per-row overhead, so they are estimates, not provider usage.
 *
 * The agent-sdk column drives the real seed path offline: the turn's history goes through the same split the
 * backend runs (`extractTrailingSystemRows` + `splitAgentHistory`) into `SessionCache.ensureSeededSession`, and the
 * turn's prompt and reply are then appended to the session the way the SDK subprocess appends them.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { ChatContentPart, ChatInjection, ChatReasoningPart, MessageView } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { rowIndexAtCacheDepth } from "@orb/inference";
import type { AssetId, ChatId, MessageId, ModelId, UserConnectionId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import { SessionCache } from "../../packages/inference/src/backends/agent-sdk/session/store.ts";
import { extractTrailingSystemRows, splitAgentHistory } from "../../packages/inference/src/backends/agent-sdk/turn-input.ts";
import { BEFORE_HISTORY_DEPTH } from "../../packages/server/src/domain/chat/assembly/injections.ts";
import { makeCapability, makeGenerationCapability, makeResolved } from "../../tests/support/factories/resolved-connection.ts";

const BASE_REF = "83a73e291";
const HISTORY_BUDGET_PATH = "packages/server/src/domain/chat/assembly/history-budget.ts";
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REPORT_PATH = `${REPO_ROOT}reports/f4-proof/f4-cache-proof.md`;

// A small cap keeps every table readable; the first turn is already over it.
const CAP_TOKENS = 1200;
const OUTPUT_TOKENS = 128;
const TURNS = 8;
const FIRST_CANON_ROWS = 61;
const MARKER_TEXT = "[Start a new chat]";
// The fit's per-row wire overhead (`historyTurnTokens`), repeated here because the base arm has its own module.
const PER_ROW_OVERHEAD = 4;
const WIRE_HEAD_ROWS = 3;
const WIRE_TAIL_ROWS = 4;
const WIRE_TEXT_CHARS = 90;
const WIRE_INDEX_WIDTH = 3;
const WIRE_ROLE_WIDTH = 9;
const CHILD_OUTPUT_BYTES = 67_108_864;

const ARMS = ["base", "chunked"] as const;
type Arm = (typeof ARMS)[number];

interface WireRow {
  readonly role: string;
  readonly text: string;
}

/** What one child reports per turn: the wire the provider would receive, and the fit's own numbers. */
interface TurnRecord {
  readonly turn: number;
  readonly firstKeptSeq: number | null;
  readonly droppedCount: number;
  readonly historyTokens: number;
  readonly roomTokens: number;
  readonly breakpointDepth: number | null;
  readonly history: readonly WireRow[];
  readonly agentHistory: readonly { readonly role: "user" | "assistant" | "system"; readonly content: readonly ChatContentPart[] }[];
  readonly reply: string;
}

const textOf = (content: readonly ChatContentPart[]): string => content.map((p) => (p.type === "text" ? p.text : "")).join("");
const rowTokens = (text: string): number => estimateTokens(text) + PER_ROW_OVERHEAD;

// ── child: one arm through the real pipeline ────────────────────────────────────────────────────────────

function canonRow(seq: number): MessageView {
  const role = seq % 2 === 1 ? "user" : "assistant";
  const speaker = role === "user" ? "Nate" : "Aria";
  return {
    id: mintTypeId(ID_PREFIX.message),
    toolCalls: [],
    chatId: CHAT_ID,
    seq,
    role,
    kind: "standard",
    authorUserId: role === "user" ? HUMAN : null,
    characterId: null,
    personaId: null,
    excludedFromPrompt: false,
    createdAt: 0,
    editedAt: null,
    selectedVariantId: mintTypeId(ID_PREFIX.messageVariant),
    selectedVariantIdx: 0,
    variantCount: 1,
    hasContinuation: false,
    content: `${speaker}, line ${seq}: the lantern flickers over the old map while the rain keeps falling.`,
    reasoning: null,
    model: null,
    provider: null,
    finishReason: null,
    stopReason: null,
    terminalReason: null,
    tokensIn: null,
    tokensOut: null,
    tokenProvenance: "unrecorded",
    costProvenance: "unrecorded",
    cacheReadTokens: null,
    cacheWriteTokens: null,
    contextWindow: null,
    costUsd: null,
    ttftMs: null,
    genStartedAt: null,
    genFinishedAt: null,
    generationId: null,
    connectionId: null,
    contextBoundaryMessageId: null,
  };
}

const CHAT_ID = castId<ChatId>("chat_f4proof");
const HUMAN = castId<UserId>("user_f4proof");

async function runArm(arm: Arm): Promise<TurnRecord[]> {
  if (arm === "base") {
    const target = new URL(HISTORY_BUDGET_PATH, `file://${REPO_ROOT}`).href;
    const source = execFileSync("git", ["-C", REPO_ROOT, "show", `${BASE_REF}:${HISTORY_BUDGET_PATH}`], { encoding: "utf8" });
    registerHooks({
      load: (url, context, nextLoad) => (url === target ? { format: "module-typescript", source, shortCircuit: true } : nextLoad(url, context)),
    });
  }
  // Imported after the hook so the base arm's whole pipeline graph sees the base fit.
  const { runTurnPipeline } = await import("../../packages/server/src/domain/chat/engine/pipeline.ts");
  const connection = makeResolved({
    api: "chat-completions",
    model: castId<ModelId>("f4-proof-model"),
    capability: makeCapability(
      makeGenerationCapability({
        context: { window: 200_000 },
        turns: { assistantPrefill: false, midConversationSystem: true, historySystemRows: true, roleHandlingFloor: "slotted", explicitPromptCache: true },
      }),
    ),
  });
  const marker: ChatInjection = { position: "in_chat", depth: BEFORE_HISTORY_DEPTH, role: "user", content: MARKER_TEXT, origin: "new-chat-marker" };
  const all = Array.from({ length: FIRST_CANON_ROWS + 2 * TURNS }, (_, i) => canonRow(i + 1));
  const records: TurnRecord[] = [];
  for (let turn = 1; turn <= TURNS; turn += 1) {
    const canon = all.slice(0, FIRST_CANON_ROWS + 2 * (turn - 1));
    const result = await runTurnPipeline({
      now: () => 0,
      applyRegexReplace: (text, regex, replacer) => text.replace(regex, replacer),
      loadInlineReplyAssetIds: () => Promise.resolve(new Map<MessageId, ReadonlySet<AssetId>>()),
      loadReasoningParts: () => Promise.resolve(new Map<MessageId, readonly ChatReasoningPart[]>()),
      runChatTurn: () =>
        (async function* () {
          await Promise.resolve();
          yield { kind: "final" as const, economics: { content: "ok", tokensIn: 0, tokensOut: 0, model: castId<ModelId>("f4-proof-model") } };
        })(),
      resolveImageUrl: () => Promise.resolve(null),
      assembleContext: {
        character: { name: "Aria", description: "a bold knight" },
        promptConfig: DEFAULT_PROMPT_CONFIG,
        activePersona: { name: "Nate", description: "the user" },
        activePersonaUserId: HUMAN,
        recentMessages: [],
        chatInjections: [marker],
      },
      canon,
      connection,
      intent: { maxContextTokens: CAP_TOKENS, maxOutputTokens: OUTPUT_TOKENS },
      kind: "send",
      chatId: CHAT_ID,
      onDelta: () => undefined,
      tools: null,
      attachedToolNames: [],
      toolRecurseLimit: 5,
      toolExecFrame: { runAsUserId: HUMAN, triggeredBy: HUMAN, chatId: CHAT_ID, membership: null, turnId: mintTypeId(ID_PREFIX.chatTurn) },
    });
    const systemTokens = estimateTokens([result.request.prompt.static, result.request.prompt.dynamic].join("\n\n"));
    const reserve = result.request.intent.maxOutputTokens ?? OUTPUT_TOKENS;
    records.push({
      turn,
      firstKeptSeq: canon.find((m) => m.id === result.contextBoundaryMessageId)?.seq ?? null,
      droppedCount: result.droppedCount,
      historyTokens: result.fitUsedTokens - systemTokens - reserve,
      roomTokens: CAP_TOKENS - systemTokens - reserve,
      breakpointDepth: result.request.cacheBreakpointFromEnd,
      history: result.request.history.map((m) => ({ role: m.role, text: textOf(m.content) })),
      agentHistory: result.request.history.flatMap((m) => (m.role === "tool" ? [] : [{ role: m.role, content: m.content }])),
      reply: all[canon.length]?.content ?? "",
    });
  }
  return records;
}

// ── parent: read each turn the way the caches do ─────────────────────────────────────────────────────────

interface CacheRead {
  readonly markers: readonly number[];
  readonly deepest: number;
  readonly hit: boolean | null;
  readonly readTokens: number;
  readonly writeTokens: number;
}

function markerIndexes(record: TurnRecord): number[] {
  if (record.breakpointDepth === null) {
    return [];
  }
  const depth = record.breakpointDepth;
  return [rowIndexAtCacheDepth(record.history, depth), rowIndexAtCacheDepth(record.history, depth + 2)].filter((i): i is number => i !== undefined);
}

const samePrefix = (a: readonly WireRow[], b: readonly WireRow[], through: number): boolean =>
  through < a.length && through < b.length && JSON.stringify(a.slice(0, through + 1)) === JSON.stringify(b.slice(0, through + 1));

const tokensThrough = (rows: readonly WireRow[], from: number, through: number): number =>
  rows.slice(from, through + 1).reduce((sum, row) => sum + rowTokens(row.text), 0);

function readCache(prior: TurnRecord | undefined, record: TurnRecord): CacheRead {
  const markers = markerIndexes(record);
  const deepest = Math.max(-1, ...markers);
  const priorMarkers = prior === undefined ? [] : markerIndexes(prior);
  // The longest prefix a prior breakpoint wrote that this turn repeats byte for byte.
  const reused = Math.max(-1, ...priorMarkers.filter((at) => prior !== undefined && samePrefix(prior.history, record.history, at)));
  return {
    markers,
    deepest,
    hit: prior === undefined ? null : reused === Math.max(-1, ...priorMarkers) && reused >= 0,
    readTokens: tokensThrough(record.history, 0, reused),
    writeTokens: tokensThrough(record.history, reused + 1, deepest),
  };
}

async function agentDispositions(records: readonly TurnRecord[]): Promise<string[]> {
  const silent = { debug: (): void => undefined, info: (): void => undefined, warn: (): void => undefined, error: (): void => undefined };
  const cache = new SessionCache(silent);
  const connectionId = castId<UserConnectionId>("user_connection_f4proof");
  const out: string[] = [];
  for (const record of records) {
    const split = splitAgentHistory(extractTrailingSystemRows(record.agentHistory).rows);
    const decision = await cache.ensureSeededSession(CHAT_ID, connectionId, split.seed);
    out.push(decision.disposition);
    if (decision.sessionId !== null) {
      // What the SDK subprocess appends after the turn runs: the prompt it was asked and the reply it gave.
      await cache.store.append({ projectKey: "f4-proof", sessionId: decision.sessionId }, [
        { type: "user", message: { role: "user", content: split.prompt } },
        { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: record.reply }] } },
      ]);
    }
  }
  return out;
}

function clip(text: string): string {
  const flat = text.replaceAll("\n", "\\n");
  return flat.length > WIRE_TEXT_CHARS ? `${flat.slice(0, WIRE_TEXT_CHARS)}…` : flat;
}

function wireDump(record: TurnRecord, read: CacheRead): string {
  const line = (row: WireRow, i: number): string => {
    const mark = read.markers.includes(i) ? " ◀ cache breakpoint" : "";
    return `${String(i).padStart(WIRE_INDEX_WIDTH)} ${row.role.padEnd(WIRE_ROLE_WIDTH)} ${clip(row.text)}${mark}`;
  };
  const rows = record.history;
  const head = rows.slice(0, WIRE_HEAD_ROWS).map((row, i) => line(row, i));
  const tailFrom = Math.max(WIRE_HEAD_ROWS, rows.length - WIRE_TAIL_ROWS);
  const tail = rows.slice(tailFrom).map((row, i) => line(row, tailFrom + i));
  const elided = tailFrom - WIRE_HEAD_ROWS;
  return ["```text", ...head, ...(elided > 0 ? [`    … ${elided} rows elided …`] : []), ...tail, "```"].join("\n");
}

function hitLabel(hit: boolean | null): string {
  if (hit === null) {
    return "cold";
  }
  return hit ? "HIT" : "MISS";
}

function table(records: readonly TurnRecord[], reads: readonly CacheRead[], agent: readonly string[]): string {
  const header = [
    "| turn | first kept seq | kept rows | history / room tokens | history cache vs prior turn | est. cache read | est. cache write | agent-sdk seed |",
    "| - | - | - | - | - | - | - | - |",
  ];
  const rows = records.map((r, i) => {
    const read = reads[i];
    return `| ${r.turn} | ${r.firstKeptSeq ?? "all"} | ${r.history.length} | ${r.historyTokens} / ${r.roomTokens} | ${hitLabel(read?.hit ?? null)} | ${read?.readTokens ?? 0} | ${read?.writeTokens ?? 0} | ${agent[i] ?? ""} |`;
  });
  const sum = (pick: (read: CacheRead) => number): number => reads.reduce((total, read) => total + pick(read), 0);
  const reseeds = agent.filter((d) => d !== "resumed").length;
  const totals = `| total | | | | ${reads.filter((read) => read.hit === false).length} MISS | ${sum((read) => read.readTokens)} | ${sum((read) => read.writeTokens)} | ${reseeds} not resumed |`;
  return [...header, ...rows, totals].join("\n");
}

/** The turns whose wire the report prints: an adjacent pair inside one chunked head, then the next head move. */
function dumpTurns(chunked: readonly TurnRecord[]): { readonly index: number; readonly label: string }[] {
  const held = chunked.findIndex((r, i) => i > 0 && r.droppedCount === chunked[i - 1]?.droppedCount);
  const moved = chunked.findIndex((r, i) => i > held && r.droppedCount !== chunked[i - 1]?.droppedCount);
  return [
    { index: held - 1, label: "first of two turns inside one chunk" },
    { index: held, label: "second of two turns inside one chunk" },
    { index: moved, label: "the chunked head moves" },
  ].filter((pick) => pick.index >= 0);
}

async function render(results: Readonly<Record<Arm, readonly TurnRecord[]>>): Promise<string> {
  const reads = (arm: Arm): CacheRead[] => results[arm].map((r, i) => readCache(results[arm][i - 1], r));
  const readsByArm: Readonly<Record<Arm, readonly CacheRead[]>> = { base: reads("base"), chunked: reads("chunked") };
  const sections = [
    "# F4 proof: a capped chat's history cache, base vs chunked fit",
    "",
    `Generated by \`pnpm probe:f4-cache-proof\`. One chat, cap \`maxContextTokens=${CAP_TOKENS}\`, output reserve ${OUTPUT_TOKENS}, ${TURNS} consecutive send turns; each turn adds one reply and one user row. Base is the fit at \`${BASE_REF}\`; chunked is the current tree. Both arms run the real turn pipeline. Token numbers are the kit estimator plus the fit's per-row overhead, not provider usage. "HIT" means every row up to the prior turn's deepest cache breakpoint repeats byte for byte, so the provider reads that prefix from cache and writes only the new rows. The static system block is identical in every turn of both arms and is not counted. "agent-sdk seed" is the decision \`ensureSeededSession\` makes for the seed this turn's history produces: \`resumed\` keeps the session, \`reseeded\` rewrites it in place.`,
    "",
  ];
  for (const arm of ARMS) {
    sections.push(`## ${arm}`, "", table(results[arm], readsByArm[arm], await agentDispositions(results[arm])), "");
  }
  sections.push("## What is sent", "", `Rows are the wire history in order: index, role, text clipped to ${WIRE_TEXT_CHARS} characters.`, "");
  for (const { index, label } of dumpTurns(results.chunked)) {
    for (const arm of ARMS) {
      const record = results[arm][index];
      const read = readsByArm[arm][index];
      if (record !== undefined && read !== undefined) {
        sections.push(`### turn ${record.turn}, ${arm} (${label})`, "", wireDump(record, read), "");
      }
    }
  }
  return sections.join("\n");
}

// ── entry ────────────────────────────────────────────────────────────────────────────────────────────────

const armFlag = process.argv.find((a) => a.startsWith("--arm="))?.slice("--arm=".length);
if (armFlag !== undefined) {
  const arm = ARMS.find((a) => a === armFlag);
  if (arm === undefined) {
    throw new Error(`unknown arm ${armFlag}`);
  }
  process.stdout.write(JSON.stringify(await runArm(arm)));
} else {
  const self = fileURLToPath(import.meta.url);
  const results = Object.fromEntries(
    ARMS.map((arm) => [
      arm,
      JSON.parse(execFileSync(process.execPath, [self, `--arm=${arm}`], { encoding: "utf8", maxBuffer: CHILD_OUTPUT_BYTES })) as TurnRecord[],
    ]),
  ) as Record<Arm, TurnRecord[]>;
  mkdirSync(new URL("./", `file://${REPORT_PATH}`), { recursive: true });
  writeFileSync(REPORT_PATH, `${await render(results)}\n`);
  process.stdout.write(`wrote ${REPORT_PATH}\n`);
}
