#!/usr/bin/env tsx
/**
 * pnpm sdk:session-probe [--mode sub|or] [--model <id>] [--turns N] [--verbose]
 *
 * The HELD-OPEN-WORKER justification probe — the measurement half of the held-open-sessions PD
 * (`reports/agent-sdk/held-open-sessions-pd.md`). It quantifies what the PD's opt-in mode would BUY: the
 * per-turn subprocess-spawn overhead a warm worker saves, and whether a streamed same-worker turn keeps
 * the prompt cache as warm as a `resume`-by-session per-turn spawn. Spends real Max-sub quota (mode-1) or
 * OpenRouter credits (mode-2) — HAND-RUN, NEVER CI. Same firewall as a real turn (mode-1 = catalog.ts's
 * `firewallBase()` + `buildClaudeSdkEnv()`; mode-2 = `buildClaudeOpenRouterEnv`).
 *
 * WHAT IT MEASURES, per mode, over N (default 3) small fixed prompts sharing ONE lore prefix:
 *   (a) BASELINE (the documented default path): a FRESH `query()` per turn, resumed by sessionId through
 *       the injected store — exactly what `runChatTurn` does today. Records wall time / TTFT / cacheRead /
 *       cacheWrite per turn.
 *   (b) HELD-OPEN (the proposed mode): ONE `query()` opened with a STREAMING-INPUT prompt (a pushable
 *       `AsyncIterable<SDKUserMessage>`), the SAME N prompts fed as streamed messages. Because the prompt
 *       is an iterable (not a string), the SDK marks the query `isSingleUserTurn=false` and keeps stdin
 *       open across turns — a string/first-message prompt would have the SDK close stdin after the first
 *       result and crash later writes. Same metrics per turn.
 *   (c) A comparison table + a verdict line: spawn overhead saved per turn (baseline wall − held wall on
 *       turns ≥2, where the baseline pays a fresh spawn and the held path does not) and the cache-warmth
 *       delta (held cacheRead vs baseline resumed cacheRead).
 *
 * SAFETY: tiny capped output, a hard turn count (`--turns`, ceiled), a per-turn watchdog, and an
 * abort/interrupt/close in `finally` on BOTH paths so a wedged worker can't grind quota. The held-open
 * query is `maxTurns` = N so it can serve the whole batch and no more.
 */

import process from "node:process";
import type {
  Options,
  SDKMessage,
  SDKUserMessage,
  SessionStore,
} from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ChatResult } from "@orb/server/infra/providers";
import {
  buildClaudeOpenRouterEnv,
  buildClaudeSdkEnv,
  consumeTurnStream,
  firewallBase,
} from "@orb/server/infra/providers/backends/agent-sdk";
import { InMemorySessionStore } from "@orb/server/infra/providers/backends/agent-sdk/session";

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const MODEL_FLAG = argValue("--model");
const VERBOSE = args.includes("--verbose");
/** --mode sub (default: the Max-sub mode-1 firewall env) | or (mode-2: the OpenRouter Anthropic skin).
 *  The OR key rides OPENROUTER_PROBE_KEY (probe-run plumbing — a scoped test key, never app config). */
const MODE = argValue("--mode") ?? "sub";
// biome-ignore lint/style/noProcessEnv: OPENROUTER_PROBE_KEY is probe-run plumbing (scoped test key), not app config — probes run outside the foundation/env perimeter.
const OR_PROBE_KEY = process.env["OPENROUTER_PROBE_KEY"] ?? "";
if (MODE === "or" && OR_PROBE_KEY.length === 0) {
  throw new Error("--mode or requires OPENROUTER_PROBE_KEY in the environment");
}

// ── Hard safety caps (a wedge must not burn quota) ─────────────────────────────────────────────────────
/** Output ceiling per turn (CLAUDE_CODE_MAX_OUTPUT_TOKENS) — keeps every reply tiny. */
const OUTPUT_CAP_TOKENS = 256;
/** Turn count, `--turns`-overridable, CEILED so a fat-fingered flag can't fan out a huge batch. */
const TURN_CAP = 6;
const TURN_FLOOR = 1;
const DEFAULT_TURNS = 3;
const DECIMAL_RADIX = 10;
const REQUESTED_TURNS = Number.parseInt(
  argValue("--turns") ?? String(DEFAULT_TURNS),
  DECIMAL_RADIX,
);
const TURNS = Math.min(
  Math.max(Number.isNaN(REQUESTED_TURNS) ? DEFAULT_TURNS : REQUESTED_TURNS, TURN_FLOOR),
  TURN_CAP,
);
/** Per-turn watchdog — a wedged spawn/stream can't hang the probe (a cold worker boot fits in 45s). */
const TURN_TIMEOUT_MS = 45_000;
/** Reply excerpt length in verbose logs. */
const SNIPPET = 80;
/** Cost column decimals in the usage table. */
const COST_DECIMALS = 5;
/** Lore paragraphs — sized so the shared system prefix clears the cacheable-prefix minimum (~4k tok on
 *  Haiku), so cacheRead>0 on turn ≥2 is a real signal, not a sub-threshold artifact. */
