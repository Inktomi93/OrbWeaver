// OR-13 — the stored-cue replay (D262) live on a prefix-bound model. One nonce'd group room on claude-fable-5-1,
// direct, with the `conversation` carry, run through the real turn pipeline and backend: a two-speaker round, then a
// user follow-up and one more reply. Pass: no call drops a thinking block for a prefix mismatch, and the cache read
// grows call over call. OR13_CAP_USD stops the run at an estimated spend.

import { randomUUID } from "node:crypto";
import type { AssembleContext, ChatInjection, ChatReasoningPart, MessageView, SpeakerRef } from "@orb/contracts/chat";
import { chatReasoningPartSchema } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG, PRESET_FORMAT_SLOT_IDS } from "@orb/contracts/preset";
import { legacyProseOverrides, resolveProseText } from "@orb/contracts/prose";
import type { InferenceLog, WireCaptureSink } from "@orb/inference";
import type { AssetId, CharacterId, ChatId, MessageId, ModelId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createAnthropicBackend } from "../../../packages/inference/src/backends/anthropic-messages/index.ts";
import { detectModelFamily } from "../../../packages/inference/src/capability/families.ts";
import { applyEndpointPosture } from "../../../packages/inference/src/capability/floor.ts";
import { curatedRows } from "../../../packages/inference/src/capability/sources/curated/loader.ts";
import { measuredRows } from "../../../packages/inference/src/capability/sources/measured/loader.ts";
import { synthesizeCapability } from "../../../packages/inference/src/capability/synthesize.ts";
import { createProviderExecutor } from "../../../packages/inference/src/roles/executor.ts";
import { BEFORE_HISTORY_DEPTH } from "../../../packages/server/src/domain/chat/assembly/injections.ts";
import type { DeliveredCue } from "../../../packages/server/src/domain/chat/contract/results.ts";
import { runTurnPipeline } from "../../../packages/server/src/domain/chat/engine/pipeline.ts";
import { buildCommittedMessageView } from "../../../packages/server/src/domain/chat/persistence/canon-write.ts";
import { createRunChatTurnBridge } from "../../../packages/server/src/entry/compose/chat.ts";
import { makeApiKeySecret, makeResolved } from "../../../tests/support/factories/resolved-connection.ts";
import { filler, jsonl, printTable, readEnvKey } from "./_kit.ts";

export const id = "or13";
export const title = "stored-cue replay on a prefix-bound model (claude-fable-5-1, direct, conversation carry)";

const MODEL = "claude-fable-5-1";
const KEY_ENV = "ANTHROPIC_PROBE_KEY";
const PER_MILLION = 1_000_000;
// OpenRouter's list for anthropic/claude-fable-5.1: input 10, output 50, 1h cache write 20. The read is priced at a
// tenth of input here, above the listed 0.25, so the estimate errs high.
const PRICES = { input: 10, cacheRead: 1, cacheWrite: 20, output: 50 } as const;
const DEFAULT_CAP_USD = 0.8;
const PRIOR_LINES = 40;
const MAX_OUTPUT_TOKENS = 1500;
const TOOL_RECURSE_LIMIT = 5;
const USD_DIGITS = 4;

const OWNER = castId<UserId>("user_or13probe");
const ARIA = castId<CharacterId>("character_or13aria");
const KAI = castId<CharacterId>("character_or13kai");
const SPEAKERS = [
  { id: ARIA, name: "Aria", description: "Aria is a lighthouse keeper: practical, dry, and slow to trust strangers." },
  { id: KAI, name: "Kai", description: "Kai is a ferry pilot: cheerful, restless, and always owed money by someone." },
] as const;
type Speaker = (typeof SPEAKERS)[number];

interface CallRecord {
  readonly call: string;
  readonly requestId: string | null;
  readonly promptTokens: number | null;
  readonly readTokens: number | null;
  readonly writeTokens: number | null;
  readonly outputTokens: number | null;
  /** `providerMetadata.thinkingDropped`; null when the response listed no transformations. */
  readonly thinkingDropped: number | null;
  readonly alarms: number;
  readonly thinkingBlocksSent: number;
  readonly blockBinding: string | null;
  readonly cueRole: string | null;
  readonly costUsd: number;
}

const silent = { debug: (): void => undefined, info: (): void => undefined, warn: (): void => undefined, error: (): void => undefined };

function view(chatId: ChatId, seq: number, content: string, characterId: CharacterId | null): MessageView {
  return buildCommittedMessageView({
    messageId: mintTypeId(ID_PREFIX.message),
    variantId: mintTypeId(ID_PREFIX.messageVariant),
    chatId,
    seq,
    role: characterId === null ? "user" : "assistant",
    authorUserId: characterId === null ? OWNER : null,
    characterId,
    now: 0,
    variant: { content },
  });
}

