// OR-12 — the history cache read with Memory, Databank and a guided steer active. Constant: one nonce'd chat run
// through the real turn pipeline and backend per wire. Mover: the arm (sections off, below Chat History as shipped,
// or above it). OR12_WIRES / OR12_ARMS / OR12_TURNS narrow a run; OR12_CAP_USD stops it at an estimated spend.

import { randomUUID } from "node:crypto";
import type { AssembleContext, ChatInjection, ChatReasoningPart, MessageView } from "@orb/contracts/chat";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, PRESET_FORMAT_SLOT_IDS } from "@orb/contracts/preset";
import { legacyProseOverrides, resolveProseText } from "@orb/contracts/prose";
import type { WireCaptureSink } from "@orb/inference";
import type { AssetId, ChatId, MessageId, ModelId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { createAnthropicBackend } from "../../../packages/inference/src/backends/anthropic-messages/index.ts";
import { createOpenAiCompatBackend } from "../../../packages/inference/src/backends/openai-compat/index.ts";
import { detectModelFamily } from "../../../packages/inference/src/capability/families.ts";
import { applyEndpointPosture } from "../../../packages/inference/src/capability/floor.ts";
import { curatedRows } from "../../../packages/inference/src/capability/sources/curated/loader.ts";
import { measuredRows } from "../../../packages/inference/src/capability/sources/measured/loader.ts";
import { synthesizeCapability } from "../../../packages/inference/src/capability/synthesize.ts";
import { createProviderExecutor } from "../../../packages/inference/src/roles/executor.ts";
import { BEFORE_HISTORY_DEPTH } from "../../../packages/server/src/domain/chat/assembly/injections.ts";
import { resolveGuidedActionText } from "../../../packages/server/src/domain/chat/assembly/macros.ts";
import { runTurnPipeline } from "../../../packages/server/src/domain/chat/engine/pipeline.ts";
import { buildCommittedMessageView } from "../../../packages/server/src/domain/chat/persistence/canon-write.ts";
import { createRunChatTurnBridge } from "../../../packages/server/src/entry/compose/chat.ts";
import { makeApiKeySecret, makeResolved } from "../../../tests/support/factories/resolved-connection.ts";
import { filler, jsonl, printTable, readEnvKey } from "./_kit.ts";

export const id = "or12";
export const title = "history cache read with Memory, Databank and a guided steer, by section placement";

const PER_MILLION = 1_000_000;
const DEFAULT_TURNS = 5;
const DEFAULT_CAP_USD = 2.5;
const TOOL_RECURSE_LIMIT = 5;
// 32 prior rows of 6 filler lines put 9k to 12k tokens of history above the first turn: over every wire's cache
// minimum, and small next to a long chat, so the arms differ by placement and not by scale.
const PRIOR_ROWS = 32;
const LINES_PER_ROW = 6;
const RATIO_DIGITS = 3;
const USD_DIGITS = 4;

/** List prices in USD per million tokens (OpenRouter `/api/v1/models`, which matches each vendor's list). Anthropic
 *  writes at the 1h rate because the shipped prompt-cache TTL is 1h; OpenAI charges no write premium. */
interface Prices {
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly output: number;
}

interface WireSpec {
  readonly providerId: string;
  readonly model: string;
  readonly keyEnv: string;
  readonly requestIdHeader: string;
  readonly prices: Prices;
  /** The context window a user declares on the connection, or null where the resolver already knows it. */
  readonly declaredWindow: number | null;
}

// OpenAI direct is the automatic-prefix wire: one vendor cache behind one endpoint. OpenRouter to a non-Anthropic
// model can route consecutive calls to different upstreams, each with its own cache, so a miss there could be a
// routing hop rather than a placement. gpt-4.1-mini takes no reasoning, so every output token is reply text.
const WIRES = {
  anthropic: {
    providerId: "anthropic",
    model: "claude-sonnet-5",
    keyEnv: "ANTHROPIC_PROBE_KEY",
    requestIdHeader: "request-id",
    prices: { input: 2, cacheRead: 0.2, cacheWrite: 4, output: 10 },
    declaredWindow: null,
  },
  openai: {
    providerId: "openai",
    model: "gpt-4.1-mini",
    keyEnv: "OPENAI_PROBE_KEY",
    requestIdHeader: "x-request-id",
    prices: { input: 0.4, cacheRead: 0.1, cacheWrite: 0.4, output: 1.6 },
    // OpenAI's model list carries no context length, so without a declaration the window is the estimated 8192
    // floor and the history fit trims this chat's head every turn, which would miss the cache for another reason.
    declaredWindow: 1_047_576,
  },
} as const satisfies Record<string, WireSpec>;
type WireName = keyof typeof WIRES;
const WIRE_NAMES = Object.keys(WIRES) as WireName[];

// `off`: no per-turn sections. `below`: the shipped default preset. `above`: the same preset with Chat History moved
// below the three sections, the order an owned preset can still hold (D251 keeps every section where it is placed).
const ARMS = ["off", "below", "above"] as const;
type Arm = (typeof ARMS)[number];

const isMarker = (section: PromptSection, marker: string): boolean => section.type === "marker" && section.marker === marker;

function sectionIndex(config: PromptConfig, marker: string): number {
  const at = config.sections.findIndex((section) => isMarker(section, marker));
  if (at === -1) {
    throw new Error(`the default preset has no ${marker} section`);
  }
  return at;
}

function chatHistoryAfterGuided(config: PromptConfig): PromptConfig {
  const pivot = config.sections[sectionIndex(config, "chat_history")];
  const rest = config.sections.filter((section) => section !== pivot);
  const guided = rest.findIndex((section) => isMarker(section, "guided_instruction"));
  if (pivot === undefined || guided === -1) {
    throw new Error("the default preset has no chat_history or guided_instruction section");
  }
  return { ...config, sections: [...rest.slice(0, guided + 1), pivot, ...rest.slice(guided + 1)] };
}

const CONFIG_BY_ARM: Readonly<Record<Arm, PromptConfig>> = {
  off: DEFAULT_PROMPT_CONFIG,
  below: DEFAULT_PROMPT_CONFIG,
  above: chatHistoryAfterGuided(DEFAULT_PROMPT_CONFIG),
};

const CHARACTER = {
  name: "Mara",
  description:
    "Mara keeps the lighthouse on a cold northern coast. She is forty, practical, dry-humoured and slow to trust. " +
    "She logs every ship, every storm and every lamp trim in a leather ledger, and she reads the weather from the gulls.",
  personality: "Terse, observant, loyal once earned.",
  scenario: "A traveller has come to stay the winter at the lighthouse and helps Mara with the ledger.",
};
const PERSONA = { name: "Alex", description: "A traveller wintering at the lighthouse." };

const MEMORY_POOL = [
  "Alex promised to fix the east shutter before the next gale.",
  "Mara's brother drowned off the salt weirs eleven years ago.",
  "The ferry pilot Wren owes Mara three barrels of lamp oil.",
  "Alex is afraid of heights but climbs the lamp stair anyway.",
  "Mara hides the good whisky behind the tide tables.",
  "A ship called the Grey Heron went missing in the thaw month.",
  "Alex once worked as a clerk in the harbour office.",
  "Mara distrusts the new harbour master and his brass telescope.",
  "The gulls went quiet the night before the last great storm.",
  "Alex found a sealed letter under the ledger's back board.",
];
const DATABANK_POOL = [
  "Lighthouse manual, section 4: trim the wick every four hours; a smoking lamp means the chimney glass needs cleaning.",
  "Tide tables, frost month: high water at the weirs falls roughly fifty minutes later each day.",
  "Harbour bylaws: every vessel entering after dark must show two lamps and answer the keeper's signal.",
  "Keeper's log excerpt: the lens was reground in the ember month after the crack from the hail storm.",
  "Coastal chart note: the salt weirs are passable on foot only at the lowest spring tides.",
  "Supply ledger: lamp oil is delivered by the ferry on the first day of each month, weather permitting.",
];
const STEERS = [
  "Have Mara mention the sealed letter.",
  "Make Mara impatient with the weather.",
  "Let Mara share one memory of her brother.",
  "Have Mara ask Alex about the harbour office.",
  "Keep the reply quiet and cold.",
  "Have Mara check the lamp before answering.",
];
const QUESTIONS = [
  "Any ships tonight?",
  "Should I trim the wick now?",
  "What was in that sealed letter, do you think?",
  "Is the ferry late again?",
  "Do you ever sleep?",
  "Tell me about the Grey Heron.",
];
const MEMORY_PICK = 5;
const DATABANK_PICK = 3;

function rotating(pool: readonly string[], turn: number, count: number): string {
  return Array.from({ length: count }, (_, i) => pool[(turn + i) % pool.length]).join("\n");
}

const pick = (pool: readonly string[], turn: number): string => pool[turn % pool.length] ?? "";

interface TurnSections {
  readonly memory: string;
  readonly databank: string;
  readonly steer: string;
}

/** What recall, retrieval and the composer produce on one turn: each changes turn to turn, as the live gathers do. */
function sectionsFor(turn: number): TurnSections {
  return { memory: rotating(MEMORY_POOL, turn, MEMORY_PICK), databank: rotating(DATABANK_POOL, turn, DATABANK_PICK), steer: pick(STEERS, turn) };
}

const OWNER = castId<UserId>("user_or12probe");

function row(chatId: ChatId, seq: number, role: MessageRole, content: string): MessageView {
  return buildCommittedMessageView({
    messageId: mintTypeId(ID_PREFIX.message),
    variantId: mintTypeId(ID_PREFIX.messageVariant),
    chatId,
    seq,
    role,
    authorUserId: role === "user" ? OWNER : null,
    now: 0,
    variant: { content },
  });
}

/** The prior history: alternating character and user rows of nonce'd filler, starting with the character. */
function priorCanon(chatId: ChatId, nonce: string): MessageView[] {
  return Array.from({ length: PRIOR_ROWS }, (_, i) => {
    const role: MessageRole = i % 2 === 0 ? "assistant" : "user";
    return row(chatId, i + 1, role, filler(`${nonce}-${i}`, LINES_PER_ROW));
  });
}

interface Capture {
  body: Record<string, unknown> | null;
  headers: Readonly<Record<string, string>>;
}

/** One call's evidence: the usage the pipeline reduced, the ids, and where the per-turn text sat on the wire. */
interface CallRecord {
  readonly requestId: string | null;
  readonly generationId: string | null;
  readonly promptTokens: number | null;
  readonly readTokens: number | null;
  readonly writeTokens: number | null;
  readonly outputTokens: number | null;
  /** Estimated at list prices ({@link Prices}); the backends report no cost on these wires. */
  readonly costUsd: number;
  readonly breakpointFromEnd: number | null;
  readonly memoryAt: string;
  readonly markers: readonly string[];
  readonly reply: string;
}

/** Where `needle` sits in the captured body: the top-level system, or a message index and role. */
function locate(body: Record<string, unknown> | null, needle: string): string {
  if (body === null) {
    return "no-capture";
  }
  if (JSON.stringify(body["system"] ?? null).includes(needle)) {
    return "system";
  }
  const messages = Array.isArray(body["messages"]) ? (body["messages"] as readonly Record<string, unknown>[]) : [];
  const at = messages.findIndex((m) => JSON.stringify(m).includes(needle));
  if (at === -1) {
    return "absent";
  }
  return `messages[${at}]:${String(messages[at]?.["role"])}${at === messages.length - 1 ? " (last)" : ""}`;
}

/** The Anthropic `cache_control` markers in a captured body, as `system[i]` / `messages[i]` paths. */
function cacheMarkers(body: Record<string, unknown> | null): string[] {
  if (body === null) {
    return [];
  }
  const marked = (value: unknown): boolean => JSON.stringify(value).includes('"cache_control"');
  const blocks = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
  const system = blocks(body["system"]).flatMap((block, i) => (marked(block) ? [`system[${i}]`] : []));
  const messages = blocks(body["messages"]).flatMap((message, i) => (marked(message) ? [`messages[${i}]`] : []));
  return [...system, ...messages];
}

function estimateUsd(prices: Prices, call: Pick<CallRecord, "promptTokens" | "readTokens" | "writeTokens" | "outputTokens">): number {
  const read = call.readTokens ?? 0;
  const write = call.writeTokens ?? 0;
  const uncached = Math.max(0, (call.promptTokens ?? 0) - read - write);
  return (uncached * prices.input + read * prices.cacheRead + write * prices.cacheWrite + (call.outputTokens ?? 0) * prices.output) / PER_MILLION;
}

const silentLog = { debug: (): void => undefined, info: (): void => undefined, warn: (): void => undefined, error: (): void => undefined };

function capabilityFor(spec: WireSpec, provider: ReturnType<typeof makeResolved>["provider"]) {
  const query = { model: spec.model, providerId: provider.id, wire: provider.wire, api: provider.apis[0] ?? null };
  const declared = spec.declaredWindow === null ? undefined : { generation: { context: { window: spec.declaredWindow } } };
  const synthesized = synthesizeCapability("generation", detectModelFamily(spec.model), { declared, measured: measuredRows(query), curated: curatedRows(query) });
  return applyEndpointPosture(provider, synthesized.capability, false);
}

/** The wire's real backend behind the real executor and the compose-tier turn bridge, capturing each request. */
function wireFor(spec: WireSpec, key: string, capture: Capture) {
  const sink: WireCaptureSink = (entry) => {
    capture.body = entry.body;
    capture.headers = entry.responseHeaders ?? {};
  };
  const shared = { now: Date.now, log: silentLog, fetch: globalThis.fetch, captureWire: sink };
  const registry = new Map([
    ["anthropic-messages" as const, createAnthropicBackend(shared)],
    ["openai-compat" as const, createOpenAiCompatBackend({ ...shared, app: { name: "orbweaver-or12-probe", url: "http://127.0.0.1" }, embedSpaceDims: 0 }).backend],
  ]);
  const executor = createProviderExecutor({ registry, span: (_name, fn) => Promise.resolve(fn()) });
  const base = makeResolved({ providerId: spec.providerId });
  const connection = makeResolved({
    providerId: spec.providerId,
    model: castId<ModelId>(spec.model),
    factsModel: castId<ModelId>(spec.model),
    capability: capabilityFor(spec, base.provider),
    credential: makeApiKeySecret(key),
  });
  return { connection, runChatTurn: createRunChatTurnBridge({ runChatTurn: executor.runChatTurn }) };
}

async function runOne(args: {
  readonly wire: ReturnType<typeof wireFor>;
  readonly spec: WireSpec;
  readonly capture: Capture;
  readonly chatId: ChatId;
  readonly config: PromptConfig;
  readonly canon: readonly MessageView[];
  readonly sections: TurnSections | null;
}): Promise<CallRecord> {
  const { wire, spec, capture, chatId, config, canon, sections } = args;
  const marker: ChatInjection = {
    position: "in_chat",
    depth: BEFORE_HISTORY_DEPTH,
    role: "user",
    content: resolveProseText(
      PRESET_FORMAT_SLOT_IDS.newChatMarker,
      legacyProseOverrides(PRESET_FORMAT_SLOT_IDS.newChatMarker, config.formatStrings?.newChatMarker),
    ).trim(),
    origin: "new-chat-marker",
  };
  const base: AssembleContext = {
    character: CHARACTER,
    promptConfig: config,
    activePersona: PERSONA,
    activePersonaUserId: OWNER,
    recentMessages: [],
    chatInjections: [marker],
  };
  const assembleContext: AssembleContext =
    sections === null
      ? base
      : {
          ...base,
          memory: sections.memory,
          databank: sections.databank,
          guidedInstruction: resolveGuidedActionText(base, { action: "response", input: sections.steer, model: spec.model, chatId }),
        };
  capture.body = null;
  capture.headers = {};
  const result = await runTurnPipeline({
    now: Date.now,
    applyRegexReplace: (text, regex, replacer) => text.replace(regex, replacer),
    loadInlineReplyAssetIds: () => Promise.resolve(new Map<MessageId, ReadonlySet<AssetId>>()),
    loadReasoningParts: () => Promise.resolve(new Map<MessageId, readonly ChatReasoningPart[]>()),
    runChatTurn: wire.runChatTurn,
    resolveImageUrl: () => Promise.resolve(null),
    assembleContext,
    canon,
    connection: wire.connection,
    // No knobs: the shipped defaults apply, so a thinking model is not cut to an empty reply by a probe-sized cap.
    intent: {},
    kind: "send",
    chatId,
    onDelta: () => undefined,
    tools: null,
    attachedToolNames: [],
    toolRecurseLimit: TOOL_RECURSE_LIMIT,
    toolExecFrame: { runAsUserId: OWNER, triggeredBy: OWNER, chatId, membership: null, turnId: mintTypeId(ID_PREFIX.chatTurn) },
  });
  const economics = result.economics;
  const usage = {
    promptTokens: economics?.tokensIn ?? null,
    readTokens: economics?.cacheReadTokens ?? null,
    writeTokens: economics?.cacheWriteTokens ?? null,
    outputTokens: economics?.tokensOut ?? null,
  };
  const memoryNeedle = sections === null ? null : (sections.memory.split("\n")[0] ?? null);
  return {
    requestId: capture.headers[spec.requestIdHeader] ?? null,
    generationId: economics?.generationId ?? null,
    ...usage,
    costUsd: estimateUsd(spec.prices, usage),
    breakpointFromEnd: result.cacheBreakpointFromEnd,
    memoryAt: memoryNeedle === null ? "n/a" : locate(capture.body, memoryNeedle),
    markers: cacheMarkers(capture.body),
    reply: result.content,
  };
}

function envList<T extends string>(name: string, all: readonly T[]): readonly T[] {
  const raw = (process.env[name] ?? "").trim();
  return raw.length === 0 ? all : all.filter((value) => raw.split(",").includes(value));
}

export async function run(): Promise<object> {
  const out = jsonl(id);
  const wires = envList("OR12_WIRES", WIRE_NAMES);
  const arms = envList("OR12_ARMS", ARMS);
  const turns = Number(process.env["OR12_TURNS"] ?? DEFAULT_TURNS);
  const cap = Number(process.env["OR12_CAP_USD"] ?? DEFAULT_CAP_USD);
  const runId = randomUUID().slice(0, 8);
  // The premise this probe measures: the shipped default preset lists the three sections below Chat History.
  const pivot = sectionIndex(DEFAULT_PROMPT_CONFIG, "chat_history");
  const shippedBelow = ["memory", "databank", "guided_instruction"].every((m) => sectionIndex(DEFAULT_PROMPT_CONFIG, m) > pivot);
  console.log(`or12 run ${runId}: default preset has memory/databank/guided below Chat History: ${shippedBelow}`);

  let spend = 0;
  let stopped = false;
  const summary: Record<string, unknown>[] = [];
  for (const wireName of wires) {
    const spec = WIRES[wireName];
    const key = readEnvKey(spec.keyEnv);
    if (key.length === 0) {
      console.log(`${wireName}: ${spec.keyEnv} not found; skipped`);
      continue;
    }
    const capture: Capture = { body: null, headers: {} };
    const wire = wireFor(spec, key, capture);
    for (const arm of arms) {
      const chatId = castId<ChatId>(`chat_or12${runId}${wireName}${arm}`);
      const nonce = `${runId}-${wireName}-${arm}`;
      const canon = priorCanon(chatId, nonce);
      const calls: CallRecord[] = [];
      const pairRatios: (number | null)[] = [];
      let sent: readonly MessageView[] = [];
      // Turns 1..N send a new user row each and commit the reply; the last step resends turn N's canon and sections
      // byte for byte, the control that tells a placement miss from a cold or evicted cache.
      for (let step = 1; step <= turns + 1; step += 1) {
        if (spend >= cap) {
          stopped = true;
          break;
        }
        const replay = step > turns;
        const turn = replay ? turns : step;
        if (!replay) {
          canon.push(row(chatId, canon.length + 1, "user", pick(QUESTIONS, turn)));
          sent = [...canon];
        }
        const call = await runOne({ wire, spec, capture, chatId, config: CONFIG_BY_ARM[arm], canon: sent, sections: arm === "off" ? null : sectionsFor(turn) });
        spend += call.costUsd;
        const prev = calls.at(-1);
        const pairRatio = prev?.promptTokens != null && call.readTokens !== null ? call.readTokens / prev.promptTokens : null;
        calls.push(call);
        pairRatios.push(pairRatio);
        out.append({ kind: "arm", probe: id, runId, wire: wireName, model: spec.model, arm, step, turn, replay, ...call, pairRatio, spendSoFar: spend });
        console.log(
          `${wireName} ${arm} step ${step}${replay ? " (replay)" : ""}: prompt=${call.promptTokens} read=${call.readTokens} write=${call.writeTokens} ` +
            `ratio=${pairRatio?.toFixed(RATIO_DIGITS) ?? "-"} memory@${call.memoryAt} markers=[${call.markers.join(",")}] id=${call.requestId ?? call.generationId} ` +
            `est=$${call.costUsd.toFixed(USD_DIGITS)} spend=$${spend.toFixed(USD_DIGITS)}`,
        );
        if (!replay) {
          canon.push(row(chatId, canon.length + 1, "assistant", call.reply));
        }
      }
      // Turn 1 is the cold write in every arm; the steady state is turns 2..N against the turn before.
      const steady = calls.slice(1, turns);
      const ratios = pairRatios.slice(1, turns).filter((ratio): ratio is number => ratio !== null);
      const mean = (values: readonly number[]): number | null => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);
      const replayCall = calls.length > turns ? calls[turns] : undefined;
      summary.push({
        wire: wireName,
        arm,
        turns: steady.length,
        meanReadRatio: mean(ratios),
        minReadRatio: ratios.length === 0 ? null : Math.min(...ratios),
        meanUsdPerTurn: mean(steady.map((call) => call.costUsd)),
        replayReadRatio: replayCall?.readTokens != null && replayCall.promptTokens != null ? replayCall.readTokens / replayCall.promptTokens : null,
      });
      if (stopped) {
        break;
      }
    }
    if (stopped) {
      break;
    }
  }
  const verdict = { kind: "verdict", probe: id, runId, at: new Date().toISOString(), shippedBelow, stoppedAtCap: stopped, estimatedSpend: spend, summary };
  out.append(verdict);
  printTable(summary);
  console.log(`or12 estimated spend: $${spend.toFixed(USD_DIGITS)}${stopped ? ` (stopped at the $${cap} cap)` : ""}`);
  return verdict;
}
