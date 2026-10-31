// Loopback HTTP, native provider conversion and an installed guest expose Stop beyond the room's bus.
import { spawn } from "node:child_process";
import { once } from "node:events";
import type { ServerResponse } from "node:http";
import { createServer } from "node:http";
import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent, TurnOutcome } from "@orb/contracts/chat";
import { builtinProvider } from "@orb/contracts/inference";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
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
import type { MockInstance } from "vitest";
import { beforeAll, vi } from "vitest";
import { z } from "zod";

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
  /** The witness key the tool handler writes, as the plugin's own storage reads it back. */
  readonly toolWrites: () => Promise<readonly string[]>;
}

/** What the root's physical edges read about the run in flight: the peer to forward to and the failure count that admits backoff. */
interface RunState {
  readonly peer: Awaited<ReturnType<typeof providerPeer>>;
  readonly tokenize: boolean;
  readonly retryScheduled: PromiseWithResolvers<number>;
  readonly retries: number[];
  failedResponses: number;
  scheduledAfterFailure: number;
}

const CANCELLATION_MODEL = "controlled-cancellation-model";
const CANCELLATION_KEY = "controlled-loopback-cancellation-key";
export interface CancellationRoom extends AsyncDisposable {
  /** Run one case in a fresh chat of this room; the callback owns every running public request until settlement. */
  readonly run: (mode: (typeof MODES)[number], prove: (fixture: CancellationRun) => Promise<void>, tokenize?: boolean) => Promise<void>;
}

/** Boot the root, the hosted connection and the enabled guest once, so a case pays only for its own peer and chat.
 *  @remarks The guest host is a spawned process whose boot dominates a case's wall time under load. */
