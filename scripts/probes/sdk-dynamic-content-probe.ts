#!/usr/bin/env tsx

/**
 * pnpm sdk:dynamic-probe [--spot A,B,C] [--nonce <str>] [--mode sub|or] [--model <id>]
 *                        [--verbose] [--dry-run]
 *
 * THE BEHAVIORAL QUESTION — for each candidate "dynamic-content spot", can we (1) put content there and have
 * the model USE it this turn, and (2) CHANGE it next turn and have the model use the NEW value? The
 * pass/fail is read off the REPLY TEXT, never off cache tokens (cache-token accounting drowned this
 * question in sdk-injection-cache-probe; that approach also used adversarial "list the codeword" prompts
 * the model REFUSES as prompt-extraction).
 *
 * THE SPOTS (each gets the same 3-turn behavioral battery):
 *   A = the UserPromptSubmit HOOK (dynamicContextOptions additionalContext) — our current live "dynamic
 *       content" channel (translate.ts). Volatile content rides the message tail each turn.
 *   B = a DEPTH in_chat injection into the SEEDED history (the production splice path). Depth-2, user
 *       role — lands mid-seed (the hashed history).
 *   C = TOP-ANCHOR — an over-deep in_chat injection that the splice CLAMPS to position 0 (the
 *       tail-independent, lineage-safe placement). Same splice path as B, depth = TOP_ANCHOR_DEPTH.
 *
 * THE BATTERY per spot — a 3-turn RESUMED sequence, all content BENIGN:
 *   RECALL — the spot carries "The balloon in the corner is RED." (turns 1-2); PASS if the reply names
 *            the CURRENT colour.
 *   STEER  — the spot ALSO carries "For your very next reply, speak like a pirate." (turns 1-2); PASS if
 *            the reply is recognisably piratey.
 *   FRESHNESS (the headline turn) — on turn 3 the spot content CHANGES to BLUE + a butler voice; PASS if
 *            the reply flips accordingly. A turn-3 reply still saying RED or still piratey means the spot
 *            served STALE content ⇒ the channel is BROKEN for dynamic use.
 *
 * VERDICT per spot: LIVE (recall+steer land turns 1-2 AND turn-3 freshness flips) vs STALE/DEAD.
 *
 * ISOLATION — WHY the nonce: Anthropic's content-keyed prefix cache has a ~5-minute TTL and is GLOBAL
 * across runs, so a fresh run could read a PRIOR run's cached lore. The system-prompt lore AND the
 * balloon sentence both mix in a per-run --nonce so no run's bytes can match a prior run's cached
 * prefix. Date.now()/Math.random() are unavailable in this runtime per the constitution, so the
 * orchestrator passes a fresh --nonce on each live run.
 *
 * cacheRead/cacheWrite ARE captured but only as a SECONDARY diagnostic column ("contaminated by the
 * global 5-min content cache across runs; do not gate on it") — the verdict is 100% the reply text.
 *
 * SAFETY: OUTPUT_CAP tokens (~200); a per-turn watchdog that ABORTS the whole query (AbortController) and
 * an `interrupt()` in `finally`. Mode-1 (Max sub) default; --mode or supported like the sibling probes.
 * Costs pennies but spends REAL sub quota / OR credits — HAND-RUN ONLY, never CI.
 */