const LORE_PARAGRAPHS = 110;

const MODEL = MODEL_FLAG ?? (MODE === "or" ? "anthropic/claude-haiku-4.5" : "claude-haiku-4-5");

/** The OR-skin tier→slug trio for --mode or (probe-run plumbing, like the probe key — the live path
 *  DERIVES this from the connection catalogs; a probe pins a fixed cheap trio). */
const OR_PROBE_TIER_MODELS = {
  opus: "anthropic/claude-haiku-4.5",
  sonnet: "anthropic/claude-haiku-4.5",
  haiku: "anthropic/claude-haiku-4.5",
} as const;

/** The per-mode firewall env — the SAME builders a real turn uses (mode-1 via catalog.ts's path). */
function probeEnv(
  overrides: Parameters<typeof buildClaudeSdkEnv>[0],
): Record<string, string | undefined> {
  return MODE === "or"
    ? buildClaudeOpenRouterEnv(OR_PROBE_KEY, OR_PROBE_TIER_MODELS, overrides)
    : buildClaudeSdkEnv(overrides);
}

// ── Fixtures ───────────────────────────────────────────────────────────────────────────────────────────
/** Deterministic ~6k-token lore block — the shared cacheable prefix both paths reuse turn-to-turn. */
const LORE = Array.from(
  { length: LORE_PARAGRAPHS },
  (_, i) =>
    `Chronicle ${i}: In the ${i}th year of the Ember Accord, the wardens of Khal-Toruun sealed the obsidian gate beneath the singing dunes, and the caravans learned to route their salt and silver through the high passes of Veyra, where the wind keeps the old names and the toll-keepers keep the older grudges. The ledger of that year records forty-one crossings, three broken oaths, and one dragon sighting that the archivists still dispute.`,
).join("\n");
const STATIC_SYSTEM = `You are a terse lore assistant for the world described below. Answer in one short sentence.\n\n${LORE}`;
/** Small fixed prompts — distinct so each turn does real work, tiny so replies stay cheap. */
const PROMPTS: readonly string[] = [
  "In one short sentence: what lies beneath the singing dunes?",
  "In one short sentence: through whose passes do the caravans route?",
  "In one short sentence: what do the toll-keepers keep?",
  "In one short sentence: how many crossings did that year's ledger record?",
  "In one short sentence: what did the archivists dispute?",
  "In one short sentence: what did the wardens of Khal-Toruun seal?",
];

// ── Per-turn measurement row ───────────────────────────────────────────────────────────────────────────
interface Measure {
  readonly path: "baseline" | "held-open";
  readonly turn: number;
  readonly wallMs: number;
  readonly ttftMs: number | null;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly costUsd: number;
}
const rows: Measure[] = [];
function push(path: Measure["path"], turn: number, wallMs: number, r: ChatResult): void {
  rows.push({
    path,
    turn,
    wallMs,
    ttftMs: r.ttftMs,
    cacheRead: r.usage.cacheReadTokens,
    cacheWrite: r.usage.cacheWriteTokens,
    costUsd: r.usage.costUsd,
  });
  if (VERBOSE) {
    console.log(`\n[${path}/t${turn}] ${wallMs}ms reply: ${r.reply.slice(0, SNIPPET)}`);
  }
}

/** Race a turn against the watchdog so a wedged spawn/stream can't hang the probe. `onTimeout` (held-open
 *  path) fires before the reject so the whole query is aborted — not just this turn's promise abandoned. */