async function cancellationRoom(): Promise<CancellationRoom> {
  await using construction = new AsyncDisposableStack();
  const official = builtinProvider("openrouter")?.baseUrl;
  if (official === undefined) {
    throw new Error("the canonical OpenRouter provider has no hosted endpoint");
  }
  const hostedChatUrl = `${official.replace(/\/$/u, "")}/chat/completions`;
  const hosted = new URL(hostedChatUrl);
  const corpusOrigin = new URL(CORPUS_PROVIDER_ENDPOINT).origin;
  const clock = createFrozenClock();
  // biome-ignore lint/nursery/useDisposables: construction.move transfers this owner to the returned room; local using would close it before the cases run.
  const timers = construction.use(createControlledTimers(clock));
  let current: RunState | undefined;
  const pendingTimeouts = new Map<symbol, number>();
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused cancellation corpus reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const characters = ["aria", "beth"].map((name) => createCharacterSchema.parse({ handle: name, name, description: `${name} is a seated witness.` }));
  const h = construction.use(
    await createChatRoot({
      memoryEnabled: false,
      characters,
      group: { output: "per-speaker", policy: "list" },
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
            if (current !== undefined && current.failedResponses > current.scheduledAfterFailure) {
              current.scheduledAfterFailure = current.failedResponses;
              current.retries.push(ms);
              current.retryScheduled.resolve(ms);
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
        const run = current;
        const custom = run?.tokenize === true && url.origin === run.peer.baseUrl && ["/tokenize", "/v1/chat/completions"].includes(url.pathname);
        if (run !== undefined && request.method === "POST" && (request.url === hostedChatUrl || custom)) {
          const response = await fetch(new URL(url.pathname + url.search, run.peer.baseUrl), {
            method: request.method,
            headers: request.headers,
            body: await request.arrayBuffer(),
            signal: request.signal,
          });
          if (response.status === 503) {
            run.failedResponses += 1;
          }
          return response;
        }
        if (url.origin === corpusOrigin) {
          return await corpus.execute(request);
        }
        throw new Error(`unscripted cancellation provider URL: ${request.url}`);
      },
    }),
  );
  const hostedCredential = await h.root.services.credentials.add({ principal: h.owner, provider: "openrouter", key: CANCELLATION_KEY });
  const hostedConnection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "openrouter",
    credentialId: hostedCredential.id,
    baseUrl: null,
    model: CANCELLATION_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, tools: { parallel: true }, sampling: { logitBias: true } },
      features: { detectServer: false },
    },
  });
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
  const witness = async (fn: "storage.get" | "storage.delete"): Promise<string> =>
    (await h.root.services.plugin.uiHostCall({ caller: h.owner, pluginId: installed.outcome.id, fn, argsJson: JSON.stringify([TOOL_RAN]) })).resultJson;

  const run: CancellationRoom["run"] = async (mode, prove, tokenize = false) => {
    await using peer = await providerPeer(mode);
    // The guest's storage outlives a case, so each case starts from a witness no earlier tool run wrote.
    await witness("storage.delete");
    const state: RunState = { peer, tokenize, retryScheduled: Promise.withResolvers<number>(), retries: [], failedResponses: 0, scheduledAfterFailure: 0 };
    if (tokenize) {
      const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "custom-openai", key: CANCELLATION_KEY });
      const connection = await h.root.services.connection.create({
        principal: h.owner,
        providerId: "custom-openai",
        credentialId: credential.id,
        baseUrl: peer.baseUrl,
        model: CANCELLATION_MODEL,
        declared: {
          kind: "generation",
          generation: { input: ["text"], context: { window: 32_000 }, tools: { parallel: true }, sampling: { logitBias: true } },
          features: { detectServer: false, tokenizeApi: "vllm" },
        },
      });
      await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
    } else {
      await h.caller.connection.setBinding({ task: "chat", connectionId: hostedConnection.id });
    }
    // The completion case seats one character; every other case seats both so the auto-mode chain has a next speaker.
    const seated = (mode === "complete" ? h.characters.slice(0, 1) : h.characters).map(({ id }) => id);
    const { chat } = await h.caller.chat.startChat({ characterIds: seated, opening: "none" });
    await h.caller.chat.setGroupConfig({
      chatId: chat.id,
      config: { output: "per-speaker", policy: "list", autoMode: mode !== "complete", autoModeMaxTurns: 3, autoModeDelayMs: 0 },
    });
    await h.root.settleBackground();
    const chatId = chat.id;
    current = state;
    let precedingTimeouts = new Set<symbol>();
    using completed = vi.spyOn(h.root.app.rpgChatOps, "onTurnCompleted");
    const events: ChatBusEvent[] = [];
    const unsubscribe = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => events.push(event));
    const settlements: Promise<PromiseSettledResult<TurnOutcome>[]>[] = [];
    const start = (): Promise<TurnOutcome> => {
      precedingTimeouts = new Set(pendingTimeouts.keys());
      const sending = h.root.services.chat.send({
        principal: h.owner,
        chatId,
        content: "hello",
        ...(tokenize ? { intent: { logitBias: { elara: -100 } } } : {}),
      });
      settlements.push(Promise.allSettled([sending]));
      return sending;
    };
    try {
      await prove({
        h: { ...h, chatId },
        peer,
        events,
        toolName: TOOL_NAME,
        chatPath: tokenize ? "/v1/chat/completions" : hosted.pathname,
        retryScheduled: state.retryScheduled.promise,
        retries: () => state.retries,
        pendingTurnTimeouts: () => [...pendingTimeouts].filter(([identity]) => !precedingTimeouts.has(identity)).map(([, ms]) => ms),
        completed,
        start,
        toolWrites: async () => {
          const value = z
            .string()
            .nullable()
            .parse(JSON.parse(await witness("storage.get")));
          return value === null ? [] : [value];
        },
      });
    } finally {
      await h.root.services.chat.abort({ principal: h.owner, chatId });
      peer.closeConnections();
      await Promise.all(settlements);
      await h.root.settleBackground();
      unsubscribe();
      current = undefined;
    }
  };
  const lifetime = construction.move();
  return { run, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

/** Register one room for the calling file: booted in a hook, disposed from the hook's teardown, and shared by every case in the file. */
export function registerCancellationRoom(): CancellationRoom["run"] {
  const shared = Promise.withResolvers<CancellationRoom>();
  beforeAll(async (): Promise<() => Promise<void>> => {
    const room = await cancellationRoom();
    shared.resolve(room);
    return async (): Promise<void> => {
      await room[Symbol.asyncDispose]();
    };
  });
  return async (mode, prove, tokenize) => await (await shared.promise).run(mode, prove, tokenize);
}
