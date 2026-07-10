#!/usr/bin/env tsx
/**
 * pnpm sdk:behavior-probe [--scenario p1,rz1,…] [--model <id>] [--verbose]
 *
 * The agent-sdk BEHAVIORAL ground-truth harness — live Max-sub turns that prove, by asking the model
 * what it actually sees, the things you cannot read off the SDK types: turn POSITION/ORDERING (does a
 * dynamic-context marker leak as a literal? what's the earliest→latest sequence?), REASONING capture
 * (is thinking text populated, empty, or a signature? streaming vs non-streaming?), and whether
 * `continue`/prefill behave as documented. Companion to sdk-cache-probe (which measures caching);
 * this one measures WHAT THE MODEL PERCEIVES. Costs pennies but spends real quota — hand-run, never CI.
 *
 * POSITIONAL PROBES use unique NATO-ish codewords planted at each turn position, then ask the model to
 * list every codeword it sees in earliest→latest order AND flag any non-prose boundary/separator token.
 * Comparing the returned order to the planted order proves sequencing; a flagged separator proves a leak
 * (the neo bug: the SDK array-systemPrompt boundary sentinel showed up as literal text and broke bots).
 */

import process from "node:process";
import type {
  ModelInfo,
  Options,
  Query,
  SDKMessage,
  SessionStore,
} from "@anthropic-ai/claude-agent-sdk";
import { query, SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from "@anthropic-ai/claude-agent-sdk";
import type { ChatResult } from "@orb/server/infra/providers";
import {
  buildClaudeOpenRouterEnv,
  buildClaudeSdkEnv,
  consumeTurnStream,
  dynamicContextOptions,
} from "@orb/server/infra/providers/backends/agent-sdk";
import {
  buildSeedFrames,
  InMemorySessionStore,
  seedSessionId,
  toSeedTurns,
} from "@orb/server/infra/providers/backends/agent-sdk/session";

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const MODEL_FLAG = argValue("--model");
const ONLY = new Set(
  (argValue("--scenario") ?? argValue("-s"))?.split(",").map((s) => s.trim()) ?? [],
);
const VERBOSE = args.includes("--verbose");
/** so1 (structured-output matrix) axes: `--models a,b,c` overrides the live family map; `--dry-run` prints
 *  the planned matrix (model × schema cell count + quota warning) WITHOUT spawning a single turn. */
const MODELS_OVERRIDE = (argValue("--models") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const DRY_RUN = args.includes("--dry-run");
/** --mode sub (default: the Max-sub mode-1 firewall env) | or (mode-2: the OpenRouter Anthropic skin).
 *  The OR key rides OPENROUTER_PROBE_KEY (probe-run plumbing — a scoped test key, never app config). */
const MODE = argValue("--mode") ?? "sub";
// biome-ignore lint/style/noProcessEnv: OPENROUTER_PROBE_KEY is probe-run plumbing (scoped test key), not app config — probes run outside the foundation/env perimeter.
const OR_PROBE_KEY = process.env["OPENROUTER_PROBE_KEY"] ?? "";
if (MODE === "or" && OR_PROBE_KEY.length === 0) {
  throw new Error("--mode or requires OPENROUTER_PROBE_KEY in the environment");
}
/** Probe-run OR tier trio — every tier pinned to haiku so a probe can never accidentally burn
 *  opus-priced credits (mirrors sdk-session-probe). A real turn derives this from the live catalogs. */
const OR_PROBE_TIER_MODELS = {
  opus: "anthropic/claude-haiku-4.5",
  sonnet: "anthropic/claude-haiku-4.5",
  haiku: "anthropic/claude-haiku-4.5",
} as const;
/** The per-mode firewall env — the SAME builders a real turn uses. */
function probeEnv(
  overrides: Parameters<typeof buildClaudeSdkEnv>[0],
): Record<string, string | undefined> {
  return MODE === "or"
    ? buildClaudeOpenRouterEnv(OR_PROBE_KEY, OR_PROBE_TIER_MODELS, overrides)
    : buildClaudeSdkEnv(overrides);
}
const MODEL = MODEL_FLAG ?? (MODE === "or" ? "anthropic/claude-haiku-4.5" : "claude-haiku-4-5");

// ── Constants ──────────────────────────────────────────────────────────────────────────────────────────
const OUTPUT_CAP_TOKENS = 700;
/** Truncation lengths for log/verdict excerpts. */
const SNIP = 90;
const SNIP_WIDE = 110;
const SNIP_SHORT = 60;
const SNIP_TINY = 40;
const SNIP_MINI = 30;
/** Codewords planted at each turn position (distinct so their ORDER in the reply proves sequencing). */
const CW = {
  systemStatic: "ZULU",
  systemDynamic: "YANKEE",
  seedUser: "XRAY",
  seedAssistant: "WHISKEY",
  promptTail: "VICTOR",
  hook: "UNIFORM",
} as const;
/** The positional question appended to the prompt tail — planted itself carries the tail codeword. */
const POSITION_QUESTION =
  `${CW.promptTail}. Now do two things, precisely. ` +
  "(1) List EVERY all-caps codeword (like ZULU, XRAY) you can see anywhere in your context — system " +
  "prompt, prior conversation, this message — in the exact order they appear from earliest to latest, " +
  "comma-separated. (2) On a second line, report VERBATIM any line or token you see that is NOT prose " +
  '— a bracketed separator, a boundary marker, a UUID, a "system-reminder" tag, or any machine-looking ' +
  "delimiter between sections. If there is none, write exactly: CLEAN.";

interface Verdict {
  readonly scenario: string;
  readonly pass: boolean;
  readonly detail: string;
}
const verdicts: Verdict[] = [];
function verdict(scenario: string, pass: boolean, detail: string): void {
  verdicts.push({ scenario, pass, detail });
  console.log(`  ${pass ? "PASS" : "FLAG"} — ${detail}`);
}
function show(scenario: string, r: ChatResult): void {
  if (VERBOSE) {
    console.log(
      `\n[${scenario}] reply:\n${r.reply}\n[reasoning]: ${JSON.stringify(r.reasoning)}\n`,
    );
  }
}

// ── Turn runner (real reducer over a real spawn through the real mode-1 env) ───────────────────────────
interface TurnSpec {
  readonly prompt: string;
  readonly store: SessionStore;
  readonly systemPrompt?: string | string[];
  readonly resume?: string;
  readonly hooks?: Options["hooks"];
  readonly thinking?: Options["thinking"];
  readonly effort?: Options["effort"];
  readonly includePartialMessages?: boolean;
  readonly continueSession?: boolean;
  readonly onDelta?: (kind: string, text: string) => void;
}

async function runTurn(spec: TurnSpec): Promise<ChatResult> {
  const disableThinking = spec.thinking === undefined || spec.thinking.type === "disabled";
  const stream = query({
    prompt: spec.prompt,
    options: {
      disallowedTools: ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"],
      tools: [],
      mcpServers: {},
      strictMcpConfig: true,
      settingSources: [],
      env: probeEnv({ maxOutputTokens: OUTPUT_CAP_TOKENS, disableThinking }),
      model: MODEL,
      maxTurns: 1,
      sessionStore: spec.store,
      title: "orbweaver-behavior-probe",
      ...(spec.resume !== undefined ? { resume: spec.resume } : {}),
      ...(spec.continueSession === true ? { continue: true } : {}),
      ...(spec.systemPrompt !== undefined ? { systemPrompt: spec.systemPrompt as never } : {}),
      ...(spec.hooks !== undefined ? { hooks: spec.hooks } : {}),
      ...(spec.thinking !== undefined ? { thinking: spec.thinking } : {}),
      ...(spec.effort !== undefined ? { effort: spec.effort } : {}),
      ...(spec.includePartialMessages === true ? { includePartialMessages: true } : {}),
    },
  });
  return await consumeTurnStream(stream as AsyncIterable<SDKMessage>, {
    model: MODEL,
    resumed: spec.resume !== undefined,
    now: () => Date.now(),
    ...(spec.onDelta !== undefined ? { onDelta: (d): void => spec.onDelta?.(d.kind, d.text) } : {}),
  });
}

const SYSTEM_STATIC = `You are a precise test instrument. Codeword ${CW.systemStatic}. Follow the user's formatting exactly.`;
const SYSTEM_DYNAMIC = `Dynamic scene note. Codeword ${CW.systemDynamic}.`;
const SEED = [
  { role: "user" as const, content: `Earlier question. Codeword ${CW.seedUser}.` },
  { role: "assistant" as const, content: `Earlier answer. Codeword ${CW.seedAssistant}.` },
];

const CAPS_LINE_RE = /[A-Z]{4,}/u;
const CODEWORD_RE = /\b(?<cw>ZULU|YANKEE|XRAY|WHISKEY|VICTOR|UNIFORM)\b/gu;
const CLEAN_RE = /\bCLEAN\b/u;
const YELLOW_RE = /yellow/iu;
const XRAY_RE = /XRAY/u;
/** Parse the reply's line-1 codeword order (best-effort — the model returns comma-separated caps). */
function parseOrder(reply: string): string[] {
  const line1 = reply.split("\n").find((l) => CAPS_LINE_RE.test(l)) ?? reply;
  return (line1.match(CODEWORD_RE) ?? []).filter((v, i, a) => a.indexOf(v) === i);
}
/** Where the hook codeword landed relative to the prompt tail (avoids a nested ternary). */
function relativePos(hookPos: number, tailPos: number): string {
  if (hookPos < 0 || tailPos < 0) {
    return "n/a";
  }
  return hookPos < tailPos ? "BEFORE prompt tail" : "AFTER prompt tail";
}
/** Did the model report a non-prose boundary/separator (the leak)? Line-2 "CLEAN" = no leak. */
function reportedLeak(reply: string): boolean {
  return !CLEAN_RE.test(reply.split("\n").slice(1).join(" "));
}

// ── POSITIONAL scenarios ─────────────────────────────────────────────────────────────────────────────

/** p1: the LIVE shape — joined static+dynamic systemPrompt + seeded canon + prompt tail. Proves the
 *  earliest→latest order is ZULU, YANKEE, XRAY, WHISKEY, VICTOR and NOTHING non-prose leaks. */
async function p1(): Promise<void> {
  const store = new InMemorySessionStore();
  const sessionId = seedSessionId("probe-p1", toSeedTurns(SEED));
  await store.append(
    { projectKey: "probe", sessionId },
    buildSeedFrames(toSeedTurns(SEED), sessionId),
  );
  const r = await runTurn({
    prompt: POSITION_QUESTION,
    store,
    resume: sessionId,
    systemPrompt: `${SYSTEM_STATIC}\n\n${SYSTEM_DYNAMIC}`,
  });
  show("p1", r);
  const order = parseOrder(r.reply);
  const want = [CW.systemStatic, CW.systemDynamic, CW.seedUser, CW.seedAssistant, CW.promptTail];
  const orderOk = JSON.stringify(order) === JSON.stringify(want);
  const clean = !reportedLeak(r.reply);
  verdict(
    "p1",
    orderOk && clean,
    `joined shape — order=${order.join(">")} want=${want.join(">")} (${orderOk ? "ordered" : "MISORDER"}); leak=${clean ? "none" : "LEAKED"} · line2="${(r.reply.split("\n")[1] ?? "").slice(0, SNIP)}"`,
  );
}

/** p2: the ARRAY [static, dynamic] systemPrompt — reproduce/refute the neo boundary-marker leak (does a
 *  literal separator between the two halves show up in the model's context?). */
async function p2(): Promise<void> {
  const store = new InMemorySessionStore();
  const sessionId = seedSessionId("probe-p2", toSeedTurns(SEED));
  await store.append(
    { projectKey: "probe", sessionId },
    buildSeedFrames(toSeedTurns(SEED), sessionId),
  );
  const r = await runTurn({
    prompt: POSITION_QUESTION,
    store,
    resume: sessionId,
    systemPrompt: [SYSTEM_STATIC, SYSTEM_DYNAMIC],
  });
  show("p2", r);
  const order = parseOrder(r.reply);
  const clean = !reportedLeak(r.reply);
  verdict(
    "p2",
    clean,
    `array [static,dynamic] — order=${order.join(">")}; boundary-marker leak=${clean ? "NONE (safe to adopt)" : "LEAKED (the neo bug — keep joining)"} · line2="${(r.reply.split("\n")[1] ?? "").slice(0, SNIP_WIDE)}"`,
  );
}

/** p3: hook-injected additionalContext (dynamicContextOptions) — WHERE does UNIFORM land in the order,
 *  and does it stay non-leaking? (Establishes the injection position relative to the prompt tail.) */
async function p3(): Promise<void> {
  const store = new InMemorySessionStore();
  const sessionId = seedSessionId("probe-p3", toSeedTurns(SEED));
  await store.append(
    { projectKey: "probe", sessionId },
    buildSeedFrames(toSeedTurns(SEED), sessionId),
  );
  const r = await runTurn({
    prompt: POSITION_QUESTION,
    store,
    resume: sessionId,
    systemPrompt: `${SYSTEM_STATIC}\n\n${SYSTEM_DYNAMIC}`,
    hooks: dynamicContextOptions(`Injected operator context. Codeword ${CW.hook}.`).hooks,
  });
  show("p3", r);
  const order = parseOrder(r.reply);
  const sawHook = order.includes(CW.hook);
  const clean = !reportedLeak(r.reply);
  const hookPos = order.indexOf(CW.hook);
  const tailPos = order.indexOf(CW.promptTail);
  const rel = relativePos(hookPos, tailPos);
  verdict(
    "p3",
    sawHook && clean,
    `hook additionalContext — seen=${sawHook} at ${rel}; order=${order.join(">")}; leak=${clean ? "none" : "LEAKED"}`,
  );
}

/** b1: the LIVE "system"-mode shape after the boundary upgrade — the native
 *  `[static, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, dynamic]` block array (the exact shape `buildSystemPrompt`
 *  now emits). Proves, positionally, that (a) the model SEES the dynamic payload (YANKEE), and (b) the
 *  boundary sentinel is INVISIBLE — the model reports no consecutive-underscore / separator token. Then it
 *  runs a SECOND turn on a fresh session changing ONLY the dynamic suffix (static prefix byte-stable) and
 *  prints usage cache read/write tokens for both, so you can eyeball the cross-session prefix-cache claim
 *  (blocks before the boundary are cacheable; the changed suffix should not bust the static prefix). */
async function b1(): Promise<void> {
  const staticPrefix = SYSTEM_STATIC;
  const runBoundaryTurn = async (dynamic: string): Promise<ChatResult> => {
    const store = new InMemorySessionStore();
    return await runTurn({
      prompt: POSITION_QUESTION,
      store,
      systemPrompt: [staticPrefix, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, dynamic],
    });
  };
  const first = await runBoundaryTurn(SYSTEM_DYNAMIC);
  show("b1", first);
  const order = parseOrder(first.reply);
  // Positional success = the dynamic payload is visible AND the boundary marker is not (line-2 CLEAN).
  const sawDynamic = order.includes(CW.systemDynamic);
  const clean = !reportedLeak(first.reply);
  // Second turn: change ONLY the dynamic suffix — the static prefix stays byte-identical (cache probe).
  const second = await runBoundaryTurn(
    `Dynamic scene note, revised. Codeword ${CW.systemDynamic}.`,
  );
  show("b1", second);
  const cache = (r: ChatResult): string =>
    `read=${r.usage.cacheReadTokens} write=${r.usage.cacheWriteTokens}`;
  verdict(
    "b1",
    sawDynamic && clean,
    `array [static,BOUNDARY,dynamic] — dynamic payload seen=${sawDynamic}; boundary leak=${clean ? "NONE (marker invisible)" : "LEAKED (marker reached the model)"}; order=${order.join(">")}; cache turn1(${cache(first)}) turn2(${cache(second)}) [static prefix unchanged; suffix-only change should preserve the prefix cache] · line2="${(first.reply.split("\n")[1] ?? "").slice(0, SNIP_WIDE)}"`,
  );
}

// ── REASONING scenarios ─────────────────────────────────────────────────────────────────────────────

/** rz1: thinking ON, NON-streaming — is the final assistant thinking block's text populated, empty
 *  (signature-only / omitted), or a summary? This is the sub-path reasoning-encoding ground truth. */
async function rz1(): Promise<void> {
  const store = new InMemorySessionStore();
  const r = await runTurn({
    prompt:
      "Think step by step, then answer: what is 17 times 23? Give only the number as the answer.",
    store,
    systemPrompt: "You are a careful calculator.",
    thinking: { type: "adaptive", display: "summarized" },
    effort: "medium",
  });
  show("rz1", r);
  const len = r.reasoning.length;
  verdict(
    "rz1",
    true,
    `non-streaming thinking(adaptive,summarized): reasoning.length=${len} (${len > 0 ? "POPULATED — summary text came through" : "EMPTY — encoded/omitted, no CoT text on this path"}); reply="${r.reply.slice(0, SNIP_TINY)}"`,
  );
}

/** rz2: thinking ON, STREAMING — do thinking_delta events fire with text, and does the final block
 *  match? Establishes whether the live reasoning UI has anything to render on the sub path. */
async function rz2(): Promise<void> {
  const store = new InMemorySessionStore();
  let reasoningDeltaChars = 0;
  let reasoningDeltas = 0;
  const r = await runTurn({
    prompt: "Think step by step, then answer: what is 29 times 31? Give only the number.",
    store,
    systemPrompt: "You are a careful calculator.",
    thinking: { type: "adaptive", display: "summarized" },
    effort: "medium",
    includePartialMessages: true,
    onDelta: (kind, text) => {
      if (kind === "reasoning") {
        reasoningDeltas++;
        reasoningDeltaChars += text.length;
      }
    },
  });
  show("rz2", r);
  verdict(
    "rz2",
    true,
    `streaming thinking: reasoning deltas=${reasoningDeltas} (${reasoningDeltaChars} chars); final reasoning.length=${r.reasoning.length} — ${reasoningDeltas > 0 ? "LIVE CoT streams on this path" : "no reasoning deltas (nothing to stream)"}`,
  );
}

/** rz3: thinking DISABLED — confirm the reply is clean and reasoning is empty (the default RP path). */
async function rz3(): Promise<void> {
  const store = new InMemorySessionStore();
  const r = await runTurn({
    prompt: "In one word, the capital of France?",
    store,
    systemPrompt: "You are terse.",
    thinking: { type: "disabled" },
  });
  show("rz3", r);
  verdict(
    "rz3",
    r.reasoning.length === 0,
    `thinking disabled: reasoning.length=${r.reasoning.length} (want 0); reply="${r.reply.slice(0, SNIP_MINI)}"`,
  );
}

// ── continue / prefill scenarios ───────────────────────────────────────────────────────────────────

/** cont1: the SDK `continue: true` (no resume id) — does it pick up the most recent session for this
 *  store, and does it read cache? Compares the SDK's own continuation to our explicit resume. */
async function cont1(): Promise<void> {
  const store = new InMemorySessionStore();
  const first = await runTurn({
    prompt: `Remember this codeword: ${CW.seedUser}. Acknowledge in one word.`,
    store,
    systemPrompt: SYSTEM_STATIC,
  });
  show("cont1", first);
  let threw = "";
  let recalled = false;
  try {
    const second = await runTurn({
      prompt: "What codeword did I just tell you? One word.",
      store,
      systemPrompt: SYSTEM_STATIC,
      continueSession: true,
    });
    show("cont1", second);
    recalled = XRAY_RE.test(second.reply);
  } catch (error) {
    threw = error instanceof Error ? error.message : String(error);
  }
  verdict(
    "cont1",
    threw.length === 0,
    threw.length > 0
      ? `continue:true threw — "${threw.slice(0, SNIP_WIDE)}" (needs listSessions on the store?)`
      : `continue:true — recalled prior codeword=${recalled} (${recalled ? "SDK auto-continued the latest session" : "did NOT recall — continue did not resume our injected store"})`,
  );
}

/** pf1: assistant PREFILL via a seeded transcript ending mid-assistant-sentence — does the model
 *  CONTINUE the partial, or ignore/restart it? (The API removed last-assistant-turn prefill on 4.6+;
 *  this probes whether the CLI path behaves differently.) */
async function pf1(): Promise<void> {
  const store = new InMemorySessionStore();
  const canon = [
    { role: "user" as const, content: "Complete the sentence I start." },
    { role: "assistant" as const, content: "The three primary colors are red, blue, and" },
  ];
  const sessionId = seedSessionId("probe-pf1", toSeedTurns(canon));
  await store.append(
    { projectKey: "probe", sessionId },
    buildSeedFrames(toSeedTurns(canon), sessionId),
  );
  let threw = "";
  let reply = "";
  try {
    const r = await runTurn({
      prompt:
        "Continue exactly from where your previous message stopped, adding only the next word.",
      store,
      resume: sessionId,
      systemPrompt: "You are precise.",
    });
    show("pf1", r);
    reply = r.reply;
  } catch (error) {
    threw = error instanceof Error ? error.message : String(error);
  }
  verdict(
    "pf1",
    threw.length === 0,
    threw.length > 0
      ? `prefill-continue threw — "${threw.slice(0, SNIP_WIDE)}"`
      : `assistant-prefill via seed: reply="${reply.slice(0, SNIP_SHORT)}" (${YELLOW_RE.test(reply) ? "CONTINUED the partial (prefill works via seed frames)" : "did not cleanly continue — inspect --verbose"})`,
  );
}

// ── so1: STRUCTURED-OUTPUT MODEL MATRIX ──────────────────────────────────────────────────────────────
// "Test the butt out of" SDK structured output across the latest models: MODELS axis (live family map via
// supportedModels(), or --models) × a fixed 3-schema battery (trivial / realistic memory-digest / hard
// enum+range), each cell classified {valid | prose-leak | retry-exhausted | api-error}. Plus a bounded
// THINKING axis on the sonnet model (digest schema, thinking on vs off). Hard-capped output tokens + a
// per-cell watchdog; --dry-run prints the planned matrix (and quota warning) without spawning.

/** A fixed structured-output schema + its prompt + a hand-rolled validator (no ajv dep). `check` returns
 *  the first conformance failure, or "" when the parsed value validates. */
interface SchemaCase {
  readonly id: string;
  readonly schema: Record<string, unknown>;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly check: (v: unknown) => string;
}

/** Hand-rolled type/required/enum/range checks — enough for the three FIXED schemas below (a dependency
 *  would be overkill; the schemas never vary). Returns "" on success, else the first violation. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function requireKeys(v: Record<string, unknown>, keys: readonly string[]): string {
  for (const k of keys) {
    if (!(k in v)) {
      return `missing required key "${k}"`;
    }
  }
  return "";
}

const SO_SCHEMAS: readonly SchemaCase[] = [
  // (1) TRIVIAL — a single required string field. The floor: any structured-output-capable model passes.
  {
    id: "trivial",
    schema: {
      type: "object",
      properties: { result: { type: "string" } },
      required: ["result"],
      additionalProperties: false,
    },
    systemPrompt: "You output only the requested JSON.",
    userPrompt: "Summarize this in one word as {result: string}: the sky at dusk turned orange.",
    check: (v) => {
      if (!isRecord(v)) {
        return "not an object";
      }
      const miss = requireKeys(v, ["result"]);
      if (miss !== "") {
        return miss;
      }
      return typeof v["result"] === "string" ? "" : "result is not a string";
    },
  },
  // (2) REALISTIC memory-digest — nested object + array-of-objects + enum + required[] (mirrors the sort of
  //     schema the summarize/distill consumers use: see domain/discovery CHARACTER_DISTILL_SCHEMA).
  {
    id: "digest",
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        salience: { enum: ["low", "medium", "high"] },
        entities: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              role: { type: "string" },
            },
            required: ["name", "role"],
            additionalProperties: false,
          },
        },
        summary: { type: "string" },
      },
      required: ["title", "salience", "entities", "summary"],
      additionalProperties: false,
    },
    systemPrompt:
      "You distill a short roleplay scene into a compact memory digest. Output only the JSON.",
    userPrompt:
      "Scene: Mara, a smuggler, met Captain Voss aboard the derelict station and struck a tense bargain over stolen coordinates. Digest it.",
    check: (v) => {
      if (!isRecord(v)) {
        return "not an object";
      }
      const miss = requireKeys(v, ["title", "salience", "entities", "summary"]);
      if (miss !== "") {
        return miss;
      }
      if (!["low", "medium", "high"].includes(v["salience"] as string)) {
        return `salience "${String(v["salience"])}" not in enum`;
      }
      const entities = v["entities"];
      if (!Array.isArray(entities) || entities.length === 0) {
        return "entities not a non-empty array";
      }
      for (const e of entities) {
        if (!isRecord(e) || typeof e["name"] !== "string" || typeof e["role"] !== "string") {
          return "an entity is missing name/role strings";
        }
      }
      return typeof v["summary"] === "string" ? "" : "summary is not a string";
    },
  },
  // (3) HARD — enum + strict required + a NUMERIC RANGE (0..10). Range conformance is where weak guided
  //     decoding leaks (a model emits 11 / a string / omits it); this cell exposes it.
  {
    id: "hard",
    schema: {
      type: "object",
      properties: {
        verdict: { enum: ["approve", "reject", "revise"] },
        confidence: { type: "integer", minimum: 0, maximum: 10 },
        rationale: { type: "string" },
      },
      required: ["verdict", "confidence", "rationale"],
      additionalProperties: false,
    },
    systemPrompt: "You are a strict reviewer. Output only the JSON.",
    userPrompt:
      "Review this plan and rate confidence 0-10: 'Ship the migration tonight with no backup.' Give a verdict.",
    check: (v) => {
      if (!isRecord(v)) {
        return "not an object";
      }
      const miss = requireKeys(v, ["verdict", "confidence", "rationale"]);
      if (miss !== "") {
        return miss;
      }
      if (!["approve", "reject", "revise"].includes(v["verdict"] as string)) {
        return `verdict "${String(v["verdict"])}" not in enum`;
      }
      const c = v["confidence"];
      if (typeof c !== "number" || !Number.isInteger(c) || c < 0 || c > 10) {
        return `confidence ${String(c)} not an integer in 0..10`;
      }
      return typeof v["rationale"] === "string" ? "" : "rationale is not a string";
    },
  },
];

/** Per-cell hard caps — a matrix can span many models; keep the quota spend bounded + legible. */
const SO_OUTPUT_CAP_TOKENS = 500;
const SO_CELL_TIMEOUT_MS = 60_000;
/** The bounded thinking axis = the sonnet model × the digest schema × {thinking on, off} = 2 cells. */
const SO_THINKING_AXIS_CELLS = 2;
/** Decimal places for the USD cost total (sub-cent granularity). */
const COST_DECIMALS = 4;
/** Matches the "sonnet" resolved model for the thinking axis (top-level per useTopLevelRegex). */
const SONNET_RE = /sonnet/iu;

/** One classified structured-output cell outcome. */
type SoOutcome = "valid" | "prose-leak" | "retry-exhausted" | "api-error";
interface SoCell {
  readonly model: string;
  readonly schemaId: string;
  readonly outcome: SoOutcome;
  readonly detail: string;
  readonly numTurns: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costUsd: number;
  readonly durationMs: number;
}

/** The reduced structured-output turn — `structured_output` (SDK), reply text (prose-leak fallback),
 *  terminal reason (retry-exhaustion classifier), token usage + cost. */
interface SoReduced {
  structured: unknown;
  reply: string;
  ok: boolean;
  subtype: string;
  terminalReason: string;
  numTurns: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

/** Read the result frame into the accumulator (split from the loop to stay under the complexity budget). */
function readSoResultFrame(acc: SoReduced, message: Extract<SDKMessage, { type: "result" }>): void {
  acc.subtype = message.subtype;
  acc.ok = !message.is_error && message.subtype === "success";
  acc.terminalReason = message.terminal_reason ?? "";
  acc.numTurns = message.num_turns;
  acc.costUsd = message.total_cost_usd;
  acc.tokensIn = message.usage.input_tokens ?? 0;
  acc.tokensOut = message.usage.output_tokens ?? 0;
  if (message.subtype === "success") {
    acc.structured = message.structured_output;
  }
}

/** Linear frame read (init → assistant → result) of ONE structured-output turn, bounded by the caller's
 *  watchdog. */
async function reduceStructuredTurn(stream: AsyncIterable<SDKMessage>): Promise<SoReduced> {
  const acc: SoReduced = {
    structured: undefined,
    reply: "",
    ok: false,
    subtype: "",
    terminalReason: "",
    numTurns: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  };
  for await (const message of stream) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          acc.reply += block.text;
        }
      }
    } else if (message.type === "result") {
      readSoResultFrame(acc, message);
    }
  }
  return acc;
}

