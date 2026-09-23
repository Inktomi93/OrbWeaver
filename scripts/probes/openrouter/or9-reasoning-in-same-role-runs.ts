// OR-9 — when a group round's assistant replies carry REAL signed thinking (the `conversation` reasoning carry),
// which layout of the run does the wire accept, and which keeps the prior call's cache entry readable?
//
// OR-8 settled the layout for text-only runs: one message, one text block per speaker. With the carry on, each
// stored reply also carries its own signed thinking, and the openai-compat fold (body.ts rule 10) refuses to
// fold a row that carries reasoning, so F1 sends two consecutive assistant messages (V3). This probe measures
// every layout on real signatures, generated first:
//
//   G1  [P, cueA]            -> reply A with thinking      (the production call for speaker A)
//   G2  [P, A+thA, cueB]     -> reply B with thinking      (production: cueA is gone, A's thinking is carried)
//
// Each variant generates its own A and B on its own nonce'd prefix, then fires a two-call pair: call 1 is the
// run with A, call 2 the run with A+B, each ending on a user cue:
//
//   V1 one message   [thA, A*]            -> [thA, A, thB, B*]
//   V2 last only     [thA, A*]            -> [A, thB, B*]        (only the run's last reply keeps its thinking)
//   V3 consecutive   [thA, A*]            -> [thA, A] [thB, B*]  (what F1 emits with the carry on)
//   V4 no thinking   [A*]                 -> [A, B*]             (carry off: the SillyTavern default)
//   V5 think-tags    ["<thinking>..</thinking>A"*] -> [.., "<thinking>..</thinking>B"*]  unsigned, as text
//   V6 cue kept      [P, cueA, thA, A*, cueB] -> [P, cueA, thA A, cueB, thB B*, cue]   append-only history; needs
//                                                                  its own generation (G2' keeps cueA)
//   X  tampered      V1 with one byte of thA's signature changed: must be refused (proves signatures are checked)
//
// Wires: Anthropic Messages direct; OpenRouter chat-completions (Anthropic pinned, streamed with
// `debug.echo_upstream_body`); and OpenRouter's Anthropic-compatible Messages endpoint (native blocks, pinned).
// Models: claude-sonnet-5 (keeps prior-turn thinking, no prefix binding) and claude-opus-5-5 (keeps prior-turn
// thinking and binds each block to its prefix). On the direct wire each opus variant also runs once with the
// `thinking-binding-controls-2026-08-01` beta and `prefix_mismatch_behavior: "error"`, which enforces the prefix
// check on any account. P is just over 1024 tokens; the marker is the 5m ephemeral one on the run's last text.

import { ANTHROPIC_PIN, addSpend, jsonl, printTable, readEnvKey, totalSpend, usageOf } from "./_kit.ts";

export const id = "or9";
export const title = "signed thinking inside a same-role run: which layout is accepted, and which keeps the cache";

const NATIVE_URL = "https://api.anthropic.com/v1/messages";
const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const MARKER = { type: "ephemeral" } as const;
const BINDING_BETA = "thinking-binding-controls-2026-08-01";
const GEN_MAX_TOKENS = 4000;
const GEN_ATTEMPTS = 4;
const CALL_MAX_TOKENS = 1200;

const MODELS = [
  { name: "sonnet-5", direct: "claude-sonnet-5", openrouter: "anthropic/claude-sonnet-5" },
  { name: "opus-5-5", direct: "claude-opus-5-5", openrouter: "anthropic/claude-opus-5.5" },
] as const;
type Model = (typeof MODELS)[number];

// Neutral wording on purpose: claude-opus-5-5's classifier refused (stop_reason "refusal", zero output) both a
// "group role-play" system prompt and the kit's nonce'd toll-ledger filler.
const SYSTEM =
  "Three friends, Mara, Wren and Kai, solve a puzzle together and answer in turn. Reply in one or two sentences as the named friend, starting with that name and a colon.";
