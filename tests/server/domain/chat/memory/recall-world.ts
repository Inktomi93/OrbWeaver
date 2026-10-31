// The recall pipeline room: a transcript the production memory build digests, a scripted provider embedding edge and a physical rerank edge.
// Shared by the recall pipeline suite and the persistence suites that remove a stored row from the same room.

import { createCharacterSchema } from "@orb/contracts/character";
import type { MemoryRecallCandidate, MemoryRecallSlice, MemoryRecallVerdict } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { resolveProseText } from "@orb/contracts/prose";
import { expect } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  SECRET_BOX_TEST_KEY,
  SUMMARIZE_TRANSCRIPT_MARKER,
  summaryReply,
} from "@orb/testkit/node/composed";
import { z } from "zod";

export const RERANK_MODEL = "corpus-rerank";
export const RERANK_WINDOW_TOKENS = 2048;
export const TURN_INTENT = { maxContextTokens: 4096, maxOutputTokens: 64 } as const;
/** A window no history can fill: the whole transcript stays verbatim in the prompt. */
export const WHOLE_HISTORY_INTENT = { maxContextTokens: 400_000, maxOutputTokens: 64 } as const;
/** One scene per arc. A scene is two transcript lines, so with `blockSize` 2 each arc is one tier-0 block. */
export const ARCS = ["bath", "market", "duel", "shrine", "storm", "farewell"] as const;
export type Arc = (typeof ARCS)[number];
export const OFF_CORPUS = "elsewhere";
export const FILLER_LINES = 10;
export const RECALL_STREAM_PASSWORD = "recall-phase-stream-password";
export const BLOCK_SIZE = 2;
export const FAN_OUT = 2;
export const STRADDLE_SCAN_WINDOWS = [0, 1, 2, 3, 4].map((step) => TURN_INTENT.maxContextTokens - step * 300);
export const FILLER = "The caravan creaked on through the grey morning while the drivers argued about the weather and the oxen. ".repeat(18);
export const VECTOR_WIDTH = CORPUS_EMBEDDING_VECTOR.length;
export const EARLIER_PROBE_WEIGHT = 0.4;
export const FILLER_AXIS = ARCS.length + 1;
export const OFF_CORPUS_AXIS = ARCS.length;

export function probe(arc: Arc | typeof OFF_CORPUS): string {
  return `probe-${arc}.`;
}

export function axisOf(name: string): number {
  const arc = ARCS.find((candidate) => candidate === name);
  return arc === undefined ? OFF_CORPUS_AXIS : ARCS.indexOf(arc);
}

export function unit(axis: number, weight = 1): number[] {
  return Array.from({ length: VECTOR_WIDTH }, (_, index) => (index === axis ? weight : 0));
}

/** A probe in the text puts the vector on that arc's axis, later probes heavier; a digest names its own arc. */
export function embeddingFor(input: string): number[] {
  const probes = [...input.matchAll(/probe-([a-z]+)\./g)].map((match) => match[1] ?? OFF_CORPUS);
  if (probes.length > 0) {
    const sum = unit(FILLER_AXIS, 0);
    probes.forEach((name, index) => {
      sum[axisOf(name)] = (sum[axisOf(name)] ?? 0) + (index === probes.length - 1 ? 1 : EARLIER_PROBE_WEIGHT);
    });
    return sum;
  }
  const arc = ARCS.find((candidate) => input.includes(`-${candidate}.`));
  return unit(arc === undefined ? FILLER_AXIS : ARCS.indexOf(arc));
}

export function lineText(arc: Arc): string {
  return `line-${arc}. They went on about the ${arc}.`;
}

export function digestText(arc: Arc): string {
  return summaryReply({ anchor: `Arc ${arc}`, facts: `arc-${arc}. The ${arc} scene happened here.`, keywords: [arc] });
}

export const rerankBodySchema = z.object({ model: z.literal(RERANK_MODEL), documents: z.array(z.string()) });

