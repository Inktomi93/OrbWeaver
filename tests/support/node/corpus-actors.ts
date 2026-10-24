// The corpus actors, connections and recall room seeded through production verbs: the composed door's corpus seeds.
// This file may not import the rows tier; the corpus publication reads rows through `factories/rows/` captures.

import { createCharacterSchema } from "@orb/contracts/character";
import { assemblyPreviewSchema } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { ChatId, UserConnectionId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { SECOND_HUMAN_HANDLE } from "@orb/tooling/seed";
import { seedCorpusAccount } from "./corpus-auth.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL } from "./corpus-provider.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import type { createServerHarness } from "./server.ts";

type ServerHarness = Awaited<ReturnType<typeof createServerHarness>>;
type CorpusCaller = Awaited<ReturnType<ServerHarness["internalCallerFor"]>>;
type CorpusTurn = Awaited<ReturnType<ServerHarness["services"]["chat"]["send"]>>;
type RecallRecord = ReturnType<ServerHarness["app"]["recallRecorder"]["recent"]>[number];

const RECALL_INTENT = { maxContextTokens: 2048, maxOutputTokens: 64 };
const memoryRecallSchema = assemblyPreviewSchema.shape.trace.shape.memoryRecall.unwrap();

export interface SeedRecallCorpusOptions {
  readonly chatConnectionId: UserConnectionId;
  readonly embedConnectionId: UserConnectionId;
  readonly summarizeConnectionId: UserConnectionId;
  readonly beforeRecall?: () => void;
  /** Awaited once the memory workloads settle, before the recall turn; the rows twin captures memory here. */
  readonly afterSettle?: (chatId: ChatId) => Promise<void>;
}

export interface SeededRecallCorpus {
  readonly chatId: ChatId;
  readonly historyTurn: CorpusTurn;
  readonly first: CorpusTurn;
  readonly recalled: CorpusTurn;
  readonly jobs: Awaited<ReturnType<CorpusCaller["workloads"]["list"]>>;
  readonly traces: readonly RecallRecord["trace"][];
}

/** Author the room and host preset through their real public writes. */
export async function seedRecallRoom(caller: CorpusCaller): Promise<ChatId> {
  const preset = await caller.preset.create({ name: "Funding control preset", kind: "custom" });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "funding-control", name: "Funding control", description: "A deterministic funding control." }),
  });
  return (await caller.chat.startChat({ characterIds: [card.id], opening: "none" })).chat.id;
}

/** Produce memory through actual turns and workers; only fresh, owner-parsed recall traces are captured. */
export async function seedRecallCorpus(root: ServerHarness, options: SeedRecallCorpusOptions): Promise<SeededRecallCorpus> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  await caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixB", maxTier: 0 } } });
  const chatId = await seedRecallRoom(caller);
  await caller.chat.setGroupConfig({ chatId, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
  await caller.connection.setBinding({ task: "chat", connectionId: options.chatConnectionId });
  await caller.connection.setBinding({ task: "summarize", connectionId: options.summarizeConnectionId });
  await caller.connection.setBinding({ task: "embed", connectionId: options.embedConnectionId });
  const principal = await root.principalFor(root.ownerId);
  const historyTurn = await root.services.chat.send({ principal, chatId, content: "Witness the opening ledger scene.", intent: RECALL_INTENT });
  if (historyTurn.aborted || historyTurn.messages.length === 0) {
    throw new Error("synthetic recall corpus produced no completed history turn");
  }
  for (let seq = 0; seq < 16; seq += 1) {
    await caller.chat.commitMessage({
      chatId,
      timeZone: UTC_TIME_ZONE,
      content: `Funding memory scene ${seq}: ${"The ledger records the remembered scene and its witnesses. ".repeat(32)}`,
    });
  }
  const first = await root.services.chat.send({ principal, chatId, content: "Remember the ledger.", intent: RECALL_INTENT });
  if (first.aborted || first.messages.length === 0) {
    throw new Error("synthetic recall corpus produced no completed first turn");
  }
  const started = [
    await caller.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
  ];
  const jobs = await settleCorpusWorkloads(root, caller, started);
  await options.afterSettle?.(chatId);
  const previous = new Set(root.app.recallRecorder.recent({ chatId }).map((record) => record.seq));
  options.beforeRecall?.();
  const recalled = await root.services.chat.send({ principal, chatId, content: "Which remembered scene held the ledger?", intent: RECALL_INTENT });
  if (recalled.aborted || recalled.messages.length === 0) {
    throw new Error("synthetic recall corpus produced no completed scoped recall turn");
  }
  const traces = root.app.recallRecorder
    .recent({ chatId })
    .filter((record) => !previous.has(record.seq))
    .map((record) => memoryRecallSchema.parse(record.trace));
  if (!traces.some((trace) => trace.queryEmbedded && trace.poolSize > 0)) {
    throw new Error("synthetic recall corpus produced no fresh nonempty recall trace");
  }
  return { chatId, historyTurn, first, recalled, jobs, traces };
}

export interface CorpusActors {
  readonly owner: Principal;
  readonly secondUserId: Awaited<ReturnType<ServerHarness["app"]["sessions"]["ensureUser"]>>;
  readonly connections: Awaited<ReturnType<typeof seedCorpusConnections>>;
}

/** Configure actual actors and hosted execution bindings through their owners, not a runtime resolver substitute. */
export async function seedCorpusActors(root: ServerHarness, freshAccount = false): Promise<CorpusActors> {
  const owner = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal: owner, partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] } });
  const connections = await seedCorpusConnections(root, owner);
  const secondUserId = freshAccount
    ? (await seedCorpusAccount(root)).userId
    : await root.app.sessions.ensureUser(brandedId("Handle").parse(SECOND_HUMAN_HANDLE));
  await seedCorpusConnections(root, await root.principalFor(secondUserId));
  return { owner, secondUserId, connections };
}

type CorpusConnectionView = Awaited<ReturnType<ServerHarness["services"]["connection"]["create"]>>;

export interface CorpusConnections {
  readonly embed: CorpusConnectionView;
  readonly text: CorpusConnectionView;
}

/** Configure explicit physical corpus models through real owner admission; no runtime/role resolver is replaced. */
export async function seedCorpusConnections(root: ServerHarness, principal: Principal): Promise<CorpusConnections> {
  const embed = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_EMBED_MODEL,
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: CORPUS_EMBEDDING_VECTOR.length, maxInputTokens: 8192 }, features: { detectServer: false } },
  });
  const text = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { input: ["text", "image"], context: { window: 32_000 }, output: { structured: true } },
      features: { detectServer: false, structuredMode: "guided-decoding" },
    },
  });
  await root.services.connection.setBinding({ principal, task: "embed", connectionId: embed.id });
  await root.services.connection.setBinding({ principal, task: "chat", connectionId: text.id });
  await root.services.connection.setBinding({ principal, task: "summarize", connectionId: text.id });
  await root.services.connection.setBinding({ principal, task: "imageEmbed", connectionId: null });
  return { embed, text };
}
