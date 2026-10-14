// @subject packages/inference/src/backends/agent-sdk/wire-read.ts
// @subject packages/inference/src/backends/agent-sdk/runner.ts
// @subject packages/inference/src/backends/agent-sdk/catalog.ts
import "@orb/testkit/node/composed-real.ts";
import type { ChatDeltaEvent } from "@orb/contracts/chat";
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import { settings } from "@orb/db";
import type { Resolved } from "@orb/inference";
import { ProviderError, toChatRequest } from "@orb/inference";
import { logger, logRing, logSerializers } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createSdkProcessSpawner } from "@orb/testkit/node/sdk-process.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { afterAll, vi } from "vitest";

// Select the real Pino destinations before construction; the scoped runner otherwise silences every sink.
vi.hoisted(() => {
  vi.stubEnv("LOG_LEVEL", "error");
});
afterAll(() => vi.unstubAllEnvs());

const MODEL = "sdk-wire-model";
const SDK_TOKEN = "controlled-wire-oauth-token";

async function rootFor(mode: string): Promise<Awaited<ReturnType<typeof createServerHarness>>> {
  const execute = createSdkProcessSpawner(new URL("./sdk-wire-child.ts", import.meta.url), [mode, MODEL, SDK_TOKEN]);
  return await createServerHarness({
    secretBoxKey: Buffer.alloc(32, 1),
    sdkSpawn: execute,
  });
}

async function savedConnection(root: Awaited<ReturnType<typeof createServerHarness>>): Promise<Resolved<"chat">> {
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: "claude-sub", key: SDK_TOKEN });
  const connection = await root.services.connection.create({
    principal,
    providerId: "claude-sub",
    credentialId: credential.id,
    baseUrl: null,
    model: MODEL,
    allowBackground: true,
    declared: declaredCapabilitySchema.parse({ kind: "generation", generation: { input: ["text", "image"] } }),
  });
  const { resolved } = await root.app.runtime.resolve({ task: "chat", connectionId: connection.id, principal, cachedFacts: true });
  await root.settleBackground();
  return { ...resolved, task: "chat" };
}

test("native SDK numeric accounting preserves two real model costs without coercion", async () => {
  await using root = await rootFor("valid");
  const connection = await savedConnection(root);
  const observed: (number | null)[] = [];
  const result = await root.app.runtime.executor.runChatTurn(
    toChatRequest({
      connection,
      params: {},
      systemPrompt: { static: "", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "wire control" }] }],
      onObservedResult: (value) => {
        observed.push(value.usage.costUsd);
        return Promise.resolve();
      },
    }),
  );
  expect(result.reply).toBe("native wire reply");
  expect(result.usage.costUsd).toBe(3);
  expect(observed).toEqual([3]);
});

test.each(["bad-cost", "bad-tokens", "bad-text"])("native SDK %s refuses before a malformed terminal can reach the observer", async (mode) => {
  await using root = await rootFor(mode);
  const connection = await savedConnection(root);
  const observed: (number | null)[] = [];
  await expect(
    root.app.runtime.executor.runChatTurn(
      toChatRequest({
        connection,
        params: {},
        systemPrompt: { static: "", dynamic: "" },
        history: [{ role: "user", content: [{ type: "text", text: "wire control" }] }],
        onObservedResult: (value) => {
          observed.push(value.usage.costUsd);
          return Promise.resolve();
        },
      }),
    ),
  ).rejects.toThrow("malformed external message fields");
  expect(observed).toEqual([]);
});

test("native SDK model discovery parses the actual valid control response", async () => {
  await using root = await rootFor("valid");
  const connection = await savedConnection(root);
  const principal = await root.principalFor(root.ownerId);
  const listing = await root.services.connection.catalogModels({ principal, connectionId: connection.connectionId });
  expect(listing).toMatchObject({ listed: true, models: [{ id: MODEL }] });
});

test("native SDK malformed model identity refuses instead of entering the catalog", async () => {
  await using root = await rootFor("bad-models");
  const connection = await savedConnection(root);
  const principal = await root.principalFor(root.ownerId);
  const before = await root.db.select().from(settings);
  const listing = await root.services.connection.catalogModels({ principal, connectionId: connection.connectionId });
  expect(listing.listed).toBe(false);
  expect(await root.db.select().from(settings)).toEqual(before);
});