// A small puzzle each speaker must answer, so adaptive thinking engages and every reply carries a real signed
// thinking block (a plain chat line gets none, even at high effort).
const RIDDLE =
  "Puzzle: the garden log lists five harvests of 17, 23, 31, 44 and 53 beans. Four numbers share a property and one does not. Each friend names the odd number, gives the reason, and adds one new observation.";
const CUE_A = "[Mara answers next.]";
const CUE_B = "[Wren answers next.]";
const CUE_NEXT = "[Kai answers next.]";
const CROPS = ["beans", "squash", "kale", "peas", "carrots", "leeks", "basil", "onions"];
const BEDS = ["the north bed", "the south bed", "the raised bed", "the herb spiral", "the greenhouse", "the pot row", "the orchard edge", "the trellis"];
// About 45 tokens per entry: LOG_ENTRIES puts P just over sonnet-5's 1024-token cache floor.
const LOG_ENTRIES = 24;

function gardenLog(nonce: string): string {
  const out = [`Garden log ${nonce}.`];
  for (let i = 0; i < LOG_ENTRIES; i += 1) {
    out.push(`Day ${i + 1}: watered ${BEDS[(i * 3) % BEDS.length]} at dawn, picked ${((i * 7) % 13) + 2} handfuls of ${CROPS[i % CROPS.length]}, and turned the compost near ${BEDS[(i * 5 + 1) % BEDS.length]}.`);
  }
  return out.join("\n");
}

// ---- a neutral transcript, spelled per wire ----

interface ThinkingBlock {
  readonly type: "thinking" | "redacted_thinking";
  readonly [k: string]: unknown;
}
interface OrDetail {
  readonly [k: string]: unknown;
}
/** One generated reply: its text and its thinking in both wire spellings (only the one its wire produced is set). */
interface Reply {
  readonly text: string;
  readonly thinking: readonly ThinkingBlock[];
  readonly details: readonly OrDetail[];
  readonly thinkingText: string;
}

type Piece = { readonly kind: "text"; readonly text: string; readonly mark?: boolean } | { readonly kind: "thinking"; readonly reply: Reply };
interface Turn {
  readonly role: "user" | "assistant";
  readonly pieces: readonly Piece[];
}

const user = (text: string): Turn => ({ role: "user", pieces: [{ kind: "text", text }] });
const say = (text: string, mark = false): Piece => ({ kind: "text", text, mark });
const think = (reply: Reply): Piece => ({ kind: "thinking", reply });
const asst = (...pieces: Piece[]): Turn => ({ role: "assistant", pieces });

function nativeMessages(turns: readonly Turn[]): unknown[] {
  return turns.map((turn) => ({
    role: turn.role,
    content: turn.pieces.flatMap((piece): readonly unknown[] => {
      if (piece.kind === "thinking") {
        return piece.reply.thinking;
      }
      return [piece.mark === true ? { type: "text", text: piece.text, cache_control: MARKER } : { type: "text", text: piece.text }];
    }),
  }));
}

// OpenRouter carries thinking as `reasoning_details` on the message, never as a content part.
function orMessages(turns: readonly Turn[]): unknown[] {
  return turns.map((turn) => {
    const details = turn.pieces.flatMap((piece) => (piece.kind === "thinking" ? piece.reply.details : []));
    const content = turn.pieces.flatMap((piece) =>
      piece.kind === "text" ? [piece.mark === true ? { type: "text", text: piece.text, cache_control: MARKER } : { type: "text", text: piece.text }] : [],
    );
    return details.length > 0 ? { role: turn.role, content, reasoning_details: details } : { role: turn.role, content };
  });
}

// ---- the two wires ----

// `openrouter-messages` is OpenRouter's Anthropic-compatible Messages endpoint: the native block shape, routed
// through OpenRouter, so a layout OpenRouter's chat-completions converter cannot spell can still reach it.
type Wire = "direct" | "openrouter" | "openrouter-messages";
const OR_MESSAGES_URL = "https://openrouter.ai/api/v1/messages";