/** Classify a reduced structured-output turn against a schema case. Precedence: retry-exhaustion terminal
 *  → api-error (failed subtype) → valid (structured_output parses + validates) → prose-leak (no structured
 *  frame, or it fails validation — the model returned prose the caller would mis-parse). */
function classifyStructured(
  reduced: Awaited<ReturnType<typeof reduceStructuredTurn>>,
  schemaCase: SchemaCase,
): { outcome: SoOutcome; detail: string } {
  const RETRY_EXHAUST =
    reduced.terminalReason === "structured_output_retry_exhausted" ||
    reduced.subtype === "error_max_structured_output_retries";
  if (RETRY_EXHAUST) {
    return { outcome: "retry-exhausted", detail: reduced.terminalReason || reduced.subtype };
  }
  if (!reduced.ok) {
    return { outcome: "api-error", detail: reduced.terminalReason || reduced.subtype || "failed" };
  }
  if (reduced.structured !== undefined) {
    const violation = schemaCase.check(reduced.structured);
    if (violation === "") {
      return { outcome: "valid", detail: JSON.stringify(reduced.structured).slice(0, SNIP) };
    }
    return { outcome: "prose-leak", detail: `structured but INVALID: ${violation}` };
  }
  // No structured frame on a success turn → the model returned prose the caller would mis-parse.
  return {
    outcome: "prose-leak",
    detail: `no structured_output; reply="${reduced.reply.slice(0, SNIP_SHORT)}"`,
  };
}