test.each(["valid", "bad-account"])("native SDK %s account diagnostics retain the existing best-effort policy", async (mode) => {
  await using root = await rootFor(mode);
  const connection = await savedConnection(root);
  const principal = await root.principalFor(root.ownerId);
  const verified = await root.services.connection.verifyAuth({ principal, connectionId: connection.connectionId });
  expect(verified.ok).toBe(true);
  expect(verified.costUsd).toBe(3);
  expect(verified.account).toEqual(mode === "bad-account" ? undefined : { email: "native@example.test", apiProvider: "firstParty" });
});

test("native SDK metadata projects actual events and deltas without changing paid-result accounting", async () => {
  await using root = await rootFor("metadata");
  const connection = await savedConnection(root);
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat;
  const events: string[] = [];
  const deltas: ChatDeltaEvent[] = [];
  const result = await root.app.runtime.executor.runChatTurn(
    toChatRequest({
      connection,
      chatId: room.id,
      onDelta: (delta) => deltas.push(delta),
      onEvent: (event) => events.push(event.kind),
      params: {},
      systemPrompt: { static: "", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "wire control" }] }],
    }),
  );
  expect(result.usage.costUsd).toBe(3);
  expect(result.usage.reasoningTokens).toBe(1);
  expect(events).toEqual(expect.arrayContaining(["compaction", "api_retry", "status", "refusal", "rate_limit", "auth_status"]));
  expect(result.events).toContainEqual(expect.objectContaining({ kind: "compaction", trigger: "auto", preTokens: 3, postTokens: 2 }));
  expect(result.events).toContainEqual(expect.objectContaining({ kind: "refusal", retried: true, fallbackModel: `${MODEL}-fallback` }));
  expect(result.rateLimit).toMatchObject({ status: "allowed", utilization: 0.1, isUsingOverage: false });
  expect(deltas).toEqual([{ chatId: room.id, kind: "text", text: "native delta" }]);
});

test.each([
  "bad-meta-compact",
  "bad-meta-retry",
  "bad-meta-status",
  "bad-meta-thinking",
  "bad-meta-refusal",
  "bad-meta-fallback",
  "bad-meta-limit",
  "bad-meta-auth",
  "bad-meta-delta",
])("native SDK %s refuses before its invalid event or terminal observation", async (mode) => {
  await using root = await rootFor(mode);
  const connection = await savedConnection(root);
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [], opening: "none" })).chat;
  const events: string[] = [];
  const deltas: ChatDeltaEvent[] = [];
  const observed: (number | null)[] = [];
  await expect(
    root.app.runtime.executor.runChatTurn(
      toChatRequest({
        connection,
        chatId: room.id,
        onDelta: (delta) => deltas.push(delta),
        onEvent: (event) => events.push(event.kind),
        onObservedResult: (value) => {
          observed.push(value.usage.costUsd);
          return Promise.resolve();
        },
        params: {},
        systemPrompt: { static: "", dynamic: "" },
        history: [{ role: "user", content: [{ type: "text", text: "wire control" }] }],
      }),
    ),
  ).rejects.toThrow("malformed external message fields");
  expect(events).toEqual([]);
  expect(deltas).toEqual([]);
  expect(observed).toEqual([]);
});

test("native SDK malformed property paths never survive in error serialization or the actual logger", async ({ ids }) => {
  await using root = await rootFor("bad-secret-path");
  const connection = await savedConnection(root);
  const observed: (number | null)[] = [];
  const failure = await root.app.runtime.executor
    .runChatTurn(
      toChatRequest({
        connection,
        params: {},
        systemPrompt: { static: "", dynamic: "" },
        history: [{ role: "user", content: [{ type: "text", text: "wire error hygiene" }] }],
        onObservedResult: (value) => {
          observed.push(value.usage.costUsd);
          return Promise.resolve();
        },
      }),
    )
    .then(
      () => {
        throw new Error("malformed native SDK result unexpectedly succeeded");
      },
      (error: unknown) => {
        if (!(error instanceof ProviderError)) {
          throw new Error("native SDK returned a non-provider refusal", { cause: error });
        }
        return error;
      },
    );
  const caseId = ids.uuid();
  logger.error({ err: failure, caseId }, "native SDK malformed wire refusal");
  const logged = logRing.recent(100).filter((line) => line.includes(caseId));
  expect(logged).toHaveLength(1);
  expect(logged.join("\n")).not.toContain(SDK_TOKEN);
  expect(JSON.stringify(logSerializers.err(failure))).not.toContain(SDK_TOKEN);
  expect(failure.message).toBe("agent-sdk: malformed external message fields");
  expect(failure.toLog()).toMatchObject({ kind: "server", retryable: true });
  expect(JSON.stringify(failure.toLog())).not.toContain(SDK_TOKEN);
  expect(failure.cause).toBeUndefined();
  expect(observed).toEqual([]);
});
