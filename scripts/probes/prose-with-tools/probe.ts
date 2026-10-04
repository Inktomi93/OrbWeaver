// Does a local (model x server) cell write prose AND tool calls in one reply when the RPG state tools ride a
// folded turn? One cell = one server + model + chat template, run streaming and non-streaming over the same
// ten-beat scene. Writes the raw turns plus a summary line that `summarize.ts` turns into RESULTS.md and rows.
//
//   node scripts/probes/prose-with-tools/probe.ts --cell=<name> --server=<vllm|llama-cpp|koboldcpp|ollama>
//        --base=http://127.0.0.1:<port>/v1 --model=<id> --template=<label> [--turns=10] [--modes=stream,nonstream]
//        [--body=<json merged into every request>] [--out=<dated results dir>]
//
// The request mirrors production's folded turn on a local wire (see README): the game master persona as the
// system row, the scene so far, then the player's beat with the state reminder squashed into the same user row
// (a local row carries `midConversationSystem: false`, so the depth-0 system note folds into user text), the
// seven terminal tools built by the real builders, `tool_choice: "auto"`, and `strict: true` per tool where the
// provider row is `strictJson: "default-on"` (vLLM).

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type {
  ExtractionRefs,
  RpgActorEntry,
  RpgActorView,
  RpgGameConfig,
  RpgSnapshotState,
  RpgTrackerCarrier,
  RpgTrackerEntry,
  RpgTrackerView,
} from "@orb/contracts/rpg";
import {
  buildRpgToolDescriptions,
  buildTrackerWriteGroups,
  constrainExtractionSchema,
  gameTrackers,
  gameTrackerWriteKeys,
  RPG_NO_CHANGES_TOOL,
  RPG_PROFILE_FREEFORM,
  rpgActorEntrySchema,
  rpgExtractionSchema,
  rpgGameConfigSchema,
  rpgTrackerDefSchema,
  toolCallsToExtraction,
  trackersForCarrier,
} from "@orb/contracts/rpg";
import type { UserId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { buildLiteReminder, frameLiteReminder } from "../../../packages/server/src/domain/rpg/substrate/reminder.ts";
import { buildActorRefIndex, extractionToStateDelta } from "../../../packages/server/src/domain/rpg/tools/apply.ts";
import { BEATS, PERSONA } from "./scene.ts";

const SERVERS = ["vllm", "llama-cpp", "koboldcpp", "ollama"] as const;
type Server = (typeof SERVERS)[number];
const MODES = ["stream", "nonstream"] as const;
type Mode = (typeof MODES)[number];

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REQUEST_TIMEOUT_MS = 900_000;
const MAX_TOKENS = 1200;
const DEFAULT_TURNS = 10;
const ERROR_EXCERPT_CHARS = 600;
const MS_PER_SECOND = 1000;
const TENTHS = 10;
/** Below this many characters a reply is not prose: a stray newline or a one-word stub before a call. */
const PROSE_MIN_CHARS = 40;
const THINK_BLOCK_RE = /<think>[\s\S]*?(<\/think>|$)/g;
/** Tool-call markup that reached `content` unparsed: the server lost the call and the prose count lies. */
const LEAKED_CALL_RE = /<tool_call>|<function=|<\/?parameter|"name"\s*:\s*"(update_|set_tracker|upsert_quest|add_journal_entry|no_changes)/;

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function required(name: string): string {
  const value = arg(name);
  if (value === undefined || value === "") {
    throw new Error(`--${name}=<value> is required (see the file header)`);
  }
  return value;
}

const CELL = required("cell");
const SERVER = required("server") as Server;
if (!(SERVERS as readonly string[]).includes(SERVER)) {
  throw new Error(`--server must be one of ${SERVERS.join(", ")}`);
}
const BASE = required("base").replace(/\/$/, "");
const MODEL = required("model");
const TEMPLATE = required("template");
const TURNS = Number.parseInt(arg("turns") ?? String(DEFAULT_TURNS), 10);
const RUN_MODES = (arg("modes") ?? MODES.join(",")).split(",") as Mode[];
const EXTRA_BODY = JSON.parse(arg("body") ?? "{}") as Record<string, unknown>;
/** A repeat of the same cell: 10 sampled turns per mode is too few to call a rate, so a cell may run again. */
const REP = Number.parseInt(arg("rep") ?? "1", 10);
const OUT = arg("out") ?? path.join(DIR, "results", new Date().toISOString().slice(0, 10));
/** The provider rows' `strictJson`: only vLLM is `default-on`, so only there does every tool carry `strict: true`. */
const STRICT = SERVER === "vllm";

const PLAYER_REF = "player";
const PLAYER_NAME = "Rook";
const PLAYER_USER = "user-rook" as UserId;
const PARTICIPANTS = [{ actorRef: { kind: "user", userId: PLAYER_USER } as const, name: PLAYER_NAME }];

function gameConfig(): RpgGameConfig {
  return rpgGameConfigSchema.parse({
    extractionMode: "folded",
    trackers: [
      rpgTrackerDefSchema.parse({
        key: "stamina",
        label: "Stamina",
        shape: "meter",
        write: "delta",
        subject: "actor",
        max: 14,
        hint: "wind you spend pushing on",
      }),
      rpgTrackerDefSchema.parse({
        key: "heat",
        label: "Heat",
        shape: "meter",
        write: "set",
        subject: "game",
        max: 100,
        hint: "how hard the city watch is looking",
      }),
    ],
  });
}

function seedState(): RpgSnapshotState {
  const player: RpgActorEntry = rpgActorEntrySchema.parse({
    actorRef: { kind: "user", userId: PLAYER_USER },
    volatile: {
      trackerValues: { stamina: { value: 14, items: null, max: null } },
      conditions: [],
      inventory: [
        { id: "i1", name: "Shortsword", description: "", quantity: 1, location: "sheathed", type: "" },
        { id: "i2", name: "Sealed Courier Satchel", description: "Marro's delivery", quantity: 1, location: "shoulder", type: "" },
        { id: "i3", name: "Linen Strips", description: "clean bandaging", quantity: 2, location: "pack", type: "" },
      ],
      wallet: [{ name: "gold", amount: 6 }],
      status: "wet and watchful",
    },
  });
  return {
    clock: null,
    calendarDate: null,
    location: "the Drowned Lantern, Saltmere",
    weather: { type: "rain", label: "steady rain" },
    presentCharacters: [],
    recentEvents: [],
    actorState: [player],
    trackerValues: {},
    quests: [],
    plot: { act: 1, title: "The Harbormaster's Ledger", acts: [] },
    fieldLocks: null,
  };
}

// ── the write surface and reminder: the production builders, wrapped as `local-8b-vehicles.ts` wraps them ───

function refsFor(state: RpgSnapshotState, config: RpgGameConfig): ExtractionRefs {
  const carriers: RpgTrackerCarrier[] = [
    { actorKey: `user:${PLAYER_USER}`, name: PLAYER_REF, kind: "party", grants: [], revokes: [] },
    { actorKey: `user:${PLAYER_USER}`, name: PLAYER_NAME, kind: "party", grants: [], revokes: [] },
  ];
  return {
    actorRefs: carriers.map((c) => c.name),
    trackerWriteGroups: buildTrackerWriteGroups(config.trackers, carriers),
    gameTrackerKeys: gameTrackerWriteKeys(config.trackers),
    conditionNames: [...new Set(state.actorState.flatMap((a) => a.volatile.conditions.map((c) => c.name)))],
    establishScene: { location: state.location === "", timeOfDay: state.clock === null, presentCast: state.presentCharacters.length === 0 },
  };
}

interface WireTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/** Mirror of `buildToolRoundWireTools` in `packages/server/src/entry/compose/rpg.ts` (private there). */
function wireTools(refs: ExtractionRefs, config: RpgGameConfig): WireTool[] {
  const constrained = constrainExtractionSchema(projectJsonSchema(rpgExtractionSchema), refs) as {
    properties?: Record<string, { items?: Record<string, unknown> }>;
  };
  const itemSchemaOf = (field: string): Record<string, unknown> | undefined => {
    const node = constrained.properties?.[field];
    return node === undefined ? undefined : (node.items ?? { type: "object" });
  };
  const sceneSchema = (constrained.properties?.["scene"] as Record<string, unknown> | undefined) ?? { type: "object" };
  const descriptions = buildRpgToolDescriptions({ config, refs });
  const toolText = (name: string): string => descriptions.get(name) ?? "";
  const tools: WireTool[] = [
    { name: "update_party", description: toolText("update_party"), parameters: itemSchemaOf("party") ?? { type: "object" } },
    { name: "update_inventory", description: toolText("update_inventory"), parameters: itemSchemaOf("inventory") ?? { type: "object" } },
    { name: "update_scene", description: toolText("update_scene"), parameters: sceneSchema },
  ];
  const trackerParams = itemSchemaOf("trackers");
  if (trackerParams !== undefined) {
    tools.push({ name: "set_tracker", description: toolText("set_tracker"), parameters: trackerParams });
  }
  tools.push(
    { name: "upsert_quest", description: toolText("upsert_quest"), parameters: itemSchemaOf("quests") ?? { type: "object" } },
    { name: "add_journal_entry", description: toolText("add_journal_entry"), parameters: itemSchemaOf("journal") ?? { type: "object" } },
    {
      name: RPG_NO_CHANGES_TOOL,
      description:
        "Call ONLY when the latest beat changed NOTHING trackable. Do NOT use this to avoid filling fields — if anything in the fiction moved, record it.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  );
  return tools;
}

function trackerView(state: RpgSnapshotState, config: RpgGameConfig): RpgTrackerView {
  const defs = config.trackers;
  const player = state.actorState[0];
  const actors: RpgActorView[] = PARTICIPANTS.map((p) => ({
    actorRef: p.actorRef,
    name: p.name,
    presence: true,
    identity: null,
    sheet: { className: "courier", attributes: {}, flavor: "", level: 3, trackerGrants: [], trackerRevokes: [] },
    volatile: player?.volatile ?? null,
    trackers: trackersForCarrier(defs, { actorKey: `user:${PLAYER_USER}`, name: p.name, kind: "party", grants: [], revokes: [] }),
  }));
  const gameEntries: RpgTrackerEntry[] = gameTrackers(defs).map((def) => ({ def, value: state.trackerValues[def.key] ?? null }));
  return {
    ambient: { location: state.location, calendarDate: state.calendarDate, clock: state.clock, weather: state.weather },
    actors,
    cast: state.presentCharacters,
    trackerDefs: defs,
    gameTrackers: gameEntries,
    quests: state.quests.map((q) => ({ id: q.id, name: q.name, status: q.status, description: q.description, objectives: q.objectives })),
    plot: state.plot,
    recentBeats: state.recentEvents.slice(-config.features.recentBeatsKeepLast),
    trackersReadOnly: false,
    trackerOrbs: [],
    lockedPaths: [],
  };
}

function reminderFor(cur: RpgSnapshotState, prev: RpgSnapshotState | null, config: RpgGameConfig): string {
  const reminder = buildLiteReminder({
    view: trackerView(cur, config),
    steeringNote: config.lite.steeringNote,
    curSnapshot: cur,
    prevSnapshot: prev,
    statProfile: RPG_PROFILE_FREEFORM,
    features: config.features,
    participantNames: { [`user:${PLAYER_USER}`]: PLAYER_NAME },
    deception: false,
    omniscience: false,
    dateMode: config.dateMode,
  });
  return frameLiteReminder(reminder, {});
}

// ── the wire ─────────────────────────────────────────────────────────────────────────────────────────────────

interface WireCall {
  readonly name: string;
  readonly arguments: string;
}

interface Reply {
  readonly content: string;
  readonly reasoning: string;
  readonly calls: readonly WireCall[];
  readonly finish: string;
  readonly totalMs: number;
  /** Streaming only: first content, reasoning or tool delta to the last chunk. */
  readonly decodeMs: number | null;
  /** Logged per turn so a cell whose prompt nears the server's window reads as suspect, never as a result. */
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  /** llama.cpp's own decode rate (`timings.predicted_per_second`), where the server reports it. */
  readonly serverTokPerSec: number | null;
}

interface ChoiceMessage {
  content?: string | null;
  reasoning_content?: string | null;
  reasoning?: string | null;
  tool_calls?: { index?: number; function?: { name?: string; arguments?: string } }[];
}
interface CompletionJson {
  choices?: { message?: ChoiceMessage; delta?: ChoiceMessage; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  timings?: { prompt_n?: number; predicted_per_second?: number };
}

async function post(body: Record<string, unknown>): Promise<Response> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok || res.body === null) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, ERROR_EXCERPT_CHARS)}`);
  }
  return res;
}

const reasoningOf = (message: ChoiceMessage): string => message.reasoning_content ?? message.reasoning ?? "";
const promptTokensOf = (json: CompletionJson): number | null => json.usage?.prompt_tokens ?? json.timings?.prompt_n ?? null;

async function postNonStream(body: Record<string, unknown>): Promise<Reply> {
  const started = performance.now();
  const json = (await (await post({ ...body, stream: false })).json()) as CompletionJson;
  const choice = json.choices?.[0];
  const message = choice?.message ?? {};
  return {
    content: message.content ?? "",
    reasoning: reasoningOf(message),
    calls: (message.tool_calls ?? []).map((c) => ({ name: c.function?.name ?? "", arguments: c.function?.arguments ?? "" })),
    finish: choice?.finish_reason ?? "",
    totalMs: performance.now() - started,
    decodeMs: null,
    promptTokens: promptTokensOf(json),
    completionTokens: json.usage?.completion_tokens ?? null,
    serverTokPerSec: json.timings?.predicted_per_second ?? null,
  };
}

/** Folds SSE chunks into one reply: content, reasoning, tool-call fragments by index, usage and timing. */
class StreamFold {
  content = "";
  reasoning = "";
  finish = "";
  firstAt: number | null = null;
  lastAt = 0;
  timedChunks = 0;
  promptTokens: number | null = null;
  completionTokens: number | null = null;
  serverTokPerSec: number | null = null;
  readonly calls = new Map<number, { name: string; arguments: string }>();

  add(data: string): void {
    if (data === "[DONE]") {
      return;
    }
    const json = JSON.parse(data) as CompletionJson;
    this.promptTokens = promptTokensOf(json) ?? this.promptTokens;
    this.completionTokens = json.usage?.completion_tokens ?? this.completionTokens;
    this.serverTokPerSec = json.timings?.predicted_per_second ?? this.serverTokPerSec;
    const choice = json.choices?.[0];
    if (choice === undefined) {
      return;
    }
    this.finish = choice.finish_reason ?? this.finish;
    const delta = choice.delta ?? {};
    const toolDeltas = delta.tool_calls ?? [];
    if ((delta.content ?? "") !== "" || reasoningOf(delta) !== "" || toolDeltas.length > 0) {
      this.firstAt ??= performance.now();
      this.lastAt = performance.now();
      this.timedChunks += 1;
    }
    this.content += delta.content ?? "";
    this.reasoning += reasoningOf(delta);
    this.addToolDeltas(toolDeltas);
  }

  private addToolDeltas(toolDeltas: NonNullable<ChoiceMessage["tool_calls"]>): void {
    for (const [position, call] of toolDeltas.entries()) {
      const index = call.index ?? position;
      const slot = this.calls.get(index) ?? { name: "", arguments: "" };
      slot.name += call.function?.name ?? "";
      slot.arguments += call.function?.arguments ?? "";
      this.calls.set(index, slot);
    }
  }
}

async function postStream(body: Record<string, unknown>): Promise<Reply> {
  const started = performance.now();
  const res = await post({ ...body, stream: true, stream_options: { include_usage: true } });
  const fold = new StreamFold();
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body ?? []) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines.map((l) => l.trim()).filter((l) => l.startsWith("data:"))) {
      fold.add(line.slice("data:".length).trim());
    }
  }
  return {
    content: fold.content,
    reasoning: fold.reasoning,
    calls: [...fold.calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call),
    finish: fold.finish,
    totalMs: performance.now() - started,
    // Ollama sends a whole tool call in one chunk, so a reply with one timed chunk has no decode window.
    decodeMs: fold.firstAt === null || fold.timedChunks < 2 ? null : fold.lastAt - fold.firstAt,
    promptTokens: fold.promptTokens,
    completionTokens: fold.completionTokens,
    serverTokPerSec: fold.serverTokPerSec,
  };
}

// ── one turn's verdict ───────────────────────────────────────────────────────────────────────────────────────

type Shape = "both" | "prose-only" | "tools-only" | "empty";

interface TurnRow {
  readonly turn: number;
  readonly shape: Shape;
  readonly proseChars: number;
  readonly calls: readonly string[];
  readonly leakedCallMarkup: boolean;
  readonly finish: string;
  readonly totalMs: number;
  readonly decodeMs: number | null;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly tokPerSec: number | null;
  readonly serverTokPerSec: number | null;
  readonly content: string;
  readonly reasoning: string;
  readonly rawCalls: readonly WireCall[];
  readonly error?: string;
}

const SHAPES: Readonly<Record<`${boolean}:${boolean}`, Shape>> = {
  "true:true": "both",
  "true:false": "prose-only",
  "false:true": "tools-only",
  "false:false": "empty",
};

const round1 = (value: number): number => Math.round(value * TENTHS) / TENTHS;

function turnRow(turn: number, reply: Reply): TurnRow {
  const prose = reply.content.replace(THINK_BLOCK_RE, "").trim();
  const hasProse = prose.length >= PROSE_MIN_CHARS;
  // End to end, prefill included: Ollama and KoboldCpp deliver a tool call in one late chunk, so a streamed
  // decode window measures nothing comparable across servers.
  const ms = reply.totalMs;
  const tokens = reply.completionTokens ?? 0;
  return {
    turn,
    shape: SHAPES[`${hasProse}:${reply.calls.length > 0}`],
    proseChars: prose.length,
    calls: reply.calls.map((c) => c.name),
    leakedCallMarkup: LEAKED_CALL_RE.test(reply.content),
    finish: reply.finish,
    totalMs: Math.round(reply.totalMs),
    decodeMs: reply.decodeMs === null ? null : Math.round(reply.decodeMs),
    promptTokens: reply.promptTokens,
    completionTokens: reply.completionTokens,
    tokPerSec: tokens > 0 && ms > 0 ? round1((tokens / ms) * MS_PER_SECOND) : null,
    serverTokPerSec: reply.serverTokPerSec === null ? null : round1(reply.serverTokPerSec),
    content: reply.content,
    reasoning: reply.reasoning,
    rawCalls: reply.calls,
  };
}

function errorRow(turn: number, err: unknown): TurnRow {
  return {
    turn,
    shape: "empty",
    proseChars: 0,
    calls: [],
    leakedCallMarkup: false,
    finish: "error",
    totalMs: 0,
    decodeMs: null,
    promptTokens: null,
    completionTokens: null,
    tokPerSec: null,
    serverTokPerSec: null,
    content: "",
    reasoning: "",
    rawCalls: [],
    error: err instanceof Error ? err.message : String(err),
  };
}

function logTurn(mode: Mode, row: TurnRow): void {
  const flags = [row.leakedCallMarkup ? "LEAK" : "", row.error === undefined ? "" : `ERROR ${row.error.slice(0, ERROR_EXCERPT_CHARS)}`].filter((f) => f !== "");
  process.stdout.write(
    `  ${CELL} ${mode} t${row.turn}: ${row.shape} · ${row.proseChars}ch · [${row.calls.join(",")}] · ${row.finish} · prompt ${row.promptTokens ?? "?"} · ${row.tokPerSec ?? "?"} tok/s ${flags.join(" · ")}\n`,
  );
}

async function runMode(mode: Mode): Promise<TurnRow[]> {
  const config = gameConfig();
  let state = seedState();
  let prev: RpgSnapshotState | null = null;
  const participantIndex = buildActorRefIndex(PARTICIPANTS);
  let mint = 0;
  const mints = { item: () => `it${++mint}`, quest: () => `q${++mint}`, objective: () => `o${++mint}` } as unknown as Parameters<
    typeof extractionToStateDelta
  >[2];
  const history: { role: "user" | "assistant"; content: string }[] = [];
  const rows: TurnRow[] = [];
  for (const [index, beat] of BEATS.slice(0, TURNS).entries()) {
    const refs = refsFor(state, config);
    const tools = wireTools(refs, config).map((tool) => ({ type: "function", function: STRICT ? { ...tool, strict: true } : tool }));
    const messages = [{ role: "system", content: PERSONA }, ...history, { role: "user", content: `${beat.player}\n\n${reminderFor(state, prev, config)}` }];
    const body = { model: MODEL, messages, tools, tool_choice: "auto", max_tokens: MAX_TOKENS, ...EXTRA_BODY };
    let row: TurnRow;
    try {
      const reply = mode === "stream" ? await postStream(body) : await postNonStream(body);
      row = turnRow(index + 1, reply);
      // State moves with whatever the model wrote, so the next reminder reads like the app's would.
      const delta = extractionToStateDelta(state, toolCallsToExtraction(reply.calls), mints, { participantIndex, trackerDefs: config.trackers });
      prev = state;
      state = { ...state, ...(delta.statePatch as Partial<RpgSnapshotState>) };
    } catch (err) {
      row = errorRow(index + 1, err);
    }
    rows.push(row);
    history.push({ role: "user", content: beat.player }, { role: "assistant", content: beat.gm });
    logTurn(mode, row);
  }
  return rows;
}

function median(values: readonly (number | null)[]): number | null {
  const sorted = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return null;
  }
  const mid = Math.floor(sorted.length / 2);
  return round1(sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  for (const mode of RUN_MODES) {
    console.log(`\n=== ${CELL} · ${mode} ===`);
    const rows = await runMode(mode);
    const count = (shape: Shape): number => rows.filter((r) => r.shape === shape).length;
    const summary = {
      cell: CELL,
      server: SERVER,
      model: MODEL,
      template: TEMPLATE,
      mode,
      rep: REP,
      body: EXTRA_BODY,
      strict: STRICT,
      turns: rows.length,
      both: count("both"),
      proseOnly: count("prose-only"),
      toolsOnly: count("tools-only"),
      empty: count("empty"),
      errors: rows.filter((r) => r.error !== undefined).length,
      leaks: rows.filter((r) => r.leakedCallMarkup).length,
      maxPromptTokens: Math.max(0, ...rows.map((r) => r.promptTokens ?? 0)),
      medianTokPerSec: median(rows.map((r) => r.tokPerSec)),
      medianServerTokPerSec: median(rows.map((r) => r.serverTokPerSec)),
      ranAt: new Date().toISOString(),
    };
    writeFileSync(path.join(OUT, `${CELL}.${mode}.r${REP}.json`), `${JSON.stringify({ summary, rows }, null, 2)}\n`);
    appendFileSync(path.join(OUT, "cells.jsonl"), `${JSON.stringify(summary)}\n`);
    console.log(
      `[${CELL} ${mode}] both ${summary.both}/${summary.turns} · prose-only ${summary.proseOnly} · tools-only ${summary.toolsOnly} · empty ${summary.empty} · errors ${summary.errors} · leaks ${summary.leaks} · max prompt ${summary.maxPromptTokens} · ${summary.medianTokPerSec ?? "?"} tok/s`,
    );
  }
}

await main();