export interface RecallWorld extends AsyncDisposable {
  readonly h: ChatRoot;
  /** The arc the scripted cross-encoder scores highest. */
  readonly rerankPrefers: (arc: Arc) => void;
  /** Run one production sweep to completion, as the sweeps that built this room did. */
  readonly sweep: (input: WorkloadInput) => Promise<void>;
}

export type WorkloadInput = Parameters<ChatRoot["caller"]["workloads"]["start"]>[0]["input"];

export interface World {
  readonly build: (config: {
    readonly mode: "off" | "mixA" | "mixB" | "mixC" | "tiered";
    readonly maxTier: number;
    readonly scout?: boolean;
    /** Serve the transport with its local sign-in, so a test can open the owner's event stream. */
    readonly signIn?: boolean;
  }) => Promise<RecallWorld>;
}

// The consolidation prompt leads with this slot; its default text is the one production sends when the host sets no override.
export const CONSOLIDATION_LEAD = resolveProseText("chat.memory.consolidationLead", {});

export function generatedText(body: string): string {
  if (body.includes(CONSOLIDATION_LEAD)) {
    return summaryReply({ anchor: "Merged arc", facts: "The scenes merged into one arc.", keywords: ["merged"] });
  }
  if (!body.includes(SUMMARIZE_TRANSCRIPT_MARKER)) {
    return "The keeper answers.";
  }
  const arc = ARCS.find((candidate) => body.includes(`line-${candidate}.`));
  return arc === undefined ? summaryReply({ anchor: "Filler", facts: "The caravan rested.", keywords: ["rest"] }) : digestText(arc);
}

export const world: World = {
  async build(config): Promise<RecallWorld> {
    let preferred: Arc = ARCS[0];
    const physical = createCorpusProviderExecution({
      modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL, RERANK_MODEL],
      embedding: embeddingFor,
      structuredReplies: CORPUS_STRUCTURED_REPLIES,
      images: [],
      chatText: generatedText,
    });
    await using construction = new AsyncDisposableStack();
    const h = construction.use(
      await createChatRoot({
        providerFetch: async (input, init) => {
          const request = new Request(input, init);
          if (new URL(request.url).pathname !== "/v1/rerank") {
            return await physical.execute(request);
          }
          const body = rerankBodySchema.parse(await request.json());
          const results = body.documents.map((document, index) => ({ index, ["relevance_score"]: document.includes(`arc-${preferred}.`) ? 1 : 0 }));
          return Response.json({ results });
        },
        ...(config.signIn === true ? { server: { env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" }, secretBoxKey: SECRET_BOX_TEST_KEY } } : {}),
        memoryEnabled: true,
        memoryDefaults: { mode: "mixB", blockSize: BLOCK_SIZE, verbatimWindow: 0, fanOut: FAN_OUT, maxTier: config.maxTier },
        characters: [
          createCharacterSchema.parse({ handle: "keeper", name: "Keeper", description: "The keeper of the caravan ledger." }),
          ...(config.scout === true ? [createCharacterSchema.parse({ handle: "scout", name: "Scout", description: "The scout who rides ahead." })] : []),
        ],
        ...(config.scout === true ? { group: { output: "per-speaker" as const, policy: "list" as const, cardScope: "scoped" as const } } : {}),
        transcript: [
          ...ARCS.flatMap((arc) => [0, 1].map(() => ({ role: "assistant" as const, content: `${lineText(arc)} ${FILLER}` }))),
          ...Array.from({ length: FILLER_LINES }, (_, index) => ({ role: "assistant" as const, content: `Filler ${index}: ${FILLER}` })),
        ],
      }),
    );
    const connection = await h.root.services.connection.create({
      principal: h.owner,
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: CORPUS_PROVIDER_ENDPOINT,
      model: RERANK_MODEL,
      label: "Corpus reranker",
      allowBackground: true,
      declared: {
        kind: "rerank",
        rerank: { maxInputTokens: RERANK_WINDOW_TOKENS, input: ["text"], instructionAware: false },
        features: { detectServer: false, rerankPath: "/rerank" },
      },
    });
    await h.caller.connection.setBinding({ task: "rerank", connectionId: connection.id });
    const keeper = h.characters[0];
    if (keeper === undefined) {
      throw new Error("the recall world has no speaker");
    }
    // The warm-up turn builds the room's digests through the live memory pass; the sweeps put them in the active space.
    const built = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: keeper.id, intent: TURN_INTENT });
    if (built.aborted) {
      throw new Error("the memory warm-up turn aborted");
    }
    await h.root.settleBackground();
    const lifetime = new AbortController();
    construction.defer(() => lifetime.abort());
    const runAdmittedWorkload = h.root.runAdmittedWorkload;
    if (runAdmittedWorkload === undefined) {
      throw new Error("the recall world has no admitted-workload driver");
    }
    const sweep = async (input: WorkloadInput): Promise<void> => {
      const job = await h.caller.workloads.start({ input, mode: "singular" });
      await runAdmittedWorkload(job.id, lifetime.signal);
    };
    for (const input of [
      { kind: "index", params: { source: "text" } },
      { kind: "memory-backfill", params: {} },
      { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } },
    ] as const satisfies WorkloadInput[]) {
      await sweep(input);
    }
    // The build runs under mixB: a room with memory off has nothing to back fill. The case's own mode applies after it.
    await h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: config.mode } } });
    const kept = construction.move();
    return {
      h,
      rerankPrefers: (arc): void => {
        preferred = arc;
      },
      sweep,
      [Symbol.asyncDispose]: () => kept.disposeAsync(),
    };
  },
};

