// Loopback HTTP, native provider conversion and an installed guest expose Stop beyond the room's bus.
import { spawn } from "node:child_process";
import { once } from "node:events";
import type { ServerResponse } from "node:http";
import { createServer } from "node:http";
import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent, TurnOutcome } from "@orb/contracts/chat";
import { builtinProvider } from "@orb/contracts/inference";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import { pluginKv } from "@orb/db";
import { createControlledTimers, createFrozenClock } from "@orb/testkit/iso";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  makePluginBundle,
  seedInstalledPlugin,
  seedPluginGrant,
} from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { and, eq } from "drizzle-orm";
import type { MockInstance } from "vitest";
import { vi } from "vitest";

const MODES = ["stream", "headers", "retry", "complete"] as const;
const PLUGIN_SLUG = "cancel-witness";
const TOOL_NAME = pluginToolWireName(PLUGIN_SLUG, "witness");
const TOOL_RAN = "tool-ran";
const FIRST_DELTA = 'data: {"id":"physical-cancel","choices":[{"index":0,"delta":{"content":"first"},"finish_reason":null}]}\n\n';
const LATE_DELTA = 'data: {"choices":[{"index":0,"delta":{"content":"late"},"finish_reason":null}]}\n\n';

async function providerPeer(mode: (typeof MODES)[number]): Promise<
  AsyncDisposable & {
    readonly baseUrl: string;
    readonly requests: string[];
    readonly arrived: Promise<void>;
    readonly disconnected: Promise<void>;
    readonly stopped: () => boolean;
    readonly destroyed: () => boolean;
    readonly writeLate: () => boolean | undefined;
    readonly closeConnections: () => void;
  }
> {
  await using construction = new AsyncDisposableStack();
  const arrived = Promise.withResolvers<void>();
  const disconnected = Promise.withResolvers<void>();
  const requests: string[] = [];
  let stopped = false;
  let response: ServerResponse | undefined;
  const server = construction.use(
    createServer((request, reply) => {
      response ??= reply;
      requests.push(request.url ?? "");
      request.resume();
      reply.on("close", () => {
        if (!reply.writableFinished) {
          stopped = true;
          disconnected.resolve();
        }
      });
      if (mode === "retry") {
        reply.writeHead(503, { "content-type": "application/json" });
        reply.end('{"error":{"message":"physical retry fixture","code":503}}');
      } else if (mode !== "headers") {
        reply.writeHead(200, { "content-type": "text/event-stream" });
        reply.write(FIRST_DELTA);
        if (requests.length === 1) {
          reply.write(
            `data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_physical","type":"function","function":{"name":${JSON.stringify(TOOL_NAME)},"arguments":"{}"}}]},"finish_reason":null}]}\n\n`,
          );
        }
        if (mode === "complete") {
          reply.end(`${terminalSseLine({ finishReason: requests.length === 1 ? "tool_calls" : "stop", delta: {} })}\n\ndata: [DONE]\n\n`);
        }
      }
      arrived.resolve();
    }),
  );
  construction.defer(() => server.closeAllConnections());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the controlled provider acquired no loopback TCP port");
  }
  const lifetime = construction.move();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    arrived: arrived.promise,
    disconnected: disconnected.promise,
    stopped: () => stopped,
    destroyed: () => response?.destroyed === true,
    writeLate: () => response?.write(LATE_DELTA),
    closeConnections: () => server.closeAllConnections(),
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

interface CancellationRun {
  readonly h: ChatRoot;
  readonly peer: Awaited<ReturnType<typeof providerPeer>>;
  readonly events: readonly ChatBusEvent[];
  readonly toolName: string;
  readonly chatPath: string;
  readonly retryScheduled: Promise<number>;
  readonly retries: () => readonly number[];
  readonly pendingTurnTimeouts: () => readonly number[];
  readonly completed: MockInstance<ChatRoot["root"]["app"]["rpgChatOps"]["onTurnCompleted"]>;
  readonly start: () => Promise<TurnOutcome>;
  readonly toolWrites: () => Promise<(typeof pluginKv.$inferSelect)[]>;
}