/** Run ONE structured-output cell (a model × schema), bounded by the per-cell watchdog. Never throws — a
 *  spawn/transport failure becomes an `api-error` cell so the matrix always completes. `thinking` is set
 *  only on the bounded thinking-axis cells. */
async function runStructuredCell(
  model: string,
  schemaCase: SchemaCase,
  thinking?: Options["thinking"],
): Promise<SoCell> {
  const startedAt = Date.now();
  const abortController = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      abortController.abort();
      reject(new Error(`cell watchdog ${SO_CELL_TIMEOUT_MS}ms`));
    }, SO_CELL_TIMEOUT_MS);
    timer.unref?.();
  });
  const disableThinking = thinking === undefined || thinking.type === "disabled";
  try {
    const stream = query({
      prompt: schemaCase.userPrompt,
      options: {
        disallowedTools: ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"],
        tools: [],
        mcpServers: {},
        strictMcpConfig: true,
        settingSources: [],
        env: probeEnv({ maxOutputTokens: SO_OUTPUT_CAP_TOKENS, disableThinking }),
        model,
        maxTurns: 1,
        systemPrompt: schemaCase.systemPrompt,
        title: "orbweaver-so-matrix",
        outputFormat: { type: "json_schema", schema: schemaCase.schema },
        abortController,
        ...(thinking !== undefined ? { thinking } : {}),
      },
    });
    const reduced = await Promise.race([
      reduceStructuredTurn(stream as AsyncIterable<SDKMessage>),
      watchdog,
    ]);
    const { outcome, detail } = classifyStructured(reduced, schemaCase);
    return {
      model,
      schemaId: schemaCase.id,
      outcome,
      detail,
      numTurns: reduced.numTurns,
      tokensIn: reduced.tokensIn,
      tokensOut: reduced.tokensOut,
      costUsd: reduced.costUsd,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      model,
      schemaId: schemaCase.id,
      outcome: "api-error",
      detail: error instanceof Error ? error.message : String(error),
      numTurns: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    abortController.abort();
  }
}