import process from "node:process";
import type { SDKMessage, SessionStore } from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ChatInjection } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatResult } from "@orb/server/infra/providers";
import { buildClaudeOpenRouterEnv, buildClaudeSdkEnv, consumeTurnStream, dynamicContextOptions } from "@orb/server/infra/providers/backends/agent-sdk";
import type { SeedTurn } from "@orb/server/infra/providers/backends/agent-sdk/session";
import { InMemorySessionStore, SessionCache } from "@orb/server/infra/providers/backends/agent-sdk/session";
import { AGENT_PROMPT_TAIL_JOINER } from "@orb/server/infra/providers/contract";
// The PRODUCTION splice + squash, deep-imported like the assembly tests (no assembly barrel exists).
import { spliceInChatInjections } from "../../packages/server/src/domain/chat/assembly/injections.ts";
import { squashSameRole } from "../../packages/server/src/domain/chat/assembly/role-squash.ts";

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const MODEL_FLAG = argValue("--model");
const ONLY = new Set(
  (argValue("--spot") ?? argValue("-s"))
    ?.split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0) ?? [],
);
const VERBOSE = args.includes("--verbose");
/** Prints the planned spots × battery and spawns NOTHING. Deterministic under the default nonce. */
const DRY_RUN = args.includes("--dry-run");
/** --mode sub (default: the Max-sub mode-1 firewall env) | or (mode-2: the OpenRouter Anthropic skin). */
const MODE = argValue("--mode") ?? "sub";
/** The per-run cache-isolation nonce, woven into the LORE + the balloon sentence. Fixed default keeps
 *  --dry-run deterministic. MUST come from argv — Date.now()/Math.random() are unavailable here (constitution). */
const NONCE = argValue("--nonce") ?? "FIXED0";
// biome-ignore lint/style/noProcessEnv: OPENROUTER_PROBE_KEY is probe-run plumbing (scoped test key), not app config — probes run outside the foundation/env perimeter.
const OR_PROBE_KEY = process.env["OPENROUTER_PROBE_KEY"] ?? "";
if (MODE === "or" && !DRY_RUN && OR_PROBE_KEY.length === 0) {
  throw new Error("--mode or requires OPENROUTER_PROBE_KEY in the environment");
}
/** Probe-run OR tier trio — every tier pinned to haiku so a probe can never accidentally burn opus-priced
 *  credits (mirrors the sibling probes). A real turn derives this from the live catalogs. */
const OR_PROBE_TIER_MODELS = {
  opus: "anthropic/claude-haiku-4.5",
  sonnet: "anthropic/claude-haiku-4.5",
  haiku: "anthropic/claude-haiku-4.5",
} as const;
/** The per-mode firewall env — the SAME builders a real turn uses. */
function probeEnv(overrides: Parameters<typeof buildClaudeSdkEnv>[0]): Record<string, string | undefined> {
  return MODE === "or" ? buildClaudeOpenRouterEnv(OR_PROBE_KEY, OR_PROBE_TIER_MODELS, overrides) : buildClaudeSdkEnv(overrides);
}
/** Default = claude-opus-4-8. The UserPromptSubmit hook delivers a MID-CONVERSATION SYSTEM MESSAGE, and
 *  per the docs that feature is "Claude Opus 4.8 ONLY" — on Haiku it carries no system authority.
 *  Overridable via --model. */
const MODEL = MODEL_FLAG ?? (MODE === "or" ? "anthropic/claude-opus-4.8" : "claude-opus-4-8");

// ── Tuning constants ───────────────────────────────────────────────────────────────────────────────────
/** Output cap per turn (CLAUDE_CODE_MAX_OUTPUT_TOKENS) — a one-line pirate/butler answer needs almost nothing. */
const OUTPUT_CAP_TOKENS = 200;
/** Lore paragraphs — sized so the system prefix clears Haiku's cacheable-prefix minimum (~4k tok), so the
 *  SECONDARY cache column is meaningful on a warm turn. Behavioral reads don't depend on it. */
const LORE_PARAGRAPHS = 110;
/** Per-turn watchdog — a wedged spawn/stream can't hang the probe (a cold worker boot fits in 60s). */
const TURN_TIMEOUT_MS = 60_000;
/** Reply excerpt length in non-verbose logs. */
const SNIPPET = 120;
/** Cost column decimals in the usage table. */
const COST_DECIMALS = 5;
/** dry-run spend estimate: ~input tokens touched per live turn (lore + canon + tail). */
const EST_TOKENS_PER_TURN = 14_000;
/** MAX_INJECTION_DEPTH-style over-deep depth — the splice clamps it to the history length, i.e. the TOP
 *  (insertAt 0), the one tail-independent (position-stable) in_chat placement (spot C). */