interface Outcome {
  readonly status: number;
  readonly error: string | null;
  readonly cacheWrite: number | null;
  readonly cacheRead: number | null;
  readonly cost: number | null;
  readonly reply: Reply | null;
  readonly stopReason: string | null;
  readonly upstream: unknown;
  readonly transformations: unknown;
}

interface NativeBlock {
  readonly type?: string;
  readonly text?: string;
  readonly thinking?: string;
  readonly [k: string]: unknown;
}
interface NativeResponse {
  readonly content?: readonly NativeBlock[];
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly cache_creation_input_tokens?: number;
    readonly cache_read_input_tokens?: number;
    readonly cost?: number;
  };
  readonly error?: unknown;
  readonly stop_reason?: string;
  readonly input_transformations?: unknown;
}

let directTokens = { write: 0, read: 0, input: 0, output: 0 };

async function nativeCall(
  key: string,
  model: Model,
  turns: readonly Turn[],
  opts: { readonly effort: string; readonly maxTokens: number; readonly binding: boolean; readonly viaOpenRouter: boolean },
): Promise<Outcome> {
  const thinking = opts.binding ? { type: "adaptive", display: "summarized", block_binding: { prefix_mismatch_behavior: "error" } } : { type: "adaptive", display: "summarized" };
  const response = await fetch(opts.viaOpenRouter ? OR_MESSAGES_URL : NATIVE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.viaOpenRouter ? { Authorization: `Bearer ${key}` } : { "x-api-key": key }),
      "anthropic-version": "2023-06-01",
      ...(opts.binding ? { "anthropic-beta": BINDING_BETA } : {}),
    },
    body: JSON.stringify({
      model: opts.viaOpenRouter ? model.openrouter : model.direct,
      ...(opts.viaOpenRouter ? { provider: ANTHROPIC_PIN } : {}),
      max_tokens: opts.maxTokens,
      system: SYSTEM,
      thinking,
      output_config: { effort: opts.effort },
      messages: nativeMessages(turns),
    }),
  });
  const json = (await response.json()) as NativeResponse;
  const u = json.usage;
  if (opts.viaOpenRouter) {
    addSpend(u?.cost ?? 0);
  } else {
    directTokens = {
    write: directTokens.write + (u?.cache_creation_input_tokens ?? 0),
    read: directTokens.read + (u?.cache_read_input_tokens ?? 0),
    input: directTokens.input + (u?.input_tokens ?? 0),
      output: directTokens.output + (u?.output_tokens ?? 0),
    };
  }
  const blocks = json.content ?? [];
  const thinkingBlocks = blocks.filter((b): b is ThinkingBlock => b.type === "thinking" || b.type === "redacted_thinking");
  const text = blocks.flatMap((b) => (b.type === "text" && typeof b.text === "string" ? [b.text] : [])).join("");
  return {
    status: response.status,
    error: json.error === undefined ? null : JSON.stringify(json.error).slice(0, 800),
    cacheWrite: u?.cache_creation_input_tokens ?? null,
    cacheRead: u?.cache_read_input_tokens ?? null,
    cost: u?.cost ?? null,
    stopReason: json.stop_reason ?? null,
    reply: response.ok ? { text, thinking: thinkingBlocks, details: [], thinkingText: thinkingBlocks.map((b) => (typeof b["thinking"] === "string" ? b["thinking"] : "")).join("\n") } : null,
    upstream: null,
    transformations: json.input_transformations ?? null,
  };
}

interface OrDelta {
  readonly content?: string | null;
  readonly reasoning?: string | null;
  readonly reasoning_details?: readonly OrDetail[];
}
interface OrChunk {
  readonly usage?: Parameters<typeof usageOf>[0]["usage"];
  readonly error?: unknown;
  readonly choices?: readonly { readonly delta?: OrDelta; readonly finish_reason?: string | null }[];
  readonly debug?: { readonly echo_upstream_body?: { readonly messages?: unknown } };
}