/** Resolve the MODELS axis: `--models` override wins; else the live family map via supportedModels()
 *  through the mode-1 firewall (exactly like catalog.ts — a held-open no-turn query, resolvedModel per
 *  family alias, deduped), interrupted in finally. On the OR path `--models` is REQUIRED (the OR skin has
 *  no supportedModels() control channel). */
async function resolveSoModels(): Promise<string[]> {
  if (MODELS_OVERRIDE.length > 0) {
    return [...new Set(MODELS_OVERRIDE)];
  }
  if (MODE === "or") {
    throw new Error("so1 --mode or requires --models a,b,c (the OR skin has no supportedModels())");
  }
  // biome-ignore lint/correctness/useYield: an empty async generator IS the held-open no-turn prompt (catalog.ts).
  async function* heldOpen(): AsyncGenerator<never> {
    await Promise.resolve();
  }
  const stream = query({
    prompt: heldOpen(),
    options: {
      disallowedTools: ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"],
      tools: [],
      mcpServers: {},
      strictMcpConfig: true,
      settingSources: [],
      env: probeEnv({}),
    },
  }) as Query;
  try {
    const models: readonly ModelInfo[] = await stream.supportedModels();
    // resolvedModel per family alias; dedup (aliases can collapse onto one resolved id).
    const resolved = models.map((m) => m.resolvedModel ?? m.value).filter((s) => s.length > 0);
    return [...new Set(resolved)];
  } finally {
    try {
      await stream.interrupt();
    } catch {
      // already gone (nothing to recover)
    }
  }
}