const TOP_ANCHOR_DEPTH = 100_000;
/** Spot B depth — mid-seed (past the last-assistant boundary), lands in the hashed history. */
const DEPTH_B = 2;

// ── The colours / steer markers (the behavioral signals) ─────────────────────────────────────────────────
const COLOUR_TURN12 = "RED";
const COLOUR_TURN3 = "BLUE";
/** The 3-turn resumed battery — turns 1-2 plant RED + pirate, turn 3 flips to BLUE + butler. Named so no
 *  bare `3` (the freshness turn) trips noMagicNumbers, and so the sequence has one home. */
const TURN_ONE = 1;
const TURN_TWO = 2;
const FRESHNESS_TURN = 3;
const TURN_SEQUENCE = [TURN_ONE, TURN_TWO, FRESHNESS_TURN] as const;
type TurnNo = (typeof TURN_SEQUENCE)[number];
/** Tolerant pirate markers — contains-ANY over a lowercased reply. Spaced markers ("ye ", "be ") avoid
 *  matching inside unrelated words (e.g. "maybe", "type"). This is the COMMAND-framed steer ("speak like a
 *  pirate") — the kind of override directive the docs say Claude is trained to resist in system content. */
const PIRATE_MARKERS = ["arr", "matey", "ye ", "ahoy", "be ", "aye", "avast", "yer "] as const;
/** Tolerant STORM markers — the CONTEXT-framed steer. Instead of commanding a voice, the spot states a FACT
 *  ("a storm is battering the tavern and everyone is shouting to be heard"); a reply that reflects the storm /
 *  shouting / tension absorbed the fact. Reported ALONGSIDE the pirate steer so we can tell whether it's the
 *  COMMAND FRAMING that fails (docs: Claude resists override-style system directives) vs the channel itself. */
const STORM_MARKERS = ["storm", "shout", "wind", "rain", "thunder", "howl", "roar", "din", "over the noise"] as const;
/** Tolerant butler markers — contains-ANY over a lowercased reply. */
const BUTLER_MARKERS = ["sir", "madam", "certainly", "indeed", "shall", "very good", "at once", "of course"] as const;

// ── Shared fixtures (nonce-woven for per-run cache isolation) ─────────────────────────────────────────────
/** Deterministic lore, mixing the run nonce into EVERY paragraph so a fresh run's system prefix cannot match
 *  a prior run's cached prefix (the ~5-min global-content-cache contamination the header documents). */
const LORE = Array.from(
  { length: LORE_PARAGRAPHS },
  (_, i) =>
    `Chronicle ${NONCE}-${i}: In the ${i}th year of the Ember Accord, the wardens of Khal-Toruun sealed the obsidian gate beneath the singing dunes, and the caravans learned to route their salt and silver through the high passes of Veyra, where the wind keeps the old names and the toll-keepers keep the older grudges. The ledger of that year records forty-one crossings, three broken oaths, and one dragon sighting that the archivists still dispute.`,
).join("\n");
const STATIC_SYSTEM = `You are a helpful assistant for the world described below. Answer briefly.\n\n${LORE}`;

/** The balloon fact for a spot's content — nonce-woven so the sentence itself can't hit a prior run's cache. */
function balloonFact(colour: string): string {
  return `The balloon in the corner (item ${NONCE}) is ${colour}.`;
}
/** The full spot content for a turn. Carries THREE signals: the balloon FACT (recall), a COMMAND-framed steer
 *  ("speak like a pirate"), and a CONTEXT-framed steer (a stated FACT about the scene — a storm). Turn 3 flips
 *  all three: BLUE, a butler command, and a CALM scene (storm passed) — so freshness is visible on every axis. */