export interface TurnIntent {
  readonly maxContextTokens: number;
  readonly maxOutputTokens: number;
}

export interface RecallRun {
  readonly trace: MemoryRecallSlice;
  readonly prompt: string;
}

/** Send one user line and read the single recall the turn recorded, with the prompt the chat model received. */
export async function recallTurn(h: ChatRoot, content: string, intent: TurnIntent = TURN_INTENT): Promise<RecallRun> {
  const before = h.root.app.recallRecorder.recent({ chatId: h.chatId }).at(-1)?.seq ?? 0;
  const requestsBefore = h.requests.length;
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content, intent });
  expect(outcome.aborted).toBe(false);
  const recalls = h.root.app.recallRecorder.recent({ chatId: h.chatId }).filter((record) => record.seq > before);
  expect(recalls).toHaveLength(1);
  const trace = recalls[0]?.trace;
  if (trace === undefined) {
    throw new Error("the turn recorded no recall");
  }
  const bodies = await Promise.all(
    h.requests
      .slice(requestsBefore)
      .filter((request) => request.method === "POST" && new URL(request.url).pathname === "/v1/chat/completions")
      .map((request) => request.clone().text()),
  );
  return { trace, prompt: bodies.filter((body) => !body.includes(SUMMARIZE_TRANSCRIPT_MARKER)).at(-1) ?? "" };
}

export function admitted(trace: MemoryRecallSlice): readonly number[] {
  return trace.candidates.filter((candidate) => candidate.verdict === "admitted").map((candidate) => candidate.blockIdx);
}

export function verdicts(trace: MemoryRecallSlice, verdict: MemoryRecallVerdict): readonly MemoryRecallCandidate[] {
  return trace.candidates.filter((candidate) => candidate.verdict === verdict);
}

/** The block index an arc's digest sits at: the transcript lists the arcs in order, two lines each. */
export function blockOf(arc: Arc): number {
  return ARCS.indexOf(arc);
}

export const ask = (arc: Arc | typeof OFF_CORPUS): string => `Tell me about the scene. ${probe(arc)}`;