function withWatchdog<T>(promise: Promise<T>, label: string, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`${label} exceeded ${TURN_TIMEOUT_MS}ms watchdog`));
    }, TURN_TIMEOUT_MS);
  });
  return Promise.race([promise, guard]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

/** Re-emit a captured message slice as an `AsyncIterable<SDKMessage>` so the shared `consumeTurnStream`
 *  reducer accounts a held-open turn IDENTICALLY to the baseline path. */
// biome-ignore lint/suspicious/useAwait: a pure replay generator yields buffered frames; it has nothing to await, but must be `async` to satisfy the `AsyncIterable` the reducer consumes.
async function* replay(slice: readonly SDKMessage[]): AsyncGenerator<SDKMessage> {
  for (const m of slice) {
    yield m;
  }
}

/** The firewall-base + generation Options shared by BOTH paths (mode-1 shape = catalog.ts's; the env is
 *  per-mode). `maxTurns` is caller-set: 1 for a per-turn spawn, N for the held-open batch. */
function turnOptions(maxTurns: number): Options {
  return {
    ...firewallBase(),
    env: probeEnv({ maxOutputTokens: OUTPUT_CAP_TOKENS }),
    model: MODEL,
    maxTurns,
    title: "orbweaver-session-probe",
  };
}

// ── (a) BASELINE — the documented default: a FRESH query() per turn, resumed by sessionId ──────────────
async function runBaseline(): Promise<void> {
  const store: SessionStore = new InMemorySessionStore();
  let resume: string | undefined;
  for (let turn = 0; turn < TURNS; turn++) {
    let sessionId = "";
    const t0 = Date.now();
    const stream = query({
      prompt: PROMPTS[turn] ?? PROMPTS[0] ?? "",
      options: {
        ...turnOptions(1),
        systemPrompt: STATIC_SYSTEM,
        sessionStore: store,
        ...(resume !== undefined ? { resume } : {}),
      },
    });
    try {
      // biome-ignore lint/performance/noAwaitInLoops: turns are sequential BY DESIGN — a resume must see the prior turn's session, and serial turns keep the spawn/cache attribution unambiguous.
      const r = await withWatchdog(
        consumeTurnStream(stream as AsyncIterable<SDKMessage>, {
          model: MODEL,
          resumed: resume !== undefined,
          now: () => Date.now(),
          onSessionId: (id) => {
            sessionId = id;
          },
        }),
        `baseline turn ${turn + 1}`,
      );
      push("baseline", turn + 1, Date.now() - t0, r);
      if (sessionId.length > 0) {
        resume = sessionId;
      }
    } finally {
      stream.close();
    }
  }
}

// ── (b) HELD-OPEN — ONE query() with streamInput; the SAME N prompts fed as streamed messages ──────────
/** A queue-driven `AsyncIterable<SDKUserMessage>` the driver pushes one prompt into per turn, awaiting
 *  each turn's result before releasing the next (so the held-open metrics stay per-turn attributable). */
class PromptFeed implements AsyncIterable<SDKUserMessage> {
  private readonly queue: SDKUserMessage[] = [];
  private resolveNext: ((v: IteratorResult<SDKUserMessage>) => void) | undefined;
  private closed = false;

  send(text: string): void {
    const msg: SDKUserMessage = {
      type: "user",
      parent_tool_use_id: null,
      message: { role: "user", content: text },
    };
    if (this.resolveNext !== undefined) {
      const r = this.resolveNext;
      this.resolveNext = undefined;
      r({ value: msg, done: false });
    } else {
      this.queue.push(msg);
    }
  }

  close(): void {
    this.closed = true;
    if (this.resolveNext !== undefined) {
      const r = this.resolveNext;
      this.resolveNext = undefined;
      r({ value: undefined as unknown as SDKUserMessage, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: (): Promise<IteratorResult<SDKUserMessage>> => {
        const queued = this.queue.shift();
        if (queued !== undefined) {
          return Promise.resolve({ value: queued, done: false });
        }
        // biome-ignore lint/suspicious/noUnnecessaryConditions: `closed` IS mutated by close() — biome's flow analysis narrows the field initializer to literal `false` and misses the mutation (the same miss suppressed across this repo).
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as SDKUserMessage, done: true });
        }
        return new Promise((resolve) => {
          this.resolveNext = resolve;
        });
      },
    };
  }
}

async function runHeldOpen(): Promise<void> {
  const store: SessionStore = new InMemorySessionStore();
  const feed = new PromptFeed();
  // The feed IS the prompt: an `AsyncIterable<SDKUserMessage>` prompt makes the SDK classify the query
  // `isSingleUserTurn=false`, so it keeps stdin open across turns (a string/first-message prompt would
  // close stdin after the first result and crash the later per-turn writes). The SDK internally drives
  // this feed via its own `streamInput`; we push one turn's message at a time from the reducer below.
  // A dedicated AbortController lets the per-turn watchdog abort the WHOLE query on a wedged turn.
  const abortController = new AbortController();
  const stream = query({
    prompt: feed,
    options: {
      ...turnOptions(TURNS),
      systemPrompt: STATIC_SYSTEM,
      sessionStore: store,
      abortController,
    },
  });
  try {
    await consumeHeldStream(stream as AsyncIterable<SDKMessage>, feed, abortController);
  } finally {
    feed.close();
    stream.close();
  }
}

/** Reduce the held-open worker's interleaved stream into ONE `ChatResult` per turn. The single message
 *  stream carries all N turns back-to-back; each `result` frame ends a turn. We drive the next prompt in
 *  as soon as a turn settles (the wall clock spans send→result), reusing the shared `consumeTurnStream`
 *  reducer per slice via a re-buffering async generator. */
