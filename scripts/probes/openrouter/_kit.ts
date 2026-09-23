// Shared plumbing for the OpenRouter provider probes (F4 / F4a / F5 / OR-5 / OR-7).
//
// Every probe here answers ONE wire question with ONE moving variable, and writes its raw evidence to
// `results/<probe>.jsonl` — JSONL, never JSON, so a partial run is still readable and an append never
// rewrites a prior row. The verdict prose lives in scripts/probes/openrouter/RESULTS.md; this file only captures numbers.
//
// Wire evidence captured on every call (OpenRouter returns all of it when `usage: {include: true}`):
//   usage.prompt_tokens_details.cached_tokens        — cache READ
//   usage.prompt_tokens_details.cache_write_tokens   — cache WRITE
//   usage.completion_tokens_details.reasoning_tokens — thinking depth
//   usage.cost                                       — OR's own billed cost
// plus the HTTP status and, on a non-200, the verbatim error body (a 400 IS a verdict here).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const RESULTS_DIR = path.join(DIR, "results");

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";

// ---- raw OpenRouter chat-completions wire shapes ----
// These probes hit the RAW HTTP endpoint, so the wire is snake_case — NOT the camelCase SDK shape the
// production `kit/wire-schemas.ts` models. All fields optional: a probe reads whatever the vendor returned
// (a 400 arrives with `error` and no `choices`; a tool-choice:"none" turn has no `tool_calls`).
interface OrReasoningDetail {
  readonly type?: string;
  readonly text?: string | null;
  readonly signature?: string;
  readonly id?: string | null;
  readonly format?: string;
  readonly index?: number;
  readonly [k: string]: unknown;
}
interface OrToolCall {
  readonly id: string;
  readonly type?: string;
  readonly function?: { readonly name?: string; readonly arguments?: string };
}
export interface OrMessage {
  readonly role?: string;
  readonly content?: string | null;
  readonly reasoning?: string | null;
  readonly reasoning_details?: OrReasoningDetail[];
  readonly tool_calls?: OrToolCall[];
}
interface OrPromptTokensDetails {
  readonly cached_tokens?: number;
  readonly cache_write_tokens?: number;
}
interface OrCompletionTokensDetails {
  readonly reasoning_tokens?: number;
}
interface OrUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly cost?: number;
  readonly prompt_tokens_details?: OrPromptTokensDetails;
  readonly completion_tokens_details?: OrCompletionTokensDetails;
}
interface OrChoice {
  readonly message?: OrMessage;
  readonly finish_reason?: string | null;
}
interface OrResponse {
  readonly choices?: OrChoice[];
  readonly usage?: OrUsage;
  readonly error?: { readonly code?: number; readonly message?: string };
}

/** A request message on the OpenRouter (OpenAI-compat) wire — heterogeneous by role (system/user/assistant/
 *  tool carry different fields), so `content` is genuinely dynamic and narrowed at use. */
export interface OrRequestMessage {
  readonly role: string;
  content?: unknown;
  tool_calls?: OrToolCall[] | undefined;
  tool_call_id?: string | undefined;
  reasoning_details?: OrReasoningDetail[] | undefined;
  readonly [k: string]: unknown;
}

/** The request body passed to `orCall` — `model`/`messages` are load-bearing; the rest (tools, reasoning,
 *  tool_choice, provider…) vary per probe and are held open. */
interface OrRequestBody {
  readonly model: string;
  readonly messages: OrRequestMessage[];
  readonly [k: string]: unknown;
}

/** camelCase summary of the wire usage that every probe row spreads. */
interface UsageSummary {
  readonly promptTokens: number | null;
  readonly cachedTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly completionTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly cost: number | null;
}

interface OrCallResult {
  readonly status: number;
  readonly ms: number;
  readonly json: OrResponse;
  readonly usage: UsageSummary;
  readonly error: string | null;
  readonly message: OrMessage | null;
}

/** An evidence row every probe spreads its usage into, plus arm-specific fields via the index signature. */
export interface ArmRowBase extends UsageSummary {
  readonly kind: string;
  readonly probe: string;
  readonly status: number;
  readonly error: string | null;
  readonly ms: number;
  readonly [k: string]: unknown;
}