// Streamed, because the upstream echo is streaming-only. Streamed `reasoning_details` arrive as fragments of one
// detail per index; they are merged back per index so the replayed detail carries its full text and signature.
async function orCall(key: string, model: Model, turns: readonly Turn[], effort: string, maxTokens: number): Promise<Outcome> {
  const response = await fetch(OR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model.openrouter,
      max_tokens: maxTokens,
      stream: true,
      usage: { include: true },
      provider: ANTHROPIC_PIN,
      reasoning: { effort },
      debug: { echo_upstream_body: true },
      messages: [{ role: "system", content: SYSTEM }, ...orMessages(turns)],
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    const refused = JSON.parse(raw) as { readonly error?: { readonly message?: string; readonly metadata?: { readonly raw?: string; readonly debug?: OrChunk["debug"] } } };
    return {
      status: response.status,
      error: (refused.error?.metadata?.raw ?? refused.error?.message ?? raw).slice(0, 800),
      cacheWrite: null,
      cacheRead: null,
      cost: null,
      reply: null,
      stopReason: null,
      upstream: refused.error?.metadata?.debug?.echo_upstream_body?.messages ?? null,
      transformations: null,
    };
  }
  let usage: OrChunk["usage"];
  let error: string | null = null;
  let upstream: unknown = null;
  let text = "";
  let reasoning = "";
  let stopReason: string | null = null;
  const details = new Map<number, Record<string, unknown>>();
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") {
      continue;
    }
    const chunk = JSON.parse(line.slice("data: ".length)) as OrChunk;
    usage = chunk.usage ?? usage;
    if (chunk.error !== undefined) {
      error = JSON.stringify(chunk.error).slice(0, 800);
    }
    if (chunk.debug?.echo_upstream_body !== undefined) {
      upstream = chunk.debug.echo_upstream_body.messages;
    }
    stopReason = chunk.choices?.[0]?.finish_reason ?? stopReason;
    const delta = chunk.choices?.[0]?.delta;
    text += delta?.content ?? "";
    reasoning += delta?.reasoning ?? "";
    for (const d of delta?.reasoning_details ?? []) {
      const index = typeof d["index"] === "number" ? d["index"] : 0;
      const into = details.get(index) ?? {};
      for (const [k, v] of Object.entries(d)) {
        into[k] = k === "text" && typeof into[k] === "string" && typeof v === "string" ? into[k] + v : (v ?? into[k]);
      }
      details.set(index, into);
    }
  }
  const summary = usageOf(usage === undefined ? {} : { usage });
  addSpend(summary.cost ?? 0);
  return {
    status: response.status,
    error,
    cacheWrite: summary.cacheWriteTokens,
    cacheRead: summary.cachedTokens,
    cost: summary.cost,
    reply: { text, thinking: [], details: [...details.values()], thinkingText: reasoning },
    stopReason,
    upstream,
    transformations: null,
  };
}

// ---- the plan ----

function tamperSignature(reply: Reply): Reply {
  const flip = (sig: string): string => {
    const at = Math.floor(sig.length / 2);
    return `${sig.slice(0, at)}${sig[at] === "A" ? "B" : "A"}${sig.slice(at + 1)}`;
  };
  return {
    ...reply,
    thinking: reply.thinking.map((b) => (typeof b["signature"] === "string" ? { ...b, signature: flip(b["signature"]) } : b)),
    details: reply.details.map((d) => (typeof d["signature"] === "string" ? { ...d, signature: flip(d["signature"]) } : d)),
  };
}

const tagged = (reply: Reply): string => `<thinking>${reply.thinkingText.trim()}</thinking>\n${reply.text.trim()}`;

const VARIANTS = ["V1-one-message", "V2-last-only", "V3-consecutive", "V4-no-thinking", "V5-think-tags", "V6-cue-kept", "X-tampered"] as const;
type Variant = (typeof VARIANTS)[number];