function spotContent(turnNo: TurnNo): string {
  if (turnNo === FRESHNESS_TURN) {
    return `${balloonFact(COLOUR_TURN3)} The storm has passed and the tavern is quiet and calm again. For your very next reply, speak like a formal butler.`;
  }
  return (
    `${balloonFact(COLOUR_TURN12)} The scene has shifted: a storm is battering the tavern and everyone ` +
    "is shouting to be heard. For your very next reply, speak like a pirate."
  );
}

/** A small benign canon so the turn is a normal chat (single-speaker; ends assistant so the tail question is
 *  the clean user tail). Nonce-woven so the whole seeded prefix is per-run. */
interface WireRow {
  role: "user" | "assistant";
  content: string;
}
const CANON: readonly WireRow[] = [
  { role: "user", content: `Hello (session ${NONCE}). Tell me about the wardens of Khal-Toruun.` },
  {
    role: "assistant",
    content: `The wardens of Khal-Toruun sealed the obsidian gate beneath the singing dunes (record ${NONCE}).`,
  },
];
/** The user question every turn asks — benign, in plain language. */
const BALLOON_QUESTION = "What colour is the balloon in the corner?";

// ── The real shaping path (splice → squash → seed/prompt split) — reused from the old probe's idiom ─────
interface BuiltTurn {
  readonly seed: readonly SeedTurn[];
  readonly prompt: string;
}
/**
 * The pre-dispatch shaping a real send-turn performs, minus name-stamp/macros (single-speaker canon has
 * neither). Splice + squash are the PRODUCTION functions. The seed/prompt split MIRRORS entry/compose/chat.ts
 * `splitAgentHistory` (last-assistant boundary; tail joined with AGENT_PROMPT_TAIL_JOINER — the real constant)
 * because importing the compose barrel would drag the whole composition-root graph into a hand-run probe.
 */
function buildShaped(canon: readonly WireRow[], tailQuestion: string, injection: ChatInjection | null): BuiltTurn {
  const withTail: WireRow[] = [...canon, { role: "user", content: tailQuestion }];
  const shaped = squashSameRole(spliceInChatInjections(withTail, injection === null ? undefined : [injection]));
  let lastAssistant = -1;
  for (let i = shaped.length - 1; i >= 0; i--) {
    if (shaped[i]?.role === "assistant") {
      lastAssistant = i;
      break;
    }
  }
  const tail = shaped.slice(lastAssistant + 1);
  if (tail.length === 0) {
    throw new Error("probe canon must end with a user tail (assistant-final shape is continue-mode)");
  }
  const prompt = tail.map((r) => r.content).join(AGENT_PROMPT_TAIL_JOINER);
  // This probe never injects system-role rows; drop any (capability-kept splice output is typed wider).
  const seed = shaped.slice(0, lastAssistant + 1).flatMap((r): SeedTurn[] => (r.role === "system" ? [] : [{ role: r.role, content: r.content }]));
  return { seed, prompt };
}

// ── The turn runner (a real spawn through the real firewall env, with a per-turn watchdog + abort) ────────
interface TurnSpec {
  readonly prompt: string;
  readonly store: SessionStore;
  readonly resume?: string;
  /** The dynamicContextOptions hook body (spot A). Undefined ⇒ no hook (spots B/C carry content in the seed). */
  readonly hookText?: string;
}
interface TurnResult {
  readonly result: ChatResult;
  readonly sessionId: string;
  readonly elapsedMs: number;
}

/** Race a turn against the watchdog so a wedged spawn/stream can't hang the probe; the watchdog aborts the
 *  WHOLE query (via the AbortController) before it rejects, so a stuck worker can't keep grinding quota. */