/** Hold only physical provider work; the callback owns every running public request until settlement. */
export async function withCancellationPeer(mode: (typeof MODES)[number], prove: (fixture: CancellationRun) => Promise<void>, tokenize = false): Promise<void> {
  await using peer = await providerPeer(mode);
  const official = builtinProvider("openrouter")?.baseUrl;
  if (official === undefined) {
    throw new Error("the canonical OpenRouter provider has no hosted endpoint");
  }
  const hostedChatUrl = `${official.replace(/\/$/u, "")}/chat/completions`;
  const hosted = new URL(hostedChatUrl);
  const corpusOrigin = new URL(CORPUS_PROVIDER_ENDPOINT).origin;
  const clock = createFrozenClock();
  using timers = createControlledTimers(clock);
  const retryScheduled = Promise.withResolvers<number>();
  const retries: number[] = [];
  let failedResponses = 0;
  let scheduledAfterFailure = 0;
  const pendingTimeouts = new Map<symbol, number>();
  let precedingTimeouts = new Set<symbol>();
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused cancellation corpus reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({
    memoryEnabled: false,
    characters: (mode === "complete" ? ["aria"] : ["aria", "beth"]).map((name) =>
      createCharacterSchema.parse({ handle: name, name, description: `${name} is a seated witness.` }),
    ),
    group: { output: "per-speaker", policy: "list", autoMode: mode !== "complete", autoModeMaxTurns: 3, autoModeDelayMs: 0 },
    server: {
      secretBoxKey: Buffer.alloc(32, 1),
      pluginSpawn: spawn,
      networkExecution: {
        resolver: (host): Promise<readonly string[]> =>
          host === hosted.hostname ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error(`unscripted cancellation provider address: ${host}`)),
      },
      clock,
      random: () => 0.5,
      timers: {
        ...timers,
        timeout: (callback, ms) => {
          const identity = Symbol("scheduled cancellation-fixture timeout");
          pendingTimeouts.set(identity, ms);
          const cancel = timers.timeout(() => {
            pendingTimeouts.delete(identity);
            callback();
          }, ms);
          // A healthy stream resets its idle guard after dispatch; only a failed physical response admits backoff.
          if (failedResponses > scheduledAfterFailure) {
            scheduledAfterFailure = failedResponses;
            retries.push(ms);
            retryScheduled.resolve(ms);
          }
          return () => {
            pendingTimeouts.delete(identity);
            cancel();
          };
        },
      },
    },
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      const custom = tokenize && url.origin === peer.baseUrl && ["/tokenize", "/v1/chat/completions"].includes(url.pathname);
      if (request.method === "POST" && (request.url === hostedChatUrl || custom)) {
        const response = await fetch(new URL(url.pathname + url.search, peer.baseUrl), {
          method: request.method,
          headers: request.headers,
          body: await request.arrayBuffer(),
          signal: request.signal,
        });
        if (response.status === 503) {
          failedResponses += 1;
        }
        return response;
      }
      if (url.origin === corpusOrigin) {
        return await corpus.execute(request);
      }
      throw new Error(`unscripted cancellation provider URL: ${request.url}`);
    },
  });
  const providerId = tokenize ? "custom-openai" : "openrouter";
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: providerId, key: "controlled-loopback-cancellation-key" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId,
    credentialId: credential.id,
    baseUrl: tokenize ? peer.baseUrl : null,
    model: "controlled-cancellation-model",
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, tools: { parallel: true }, sampling: { logitBias: true } },
      features: { detectServer: false, ...(tokenize ? { tokenizeApi: "vllm" } : {}) },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const manifest = pluginManifestSchema.parse({
    id: PLUGIN_SLUG,
    name: "Physical cancellation witness",
    description: "Records an actual completed tool execution.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["tools.register", "storage.kv"],
  });
  const guest = `const host=orb.host(1);host.tools.register({name:"witness",description:"Record a completed tool call",parameters:{type:"object",properties:{},additionalProperties:false},handler:async()=>{await host.storage.set(${JSON.stringify(TOOL_RAN)},"yes");return "done";}});`;
  const installed = await seedInstalledPlugin(h.root, {
    caller: h.owner,
    bundle: makePluginBundle(manifest, guest, clock.now()),
    grant: [],
  });
  const enabled = await seedPluginGrant(h.root, {
    caller: h.owner,
    pluginId: installed.outcome.id,
    grant: manifest.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  if (enabled.outcome.status !== "enabled") {
    throw new Error("the physical cancellation guest did not activate");
  }
  using completed = vi.spyOn(h.root.app.rpgChatOps, "onTurnCompleted");
  const events: ChatBusEvent[] = [];
  const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => events.push(event));
  const settlements: Promise<PromiseSettledResult<TurnOutcome>[]>[] = [];
  const start = (): Promise<TurnOutcome> => {
    precedingTimeouts = new Set(pendingTimeouts.keys());
    const sending = h.root.services.chat.send({
      principal: h.owner,
      chatId: h.chatId,
      content: "hello",
      ...(tokenize ? { intent: { logitBias: { elara: -100 } } } : {}),
    });
    settlements.push(Promise.allSettled([sending]));
    return sending;
  };
  try {
    await prove({
      h,
      peer,
      events,
      toolName: TOOL_NAME,
      chatPath: tokenize ? "/v1/chat/completions" : hosted.pathname,
      retryScheduled: retryScheduled.promise,
      retries: () => retries,
      pendingTurnTimeouts: () => [...pendingTimeouts].filter(([identity]) => !precedingTimeouts.has(identity)).map(([, ms]) => ms),
      completed,
      start,
      toolWrites: async () =>
        await h.root.db
          .select()
          .from(pluginKv)
          .where(and(eq(pluginKv.pluginId, installed.outcome.id), eq(pluginKv.ownerId, h.owner.userId), eq(pluginKv.key, TOOL_RAN))),
    });
  } finally {
    await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
    peer.closeConnections();
    await Promise.all(settlements);
    await h.root.settleBackground();
    unsubscribe();
  }
}