/** The per-model verdict off its cells: WORKS (all valid), FLAKY(n/m) (some non-valid), BROKEN (none valid). */
function modelVerdict(cells: readonly SoCell[]): string {
  const valid = cells.filter((c) => c.outcome === "valid").length;
  if (valid === cells.length) {
    return "WORKS";
  }
  if (valid === 0) {
    return "BROKEN";
  }
  return `FLAKY(${valid}/${cells.length})`;
}

/** Print the planned matrix (models × schemas + thinking-axis cells) and the quota warning. Returns the
 *  planned cell count so `main` can gate --dry-run without spawning. */
function printSoPlan(models: readonly string[], sonnetModel: string | undefined): number {
  const batteryCells = models.length * SO_SCHEMAS.length;
  const thinkingCells = sonnetModel !== undefined ? SO_THINKING_AXIS_CELLS : 0;
  const total = batteryCells + thinkingCells;
  console.log(
    `so1 PLAN — ${models.length} model(s) × ${SO_SCHEMAS.length} schema(s) = ${batteryCells} battery cells` +
      `${thinkingCells > 0 ? ` + ${thinkingCells} thinking-axis cells (${sonnetModel})` : ""} = ${total} live turns`,
  );
  console.log(`  models: ${models.join(", ")}`);
  console.log(`  schemas: ${SO_SCHEMAS.map((s) => s.id).join(", ")}`);
  console.log(
    `  ⚠ each cell spends real ${MODE === "or" ? "OR credits" : "Max-sub quota"} (cap ${SO_OUTPUT_CAP_TOKENS} out-tokens/cell)`,
  );
  return total;
}

