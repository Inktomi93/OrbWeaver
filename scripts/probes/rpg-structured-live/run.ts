// Live acceptance matrix for the structured state round (item 0511): the real composition root over a fresh
// in-memory db, real connection rows and bindings, real `chat.send` turns, the real RPG flush and the real host
// resync. Only the stores are in memory; every model call is real, and the provider transport is tapped, not faked.
//
//   node scripts/probes/rpg-structured-live/run.ts <cell>...   one or more cells from CELLS (see README.md)
//   node scripts/probes/rpg-structured-live/run.ts report      the per-cell table from results.jsonl

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { Principal } from "@orb/contracts/identity";
import type { DeclaredCapability } from "@orb/contracts/inference";
import { resolveProseText } from "@orb/contracts/prose";
import type { RpgExtractionMode, RpgStateCaptureVehicle } from "@orb/contracts/rpg";
import type { CharacterHandle, ChatId, Handle, MessageId, MessageVariantId, UserCredentialId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { z } from "zod";
import type { ServicesResult } from "../../../packages/server/src/entry/compose/index.ts";
import { createServices, NO_SHARE_RELAY, UNSUPERVISED_RESTART } from "../../../packages/server/src/entry/compose/index.ts";
import { freshDb } from "../../../tests/support/db.ts";
import { seedUser } from "../../../tests/support/factories/user.ts";
import { readEnvKey } from "../openrouter/_kit.ts";
import type { PanelRead } from "./scenario.ts";
import { FINAL_EXPECT, judge, NARRATOR_CARD, panelDiff, readPanel, SCENARIO_CONTROLS, SWIPE_CHECKS, SWIPE_SCRIPT, TRACKERS, TURNS } from "./scenario.ts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
// A parallel batch writes its own file (merged afterwards), so two writers never interleave one line.
const RESULTS = readEnvKey("RPG_LIVE_RESULTS") || path.join(DIR, "results.jsonl");
const OWNER = castId<UserId>("user_rpgstructlive_owner");
const HOST = castId<UserId>("user_rpgstructlive_host");
const SESSION_SECRET = "rpg-structured-live-session-secret-0511";
const RUN_ID_CHARS = 8;
const EXIT_MISUSE = 3;
/** How long one turn's post-commit flush may take before the row records a timeout. */
const FLUSH_WAIT_MS = 600_000;
const FLUSH_POLL_MS = 250;
const TEXT_CAP = 600;
const SECRET_BOX_KEY_BYTES = 32;
const EXTRACTION_SCHEMA = "rpg_state_extraction";
const OPENROUTER_CHAT = "https://openrouter.ai/api/v1/chat/completions";
const RPG_TOOL_NAMES = new Set(["update_party", "update_inventory", "update_scene", "set_tracker", "upsert_quest", "add_journal_entry", "no_changes"]);

type Consumer = "folded" | "cheap" | "resync" | "swipes";

interface Cell {
  readonly providerId: string;
  readonly model: string;
  readonly device: string;
  readonly baseUrl?: string;
  readonly keyEnv?: string;
  readonly declared?: DeclaredCapability;
  readonly vehicle: RpgStateCaptureVehicle;
  readonly consumers: readonly Consumer[];
  readonly echoUpstream?: boolean;
  readonly maxOutputTokens?: number;
}

const ALL = ["folded", "cheap", "resync"] as const;
const GEMMA_GGUF = "gemma-4-E4B-it-Q8_0";
/** The KoboldCpp and llama.cpp arms run at this context size; the declared Ollama row matches them. */
const OLLAMA_DECLARED_WINDOW = 16_384;

const CELLS: Record<string, Cell> = {
  "ollama-gemma4-e4b": { providerId: "ollama", model: "gemma4:e4b", device: "GPU 0", baseUrl: "http://127.0.0.1:28943/v1", vehicle: "auto", consumers: ALL },
  // The same row with the window a user declares under Advanced; unpinned, the app states Ollama's 4096 default.
  "ollama-gemma4-e4b-window16k": {
    providerId: "ollama",
    model: "gemma4:e4b",
    device: "GPU 0",
    baseUrl: "http://127.0.0.1:28943/v1",
    declared: { generation: { context: { window: OLLAMA_DECLARED_WINDOW } } },
    vehicle: "auto",
    consumers: ALL,
  },
  // KoboldCpp states no tools; a user declares them under Advanced, which is what this row does.
  "koboldcpp-gemma-4-e4b": {
    providerId: "koboldcpp",
    model: `koboldcpp/${GEMMA_GGUF}`,
    device: "GPU 0",
    baseUrl: "http://127.0.0.1:28944/v1",
    declared: { generation: { tools: { parallel: false } } },
    vehicle: "auto",
    consumers: ALL,
  },
  // The panel's `structured-unavailable`: the knob asks for structured output that the row declares it lacks.
  "koboldcpp-gemma-4-e4b-structured-unavailable": {
    providerId: "koboldcpp",
    model: `koboldcpp/${GEMMA_GGUF}`,
    device: "GPU 0",
    baseUrl: "http://127.0.0.1:28944/v1",
    declared: { generation: { tools: { parallel: false }, output: { structured: false } } },
    vehicle: "structured",
    consumers: ["cheap"],
  },
  "llamacpp-gemma-4-e4b": {
    providerId: "llama-cpp",
    model: "gemma-4-e4b-it",
    device: "GPU 0",
    baseUrl: "http://127.0.0.1:28942/v1",
    vehicle: "auto",
    consumers: ALL,
  },
  "llamacpp-gemma-4-e4b-structured": {
    providerId: "llama-cpp",
    model: "gemma-4-e4b-it",
    device: "GPU 0",
    baseUrl: "http://127.0.0.1:28942/v1",
    vehicle: "structured",
    consumers: ["cheap", "resync"],
  },
  "vllm-qwen3.8-27b": { providerId: "vllm", model: "qwen3.8-27b", device: "GPU 1", baseUrl: "http://127.0.0.1:28941/v1", vehicle: "auto", consumers: ALL },
  "vllm-qwen3.8-27b-structured": {
    providerId: "vllm",
    model: "qwen3.8-27b",
    device: "GPU 1",
    baseUrl: "http://127.0.0.1:28941/v1",
    vehicle: "structured",
    consumers: ["cheap", "resync"],
  },
  "anthropic-claude-sonnet-5-5": {
    providerId: "anthropic",
    model: "claude-sonnet-5-5",
    device: "hosted",
    keyEnv: "ANTHROPIC_PROBE_KEY",
    vehicle: "auto",
    consumers: ALL,
  },
  // Not in the brief's list: the only live proof of the patch-list shape, which Claude reaches under `structured`.
  "anthropic-claude-sonnet-5-5-structured": {
    providerId: "anthropic",
    model: "claude-sonnet-5-5",
    device: "hosted",
    keyEnv: "ANTHROPIC_PROBE_KEY",
    vehicle: "structured",
    consumers: ["cheap"],
  },
  "openrouter-claude-sonnet-5.5": {
    providerId: "openrouter",
    model: "anthropic/claude-sonnet-5.5",
    device: "hosted",
    keyEnv: "OPENROUTER_PROBE_KEY",
    vehicle: "auto",
    consumers: ALL,
    echoUpstream: true,
  },
  "openrouter-claude-sonnet-4.6": {
    providerId: "openrouter",
    model: "anthropic/claude-sonnet-4.6",
    device: "hosted",
    keyEnv: "OPENROUTER_PROBE_KEY",
    vehicle: "auto",
    consumers: ALL,
    echoUpstream: true,
  },
  "openai-gpt-5.5": { providerId: "openai", model: "gpt-5.5", device: "hosted", keyEnv: "OPENAI_PROBE_KEY", vehicle: "auto", consumers: ALL },
  "gemini-3.8-flash": { providerId: "google", model: "gemini-3.8-flash", device: "hosted", keyEnv: "GEMINI_PROBE_KEY", vehicle: "auto", consumers: ALL },
  "gemini-3.1-pro-preview": {
    providerId: "google",
    model: "gemini-3.1-pro-preview",
    device: "hosted",
    keyEnv: "GEMINI_PROBE_KEY",
    vehicle: "auto",
    consumers: ALL,
  },
  "gemini-3.1-pro-preview-folded-16k": {
    providerId: "google",
    model: "gemini-3.1-pro-preview",
    device: "hosted",
    keyEnv: "GEMINI_PROBE_KEY",
    vehicle: "auto",
    consumers: ["folded"],
    maxOutputTokens: 16_384,
  },
  "gemini-3.8-flash-structured": {
    providerId: "google",
    model: "gemini-3.8-flash",
    device: "hosted",
    keyEnv: "GEMINI_PROBE_KEY",
    vehicle: "structured",
    consumers: ["cheap", "resync"],
  },
  "gemini-3.1-pro-preview-structured": {
    providerId: "google",
    model: "gemini-3.1-pro-preview",
    device: "hosted",
    keyEnv: "GEMINI_PROBE_KEY",
    vehicle: "structured",
    consumers: ["cheap", "resync"],
  },
  "custom-gemini-3.8-flash-compat": {
    providerId: "custom-openai",
    model: "gemini-3.8-flash",
    device: "hosted",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_PROBE_KEY",
    declared: { features: { thinkingOff: "none" } },
    vehicle: "structured",
    consumers: ALL,
  },
  "custom-gemini-3.1-pro-preview-compat": {
    providerId: "custom-openai",
    model: "gemini-3.1-pro-preview",
    device: "hosted",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_PROBE_KEY",
    declared: { features: { thinkingOff: "none" } },
    vehicle: "structured",
    consumers: ALL,
  },
};

const runId = mintTypeId(ID_PREFIX.chatTurn).slice(-RUN_ID_CHARS);
const git = (gitArgs: readonly string[]): string => execFileSync("git", gitArgs, { cwd: DIR, encoding: "utf8" }).trim();
const tree = { head: git(["rev-parse", "--short", "HEAD"]), dirtyProduct: git(["status", "--porcelain", "--", "../../../packages"]).length > 0 };

function row(fields: Record<string, unknown>): void {
  appendFileSync(RESULTS, `${JSON.stringify({ run: runId, at: new Date().toISOString(), tree, fixtureControls: SCENARIO_CONTROLS, ...fields })}\n`);
}

const clip = (text: string): string => (text.length > TEXT_CAP ? `${text.slice(0, TEXT_CAP)}…` : text);

// ── the provider tap: every request the composed runtime sends, with its timing and reply ──────────────────────

interface Wire {
  readonly url: string;
  readonly body: Record<string, unknown> | null;
  readonly headers: RequestInit["headers"];
  readonly startedAt: number;
  status: number | null;
  ms: number | null;
  reply: string;
  error: string | null;
}

const wires: Wire[] = [];

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> | null {
  if (typeof init?.body !== "string") {
    return null;
  }
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const tappedFetch: typeof fetch = async (input, init) => {
  const wire: Wire = {
    url: urlOf(input),
    body: parseBody(init),
    headers: init?.headers,
    startedAt: Date.now(),
    status: null,
    ms: null,
    reply: "",
    error: null,
  };
  wires.push(wire);
  try {
    const res = await globalThis.fetch(input, init);
    wire.status = res.status;
    // The clone is read to its end beside the caller's own read, so a streamed reply's latency is its last byte.
    void res
      .clone()
      .text()
      .then((text) => {
        wire.reply = text;
        wire.ms = Date.now() - wire.startedAt;
      })
      .catch((err: unknown) => {
        wire.error = String(err);
        wire.ms = Date.now() - wire.startedAt;
      });
    return res;
  } catch (err) {
    wire.error = String(err);
    wire.ms = Date.now() - wire.startedAt;
    throw err;
  }
};

// ── the log tap: every `rpg.*` event the round, the flush and the resync emit ───────────────────────────────────

interface LogEvent {
  readonly level: string;
  readonly event: string;
  readonly fields: Record<string, unknown>;
}

const logEvents: LogEvent[] = [];

function chunkText(chunk: unknown): string {
  return Buffer.isBuffer(chunk) ? chunk.toString("utf8") : "";
}

// The product logs through a pino multistream onto `process.stdout`, and a settings rebuild re-binds the logger's
// level methods, so the tap reads the serialized lines rather than wrapping the logger.
function tapLog(): void {
  const write = process.stdout.write.bind(process.stdout) as (chunk: unknown, ...rest: unknown[]) => boolean;
  const tapped = (chunk: unknown, ...rest: unknown[]): boolean => {
    const text = typeof chunk === "string" ? chunk : chunkText(chunk);
    for (const line of text.split("\n")) {
      if (!(line.startsWith("{") && line.includes('"event":"rpg.'))) {
        continue;
      }
      try {
        const { level, event, time: _time, pid: _pid, hostname: _host, msg: _msg, ...fields } = JSON.parse(line) as Record<string, unknown>;
        if (typeof event === "string") {
          logEvents.push({ level: String(level), event, fields });
        }
      } catch {
        // A line split across two writes is skipped; the stdout log keeps it.
      }
    }
    return write(chunk, ...rest);
  };
  Object.assign(process.stdout, { write: tapped });
}

// ── reading the wire ───────────────────────────────────────────────────────────────────────────────────────────

type WireKind = "char-turn" | "char-turn+tools" | "state-tools" | "state-structured" | "state-extraction" | "other";

function toolNamesOf(body: Record<string, unknown>): string[] {
  const tools = body["tools"];
  if (!Array.isArray(tools)) {
    return [];
  }
  return (tools as Record<string, unknown>[]).flatMap((tool) => {
    const fn = tool["function"] as { name?: string } | undefined;
    const decls = tool["functionDeclarations"] as { name?: string }[] | undefined;
    return [fn?.name ?? (tool["name"] as string | undefined), ...(decls ?? []).map((d) => d.name)].filter((n): n is string => typeof n === "string");
  });
}

/** The response schema a body carries, on whichever wire it rode, with the wire field that carried it. */
function schemaOf(body: Record<string, unknown>): { readonly field: string; readonly name: string | null; readonly schema: Record<string, unknown> } | null {
  const rf = body["response_format"] as { type?: string; json_schema?: { name?: string; schema?: Record<string, unknown> } } | undefined;
  if (rf?.json_schema?.schema !== undefined) {
    return { field: "response_format.json_schema", name: rf.json_schema.name ?? null, schema: rf.json_schema.schema };
  }
  const oc = (body["output_config"] as { format?: { schema?: Record<string, unknown> } } | undefined)?.format;
  if (oc?.schema !== undefined) {
    return { field: "output_config.format", name: null, schema: oc.schema };
  }
  if (body["format"] !== null && typeof body["format"] === "object") {
    return { field: "ollama format", name: null, schema: body["format"] as Record<string, unknown> };
  }
  const gen = body["generationConfig"] as Record<string, unknown> | undefined;
  const gs = (gen?.["responseJsonSchema"] ?? gen?.["responseSchema"]) as Record<string, unknown> | undefined;
  if (gs !== undefined) {
    return { field: "generationConfig", name: null, schema: gs };
  }
  const text = body["text"] as { format?: { name?: string; schema?: Record<string, unknown> } } | undefined;
  if (text?.format?.schema !== undefined) {
    return { field: "text.format", name: text.format.name ?? null, schema: text.format.schema };
  }
  return null;
}

const PATCH_KEY = '"plane"';

/** union = `changes[]` of `{tool,args}` members; patch = flat `{plane,call,field,item,value}` entries. The
 *  Anthropic arm nests the entry schema differently, so the shape is read off the key anywhere under `changes`. */
function shapeOf(schema: Record<string, unknown>): string {
  const changes = (schema["properties"] as Record<string, unknown> | undefined)?.["changes"];
  if (changes === undefined) {
    return "extraction";
  }
  return JSON.stringify(changes).includes(PATCH_KEY) ? "patch" : "union";
}

/** A stored request's shape, corrected from its reply: rows taken before `shapeOf` read nested schemas say `union`. */
function shapeFromReply(detail: string, reply: string): string {
  return detail.endsWith(" union") && reply.includes(PATCH_KEY) ? `${detail.slice(0, -" union".length)} patch` : detail;
}

/** The opening words of the two system blocks a state tool round sends, JSON-escaped as a body carries them. */
const MARKER_CHARS = 60;
const STATE_ROUND_MARKERS = (["rpg.extract.toolRoundHeader", "rpg.extract.plane.inventory"] as const).map((slot) =>
  JSON.stringify(resolveProseText(slot, {}).slice(0, MARKER_CHARS)).slice(1, -1),
);

function classify(wire: Wire): { readonly kind: WireKind; readonly detail: string } {
  const body = wire.body;
  if (body === null || wire.url.endsWith("/models") || wire.url.includes("/api/show") || wire.url.includes("/api/tags")) {
    return { kind: "other", detail: wire.url };
  }
  const schema = schemaOf(body);
  if (schema !== null && shapeOf(schema.schema) !== "extraction") {
    return { kind: "state-structured", detail: `${schema.field} ${shapeOf(schema.schema)}` };
  }
  if (schema !== null && (schema.name === EXTRACTION_SCHEMA || "party" in ((schema.schema["properties"] as object | undefined) ?? {}))) {
    return { kind: "state-extraction", detail: schema.field };
  }
  const tools = toolNamesOf(body);
  const rpgTools = tools.filter((name) => RPG_TOOL_NAMES.has(name));
  const choice = JSON.stringify(body["tool_choice"] ?? body["toolConfig"] ?? null);
  if (rpgTools.length > 0) {
    // The tool round's system block opens with its header slot (or the inventory plane, on the audit); a folded
    // character turn carries the same tools under the character's own prompt.
    const stateRound = STATE_ROUND_MARKERS.some((marker) => JSON.stringify(body).includes(marker));
    return { kind: stateRound ? "state-tools" : "char-turn+tools", detail: `tool_choice ${choice}` };
  }
  return schema !== null ? { kind: "other", detail: `${schema.field} ${schema.name ?? ""}` } : { kind: "char-turn", detail: wire.url };
}

/** The schema name a state-structured request named, to tell the state round from any other structured call. */
function isStateRound(kind: WireKind): boolean {
  return kind === "state-tools" || kind === "state-structured" || kind === "state-extraction";
}

type Json = Record<string, unknown>;

interface ReplyParts {
  readonly text: string[];
  readonly calls: string[];
  readonly meta: Json;
}

const asList = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);
const asRecord = (value: unknown): Json | undefined => (value !== null && typeof value === "object" ? (value as Json) : undefined);

/** Stop reasons and token counts, on whichever wire spelled them. */
function frameMeta(frame: Json, out: ReplyParts): void {
  for (const key of ["done_reason", "stop_reason", "prompt_eval_count", "eval_count"]) {
    if (frame[key] !== undefined && frame[key] !== null) {
      out.meta[key] = frame[key];
    }
  }
  const finish = asList(frame["choices"])[0]?.["finish_reason"];
  if (finish !== undefined && finish !== null) {
    out.meta["finish_reason"] = finish;
  }
  const nativeFinish = asList(frame["candidates"])[0]?.["finishReason"];
  if (typeof nativeFinish === "string") {
    out.meta["finishReason"] = nativeFinish;
  }
  if (typeof frame["modelVersion"] === "string") {
    out.meta["modelVersion"] = frame["modelVersion"];
  }
  const usage = asRecord(frame["usage"] ?? frame["usageMetadata"] ?? asRecord(frame["message"])?.["usage"]);
  if (usage !== undefined) {
    out.meta["usage"] = { ...asRecord(out.meta["usage"]), ...usage };
  }
  const anthropicStop = asRecord(frame["delta"])?.["stop_reason"];
  if (typeof anthropicStop === "string") {
    out.meta["stop_reason"] = anthropicStop;
  }
}

/** OpenAI chat chunks and bodies, and Ollama's native `message`. */
function chatParts(frame: Json, out: ReplyParts): void {
  const choice = asList(frame["choices"])[0];
  const message = asRecord(choice?.["delta"] ?? choice?.["message"] ?? frame["message"]);
  if (typeof message?.["content"] === "string") {
    out.text.push(message["content"]);
  }
  for (const call of asList(message?.["tool_calls"])) {
    const fn = asRecord(call["function"]);
    const args = fn?.["arguments"];
    const name = typeof fn?.["name"] === "string" ? `${fn["name"]}:` : "";
    out.calls.push(`${name}${typeof args === "string" ? args : JSON.stringify(args ?? "")}`);
  }
}

/** Anthropic Messages events and bodies. */
function anthropicParts(frame: Json, out: ReplyParts): void {
  const delta = asRecord(frame["delta"]);
  if (typeof delta?.["text"] === "string") {
    out.text.push(delta["text"]);
  }
  if (typeof delta?.["partial_json"] === "string") {
    out.calls.push(delta["partial_json"]);
  }
  const block = asRecord(frame["content_block"]);
  if (block?.["type"] === "tool_use") {
    out.calls.push(`${String(block["name"])}:`);
  }
  for (const part of asList(frame["content"])) {
    if (typeof part["text"] === "string") {
      out.text.push(part["text"]);
    }
    if (part["type"] === "tool_use") {
      out.calls.push(`${String(part["name"])}:${JSON.stringify(part["input"])}`);
    }
  }
}

/** Gemini candidates, skipping thought parts. */
function geminiParts(frame: Json, out: ReplyParts): void {
  const parts = asList(asRecord(asList(frame["candidates"])[0]?.["content"])?.["parts"]);
  for (const part of parts) {
    if (typeof part["text"] === "string" && part["thought"] !== true) {
      out.text.push(part["text"]);
    }
    if (part["functionCall"] !== undefined) {
      out.calls.push(JSON.stringify(part["functionCall"]));
    }
    if (part["functionCall"] !== undefined || typeof part["thoughtSignature"] === "string") {
      const call = asRecord(part["functionCall"]);
      out.meta["nativeParts"] = [
        ...asList(out.meta["nativeParts"]),
        {
          kind: call === undefined ? "signed-part" : "functionCall",
          id: call?.["id"] ?? null,
          name: call?.["name"] ?? null,
          signaturePresent: typeof part["thoughtSignature"] === "string",
        },
      ];
    }
  }
}

/** OpenAI Responses bodies and text deltas. */
function responsesParts(frame: Json, out: ReplyParts): void {
  for (const item of asList(frame["output"])) {
    for (const part of asList(item["content"])) {
      if (typeof part["text"] === "string") {
        out.text.push(part["text"]);
      }
    }
    if (item["type"] === "function_call") {
      out.calls.push(`${String(item["name"])}:${String(item["arguments"])}`);
    }
  }
  if (frame["type"] === "response.output_text.delta" && typeof frame["delta"] === "string") {
    out.text.push(frame["delta"]);
  }
}

const FRAME_READERS: readonly ((frame: Json, out: ReplyParts) => void)[] = [frameMeta, chatParts, anthropicParts, geminiParts, responsesParts];

/** A reply decoded from SSE, NDJSON or one JSON body into the text it said and the calls it made. */
function decodeReply(raw: string): { readonly text: string; readonly calls: string; readonly meta: Json } {
  const out: ReplyParts = { text: [], calls: [], meta: {} };
  const frames = raw.trimStart().startsWith("{") && !raw.includes("\n{") ? [raw] : raw.split("\n");
  for (const line of frames) {
    const payload = line.startsWith("data: ") ? line.slice("data: ".length) : line;
    if (!payload.trimStart().startsWith("{")) {
      continue;
    }
    try {
      const frame = JSON.parse(payload) as Json;
      for (const read of FRAME_READERS) {
        read(frame, out);
      }
    } catch {
      // A frame cut mid-line by the transport is not evidence either way.
    }
  }
  return { text: out.text.join(""), calls: out.calls.join(" "), meta: out.meta };
}

/** What the model answered a state round with, cut to the part a reader needs. */
function replyDigest(wire: Wire): string {
  const { text, calls } = decodeReply(wire.reply);
  return clip(`${text}${calls.length > 0 ? ` [calls] ${calls}` : ""}`.replace(/\s+/g, " "));
}

// ── OpenRouter: what the router forwarded upstream ─────────────────────────────────────────────────────────────

async function echoUpstream(wire: Wire): Promise<Record<string, unknown>> {
  if (wire.body === null) {
    return { skipped: "no body" };
  }
  const body = { ...wire.body, stream: true, debug: { echo_upstream_body: true } };
  const res = await globalThis.fetch(OPENROUTER_CHAT, {
    method: "POST",
    ...(wire.headers === undefined ? {} : { headers: wire.headers }),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  for (const line of text.split("\n")) {
    if (!(line.startsWith("data: ") && line.includes("echo_upstream_body"))) {
      continue;
    }
    const chunk = JSON.parse(line.slice("data: ".length)) as { debug?: { echo_upstream_body?: Record<string, unknown> } };
    const upstream = chunk.debug?.echo_upstream_body ?? {};
    return {
      status: res.status,
      upstreamKeys: Object.keys(upstream).toSorted(),
      tool_choice: upstream["tool_choice"] ?? null,
      tools: toolNamesOf(upstream),
      output_config: upstream["output_config"] ?? null,
      thinking: upstream["thinking"] ?? null,
      max_tokens: upstream["max_tokens"] ?? null,
    };
  }
  return { status: res.status, noEcho: clip(text) };
}

// ── the app, per cell ──────────────────────────────────────────────────────────────────────────────────────────

function principalOf(userId: UserId, handle: string): Principal {
  return { userId, role: "user", handle: castId<Handle>(handle), externalId: null, via: "header" };
}

interface Booted {
  readonly app: ServicesResult;
  readonly host: Principal;
  readonly cleanup: () => void;
  readonly maxOutputTokens: number | undefined;
}

async function storeKey(services: ServicesResult["services"], host: Principal, provider: string, keyEnv: string): Promise<UserCredentialId> {
  const key = readEnvKey(keyEnv);
  if (key.length === 0) {
    throw new Error(`${keyEnv} is not set`);
  }
  return (await services.credentials.add({ principal: host, provider, key })).id;
}

async function boot(cell: Cell): Promise<Booted> {
  const db = await freshDb();
  const casDir = mkdtempSync(path.join(tmpdir(), "rpg-structured-live-cas-"));
  const variantDir = mkdtempSync(path.join(tmpdir(), "rpg-structured-live-var-"));
  const stagingDir = mkdtempSync(path.join(tmpdir(), "rpg-structured-live-stage-"));
  const app = await createServices({
    serverRestart: UNSUPERVISED_RESTART,
    share: NO_SHARE_RELAY,
    db,
    now: () => Date.now(),
    ownerId: OWNER,
    secretBoxKey: randomBytes(SECRET_BOX_KEY_BYTES),
    casDir,
    variantDir,
    importStagingDir: stagingDir,
    sessionSecret: SESSION_SECRET,
    providerSeams: { sdkFetch: tappedFetch },
    rpgTrace: true,
  });
  await seedUser(db, { id: OWNER, handle: castId<Handle>("rpgstructlive_owner"), role: "owner" });
  await seedUser(db, { id: HOST, handle: castId<Handle>("rpgstructlive_host") });
  const host = principalOf(HOST, "rpgstructlive_host");
  const { services } = app;
  const credentialId = cell.keyEnv === undefined ? null : await storeKey(services, host, cell.providerId, cell.keyEnv);
  const connection = await services.connection.create({
    principal: host,
    providerId: cell.providerId,
    model: cell.model,
    credentialId,
    baseUrl: cell.baseUrl ?? null,
    declared: cell.declared ?? null,
  });
  await services.connection.setBinding({ principal: host, task: "chat", connectionId: connection.id });
  if (cell.maxOutputTokens !== undefined) {
    const resolved = await services.connection.resolveChatCapability({ principal: host });
    if (resolved.capability.kind !== "generation" || resolved.capability.generation.output.maxTokens.max < cell.maxOutputTokens) {
      throw new Error("Diagnostic output budget exceeds the resolved model limit");
    }
    row({ kind: "diagnostic-config", model: cell.model, maxOutputTokens: cell.maxOutputTokens, effort: "provider-default", capability: resolved.capability });
  }
  return {
    app,
    host,
    maxOutputTokens: cell.maxOutputTokens,
    cleanup: (): void => {
      for (const dir of [casDir, variantDir, stagingDir]) {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

/** Wait for this chat's next `flushed` trace event past `afterSeq`. */
async function waitFlushed(
  app: ServicesResult,
  chatId: ChatId,
  afterSeq: number,
): Promise<{ readonly outcome: string; readonly droppedReason: string | null } | null> {
  const deadline = Date.now() + FLUSH_WAIT_MS;
  while (Date.now() < deadline) {
    const done = app.rpgTrace?.recent({ chatId }).find((r) => r.seq > afterSeq && r.event.phase === "flushed");
    if (done !== undefined && done.event.phase === "flushed") {
      return { outcome: done.event.outcome, droppedReason: done.event.droppedReason };
    }
    await new Promise((resolve) => setTimeout(resolve, FLUSH_POLL_MS));
  }
  return null;
}

function lastSeq(app: ServicesResult, chatId: ChatId): number {
  return app.rpgTrace?.recent({ chatId }).at(-1)?.seq ?? 0;
}

interface Game {
  readonly chatId: ChatId;
  readonly panelReason: Record<string, unknown>;
}

/** Each game mints its own narrator card; the handle is unique per owner. */
let gamesStarted = 0;

async function startGame(booted: Booted, cell: Cell, mode: RpgExtractionMode): Promise<Game> {
  const { services } = booted.app;
  const character = await services.character.create({
    principal: booted.host,
    input: { handle: castId<CharacterHandle>(`narrator-${mode}-${String(++gamesStarted)}`), name: NARRATOR_CARD.name, description: NARRATOR_CARD.description },
  });
  const { chat } = await services.chat.startChat({ principal: booted.host, characterIds: [character.id], opening: "none" });
  await services.rpg.createGame({ principal: booted.host, chatId: chat.id, mode: "lite" });
  await services.rpg.updateConfig({
    principal: booted.host,
    chatId: chat.id,
    extractionMode: mode,
    patch: { trackers: TRACKERS, stateCaptureVehicle: cell.vehicle },
  });
  const game = await services.rpg.getGame({ principal: booted.host, chatId: chat.id });
  return { chatId: chat.id, panelReason: { ...game.effectiveDelivery } };
}

async function panel(booted: Booted, chatId: ChatId): Promise<PanelRead> {
  return readPanel(await booted.app.services.rpg.getTrackerView({ principal: booted.host, chatId }));
}

/** The trace's tool events in a window: which vehicle carried the calls, and each call's verdict. */
function toolEvents(
  app: ServicesResult,
  chatId: ChatId,
  afterSeq: number,
): {
  vehicles: string[];
  calls: { name: string; verdict: string; args: string; issues: readonly string[] }[];
  path: string | null;
  fallbackReason: string | null;
} {
  const records = app.rpgTrace?.recent({ chatId }).filter((r) => r.seq > afterSeq) ?? [];
  const vehicles: string[] = [];
  const calls: { name: string; verdict: string; args: string; issues: readonly string[] }[] = [];
  let pathTaken: string | null = null;
  let fallbackReason: string | null = null;
  for (const record of records) {
    const event = record.event;
    if (event.phase === "tool") {
      vehicles.push(event.vehicle);
      calls.push(...event.calls.map((c) => ({ name: c.name, verdict: c.verdict, args: clip(c.args), issues: c.issues })));
    }
    if (event.phase === "flush") {
      pathTaken = event.path;
      fallbackReason = event.fallbackReason;
    }
  }
  return { vehicles, calls, path: pathTaken, fallbackReason };
}

/** The body fields that bound a reply: its length cap, window, reasoning switch and choice. */
const KNOB_KEYS = [
  "max_tokens",
  "max_completion_tokens",
  "max_output_tokens",
  "options",
  "think",
  "thinking",
  "reasoning",
  "reasoning_effort",
  "chat_template_kwargs",
  "tool_choice",
  "temperature",
  "stream",
];

function knobsOf(body: Record<string, unknown> | null): Json {
  const knobs: Json = {};
  for (const key of KNOB_KEYS) {
    if (body?.[key] !== undefined) {
      knobs[key] = body[key];
    }
  }
  const gen = body?.["generationConfig"] as Json | undefined;
  if (gen !== undefined) {
    const { responseJsonSchema: _schema, responseSchema: _legacy, ...rest } = gen;
    knobs["generationConfig"] = rest;
  }
  return knobs;
}

interface StateRequest {
  readonly kind: WireKind;
  readonly detail: string;
  readonly status: number | null;
  readonly ms: number | null;
  readonly reply: string;
  readonly knobs: Json;
  readonly stop: Json;
}

function wireSummary(window: readonly Wire[]): { charTurnMs: number | null; stateMs: number; stateRequests: StateRequest[] } {
  let charTurnMs: number | null = null;
  let stateMs = 0;
  const stateRequests: StateRequest[] = [];
  for (const wire of window) {
    const { kind, detail } = classify(wire);
    if (kind === "char-turn" || kind === "char-turn+tools") {
      charTurnMs = (charTurnMs ?? 0) + (wire.ms ?? 0);
    }
    if (isStateRound(kind)) {
      stateMs += wire.ms ?? 0;
      stateRequests.push({
        kind,
        detail,
        status: wire.status,
        ms: wire.ms,
        reply: replyDigest(wire),
        knobs: knobsOf(wire.body),
        stop: decodeReply(wire.reply).meta,
      });
    }
  }
  return { charTurnMs, stateMs, stateRequests };
}

const INVENTORY_AUDIT = "inventory audit";

/** A retry is the round asked again after an empty downgraded tool round; an inventory audit is counted apart. */
function retriesOf(events: readonly { readonly event: string }[]): number {
  return events.filter((e) => e.event.endsWith("structured_fallback")).length;
}

const ROUND_EVENTS = /unparseable|stripped|phantom|healed|dropped|failed|fallback|empty|vehicle_fallback|readonly|unresolvable|path|quiet|cancelled/;

async function settleWires(): Promise<void> {
  const deadline = Date.now() + FLUSH_WAIT_MS;
  while (wires.some((w) => w.ms === null) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, FLUSH_POLL_MS));
  }
}

/** Send one player turn through `chat.send`; a refusal is recorded, never thrown out of the run. */
async function send(booted: Booted, chatId: ChatId, content: string): Promise<string | null> {
  try {
    await booted.app.services.chat.send({
      principal: booted.host,
      chatId,
      content,
      ...(booted.maxOutputTokens === undefined ? {} : { intent: { maxOutputTokens: booted.maxOutputTokens } }),
    });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function nativeRequestParts(body: Json | null): Json[] {
  return asList(body?.["contents"]).flatMap((content, messageIndex) =>
    asList(content["parts"]).flatMap((part, partIndex) => {
      const call = asRecord(part["functionCall"]);
      const result = asRecord(part["functionResponse"]);
      const kind = call === undefined ? "signed-part" : "functionCall";
      return call === undefined && result === undefined && typeof part["thoughtSignature"] !== "string"
        ? []
        : [
            {
              messageIndex,
              partIndex,
              role: content["role"],
              kind: result === undefined ? kind : "functionResponse",
              id: call?.["id"] ?? result?.["id"] ?? null,
              name: call?.["name"] ?? result?.["name"] ?? null,
              signaturePresent: typeof part["thoughtSignature"] === "string",
            },
          ];
    }),
  );
}

function characterRequestFacts(wire: Wire): Json {
  const tools = wire.body === null ? [] : toolNamesOf(wire.body);
  const system = asRecord(wire.body?.["systemInstruction"]);
  const systemText = asList(system?.["parts"])
    .map((part) => part["text"])
    .filter((text): text is string => typeof text === "string")
    .join("\n");
  return {
    kind: classify(wire).kind,
    status: wire.status,
    ms: wire.ms,
    knobs: knobsOf(wire.body),
    toolConfig: wire.body?.["toolConfig"] ?? null,
    declaredTools: tools,
    declaredToolCount: tools.length,
    narrationConstraintPresent: systemText.includes(NARRATOR_CARD.description),
    requestParts: nativeRequestParts(wire.body),
    stop: decodeReply(wire.reply).meta,
  };
}

/** The first state round of a consumer (or its folded character turn), re-sent with OpenRouter's upstream echo. */
async function echoFirst(window: readonly Wire[]): Promise<Record<string, unknown> | null> {
  const target = window.find((w) => isStateRound(classify(w).kind)) ?? window.find((w) => classify(w).kind === "char-turn+tools");
  return target === undefined ? null : await echoUpstream(target);
}

interface TurnCtx {
  readonly cellName: string;
  readonly booted: Booted;
  readonly mode: RpgExtractionMode;
  readonly chatId: ChatId;
  /** Re-send this turn's first state round with OpenRouter's upstream echo. */
  readonly echo: boolean;
}

async function playTurn(ctx: TurnCtx, turn: (typeof TURNS)[number]): Promise<boolean> {
  const { app } = ctx.booted;
  const before = await panel(ctx.booted, ctx.chatId);
  const seq = lastSeq(app, ctx.chatId);
  const wireMark = wires.length;
  const logMark = logEvents.length;
  const started = Date.now();
  const sendError = await send(ctx.booted, ctx.chatId, turn.player);
  const flushed = sendError === null ? await waitFlushed(app, ctx.chatId, seq) : null;
  await settleWires();
  const totalMs = Date.now() - started;
  const after = await panel(ctx.booted, ctx.chatId);
  const verdict = judge(turn.expect, after, before);
  const window = wires.slice(wireMark);
  const { charTurnMs, stateMs, stateRequests } = wireSummary(window);
  const charWire = window.find((w) => classify(w).kind.startsWith("char-turn"));
  const reply = charWire === undefined ? { text: "", calls: "", meta: {} } : decodeReply(charWire.reply);
  const tools = toolEvents(app, ctx.chatId, seq);
  const events = logEvents.slice(logMark).filter((e) => ROUND_EVENTS.test(e.event));
  const upstream = ctx.echo ? await echoFirst(window) : null;
  row({
    kind: "turn",
    cell: ctx.cellName,
    consumer: ctx.mode,
    turn: turn.id,
    planes: turn.planes,
    sendError,
    flush: flushed,
    path: tools.path,
    fallbackReason: tools.fallbackReason,
    traceVehicles: tools.vehicles,
    calls: tools.calls,
    stateRequests,
    retries: retriesOf(events),
    audits: tools.vehicles.filter((vehicle) => vehicle.includes(INVENTORY_AUDIT)).length,
    latency: { totalMs, charTurnMs, stateMs },
    expectPass: verdict.pass,
    expectMiss: verdict.miss,
    before,
    after,
    events,
    upstream,
    narration: ctx.booted.maxOutputTokens === undefined ? clip(reply.text.replace(/\s+/g, " ")) : "",
    charTurnCalls: ctx.booted.maxOutputTokens === undefined ? clip(reply.calls) : "",
    charRequests: window.filter((wire) => classify(wire).kind.startsWith("char-turn")).map(characterRequestFacts),
  });
  process.stdout.write(
    `${ctx.cellName} ${ctx.mode} ${turn.id}: ${tools.path ?? "-"} ${tools.vehicles.join("+") || "-"} req=${stateRequests.map((r) => r.kind).join(",") || "-"} ` +
      `pass ${verdict.pass.length}/${turn.expect.length} ${sendError ?? ""} ${totalMs}ms\n`,
  );
  return upstream !== null;
}

async function playConsumer(cellName: string, cell: Cell, booted: Booted, mode: RpgExtractionMode): Promise<ChatId> {
  const game = await startGame(booted, cell, mode);
  row({ kind: "game", cell: cellName, consumer: mode, vehicleKnob: cell.vehicle, panel: game.panelReason });
  let echoed = false;
  for (const turn of TURNS) {
    const ctx: TurnCtx = { cellName, booted, mode, chatId: game.chatId, echo: cell.echoUpstream === true && !echoed };
    const sent = await playTurn(ctx, turn);
    echoed = sent || echoed;
  }
  return game.chatId;
}

async function runResync(cellName: string, booted: Booted, chatId: ChatId): Promise<void> {
  const { app, host } = booted;
  const before = await panel(booted, chatId);
  const wireMark = wires.length;
  const logMark = logEvents.length;
  const started = Date.now();
  let result: unknown;
  try {
    result = await app.services.rpg.resyncFromStory({ principal: host, chatId });
  } catch (err) {
    result = { threw: err instanceof Error ? err.message : String(err) };
  }
  await settleWires();
  const after = await panel(booted, chatId);
  const { stateMs, stateRequests } = wireSummary(wires.slice(wireMark));
  const verdict = judge(FINAL_EXPECT, after, before);
  const game = await app.services.rpg.getGame({ principal: host, chatId });
  row({
    kind: "resync",
    cell: cellName,
    consumer: "resync",
    result,
    stateRequests,
    retries: retriesOf(logEvents.slice(logMark)),
    latency: { totalMs: Date.now() - started, stateMs },
    expectPass: verdict.pass,
    expectMiss: verdict.miss,
    before,
    after,
    panel: { ...game.effectiveDelivery },
    events: logEvents.slice(logMark).filter((e) => ROUND_EVENTS.test(e.event)),
  });
  process.stdout.write(
    `${cellName} resync: ${JSON.stringify(result)} req=${stateRequests.map((r) => `${r.kind}:${r.detail}`).join(",")} pass ${verdict.pass.length}/${FINAL_EXPECT.length}\n`,
  );
}

// ── swipes: state is stored per variant ─────────────────────────────────────────────────────────────────────────

/** The newest assistant slot, and the variant it has selected. */
async function lastAssistant(booted: Booted, chatId: ChatId): Promise<{ readonly messageId: MessageId; readonly variantId: MessageVariantId }> {
  const page = await booted.app.services.chat.listMessages({ principal: booted.host, chatId });
  const slot = page.messages.findLast((m) => m.role === "assistant");
  if (slot === undefined) {
    throw new Error(`chat ${chatId} has no assistant message`);
  }
  return { messageId: slot.id, variantId: slot.selectedVariantId };
}

interface SwipeStep {
  readonly step: string;
  readonly read: PanelRead;
  readonly vehicles: readonly string[];
  /** The state round's calls for this step, with their verdicts: the writes this variant made. */
  readonly calls: readonly { readonly name: string; readonly verdict: string; readonly args: string }[];
  readonly narration: string;
  readonly flush: { readonly outcome: string; readonly droppedReason: string | null } | null;
  readonly error: string | null;
}

/** Run one verb and return the panel it left. A generating verb (send, swipe) is followed by its flush; a pointer
 *  move (`selectVariant`) runs no state round, so nothing is waited for. */
async function generate(
  at: { readonly booted: Booted; readonly chatId: ChatId },
  step: string,
  verb: () => Promise<unknown>,
  flushes = true,
): Promise<SwipeStep> {
  const { booted, chatId } = at;
  const seq = lastSeq(booted.app, chatId);
  const wireMark = wires.length;
  let error: string | null = null;
  try {
    await verb();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const flush = error === null && flushes ? await waitFlushed(booted.app, chatId, seq) : null;
  await settleWires();
  process.stdout.write(`  swipe step "${step}": ${error ?? "ok"} flush=${flush?.outcome ?? "none"}\n`);
  const tools = toolEvents(booted.app, chatId, seq);
  const charWire = wires.slice(wireMark).find((w) => classify(w).kind.startsWith("char-turn"));
  const narration = charWire === undefined ? "" : clip(decodeReply(charWire.reply).text.replace(/\s+/g, " "));
  return { step, read: await panel(booted, chatId), vehicles: tools.vehicles, calls: tools.calls, narration, flush, error };
}

/** Did this variant's own inventory call remove the rope? */
function removesRope(step: SwipeStep): boolean {
  return step.calls.some((c) => c.name === "update_inventory" && c.verdict !== "dropped" && /"remove"[^\]]*rope/iu.test(c.args));
}

/** The location this variant's own `update_scene` calls set, the later call winning (the fold's merge rule). */
function writtenLocation(step: SwipeStep): string | null {
  let location: string | null = null;
  for (const call of step.calls.filter((c) => c.name === "update_scene" && c.verdict !== "dropped")) {
    const match = /"location"\s*:\s*"([^"]*)"/u.exec(call.args);
    location = match?.[1] ?? location;
  }
  return location;
}

/** The swipe checks over the seven recorded steps, in their recorded order. */
function swipeChecks(steps: readonly SwipeStep[]): Record<string, boolean> {
  const [base, a, b, backToA, c, d, backToC] = steps;
  if (base === undefined || a === undefined || b === undefined || backToA === undefined || c === undefined || d === undefined || backToC === undefined) {
    return { "all seven steps recorded": false };
  }
  return {
    "(a) B shows base + B only": SWIPE_CHECKS.aVariantB(b.read) && panelDiff(base.read, b.read).every((line) => !/rope/iu.test(line)),
    "(a) A showed base + A only": SWIPE_CHECKS.aVariantA(a.read),
    "(b) back to A restores A exactly": JSON.stringify(backToA.read) === JSON.stringify(a.read),
    "(c) N+1 builds on A": SWIPE_CHECKS.buildsOnA(c.read, removesRope(c)),
    "(c) N+1 shows its own location write": c.read.location === (writtenLocation(c) ?? backToA.read.location),
    "(d) regenerated N+1 keeps A, drops C": SWIPE_CHECKS.dKeepsAOnly(d.read, removesRope(d)),
    "(d) regenerated N+1 shows its own location write": d.read.location === (writtenLocation(d) ?? backToA.read.location),
    "(d) back to C restores C exactly": JSON.stringify(backToC.read) === JSON.stringify(c.read),
  };
}

/** Swipe turn N two ways, switch back, build N+1 on the selected swipe, regenerate N+1 and switch back again. Every
 *  verb is the real chat front door; every read is the panel the selected lineage resolves to. */
async function playSwipes(cellName: string, cell: Cell, booted: Booted): Promise<void> {
  const game = await startGame(booted, cell, "cheap");
  const { chatId } = game;
  const { services } = booted.app;
  const principal = booted.host;
  const at = { booted, chatId };
  row({ kind: "game", cell: cellName, consumer: "swipes", vehicleKnob: cell.vehicle, panel: game.panelReason });
  const base = await generate(at, "base", () => services.chat.send({ principal, chatId, content: SWIPE_SCRIPT.base }));
  const a = await generate(at, "N variant A (rope)", () =>
    services.chat.send({ principal, chatId, content: SWIPE_SCRIPT.turnN, guided: { action: "response", input: SWIPE_SCRIPT.steerA } }),
  );
  const slotN = await lastAssistant(booted, chatId);
  const b = await generate(at, "N variant B (dagger), swiped", () =>
    services.chat.swipe({ principal, chatId, messageId: slotN.messageId, guided: { action: "swipe", input: SWIPE_SCRIPT.steerB } }),
  );
  const backToA = await generate(
    at,
    "N back to variant A",
    () => services.chat.selectVariant({ principal, chatId, messageId: slotN.messageId, variantId: slotN.variantId }),
    false,
  );
  const c = await generate(at, "N+1 variant C (stables) on A", () =>
    services.chat.send({ principal, chatId, content: SWIPE_SCRIPT.turnN1, guided: { action: "response", input: SWIPE_SCRIPT.steerC } }),
  );
  const slotN1 = await lastAssistant(booted, chatId);
  const d = await generate(at, "N+1 variant D (chapel), regenerated", () =>
    services.chat.swipe({ principal, chatId, messageId: slotN1.messageId, guided: { action: "swipe", input: SWIPE_SCRIPT.steerD } }),
  );
  const backToC = await generate(
    at,
    "N+1 back to variant C",
    () => services.chat.selectVariant({ principal, chatId, messageId: slotN1.messageId, variantId: slotN1.variantId }),
    false,
  );
  const steps = [base, a, b, backToA, c, d, backToC];
  const checks = swipeChecks(steps);
  const diffs = steps.slice(1).map((step, i) => ({ step: step.step, from: steps[i]?.step, diff: panelDiff(steps[i]?.read ?? step.read, step.read) }));
  row({ kind: "swipes", cell: cellName, consumer: "swipes", steps, diffs, checks });
  process.stdout.write(
    `${cellName} swipes: ${Object.entries(checks)
      .map(([k, v]) => `${v ? "PASS" : "FAIL"} ${k}`)
      .join(" | ")}\n`,
  );
}

async function playConsumers(cellName: string, cell: Cell, booted: Booted, consumers: readonly Consumer[]): Promise<void> {
  let cheapChat: ChatId | null = null;
  for (const consumer of consumers) {
    if (consumer === "swipes") {
      await playSwipes(cellName, cell, booted);
      continue;
    }
    if (consumer === "resync") {
      // The resync rebuilds the cheap game's story; a run that asked for no cheap game plays one first.
      cheapChat ??= await playConsumer(cellName, cell, booted, "cheap");
      await runResync(cellName, booted, cheapChat);
      continue;
    }
    const chatId = await playConsumer(cellName, cell, booted, consumer);
    if (consumer === "cheap") {
      cheapChat = chatId;
    }
  }
}

async function runCell(cellName: string, consumers: readonly Consumer[] | null): Promise<void> {
  const cell = CELLS[cellName];
  if (cell === undefined) {
    throw new Error(`unknown cell ${cellName}; cells: ${Object.keys(CELLS).join(", ")}`);
  }
  row({
    kind: "cell",
    cell: cellName,
    providerId: cell.providerId,
    model: cell.model,
    device: cell.device,
    baseUrl: cell.baseUrl ?? null,
    vehicleKnob: cell.vehicle,
    declared: cell.declared ?? null,
  });
  const booted = await boot(cell);
  try {
    await playConsumers(cellName, cell, booted, consumers ?? cell.consumers);
  } finally {
    booted.cleanup();
  }
}

// ── report ─────────────────────────────────────────────────────────────────────────────────────────────────────

interface Row {
  readonly run: string;
  readonly kind: string;
  readonly cell: string;
  readonly consumer?: string;
  readonly [key: string]: unknown;
}

/** Score a stored row with the CURRENT checks over the panels it recorded, so every run reads by one rule. */
function rejudge(t: Row, verifiedCeiling?: number): { readonly pass: string[]; readonly miss: string[] } {
  const after = t["after"] as PanelRead;
  const before = t["before"] as PanelRead;
  const turn = TURNS.find((candidate) => candidate.id === t["turn"]);
  const expected = t.kind === "resync" ? FINAL_EXPECT : turn?.expect;
  if (expected === undefined) {
    return { pass: [], miss: ["unknown turn"] };
  }
  const result = t["result"];
  const resyncFailed = result !== null && typeof result === "object" && "ok" in result && result.ok === false;
  if (typeof t["sendError"] === "string" || resyncFailed) {
    return { pass: [], miss: expected.map((expectation) => expectation.label) };
  }
  if (t["turn"] === "t4-labour" && before.stamina === null) {
    if (verifiedCeiling === undefined) {
      // Old captures did not record the fixture ceiling. Their stored verdict is historical evidence,
      // not a new acceptance claim under today's fixture.
      return { pass: z.array(z.string()).parse(t["expectPass"]), miss: z.array(z.string()).parse(t["expectMiss"]) };
    }
    return judge(expected, after, { ...before, stamina: verifiedCeiling });
  }
  return judge(expected, after, before);
}

const fixtureControlsSchema = z.object({ staminaCeiling: z.number().positive() });

function fixtureCeiling(entry: Row): number | undefined {
  const parsed = fixtureControlsSchema.safeParse(entry["fixtureControls"]);
  return parsed.success ? parsed.data.staminaCeiling : undefined;
}

interface Tally {
  readonly vehicles: Set<string>;
  readonly issues: string[];
  readonly stateMs: number[];
  checks: number;
  passed: number;
  turnsPass: number;
  retries: number;
  audits: number;
}

function tallyTurn(t: Row, tally: Tally, verifiedCeiling?: number): void {
  for (const req of (t["stateRequests"] as { kind: string; detail: string; reply?: string }[] | undefined) ?? []) {
    tally.vehicles.add(`${req.kind}(${shapeFromReply(req.detail, req.reply ?? "")})`);
  }
  const ceiling = fixtureCeiling(t) ?? verifiedCeiling;
  const { pass, miss } = rejudge(t, ceiling);
  if (t["turn"] === "t4-labour" && ceiling === undefined && (t["before"] as PanelRead).stamina === null) {
    tally.issues.push("historical fixture unverified; excluded from current acceptance");
  }
  tally.checks += pass.length + miss.length;
  tally.passed += pass.length;
  tally.turnsPass += miss.length === 0 ? 1 : 0;
  const events = (t["events"] as { event: string }[] | undefined) ?? [];
  tally.retries += retriesOf(events);
  tally.audits += ((t["traceVehicles"] as string[] | undefined) ?? []).filter((vehicle) => vehicle.includes(INVENTORY_AUDIT)).length;
  const latency = t["latency"] as { stateMs: number };
  if (latency.stateMs > 0) {
    tally.stateMs.push(latency.stateMs);
  }
  const calls = (t["calls"] as { name: string; verdict: string }[] | undefined) ?? [];
  tally.issues.push(...calls.filter((call) => call.verdict !== "applied").map((call) => `${call.name}:${call.verdict}`));
  tally.issues.push(...events.filter((e) => !e.event.endsWith(".path")).map((e) => e.event));
  if (tally.vehicles.size === 0 && t["path"] === "folded") {
    tally.vehicles.add("folded (co-emitted on the character turn)");
  }
}

/** One consumer's table line, or `null` when the run did not play it. */
function consumerLine(cell: string, consumer: string, mine: readonly Row[], verifiedCeiling?: number): string | null {
  const turns = mine.filter((r) => r.consumer === consumer && (r.kind === "turn" || r.kind === "resync"));
  if (turns.length === 0) {
    return null;
  }
  const gameRow = mine.find((r) => r.kind === "game" && r.consumer === consumer);
  const panelRead = (gameRow?.["panel"] ?? turns[0]?.["panel"]) as
    | { path?: string; fallbackReason?: string | null; structuredUnavailable?: boolean }
    | undefined;
  // The panel rework in flight reports the unhonoured knob as its own field beside the fold reason.
  const unavailable = panelRead?.structuredUnavailable === true ? " + structuredUnavailable" : "";
  const tally: Tally = { vehicles: new Set(), issues: [], stateMs: [], checks: 0, passed: 0, turnsPass: 0, retries: 0, audits: 0 };
  for (const t of turns) {
    tallyTurn(t, tally, verifiedCeiling);
  }
  const sorted = tally.stateMs.toSorted((a, b) => a - b);
  const median = sorted.length === 0 ? "-" : String(sorted[Math.floor(sorted.length / 2)]);
  const counts = new Map<string, number>();
  for (const issue of tally.issues) {
    counts.set(issue, (counts.get(issue) ?? 0) + 1);
  }
  const counted = [...counts].map(([k, v]) => `${k}×${v}`).join(", ");
  const panelText = `${panelRead?.path ?? "-"} / ${panelRead?.fallbackReason ?? "null"}${unavailable}`;
  return `| ${cell} | ${consumer} | ${panelText} | ${[...tally.vehicles].join("; ") || "-"} | ${tally.turnsPass}/${turns.length} | ${tally.passed}/${tally.checks} | ${tally.retries} / ${tally.audits} | ${counted || "-"} | ${median} |`;
}

function report(): void {
  const rows = readFileSync(RESULTS, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Row);
  // The latest run per cell AND consumer: a rerun of one consumer must not hide the cell's others.
  const latest = new Map<string, string>();
  const verifiedControls = new Map<string, number>();
  for (const r of rows) {
    const ceiling = fixtureCeiling(r);
    if (ceiling !== undefined) {
      verifiedControls.set(r.run, ceiling);
    }
    if (r.consumer !== undefined) {
      latest.set(`${r.cell}\u0000${r.consumer}`, r.run);
    }
  }
  const cells = [...new Set(rows.filter((r) => r.kind === "cell").map((r) => r.cell))];
  console.log("| cell | consumer | panel | vehicle used | turns pass | checks | retries / audits | drops/issues | state ms median |");
  console.log("| - | - | - | - | - | - | - | - | - |");
  for (const cell of cells) {
    for (const consumer of ["folded", "cheap", "resync"]) {
      const run = latest.get(`${cell}\u0000${consumer}`);
      const line =
        run === undefined
          ? null
          : consumerLine(
              cell,
              consumer,
              rows.filter((r) => r.cell === cell && r.run === run),
              verifiedControls.get(run),
            );
      if (line !== null) {
        console.log(line);
      }
    }
  }
  swipeReport(rows, latest, cells);
}

/** The per-step panel diffs and the four checks of each cell's latest swipe run. */
function swipeReport(rows: readonly Row[], latest: ReadonlyMap<string, string>, cells: readonly string[]): void {
  for (const cell of cells) {
    const run = latest.get(`${cell}\u0000swipes`);
    const result = rows.find((r) => r.cell === cell && r.run === run && r.kind === "swipes");
    if (result === undefined) {
      continue;
    }
    console.log(`\n### ${cell} swipes\n`);
    const stored = (result["steps"] as SwipeStep[]).map((step) => ({ ...step, calls: step.calls ?? [] }));
    for (const [label, ok] of Object.entries(swipeChecks(stored))) {
      console.log(`- ${ok ? "PASS" : "FAIL"} ${label}`);
    }
    console.log("\n| step | vehicle | flush | diff from the previous step |\n| - | - | - | - |");
    const steps = result["steps"] as { step: string; vehicles: string[]; flush: { outcome: string } | null }[];
    const diffs = result["diffs"] as { step: string; diff: string[] }[];
    for (const step of steps) {
      const diff = diffs.find((d) => d.step === step.step)?.diff ?? ["(first step)"];
      console.log(`| ${step.step} | ${step.vehicles.join(" + ") || "-"} | ${step.flush?.outcome ?? "-"} | ${diff.join("<br>") || "(no change)"} |`);
    }
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(`usage: run.ts <cell>... | report\ncells: ${Object.keys(CELLS).join(", ")}`);
  process.exit(EXIT_MISUSE);
}
if (args[0] === "report") {
  report();
} else {
  tapLog();
  // `<cell>@cheap,swipes` runs those consumers only; a bare cell runs its own list.
  for (const arg of args) {
    const [cellName = "", only] = arg.split("@");
    await runCell(cellName, only === undefined ? null : (only.split(",") as Consumer[]));
  }
  // The composed graph holds timers and sockets open; the run is over.
  process.exit(0);
}
