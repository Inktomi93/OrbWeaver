// The Ollama window through the app's own path: the connection's capability as the editor reads it, then a chat
// turn through the real turn pipeline (assembly, the history fit against that window, the openai-compat backend).
// Ollama keeps the system prompt and drops the oldest messages that do not fit its `num_ctx`, so the fact rides
// the OLDEST history message the fit keeps: a first pass finds it in the captured wire body, a second plants the
// fact there at the same length (the fit's estimate is unchanged) and asks for it.
//
//   node scripts/probes/local-servers/ollama-window.ts [--server-ctx=<n>]     against the `ollama` arm of rig.sh
//
// Arms: `stated` (no declaration: the window the editor shows), `declared` (8192 declared on the native route,
// which sends it as `num_ctx`), `v1-control` (the same declaration with the native route turned off: `/v1` runs
// the server default and must lose the fact), `pinned` (a copy made on the rig with `num_ctx` set, which the
// reader states). `--server-ctx=<n>` (the arm started with `LOCAL_RIG_OLLAMA_CTX=<n>`) adds `server`: the window
// declared at the server's `OLLAMA_CONTEXT_LENGTH` over `/v1`. Evidence: `results/ollama-window.jsonl`.

import process from "node:process";
import type { AssembleContext, ChatReasoningPart, MessageView } from "@orb/contracts/chat";
import type { Capability, DeclaredCapability } from "@orb/contracts/inference";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { createInferenceRuntime } from "@orb/inference";
import type { AssetId, ChatId, MessageId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { DeliveredCue } from "../../../packages/server/src/domain/chat/contract/results.ts";
import { runTurnPipeline } from "../../../packages/server/src/domain/chat/engine/pipeline.ts";
import { buildCommittedMessageView } from "../../../packages/server/src/domain/chat/persistence/canon-write.ts";
import { createRunChatTurnBridge } from "../../../packages/server/src/entry/compose/chat.ts";
import { fakeConnection, fakeDeps } from "../../../tests/inference/_support.ts";
import { principal } from "../../../tests/support/factories/principal.ts";
import { http, jsonl, waitFor } from "./_kit.ts";

const BASE_URL = "http://127.0.0.1:28111/v1";
const ROOT = "http://127.0.0.1:28111";
const MODEL = "qwen2.5:0.5b";
const PINNED_MODEL = "qwen2.5-orb-window-probe-8k:latest";
const PINNED_NUM_CTX = 8192;
const DECLARED_WINDOW = 8192;
const SECRET = "PINEAPPLE";
const FACT = `Mara's secret word is ${SECRET}. `;
/** Longer than any arm's window, and below 13 × 17 so every message's line pair is unique. */
const HISTORY_MESSAGES = 220;
/** A short reply, so the fit packs the history right up to the stated window. */
const MAX_OUTPUT_TOKENS = 16;
const TOOL_RECURSE_LIMIT = 0;
const HEALTH_TRIES = 60;
const HTTP_OK = 200;
/** Far above any arm's window, so the count sees the whole request. */
const COUNT_NUM_CTX = 32_768;
const ANSWER_SNIPPET = 80;
const SERVER_CTX_FLAG = "--server-ctx=";

const OWNER = castId<UserId>("user_ollamawindow");
const chatId = castId<ChatId>("chat_ollamawindow");
const log = jsonl("ollama-window");

function view(seq: number, content: string): MessageView {
  const fromUser = seq % 2 === 1;
  return buildCommittedMessageView({
    messageId: mintTypeId(ID_PREFIX.message),
    variantId: mintTypeId(ID_PREFIX.messageVariant),
    chatId,
    seq,
    role: fromUser ? "user" : "assistant",
    authorUserId: fromUser ? OWNER : null,
    characterId: null,
    now: 0,
    variant: { content },
  });
}

// Plain roleplay prose. Each message pairs a line from the first FIRST_LINES with one from the whole pool, so
// the pair is unique per message (13 and 17 are coprime) and the captured body names the oldest message sent.
const PROSE = [
  "The lamp gutters as the wind finds the gap under the door, and Mara pulls her shawl tighter.",
  "Rain drums on the slate roof while the kettle begins its thin, rising whistle.",
  "Outside, the weir gates groan against the tide and the gulls argue over the nets.",
  "She turns the ledger page slowly, tracing each name with a fingertip stained with ink.",
  "A cart rattles past on the causeway, its driver singing something tuneless and cheerful.",
  "The fire settles with a soft crack, and a scatter of sparks climbs the chimney.",
  "Somewhere below, a dog barks twice at nothing and then goes quiet again.",
  "Mara glances at the window, where the evening has turned the marsh the colour of pewter.",
  "The smell of salt and peat smoke hangs in the room like an old, familiar coat.",
  "A traveller's boots have left a trail of drying mud from the door to the hearth.",
  "She sets two chipped cups on the table and pours without asking who wants tea.",
  "The clock on the mantel ticks loudly, as if it is trying to hurry the conversation along.",
  "Far off, the bell on the channel buoy rings whenever a swell lifts it.",
  "The candle stub on the sill has burned down into a small, crooked pool of wax.",
  "Wind presses at the shutters and the whole cottage creaks like a ship at anchor.",
  "A moth circles the lamp, patient and doomed, while the talk drifts on.",
  "Mara laughs quietly at something only she seems to find funny, then shakes her head.",
] as const;
const FIRST_LINES = 13;

function proseFor(seq: number): readonly [string, string] {
  return [PROSE[seq % FIRST_LINES] as string, PROSE[seq % PROSE.length] as string];
}

/** The fact in place of a line, padded to the same length so the fit costs the message the same. */
function factLine(original: string): string {
  return FACT.repeat(Math.ceil(original.length / FACT.length)).slice(0, original.length);
}

/** The history, the fact planted in message `factSeq` (none when null), and a closing question. */
function canonWith(factSeq: number | null): MessageView[] {
  const canon: MessageView[] = [];
  for (let seq = 1; seq <= HISTORY_MESSAGES; seq += 1) {
    const [first, second] = proseFor(seq);
    canon.push(view(seq, `${seq === factSeq ? factLine(first) : first} ${second}`));
  }
  canon.push(view(HISTORY_MESSAGES + 1, "Out of character: what is Mara's secret word? Reply with the word only."));
  return canon;
}

const assembleContext: AssembleContext = {
  timezone: UTC_TIME_ZONE,
  character: { name: "Mara", description: "Mara is a ledger keeper at the salt weirs." },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Alex", description: "A traveller." },
  activePersonaUserId: OWNER,
  recentMessages: [],
  chatInjections: [],
};

let captured: Record<string, unknown> | null = null;
const deps = fakeDeps({
  fetch: globalThis.fetch,
  captureWire: (entry): void => {
    captured = entry.body;
  },
});
const runtime = await createInferenceRuntime(deps);
const runChatTurn = createRunChatTurnBridge({ runChatTurn: runtime.executor.runChatTurn });
const owner = principal(OWNER);

function windowOf(capability: Capability): { readonly window: number; readonly assumed: boolean } {
  if (capability.kind !== "generation") {
    throw new Error(`expected a generation model, got ${capability.kind}`);
  }
  return { window: capability.generation.context.window, assumed: capability.generation.context.windowEstimated === true };
}

/** The seq of the oldest history message the captured request carried, matched by its unique line pair; the
 *  planted message by its fact line (two lines of one length pad to the same fact line, so only `factSeq` may). */
function oldestSentSeq(body: Record<string, unknown> | null, factSeq: number | null): number | null {
  const messages = Array.isArray(body?.["messages"]) ? (body["messages"] as readonly { readonly content?: unknown }[]) : [];
  for (const message of messages) {
    const text = typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "");
    for (let seq = 1; seq <= HISTORY_MESSAGES; seq += 1) {
      const [first, second] = proseFor(seq);
      if (text.includes(`${seq === factSeq ? factLine(first) : first} ${second}`)) {
        return seq;
      }
    }
  }
  return null;
}