/** Pick the "sonnet" resolved model for the thinking axis (first id containing "sonnet"), if any. */
function pickSonnet(models: readonly string[]): string | undefined {
  return models.find((m) => SONNET_RE.test(m));
}

/** Render the per-model verdict matrix table + a one-line verdict per model + totals. */
function renderSoMatrix(models: readonly string[], cells: readonly SoCell[]): void {
  console.log("\n── so1 matrix (outcome per model × schema) ──");
  const header = ["model", ...SO_SCHEMAS.map((s) => s.id)].join(" | ");
  console.log(`  ${header}`);
  for (const model of models) {
    const row = SO_SCHEMAS.map((s) => {
      const cell = cells.find((c) => c.model === model && c.schemaId === s.id);
      return cell?.outcome ?? "—";
    });
    const modelCells = cells.filter((c) => c.model === model && c.schemaId !== "digest-think");
    console.log(`  ${model} | ${row.join(" | ")}  →  ${modelVerdict(modelCells)}`);
  }
  const valid = cells.filter((c) => c.outcome === "valid").length;
  const totalTokensOut = cells.reduce((n, c) => n + c.tokensOut, 0);
  const totalCost = cells.reduce((n, c) => n + c.costUsd, 0);
  console.log(
    `\n  totals: ${valid}/${cells.length} cells valid · out-tokens=${totalTokensOut} · cost=$${totalCost.toFixed(COST_DECIMALS)}`,
  );
  // Per-cell detail lines for the non-valid cells (the FLAG list an operator inspects).
  for (const c of cells.filter((x) => x.outcome !== "valid")) {
    console.log(
      `  FLAG [${c.model} / ${c.schemaId}] ${c.outcome}: ${c.detail} (turns=${c.numTurns}, ${c.durationMs}ms)`,
    );
  }
}