function withWatchdog<T>(promise: Promise<T>, label: string, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`${label} exceeded ${TURN_TIMEOUT_MS}ms watchdog`));
    }, TURN_TIMEOUT_MS);
  });
  return Promise.race([promise, guard]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

async function runTurn(spec: TurnSpec, label: string): Promise<TurnResult> {
  let sessionId = "";
  const startedAt = Date.now();
  const abortController = new AbortController();
  const hookOpts = spec.hookText === undefined ? {} : dynamicContextOptions(spec.hookText);
  const stream = query({
    prompt: spec.prompt,
    options: {
      // The locked firewall base (mirrors disciplineOptions without needing a branded credential).
      disallowedTools: ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"],
      tools: [],
      mcpServers: {},
      strictMcpConfig: true,
      settingSources: [],
      env: probeEnv({ maxOutputTokens: OUTPUT_CAP_TOKENS }),
      model: MODEL,
      maxTurns: 1,
      sessionStore: spec.store,
      systemPrompt: STATIC_SYSTEM,
      title: "orbweaver-dynamic-content-probe",
      abortController,
      ...(spec.resume !== undefined ? { resume: spec.resume } : {}),
      ...hookOpts,
    },
  });
  try {
    const result = await withWatchdog(
      consumeTurnStream(stream as AsyncIterable<SDKMessage>, {
        model: MODEL,
        resumed: spec.resume !== undefined,
        now: () => Date.now(),
        onSessionId: (id) => {
          sessionId = id;
        },
      }),
      label,
      () => abortController.abort(),
    );
    return { result, sessionId, elapsedMs: Date.now() - startedAt };
  } finally {
    // Belt-and-suspenders: interrupt + close the held-open worker so a wedged/aborted turn frees the spawn.
    try {
      await stream.interrupt();
    } catch {
      // interrupt on an already-finished/aborted stream is a no-op; ignore.
    }
    stream.close();
  }
}

// ── The behavioral reads (off the REPLY TEXT — never the cache tokens) ────────────────────────────────────
function containsAny(haystack: string, markers: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return markers.some((m) => lower.includes(m));
}
/** Which colour (if any) the reply names. Case-insensitive whole-word-ish contains. */
function saidColour(reply: string): "RED" | "BLUE" | "neither" | "both" {
  const lower = reply.toLowerCase();
  const red = lower.includes("red");
  const blue = lower.includes("blue");
  if (red && blue) {
    return "both";
  }
  if (red) {
    return "RED";
  }
  if (blue) {
    return "BLUE";
  }
  return "neither";
}

// ── The spots ────────────────────────────────────────────────────────────────────────────────────────────
type SpotId = "A" | "B" | "C";
interface Spot {
  readonly id: SpotId;
  readonly label: string;
  /** How this spot delivers its content for a turn: A via the hook; B/C via an in_chat injection at a depth. */
  readonly channel: "hook" | { injectDepth: number };
}
const SPOTS: readonly Spot[] = [
  {
    id: "A",
    label: "UserPromptSubmit HOOK (dynamicContextOptions additionalContext)",
    channel: "hook",
  },
  {
    id: "B",
    label: `DEPTH in_chat injection (depth ${DEPTH_B}, user role — mid-seed history)`,
    channel: { injectDepth: DEPTH_B },
  },
  {
    id: "C",
    label: "TOP-ANCHOR in_chat injection (over-deep clamp to position 0)",
    channel: { injectDepth: TOP_ANCHOR_DEPTH },
  },
];

/** Build the (seed, prompt, hookText) for one spot's turn. For the hook spot the content rides the hook and
 *  the seed is the plain canon; for B/C the content is spliced into the history as an in_chat injection. */
function shapeSpotTurn(spot: Spot, turnNo: TurnNo): { built: BuiltTurn; hookText?: string } {
  const content = spotContent(turnNo);
  if (spot.channel === "hook") {
    return { built: buildShaped(CANON, BALLOON_QUESTION, null), hookText: content };
  }
  const injection: ChatInjection = {
    position: "in_chat",
    depth: spot.channel.injectDepth,
    role: "user",
    content,
  };
  return { built: buildShaped(CANON, BALLOON_QUESTION, injection) };
}

// ── Recording ────────────────────────────────────────────────────────────────────────────────────────────
interface UsageRow {
  readonly spot: string;
  readonly turn: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly costUsd: number;
  readonly ms: number;
}
const usageRows: UsageRow[] = [];
const verdicts: { spot: string; pass: boolean; detail: string }[] = [];

interface TurnRead {
  readonly turnNo: TurnNo;
  readonly reply: string;
  readonly colour: ReturnType<typeof saidColour>;
  readonly recallOk: boolean;
  /** COMMAND-framed steer (pirate on t1-2). Load-bearing for the verdict. */
  readonly steerPirate: boolean;
  /** COMMAND-framed steer flip target (butler on t3). Load-bearing for the verdict. */
  readonly steerButler: boolean;
  /** CONTEXT-framed steer (storm on t1-2, calm on t3) — a DIAGNOSTIC report, NOT gated. Isolates whether the
   *  command framing (not the channel) is what fails: a landed storm + failed pirate ⇒ framing is the culprit. */
  readonly steerStorm: boolean;
  readonly disposition: string;
}

function record(spot: string, turnNo: number, t: TurnResult, disposition: string): void {
  const r = t.result;
  usageRows.push({
    spot,
    turn: `t${turnNo}`,
    tokensIn: r.usage.tokensIn,
    tokensOut: r.usage.tokensOut,
    cacheRead: r.usage.cacheReadTokens,
    cacheWrite: r.usage.cacheWriteTokens,
    costUsd: r.usage.costUsd,
    ms: t.elapsedMs,
  });
  console.log(`  [${spot}/t${turnNo}] disp=${disposition} reply: ${r.reply.slice(0, VERBOSE ? r.reply.length : SNIPPET)}`);
}

// ── The battery driver — one spot, 3 resumed turns ───────────────────────────────────────────────────────
async function runSpot(spot: Spot): Promise<void> {
  console.log(`\n── spot ${spot.id}: ${spot.label} ──`);
  const chatId = castId<ChatId>(`probe-dyn-${spot.id}-${NONCE}`);
  const cache = new SessionCache(new InMemorySessionStore());
  const reads: TurnRead[] = [];
  for (const turnNo of TURN_SEQUENCE) {
    const { built, hookText } = shapeSpotTurn(spot, turnNo);
    // biome-ignore lint/performance/noAwaitInLoops: the 3 turns are sequential BY DESIGN — each resumes the prior lineage; serial order is the whole point of a resumed battery.
    const decision = await cache.ensureSeededSession(chatId, built.seed);
    const t = await runTurn(
      {
        prompt: built.prompt,
        store: cache.store,
        ...(decision.sessionId !== null ? { resume: decision.sessionId } : {}),
        ...(hookText !== undefined ? { hookText } : {}),
      },
      `spot ${spot.id} turn ${turnNo}`,
    );
    record(spot.id, turnNo, t, decision.disposition);
    const colour = saidColour(t.result.reply);
    const wantColour = turnNo === FRESHNESS_TURN ? COLOUR_TURN3 : COLOUR_TURN12;
    reads.push({
      turnNo,
      reply: t.result.reply,
      colour,
      recallOk: colour === wantColour,
      steerPirate: containsAny(t.result.reply, PIRATE_MARKERS),
      steerButler: containsAny(t.result.reply, BUTLER_MARKERS),
      steerStorm: containsAny(t.result.reply, STORM_MARKERS),
      disposition: decision.disposition,
    });
  }
  scoreSpot(spot, reads);
}

/** The per-turn recall/steer print line — extracted so scoreSpot stays under the complexity ceiling. */
function turnReadLine(r: TurnRead): string {
  const wantColour = r.turnNo === FRESHNESS_TURN ? COLOUR_TURN3 : COLOUR_TURN12;
  const steerLabel =
    r.turnNo === FRESHNESS_TURN
      ? `butler=${r.steerButler} pirate=${r.steerPirate}(want NOT pirate) storm=${r.steerStorm}(diag; want NOT storm)`
      : `pirate=${r.steerPirate} storm=${r.steerStorm}(diag)`;
  return `    t${r.turnNo}: recall want=${wantColour} said=${r.colour} ${r.recallOk ? "MATCH" : "MISS"} | steer ${steerLabel}`;
}

interface SpotScore {
  readonly live: boolean;
  readonly label: string;
}
/** The LIVE / STALE / DEAD classification off the reply reads — flat (no nested ternary). */
function classifySpot(reads: readonly TurnRead[]): SpotScore {
  const t1 = reads.find((r) => r.turnNo === TURN_ONE);
  const t2 = reads.find((r) => r.turnNo === TURN_TWO);
  const t3 = reads.find((r) => r.turnNo === FRESHNESS_TURN);
  // Recall + steer must LAND on turns 1-2 (the spot delivers content at all), AND the turn-3 freshness must
  // FLIP: new colour BLUE (not RED) and butler-ish / NOT piratey (the changed content reached the model).
  const recallLands = t1?.recallOk === true && t2?.recallOk === true;
  const steerLands = t1?.steerPirate === true && t2?.steerPirate === true;
  const freshnessFlips = t3?.colour === COLOUR_TURN3 && t3?.steerButler === true && t3?.steerPirate === false;
  const live = recallLands && steerLands && freshnessFlips;
  // Precise STALE tell: turn-3 still saying RED, or still piratey ⇒ the channel served stale (cached) content.
  const stale = t3?.colour === COLOUR_TURN12 || t3?.steerPirate === true;
  let label = "DEAD/UNCLEAR — content did not reliably land (recall/steer failed turns 1-2); see per-turn reads";
  if (live) {
    label = "LIVE — content lands turns 1-2 AND turn-3 freshness flips (BLUE + butler)";
  } else if (recallLands && steerLands && stale) {
    label = "STALE — content lands turns 1-2 but turn-3 served STALE content (still RED and/or still piratey)";
  }
  // DIAGNOSTIC (not gated): did the CONTEXT-framed storm fact land on t1-2 while the COMMAND-framed pirate
  // did/didn't? A landed storm + a failed pirate points at COMMAND FRAMING, not the channel, as the failure.
  const stormLands = t1?.steerStorm === true && t2?.steerStorm === true;
  const detail =
    `recall-lands(t1,t2)=${recallLands} steer-lands(t1,t2)=${steerLands} freshness-flips(t3)=${freshnessFlips} ` +
    `[t3 colour=${t3?.colour} butler=${t3?.steerButler} pirate=${t3?.steerPirate}] ` +
    `| DIAG context-steer storm-lands(t1,t2)=${stormLands} (command=pirate lands=${steerLands}: ` +
    `${stormLands && !steerLands ? "CONTEXT lands but COMMAND fails ⇒ blame the FRAMING, not the channel" : "framing not implicated"}) ` +
    `⇒ ${label}`;
  return { live, label: detail };
}

/** Per-turn behavioral prints + the LIVE / STALE-DEAD verdict, all off the reply text. */
function scoreSpot(spot: Spot, reads: readonly TurnRead[]): void {
  for (const r of reads) {
    console.log(turnReadLine(r));
  }
  const score = classifySpot(reads);
  verdicts.push({ spot: spot.id, pass: score.live, detail: `spot ${spot.id}: ${score.label}` });
  console.log(`  ${score.live ? "PASS" : "FAIL"} — ${score.label}`);
}

// ── Plan / dry-run ───────────────────────────────────────────────────────────────────────────────────────
function printPlan(spots: readonly Spot[]): void {
  const totalTurns = spots.length * TURN_SEQUENCE.length;
  console.log(
    `PLAN — ${spots.length} spot(s) × 3-turn battery = ${totalTurns} live turns ` +
      `(~${EST_TOKENS_PER_TURN} input tok touched/turn, mostly cache-read after t1; ⚠ real ${MODE === "or" ? "OR credits" : "Max-sub quota"})`,
  );
  console.log(`  nonce=${NONCE} (woven into LORE + balloon fact ⇒ this run is cache-isolated from every other run)`);
  console.log("  battery per spot (BENIGN content, read off REPLY TEXT):");
  for (const spot of spots) {
    console.log(`  spot ${spot.id}: ${spot.label}`);
    for (const turnNo of TURN_SEQUENCE) {
      const { built, hookText } = shapeSpotTurn(spot, turnNo);
      const via = hookText !== undefined ? "hook" : `seed-splice (${built.seed.length} seed turns)`;
      const want =
        turnNo === FRESHNESS_TURN
          ? "FRESHNESS: expect BLUE + butler + calm (NOT red, NOT pirate, NOT storm)"
          : `RECALL ${COLOUR_TURN12} + STEER pirate(command) + storm(context)`;
      console.log(`    t${turnNo} via ${via}: content="${spotContent(turnNo)}" → ${want}`);
    }
  }
  console.log(
    "\n  pass checks: RECALL = reply names the current colour (red on t1-2, BLUE on t3); " +
      `STEER pirate = reply contains any of [${PIRATE_MARKERS.join(", ")}]; ` +
      `t3 butler = reply contains any of [${BUTLER_MARKERS.join(", ")}] AND not piratey. ` +
      "cacheRead/cacheWrite are SECONDARY (contaminated by the global 5-min content cache; do not gate on them).",
  );
}

// ── Result rendering ─────────────────────────────────────────────────────────────────────────────────────
function printUsageTable(): void {
  if (usageRows.length === 0) {
    return;
  }
  console.log("\n=== usage table (SECONDARY — contaminated by the global 5-min content cache across runs; do NOT gate on it) ===");
  console.table(
    usageRows.map((r) => ({
      spot: `${r.spot}/${r.turn}`,
      in: r.tokensIn,
      out: r.tokensOut,
      "cacheRead*": r.cacheRead,
      "cacheWrite*": r.cacheWrite,
      cost: r.costUsd.toFixed(COST_DECIMALS),
      ms: r.ms,
    })),
  );
  console.log("  * secondary diagnostic only — the pass/fail is 100% the reply text above.");
}

// ── Main ─────────────────────────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`sdk-dynamic-content-probe — model=${MODEL} (${MODE === "or" ? "mode-2 OR skin" : "mode-1 Max sub"}; spends real quota/credits)\n`);
  const spots = SPOTS.filter((s) => ONLY.size === 0 || ONLY.has(s.id));
  if (spots.length === 0) {
    throw new Error(`--spot matched nothing; known spots: ${SPOTS.map((s) => s.id).join(",")}`);
  }
  printPlan(spots);
  if (DRY_RUN) {
    console.log("\n--dry-run: no turns spawned.");
    return;
  }
  for (const spot of spots) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: spots run sequentially — quota-metered live batteries; serial order keeps cache-metric attribution clean.
      await runSpot(spot);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      verdicts.push({ spot: spot.id, pass: false, detail: `spot ${spot.id} threw: ${msg}` });
      console.log(`  FAIL — spot ${spot.id} threw: ${msg}`);
    }
  }
  printUsageTable();
  console.log("\n=== per-spot verdicts ===");
  for (const v of verdicts) {
    console.log(`  ${v.pass ? "LIVE " : "STALE/DEAD"} — ${v.detail}`);
  }
  const failed = verdicts.filter((v) => !v.pass);
  console.log(`\n${verdicts.length - failed.length}/${verdicts.length} spots LIVE`);
  process.exitCode = failed.length > 0 ? 1 : 0;
}

await main();
