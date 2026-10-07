// The real chat abort verb must close the provider socket, not merely close the client slot.
// A loopback HTTP peer observes cancellation across the engine, bridge, executor and OpenRouter SDK.
import { once } from "node:events";
import type { ServerResponse } from "node:http";
import { createServer } from "node:http";
import { userConnections } from "@orb/db";
import { createInferenceRuntime } from "@orb/inference";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/contract/context.ts";
import { createRunChatTurnBridge } from "../../../../../packages/server/src/entry/compose/chat.ts";
import { fakeApiKeySecret, fakeDeps, fakeResolved } from "../../../../inference/_support.ts";
import type { ChatScenario } from "../../../../support/chat/scenario.ts";
import { scenario } from "../../../../support/chat/scenario.ts";
import { tape } from "../../../../support/chat/tape.ts";
import { makeCapability, makeGenerationCapability } from "../../../../support/factories/resolved-connection.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { terminalSseLine } from "../../../../support/provider-stream.ts";

const FIRST_DELTA = 'data: {"id":"cancel-test","choices":[{"index":0,"delta":{"content":"first"},"finish_reason":null}]}\n\n';
const LATE_DELTA = 'data: {"choices":[{"index":0,"delta":{"content":"late"},"finish_reason":null}]}\n\n';
const TOOL_NAME = "cancel_fixture_tool";
const TOOL_DELTA = `data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_fixture","type":"function","function":{"name":"${TOOL_NAME}","arguments":"{}"}}]},"finish_reason":null}]}\n\n`;

interface ProviderPeer {
  readonly completes: boolean;
  readonly baseUrl: string;
  readonly requests: string[];
  readonly responses: ServerResponse[];
  readonly arrived: Promise<void>;
  readonly disconnected: Promise<void>;
  readonly stopped: () => boolean;
  readonly writeLate: () => boolean | undefined;
  readonly close: () => Promise<void>;
}

interface CancellationHarness {
  readonly chat: ChatScenario;
  readonly retries: string[];
  readonly retryScheduled: Promise<void>;
  readonly toolCalls: string[];
  readonly rpgCompleted: string[];
  readonly close: () => Promise<void>;
}

async function providerPeer(mode: "stream" | "headers" | "retry" | "complete"): Promise<ProviderPeer> {
  const arrived = Promise.withResolvers<void>();
  const disconnected = Promise.withResolvers<void>();
  const requests: string[] = [];
  const responses: ServerResponse[] = [];
  let stopped = false;
  const server = createServer((req, res) => {
    requests.push(req.url ?? "");
    responses.push(res);
    req.resume();
    res.on("close", () => {
      if (!res.writableFinished) {
        stopped = true;
        disconnected.resolve();
      }
    });
    if (mode === "retry") {
      res.writeHead(503, { "content-type": "application/json" });
      res.end('{"error":{"message":"retry fixture","code":503}}');
    } else if (mode !== "headers") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(FIRST_DELTA);
      if (requests.length === 1) {
        res.write(TOOL_DELTA);
      }
      if (mode === "complete") {
        res.end(`${terminalSseLine({ finishReason: requests.length === 1 ? "tool_calls" : "stop", delta: {} })}\n\ndata: [DONE]\n\n`);
      }
    }
    arrived.resolve();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("loopback provider did not acquire a TCP port");
  }
  return {
    completes: mode === "complete",
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    responses,
    arrived: arrived.promise,
    disconnected: disconnected.promise,
    stopped: (): boolean => stopped,
    writeLate: (): boolean | undefined => responses[0]?.write(LATE_DELTA),
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((err) => (err === undefined ? resolve() : reject(err))));
    },
  };
}