/** READ AN ARM-ROW EXTRA BACK AS THE STRING ITS WRITER PUT THERE. The index signature above is what lets
 *  each probe stamp its own per-arm fields, and the price is that every read comes back `unknown` — which
 *  a template literal must not interpolate, because `unknown` is exactly where an accidental object turns
 *  into `[object Object]` in a findings line nobody re-reads. The two OR-5 probes write
 *  `breakpointRole: history[i]?.role ?? null`, so `string | null` is the real domain and this narrowing
 *  loses nothing; a non-string reads as `null` rather than as a lie about the arm. */
export function rowText(row: ArmRowBase, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

/** Anthropic-family model: these probes are about Anthropic cache/thinking semantics as seen THROUGH the
 *  OpenAI-compat shim, so a non-Anthropic model answers a different question. */
export const OR_MODEL = process.env["OR_MODEL"] ?? "anthropic/claude-sonnet-5";
export const NATIVE_MODEL = process.env["NATIVE_MODEL"] ?? "claude-sonnet-5";

/** Pin Anthropic with no fallbacks — an unpinned turn can land on Bedrock/Azure/Google, which ignore
 *  `cache_control` entirely and would read as a cache "bust" that is really a routing hop (findings §2). */
export const ANTHROPIC_PIN = { order: ["Anthropic"], allow_fallbacks: false };

/** Walks up from this file for the repo `.env` — this harness runs from git worktrees, which do not carry
 *  their own `.env`. `process.env` wins when set. */
export function readEnvKey(name: string): string {
  const preset = process.env[name];
  if (preset !== undefined && preset !== "") {
    return preset;
  }
  let dir = DIR;
  for (let i = 0; i < 12; i += 1) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) {
      for (const line of fs.readFileSync(candidate, "utf8").split(/\r?\n/)) {
        if (!line.startsWith(`${name}=`)) {
          continue;
        }
        let value = line.slice(name.length + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (value.length > 0) {
          return value;
        }
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return "";
}

/** Deterministic filler so a prefix is byte-stable across arms, and `nonce`-unique across runs (a prior
 *  run's live cache entry would otherwise make a "prime" arm read as a hit). ~14 tokens per line. */
export function filler(nonce: string, lines: number): string {
  const out = [];
  for (let i = 0; i < lines; i += 1) {
    out.push(`[${nonce}#${i}] Field note ${i}: the ashen road bends north past the salt weirs, and the ledger keeper records every toll paid in coin or in name.`);
  }
  return out.join("\n");
}

export function usageOf(json: OrResponse): UsageSummary {
  const usage = json.usage ?? {};
  return {
    promptTokens: usage.prompt_tokens ?? null,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? null,
    cacheWriteTokens: usage.prompt_tokens_details?.cache_write_tokens ?? null,
    completionTokens: usage.completion_tokens ?? null,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
    cost: usage.cost ?? null,
  };
}

let spend = 0;
export const totalSpend = () => spend;
/** For a probe that calls OpenRouter outside {@link orCall} (the streaming-only debug echo), so the batch total stays true. */
export const addSpend = (cost: number) => {
  spend += cost;
};

export async function orCall(body: OrRequestBody, key: string): Promise<OrCallResult> {
  const started = Date.now();
  const response = await fetch(OR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ usage: { include: true }, provider: ANTHROPIC_PIN, stream: false, ...body }),
  });
  const json = (await response.json()) as OrResponse;
  spend += json.usage?.cost ?? 0;
  return {
    status: response.status,
    ms: Date.now() - started,
    json,
    usage: usageOf(json),
    error: json.error ? JSON.stringify(json.error).slice(0, 600) : null,
    message: json.choices?.[0]?.message ?? null,
  };
}

/** Appends one evidence row. `arm` is the moving variable's value; everything else in the row is the
 *  constant it moved against. */
interface JsonlRow {
  readonly kind?: string;
  readonly blocked?: unknown;
}

export function jsonl(probe: string) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `${probe}.jsonl`);
  return {
    file,
    append(row: object) {
      fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
    },
    /** Resume unit is the PROBE, not the arm: the cache arms are only meaningful back-to-back inside one
     *  5-minute TTL window, so a half-finished cache probe must be re-run whole. */
    hasCompletedRun() {
      if (!fs.existsSync(file)) {
        return false;
      }
      return fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l): JsonlRow => JSON.parse(l) as JsonlRow)
        // A `blocked` verdict is a probe that couldn't measure (e.g. the capture arm produced nothing to
        // replay) — it is kept as evidence but must NOT satisfy the resume check.
        .some((row) => row.kind === "verdict" && row.blocked === undefined);
    },
  };
}

export function printTable(rows: readonly object[]): void {
  console.table(rows);
}