/** How many tokens the captured request holds in full: the same messages through `/api/chat` with a window far
 *  above it. A `/v1` count below this is content the server dropped. */
async function sentTokens(body: Record<string, unknown> | null, model: string): Promise<number | null> {
  const messages = Array.isArray(body?.["messages"]) ? (body["messages"] as readonly { readonly role: string; readonly content?: unknown }[]) : [];
  const flat = messages.map((message) => ({
    role: message.role,
    content: Array.isArray(message.content)
      ? (message.content as readonly { readonly text?: string }[]).map((part) => part.text ?? "").join("")
      : String(message.content ?? ""),
  }));
  const res = await http(`${ROOT}/api/chat`, { body: { model, messages: flat, stream: false, options: { ["num_ctx"]: COUNT_NUM_CTX, ["num_predict"]: 1 } } });
  return (res.json as { prompt_eval_count?: number } | null)?.prompt_eval_count ?? null;
}

async function turn(
  resolved: Awaited<ReturnType<typeof runtime.resolve>>["resolved"],
  canon: readonly MessageView[],
): Promise<Awaited<ReturnType<typeof runTurnPipeline>>> {
  captured = null;
  return await runTurnPipeline({
    now: Date.now,
    applyRegexReplace: (text, regex, replacer) => text.replace(regex, replacer),
    loadInlineReplyAssetIds: () => Promise.resolve(new Map<MessageId, ReadonlySet<AssetId>>()),
    loadReasoningParts: () => Promise.resolve(new Map<MessageId, readonly ChatReasoningPart[]>()),
    loadCues: () => Promise.resolve(new Map<MessageId, DeliveredCue>()),
    runChatTurn,
    resolveImageUrl: () => Promise.resolve(null),
    assembleContext,
    canon,
    connection: resolved as Parameters<typeof runTurnPipeline>[0]["connection"],
    intent: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0 },
    kind: "auto",
    chatId,
    onDelta: () => undefined,
    tools: null,
    attachedToolNames: [],
    toolRecurseLimit: TOOL_RECURSE_LIMIT,
    toolExecFrame: { runAsUserId: OWNER, triggeredBy: OWNER, chatId, membership: null, turnId: mintTypeId(ID_PREFIX.chatTurn) },
  });
}