async function consumeHeldStream(
  stream: AsyncIterable<SDKMessage>,
  feed: PromptFeed,
  abortController: AbortController,
): Promise<void> {
  const iterator = stream[Symbol.asyncIterator]();
  for (let turn = 0; turn < TURNS; turn++) {
    const t0 = Date.now();
    feed.send(PROMPTS[turn] ?? PROMPTS[0] ?? "");
    // Re-buffer this turn's slice (up to and including its `result` frame) back through the shared reducer,
    // so cache/usage/ttft accounting is IDENTICAL to the baseline path (no bespoke accounting drift).
    // The watchdog aborts the WHOLE held-open query on a wedged turn, then rejects — so a stuck worker
    // can't grind quota and the verdict never prints a fabricated row.
    // biome-ignore lint/performance/noAwaitInLoops: turns are sequential BY DESIGN — the next prompt is released only after this turn's `result` frame settles, keeping per-turn attribution clean.
    const r = await withWatchdog(
      sliceOneTurn(iterator, turn + 1),
      `held-open turn ${turn + 1}`,
      () => abortController.abort(),
    );
    push("held-open", turn + 1, Date.now() - t0, r);
  }
}

/** Pull messages off the shared iterator until (and including) the next `result` frame, then reduce that
 *  slice through `consumeTurnStream`. FAILS LOUDLY if the stream ends before this turn's `result` frame —
 *  a held-open turn that produced no result must NOT be silently recorded as a zero-usage row (that was
 *  the artifact the old single-user-turn bug printed). */
async function sliceOneTurn(
  iterator: AsyncIterator<SDKMessage>,
  turn: number,
): Promise<ChatResult> {
  const slice: SDKMessage[] = [];
  let sawResult = false;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: draining one turn's messages off a live stream is inherently sequential.
    const next = await iterator.next();
    if (next.done === true) {
      break;
    }
    slice.push(next.value);
    if (next.value.type === "result") {
      sawResult = true;
      break;
    }
  }
  if (!sawResult) {
    throw new Error(
      `held-open turn ${turn} produced no result frame (stream closed early) — the held-open worker did not serve this turn; refusing to record a fabricated zero-usage row`,
    );
  }
  return consumeTurnStream(replay(slice), { model: MODEL, resumed: true, now: () => Date.now() });
}

// ── Comparison + verdict ───────────────────────────────────────────────────────────────────────────────
function mean(ns: readonly number[]): number {
  return ns.length === 0 ? 0 : ns.reduce((a, b) => a + b, 0) / ns.length;
}

function report(): void {
  console.log("\n=== per-turn measurements ===");
  console.table(
    rows.map((r) => ({
      path: r.path,
      turn: r.turn,
      wallMs: r.wallMs,
      ttftMs: r.ttftMs ?? "—",
      cacheRead: r.cacheRead,
      cacheWrite: r.cacheWrite,
      cost: r.costUsd.toFixed(COST_DECIMALS),
    })),
  );

  // Warm-turn comparison: turns ≥2, where the baseline pays a fresh spawn and the held path does not.
  const warmBase = rows.filter((r) => r.path === "baseline" && r.turn >= 2);
  const warmHeld = rows.filter((r) => r.path === "held-open" && r.turn >= 2);
  const baseWall = mean(warmBase.map((r) => r.wallMs));
  const heldWall = mean(warmHeld.map((r) => r.wallMs));
  const baseRead = mean(warmBase.map((r) => r.cacheRead));
  const heldRead = mean(warmHeld.map((r) => r.cacheRead));
  const spawnSavedMs = baseWall - heldWall;

  console.log("\n=== verdict (warm turns, ≥2) ===");
  console.log(
    `mode=${MODE === "or" ? "mode-2 OR skin" : "mode-1 Max sub"} model=${MODEL} turns=${TURNS}`,
  );
  console.log(
    `spawn overhead saved/turn ≈ ${spawnSavedMs.toFixed(0)}ms ` +
      `(baseline warm wall ${baseWall.toFixed(0)}ms − held-open warm wall ${heldWall.toFixed(0)}ms)`,
  );
  console.log(
    `cache-warmth delta: held-open cacheRead ${heldRead.toFixed(0)} vs baseline resumed cacheRead ${baseRead.toFixed(0)} ` +
      `(${heldRead >= baseRead ? "held-open stays at least as warm" : "held-open is COLDER — investigate before defaulting on"})`,
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(
    `sdk-session-probe — model=${MODEL} (${MODE === "or" ? "mode-2 OR skin" : "mode-1 Max sub"}; spends real quota/credits; turns=${TURNS})\n`,
  );
  console.log("── baseline (fresh query per turn, resume by session) ──");
  await runBaseline();
  console.log("── held-open (one query, streamInput batch) ──");
  await runHeldOpen();
  report();
}

await main();