/** so1: the structured-output MODEL MATRIX. Resolves the models axis, runs the 3-schema battery per model +
 *  a bounded thinking-axis on the sonnet model, classifies each cell, and renders the verdict matrix. A
 *  --dry-run prints the plan and returns without spawning. Pass = every cell valid; else the flagged cells
 *  are listed. Sequential BY DESIGN (quota-metered live turns). */
async function so1(): Promise<void> {
  const models = await resolveSoModels();
  const sonnet = pickSonnet(models);
  const planned = printSoPlan(models, sonnet);
  if (DRY_RUN) {
    verdict("so1", true, `dry-run: ${planned} planned cells (no turns spawned)`);
    return;
  }
  const cells: SoCell[] = [];
  for (const model of models) {
    for (const schemaCase of SO_SCHEMAS) {
      // biome-ignore lint/performance/noAwaitInLoops: cells are sequential BY DESIGN — quota-metered live turns, ordered output.
      const cell = await runStructuredCell(model, schemaCase);
      cells.push(cell);
      console.log(`  [${model} / ${schemaCase.id}] ${cell.outcome} — ${cell.detail}`);
    }
  }
  // THINKING axis (bounded): the sonnet model × the digest schema, thinking enabled vs disabled — flag if
  // structured output + thinking interact badly (a common weak spot).
  const digest = SO_SCHEMAS.find((s) => s.id === "digest");
  if (sonnet !== undefined && digest !== undefined) {
    const thinkOff = await runStructuredCell(sonnet, digest, { type: "disabled" });
    const thinkOn = await runStructuredCell(sonnet, digest, {
      type: "adaptive",
      display: "summarized",
    });
    console.log(
      `  [thinking axis · ${sonnet} · digest] off=${thinkOff.outcome} on=${thinkOn.outcome}` +
        `${thinkOff.outcome === thinkOn.outcome ? " (no interaction)" : " ⚠ THINKING CHANGES THE OUTCOME"}`,
    );
  }
  renderSoMatrix(models, cells);
  const allValid = cells.every((c) => c.outcome === "valid");
  verdict(
    "so1",
    allValid,
    `structured-output matrix — ${cells.filter((c) => c.outcome === "valid").length}/${cells.length} cells valid across ${models.length} model(s)`,
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const all: ReadonlyArray<readonly [string, () => Promise<void>]> = [
    ["p1", p1],
    ["p2", p2],
    ["p3", p3],
    ["b1", b1],
    ["rz1", rz1],
    ["rz2", rz2],
    ["rz3", rz3],
    ["cont1", cont1],
    ["pf1", pf1],
    ["so1", so1],
  ];
  console.log(
    `sdk-behavior-probe — model=${MODEL} (${MODE === "or" ? "mode-2 OR skin" : "mode-1 Max sub"}; spends real quota/credits)\n`,
  );
  for (const [name, run] of all) {
    if (ONLY.size > 0 && !ONLY.has(name)) {
      continue;
    }
    console.log(`── ${name} ──`);
    try {
      // biome-ignore lint/performance/noAwaitInLoops: scenarios are sequential BY DESIGN — quota-metered live turns, ordered output.
      await run();
    } catch (error) {
      verdict(name, false, `threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const flagged = verdicts.filter((v) => !v.pass);
  console.log(`\n${verdicts.length - flagged.length}/${verdicts.length} scenario checks passed`);
  process.exitCode = flagged.length > 0 ? 1 : 0;
}

await main();