async function arm(name: string, model: string, declared: DeclaredCapability | null): Promise<boolean> {
  const connection = fakeConnection({ providerId: "ollama", model, ownerId: OWNER, baseUrl: BASE_URL, declared });
  deps.stores.connections.rows.set(connection.id, connection);
  // What a save or a new connection does in the app: ask the server again.
  await runtime.catalogs.invalidateEndpoint(connection);
  // What the connection editor renders: the same read `connection.capabilities` serves.
  const shown = windowOf((await runtime.capabilities.for({ connectionId: connection.id, principal: owner })).capability);
  const { resolved } = await runtime.resolve({ task: "chat", principal: owner, connectionId: connection.id });
  await turn(resolved, canonWith(null));
  const factSeq = oldestSentSeq(captured, null);
  const result = await turn(resolved, canonWith(factSeq));
  const recalled = result.content.toUpperCase().includes(SECRET);
  const sentBody = captured;
  const row = {
    kind: "window",
    arm: name,
    model,
    shownWindow: shown.window,
    shownAssumed: shown.assumed,
    fitCeiling: result.fitCeilingTokens,
    factSeq,
    oldestSent: oldestSentSeq(sentBody, factSeq),
    factSent: JSON.stringify(sentBody).includes(SECRET),
    tokensIn: result.economics?.tokensIn ?? null,
    sentTokens: await sentTokens(sentBody, model),
    answer: result.content.slice(0, ANSWER_SNIPPET),
    recalled,
  };
  log.row(row);
  console.log(JSON.stringify(row));
  return recalled;
}

await waitFor(`${ROOT}/api/version`, HEALTH_TRIES);
const verdict: Record<string, boolean> = {};
verdict["stated"] = await arm("stated", MODEL, null);
verdict["declared"] = await arm("declared 8192, native route", MODEL, { generation: { context: { window: DECLARED_WINDOW } } });
verdict["v1-control"] = await arm("declared 8192, /v1 (control)", MODEL, {
  features: { nativeChat: "none" },
  generation: { context: { window: DECLARED_WINDOW } },
});

// The pin is the rig's own, made here on purpose and removed after: the app itself never creates a model.
const created = await http(`${ROOT}/api/create`, { body: { model: PINNED_MODEL, from: MODEL, parameters: { num_ctx: PINNED_NUM_CTX }, stream: false } });
log.row({ kind: "pin", model: PINNED_MODEL, status: created.status });
if (created.status === HTTP_OK) {
  verdict["pinned"] = await arm("pinned", PINNED_MODEL, null);
  await http(`${ROOT}/api/delete`, { method: "DELETE", body: { model: PINNED_MODEL } });
}

const serverCtx = process.argv.find((arg) => arg.startsWith(SERVER_CTX_FLAG))?.slice(SERVER_CTX_FLAG.length);
if (serverCtx !== undefined) {
  verdict["server"] = await arm(`server OLLAMA_CONTEXT_LENGTH=${serverCtx}, declared, /v1`, MODEL, {
    features: { nativeChat: "none" },
    generation: { context: { window: Number(serverCtx) } },
  });
}
log.row({ kind: "verdict", verdict });
console.log(JSON.stringify({ verdict }));