// The two calls of one variant. Every variant but V6 is the production shape: speaker cues are not kept, so the
// run's replies sit next to each other. V6 keeps each cue in the history, so no same-role run exists at all.
function pairFor(variant: Variant, p: string, a: Reply, b: Reply): readonly (readonly Turn[])[] {
  const aT = a.text.trim();
  const bT = b.text.trim();
  const two = (one: Turn, both: readonly Turn[]): readonly (readonly Turn[])[] => [
    [user(p), one, user(CUE_B)],
    [user(p), ...both, user(CUE_NEXT)],
  ];
  switch (variant) {
    case "V1-one-message":
      return two(asst(think(a), say(aT, true)), [asst(think(a), say(aT), think(b), say(bT, true))]);
    case "V2-last-only":
      return two(asst(think(a), say(aT, true)), [asst(say(aT), think(b), say(bT, true))]);
    case "V3-consecutive":
      return two(asst(think(a), say(aT, true)), [asst(think(a), say(aT)), asst(think(b), say(bT, true))]);
    case "V4-no-thinking":
      return two(asst(say(aT, true)), [asst(say(aT), say(bT, true))]);
    case "V5-think-tags":
      return two(asst(say(tagged(a), true)), [asst(say(tagged(a)), say(tagged(b), true))]);
    case "X-tampered": {
      const badA = tamperSignature(a);
      return two(asst(think(badA), say(aT, true)), [asst(think(badA), say(aT), think(b), say(bT, true))]);
    }
    case "V6-cue-kept":
      return [
        [user(p), user(CUE_A), asst(think(a), say(aT, true)), user(CUE_B)],
        [user(p), user(CUE_A), asst(think(a), say(aT)), user(CUE_B), asst(think(b), say(bT, true)), user(CUE_NEXT)],
      ];
    default:
      return assertNever(variant);
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled variant ${String(value)}`);
}

const hasThinking = (reply: Reply | null): reply is Reply => reply !== null && reply.thinking.length + reply.details.length > 0;

function trimEcho(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 72 ? `${value.slice(0, 48)}…(${value.length} chars)` : value;
  }
  if (Array.isArray(value)) {
    return value.map(trimEcho);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimEcho(v)]));
  }
  return value;
}

export async function run() {
  const orKey = readEnvKey("OPENROUTER_PROBE_KEY") || readEnvKey("OPENROUTER_API_KEY");
  const keys: Record<Wire, string> = {
    "openrouter-messages": orKey,
    direct: readEnvKey("ANTHROPIC_PROBE_KEY") || readEnvKey("ANTHROPIC_API_KEY"),
    openrouter: readEnvKey("OPENROUTER_PROBE_KEY") || readEnvKey("OPENROUTER_API_KEY"),
  };
  const out = jsonl(id);
  const rows: Record<string, unknown>[] = [];
  const call = (wire: Wire, model: Model, turns: readonly Turn[], effort: string, maxTokens: number, binding = false): Promise<Outcome> =>
    wire === "openrouter"
      ? orCall(keys.openrouter, model, turns, effort, maxTokens)
      : nativeCall(keys[wire], model, turns, { effort, maxTokens, binding, viaOpenRouter: wire === "openrouter-messages" });
  const record = (base: Record<string, unknown>, o: Outcome): void => {
    const row = {
      kind: "arm",
      probe: id,
      ...base,
      status: o.status,
      error: o.error,
      cacheWrite: o.cacheWrite,
      cacheRead: o.cacheRead,
      cost: o.cost,
      stopReason: o.stopReason,
      replyHead: o.reply?.text.slice(0, 140) ?? null,
      replyThinking: o.reply === null ? null : o.reply.thinking.length + o.reply.details.length,
      transformations: o.transformations,
      upstreamMessages: trimEcho(o.upstream),
    };
    out.append(row);
    rows.push(row);
  };

  // OR9_WIRES / OR9_MODELS / OR9_VARIANTS narrow a re-run (comma lists); unset runs everything.
  const pick = <T extends string>(env: string, all: readonly T[]): readonly T[] => {
    const wanted = (process.env[env] ?? "").split(",").filter((s) => s.length > 0);
    return wanted.length === 0 ? all : all.filter((v) => wanted.includes(v));
  };
  for (const wire of pick("OR9_WIRES", ["direct", "openrouter", "openrouter-messages"] as const)) {
    for (const model of MODELS.filter((m) => pick("OR9_MODELS", MODELS.map((x) => x.name)).includes(m.name))) {
      for (const variant of pick("OR9_VARIANTS", VARIANTS)) {
        // Each variant generates its own A and B on its own nonce'd prefix: the signatures are bound to that prefix,
        // and no variant can read another's cache entry.
        // The variant is an index, not its name: a name word such as "tampered" in the prompt tripped the opus classifier.
        const nonce = `or9-${wire}-${model.name}-v${VARIANTS.indexOf(variant)}-${Date.now()}`;
        const p = `${gardenLog(nonce)}\n\n${RIDDLE}`;
        const base = { wire, model: model.name, variant };
        // Adaptive thinking decides per request whether to think, so a generation step retries until it does.
        const generate = async (step: string, turns: readonly Turn[]): Promise<Reply | null> => {
          for (let attempt = 1; attempt <= GEN_ATTEMPTS; attempt += 1) {
            const outcome = await call(wire, model, turns, "high", GEN_MAX_TOKENS);
            record({ ...base, step, attempt, call: 0 }, outcome);
            if ((hasThinking(outcome.reply) && outcome.reply.text.trim().length > 0) || outcome.status !== 200) {
              return outcome.reply;
            }
          }
          return null;
        };
        const a = await generate("G1", [user(p), user(CUE_A)]);
        if (!hasThinking(a)) {
          out.append({ kind: "blocked", probe: id, ...base, blocked: "G1 produced no signed thinking" });
          continue;
        }
        // Production drops the speaker cue once the speaker has replied; V6 is the one layout that keeps it.
        const g2History = variant === "V6-cue-kept" ? [user(p), user(CUE_A), asst(think(a), say(a.text.trim())), user(CUE_B)] : [user(p), asst(think(a), say(a.text.trim())), user(CUE_B)];
        const b = await generate("G2", g2History);
        if (!hasThinking(b)) {
          out.append({ kind: "blocked", probe: id, ...base, blocked: "G2 produced no signed thinking" });
          continue;
        }
        // On the direct wire, opus-5-5 re-sends each pair with the prefix check enforced, whatever the account's age.
        const bindingRuns = wire === "direct" && model.name === "opus-5-5" ? [false, true] : [false];
        for (const binding of bindingRuns) {
          for (const [index, turns] of pairFor(variant, p, a, b).entries()) {
            record({ ...base, binding, step: "pair", call: index + 1 }, await call(wire, model, turns, "low", CALL_MAX_TOKENS, binding));
          }
        }
      }
    }
  }

  const verdict = {
    kind: "verdict",
    probe: id,
    at: new Date().toISOString(),
    secondCalls: rows
      .filter((r) => r["call"] === 2)
      .map((r) => `${String(r["wire"])}:${String(r["model"])}:${String(r["variant"])}${r["binding"] === true ? ":binding" : ""} status=${String(r["status"])} read=${String(r["cacheRead"])}`),
    openrouterSpend: totalSpend(),
    directTokens,
  };
  out.append(verdict);
  printTable(
    rows.map(({ wire, model, variant, binding, step, call, status, cacheWrite, cacheRead, replyThinking }) => ({
      wire,
      model,
      variant,
      binding,
      step,
      call,
      status,
      cacheWrite,
      cacheRead,
      replyThinking,
    })),
  );
  for (const r of rows.filter((row) => row["error"] !== null)) {
    console.log(`${String(r["wire"])} ${String(r["model"])} ${String(r["variant"])} call ${String(r["call"])}: ${String(r["error"])}`);
  }
  return verdict;
}