function estimateUsd(u: Pick<CallRecord, "promptTokens" | "readTokens" | "writeTokens" | "outputTokens">): number {
  const read = u.readTokens ?? 0;
  const write = u.writeTokens ?? 0;
  const uncached = Math.max(0, (u.promptTokens ?? 0) - read - write);
  return (uncached * PRICES.input + read * PRICES.cacheRead + write * PRICES.cacheWrite + (u.outputTokens ?? 0) * PRICES.output) / PER_MILLION;
}

/** How many thinking blocks the captured request carried back, across every message. */
function thinkingBlocks(body: Record<string, unknown> | null): number {
  const messages = Array.isArray(body?.["messages"]) ? (body["messages"] as readonly Record<string, unknown>[]) : [];
  return messages.reduce((sum, m) => sum + (Array.isArray(m["content"]) ? (m["content"] as readonly Record<string, unknown>[]).filter((b) => b["type"] === "thinking").length : 0), 0);
}

export async function run(): Promise<object> {
  const out = jsonl(id);
  const key = readEnvKey(KEY_ENV);
  if (key.length === 0) {
    console.log(`${KEY_ENV} not found; nothing fired`);
    return { kind: "verdict", probe: id, skipped: true };
  }
  const cap = Number(process.env["OR13_CAP_USD"] ?? DEFAULT_CAP_USD);
  const runId = randomUUID().slice(0, 8);
  const chatId = castId<ChatId>(`chat_or13${runId}`);

  const capture: { body: Record<string, unknown> | null; headers: Readonly<Record<string, string>> } = { body: null, headers: {} };
  const sink: WireCaptureSink = (entry) => {
    capture.body = entry.body;
    capture.headers = entry.responseHeaders ?? {};
  };
  let alarms = 0;
  const log: InferenceLog = { ...silent, error: (fields) => (fields["event"] === "provider.thinking_dropped" ? (alarms += 1) : undefined) };
  const registry = new Map([["anthropic-messages" as const, createAnthropicBackend({ now: Date.now, log, fetch: globalThis.fetch, captureWire: sink })]]);
  const executor = createProviderExecutor({ registry, span: (_name, fn) => Promise.resolve(fn()) });
  const base = makeResolved({ providerId: "anthropic" });
  const query = { model: MODEL, providerId: base.provider.id, wire: base.provider.wire, api: base.provider.apis[0] ?? null };
  const synthesized = synthesizeCapability("generation", detectModelFamily(MODEL), { measured: measuredRows(query), curated: curatedRows(query) });
  const connection = makeResolved({
    providerId: "anthropic",
    model: castId<ModelId>(MODEL),
    factsModel: castId<ModelId>(MODEL),
    capability: applyEndpointPosture(base.provider, synthesized.capability, false),
    credential: makeApiKeySecret(key),
  });
  const runChatTurn = createRunChatTurnBridge({ runChatTurn: executor.runChatTurn });

  const refs: SpeakerRef[] = SPEAKERS.map((s) => ({ kind: "character", characterId: s.id }));
  const marker: ChatInjection = {
    position: "in_chat",
    depth: BEFORE_HISTORY_DEPTH,
    role: "user",
    content: resolveProseText(PRESET_FORMAT_SLOT_IDS.newChatMarker, legacyProseOverrides(PRESET_FORMAT_SLOT_IDS.newChatMarker, undefined)).trim(),
    origin: "new-chat-marker",
  };
  const assembleContext: AssembleContext = {
    character: { name: SPEAKERS[0].name, description: SPEAKERS[0].description },
    characters: SPEAKERS.map((s) => ({ name: s.name, description: s.description })),
    characterIds: SPEAKERS.map((s) => s.id),
    speakerRefs: refs,
    promptConfig: DEFAULT_PROMPT_CONFIG,
    activePersona: { name: "Alex", description: "A traveller wintering at the lighthouse." },
    activePersonaUserId: OWNER,
    recentMessages: [],
    chatInjections: [marker],
  };

  // Both characters have spoken before the round, so the name-stamp labels every reply the same way on every call.
  const canon: MessageView[] = [
    view(chatId, 1, `Aria sets the lamp oil down. ${filler(`${runId}-a`, PRIOR_LINES)}`, ARIA),
    view(chatId, 2, "Kai ties the ferry off and waves.", KAI),
    view(chatId, 3, "Is the ferry running tonight, and who is paying for the oil?", null),
  ];
  const cues = new Map<MessageId, DeliveredCue>();
  const reasoning = new Map<MessageId, readonly ChatReasoningPart[]>();
  const calls: CallRecord[] = [];
  let spend = 0;

  const reply = async (label: string, speaker: Speaker, index: number): Promise<boolean> => {
    if (spend >= cap) {
      return false;
    }
    capture.body = null;
    capture.headers = {};
    const alarmsBefore = alarms;
    const result = await runTurnPipeline({
      now: Date.now,
      applyRegexReplace: (text, regex, replacer) => text.replace(regex, replacer),
      loadInlineReplyAssetIds: () => Promise.resolve(new Map<MessageId, ReadonlySet<AssetId>>()),
      loadReasoningParts: () => Promise.resolve(reasoning),
      loadCues: () => Promise.resolve(cues),
      runChatTurn,
      resolveImageUrl: () => Promise.resolve(null),
      assembleContext,
      canon,
      connection,
      intent: { effort: "low", carryReasoning: "conversation", maxOutputTokens: MAX_OUTPUT_TOKENS },
      kind: "auto",
      chatId,
      // The round driver's per-speaker fence, as `engine/round.ts` builds it for a multi-speaker round.
      groupNudge: resolveProseText("chat.group.roundNudge", {}, { name: speaker.name }),
      shape: { output: "per-speaker", cardScope: "merged", scopedTargetId: null, speakerName: speaker.name, speakerRef: refs[index] as SpeakerRef },
      onDelta: () => undefined,
      tools: null,
      attachedToolNames: [],
      toolRecurseLimit: TOOL_RECURSE_LIMIT,
      toolExecFrame: { runAsUserId: OWNER, triggeredBy: OWNER, chatId, membership: null, turnId: mintTypeId(ID_PREFIX.chatTurn) },
    });
    const e = result.economics;
    const meta = e?.providerMetadata;
    const usage = { promptTokens: e?.tokensIn ?? null, readTokens: e?.cacheReadTokens ?? null, writeTokens: e?.cacheWriteTokens ?? null, outputTokens: e?.tokensOut ?? null };
    const thinking = capture.body?.["thinking"] as Record<string, unknown> | undefined;
    const record: CallRecord = {
      call: label,
      requestId: capture.headers["request-id"] ?? null,
      ...usage,
      thinkingDropped: meta !== undefined && meta !== null && meta.provider === "anthropic" ? (meta.thinkingDropped ?? null) : null,
      alarms: alarms - alarmsBefore,
      thinkingBlocksSent: thinkingBlocks(capture.body),
      blockBinding: JSON.stringify(thinking?.["block_binding"] ?? null),
      cueRole: result.cue?.role ?? null,
      costUsd: estimateUsd(usage),
    };
    spend += record.costUsd;
    calls.push(record);
    out.append({ kind: "arm", probe: id, runId, model: MODEL, ...record, spendSoFar: spend });
    console.log(
      `${label}: id=${record.requestId} prompt=${record.promptTokens} read=${record.readTokens} write=${record.writeTokens} out=${record.outputTokens} ` +
        `dropped=${record.thinkingDropped} alarms=${record.alarms} thinkingSent=${record.thinkingBlocksSent} binding=${record.blockBinding} ` +
        `cue=${record.cueRole} est=$${record.costUsd.toFixed(USD_DIGITS)}`,
    );
    const committed = view(chatId, canon.length + 1, result.content, speaker.id);
    canon.push(committed);
    if (result.cue !== null) {
      cues.set(committed.id, result.cue);
    }
    const parts = chatReasoningPartSchema.array().safeParse(e?.reasoningParts ?? []);
    if (parts.success && parts.data.length > 0) {
      reasoning.set(committed.id, parts.data);
    }
    return true;
  };

  const ran =
    (await reply("round speaker 1 (Aria)", SPEAKERS[0], 0)) &&
    (await reply("round speaker 2 (Kai)", SPEAKERS[1], 1)) &&
    (canon.push(view(chatId, canon.length + 1, "Fine. Then which of you rows me out to the weirs at dawn?", null)), await reply("follow-up (Aria)", SPEAKERS[0], 0));
  const reads = calls.map((c) => c.readTokens ?? 0);
  const readsGrow = reads.every((read, i) => i === 0 || read > (reads[i - 1] ?? 0));
  const zeroDrops = calls.every((c) => (c.thinkingDropped ?? 0) === 0 && c.alarms === 0);
  const verdict = {
    kind: "verdict",
    probe: id,
    runId,
    at: new Date().toISOString(),
    completed: ran,
    pass: ran && readsGrow && zeroDrops,
    readsGrow,
    zeroDrops,
    estimatedSpend: spend,
  };
  out.append(verdict);
  printTable(calls.map(({ call, requestId, promptTokens, readTokens, writeTokens, outputTokens, thinkingDropped, thinkingBlocksSent, cueRole, costUsd }) => ({ call, requestId, promptTokens, readTokens, writeTokens, outputTokens, thinkingDropped, thinkingBlocksSent, cueRole, costUsd })));
  console.log(`or13 estimated spend: $${spend.toFixed(USD_DIGITS)}`);
  return verdict;
}