async function cancellationScenario(peer: ProviderPeer, rescue?: AbortSignal, tokenize = false): Promise<CancellationHarness> {
  const retryScheduled = Promise.withResolvers<void>();
  const retries: string[] = [];
  const toolCalls: string[] = [];
  const rpgCompleted: string[] = [];
  const unreachable = (): never => {
    throw new Error("unexpected RPG operation in cancellation fixture");
  };
  const rpg: NonNullable<ChatContext["rpg"]> = {
    planGameBirth: unreachable,
    gameBirthCommitted: unreachable,
    resolvePresetOverride: () => Promise.resolve(null),
    resolveUserMacros: () => Promise.resolve([]),
    gatherTurnContext: () => Promise.resolve(null),
    markDicePreRollEligible: () => undefined,
    onUserCommit: () => Promise.resolve(),
    onTurnCompleted: (_chatId, _messageId, _variantId, turnId) => {
      rpgCompleted.push(turnId);
      return Promise.resolve();
    },
    onTurnAborted: () => Promise.resolve(),
    cancelStateRounds: () => 0,
    resolveGmSeatHolderKind: () => Promise.resolve(null),
    resolveReasoningHostOnly: () => Promise.resolve(false),
    forkGame: unreachable,
    handoffHealStatements: unreachable,
    handoffWouldCopyGmPreset: unreachable,
    handoffRekeyActors: unreachable,
  };
  const runtime = await createInferenceRuntime({
    ...fakeDeps({ fetch }),
    random: () => 0.5,
    addSpanEvent: (name) => {
      retries.push(name);
      if (name === "provider.retry") {
        retryScheduled.resolve();
      }
    },
  });
  const connection = fakeResolved({
    task: "chat",
    providerId: tokenize ? "custom-openai" : "openrouter",
    model: "cancel-fixture",
    capability: makeCapability(makeGenerationCapability({ sampling: { logitBias: true }, tools: { parallel: true } })),
    secret: fakeApiKeySecret("local-fixture-key"),
    baseUrl: peer.baseUrl,
    ...(tokenize ? { declaredFeatures: { tokenizeApi: "vllm" as const } } : {}),
  });
  const bridge = createRunChatTurnBridge({
    runChatTurn: (req) =>
      runtime.executor.runChatTurn({
        ...req,
        ...(rescue === undefined ? {} : { signal: rescue }),
        ...(tokenize ? { params: { ...req.params, logitBias: { elara: -100 } } } : {}),
      }),
  });
  const chat = await scenario.chat(tape(), {
    connection,
    characters: peer.completes ? ["aria"] : ["aria", "beth"],
    autoMode: !peer.completes,
    autoModeMaxTurns: 3,
    ctx: {
      runChatTurn: bridge,
      rpg,
      teaching: [{ id: "cancellation-fixture", order: 1, collect: () => Promise.resolve({ injections: [], toolNames: [TOOL_NAME] }) }],
      tools: {
        resolveTools: (_ownerId, names) => names,
        toToolDefinitions: () => [{ name: TOOL_NAME, description: "A cancellation fixture tool", parameters: { type: "object" }, inputShape: {} }],
        prepareExecution: () =>
          Promise.resolve((calls) => {
            toolCalls.push(...calls.map((call) => call.name));
            return Promise.resolve(calls.map((call) => ({ ...call, result: "done", isError: false, durationMs: 0 })));
          }),
      },
    },
  });
  await seedUser(chat.db, { id: connection.ownerId });
  await chat.db.insert(userConnections).values({
    id: connection.connectionId,
    ownerId: connection.ownerId,
    label: "Cancellation fixture",
    providerId: connection.providerId,
    model: connection.model,
    createdAt: chat.ctx.now(),
    updatedAt: chat.ctx.now(),
  });
  return { chat, retries, retryScheduled: retryScheduled.promise, toolCalls, rpgCompleted, close: (): Promise<void> => runtime.localLight.close() };
}

test("completed wire tool calls execute and launch the RPG completion hook in the same fixture", async () => {
  const peer = await providerPeer("complete");
  const harness = await cancellationScenario(peer);
  try {
    expect(await harness.chat.send("hello")).toMatchObject({ aborted: false });
    expect(harness.toolCalls).toEqual([TOOL_NAME]);
    expect(harness.rpgCompleted).toHaveLength(1);
    expect(peer.requests).toEqual(["/chat/completions", "/chat/completions"]);
    expect((await harness.chat.loadCanon()).map((row) => row.role)).toEqual(["user", "assistant"]);
  } finally {
    await peer.close();
    await harness.close();
  }
});

test("Stop while resolving word bias closes the actual tokenize request before generation", async () => {
  const peer = await providerPeer("headers");
  const harness = await cancellationScenario(peer, undefined, true);
  const pending = harness.chat.send("hello");
  try {
    await peer.arrived;
    expect(peer.requests).toEqual(["/tokenize"]);
    await harness.chat.turn.abort({ principal: harness.chat.principal(), chatId: harness.chat.chatId });
    await expect.poll(peer.stopped).toBe(true);
    expect(await pending).toMatchObject({ aborted: true, abortReason: "user" });
    expect(peer.requests).toEqual(["/tokenize"]);
    expect((await harness.chat.loadCanon()).map((row) => row.role)).toEqual(["user"]);
  } finally {
    await peer.close();
    await pending;
    await harness.close();
  }
});

for (const phase of ["stream", "headers"] as const) {
  test(`Stop during ${phase} cancels actual OpenRouter HTTP work without retry or chained generation`, async () => {
    const peer = await providerPeer(phase);
    const harness = await cancellationScenario(peer);
    try {
      const pending = harness.chat.send("hello");
      await peer.arrived;
      await expect.poll(() => phase !== "stream" || harness.chat.events.some((event) => event.type === "delta")).toBe(true);
      await harness.chat.turn.abort({ principal: harness.chat.principal(), chatId: harness.chat.chatId });
      const outcome = await pending;
      expect(outcome).toMatchObject({ aborted: true, abortReason: "user" });
      await peer.disconnected;
      expect(peer.stopped()).toBe(true);
      expect(peer.responses[0]?.destroyed).toBe(true);
      expect(peer.writeLate()).toBe(false);
      expect(peer.requests).toEqual(["/chat/completions"]);
      expect(harness.retries.filter((name) => name === "provider.retry")).toHaveLength(0);
      expect((await harness.chat.loadCanon()).map((row) => row.role)).toEqual(["user"]);
      expect(harness.chat.events.map((event) => event.type)).toContain("turnAborted");
      expect(harness.chat.events.map((event) => event.type)).not.toContain("turnCompleted");
      expect(harness.chat.activeTurns.countActive(harness.chat.chatId)).toBe(0);
      expect(harness.toolCalls).toEqual([]);
      expect(harness.rpgCompleted).toEqual([]);
    } finally {
      await peer.close();
      await harness.close();
    }
  });
}

test("Stop during an actual HTTP 503 backoff prevents the queued retry and chained generation", async () => {
  const peer = await providerPeer("retry");
  const harness = await cancellationScenario(peer);
  try {
    const pending = harness.chat.send("hello");
    await harness.retryScheduled;
    await harness.chat.turn.abort({ principal: harness.chat.principal(), chatId: harness.chat.chatId });
    expect(await pending).toMatchObject({ aborted: true, abortReason: "user" });
    expect(peer.requests).toEqual(["/chat/completions"]);
    expect(harness.retries.filter((name) => name === "provider.retry")).toHaveLength(1);
    expect((await harness.chat.loadCanon()).map((row) => row.role)).toEqual(["user"]);
    expect(harness.chat.events.map((event) => event.type)).not.toContain("turnCompleted");
    expect(harness.toolCalls).toEqual([]);
    expect(harness.rpgCompleted).toEqual([]);
  } finally {
    await peer.close();
    await harness.close();
  }
});

test("already-cancelled OpenRouter work never opens an HTTP request", async () => {
  const peer = await providerPeer("stream");
  const controller = new AbortController();
  controller.abort();
  const harness = await cancellationScenario(peer, controller.signal);
  try {
    await expect(harness.chat.send("hello")).rejects.toMatchObject({ kind: "aborted", retryable: false });
    expect(peer.requests).toEqual([]);
    expect(harness.retries.filter((name) => name === "provider.retry")).toEqual([]);
  } finally {
    await peer.close();
    await harness.close();
  }
});

test("transport proof distinguishes an unforwarded Stop from a cancelled provider request", async () => {
  const peer = await providerPeer("stream");
  const rescue = new AbortController();
  const harness = await cancellationScenario(peer, rescue.signal);
  try {
    const pending = harness.chat.send("hello");
    await peer.arrived;
    await harness.chat.turn.abort({ principal: harness.chat.principal(), chatId: harness.chat.chatId });
    expect(peer.stopped()).toBe(false);
    expect(peer.responses[0]?.destroyed).toBe(false);
    expect(peer.writeLate()).toBe(true);
    rescue.abort();
    expect(await pending).toMatchObject({ aborted: true, abortReason: "user" });
    await peer.disconnected;
    expect(peer.stopped()).toBe(true);
    expect(peer.writeLate()).toBe(false);
  } finally {
    rescue.abort();
    await peer.close();
    await harness.close();
  }
});
