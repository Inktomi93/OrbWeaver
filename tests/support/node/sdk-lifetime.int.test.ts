import "./composed-real.ts";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import type { AgentSdkQuery, AgentSdkSpawn, Resolved } from "@orb/inference";
import { vi } from "vitest";
import { expect, test } from "./fixtures.ts";
import { createSdkProcessSpawner } from "./sdk-process.ts";
import { createServerHarness } from "./server.ts";

async function savedSummarizer(harness: Awaited<ReturnType<typeof createServerHarness>>): Promise<Resolved<"summarize">> {
  const principal = await harness.principalFor(harness.ownerId);
  const credential = await harness.services.credentials.add({ principal, provider: "claude-sub", key: "controlled-sdk-oauth-token" });
  const connection = await harness.services.connection.create({
    principal,
    providerId: "claude-sub",
    credentialId: credential.id,
    baseUrl: null,
    model: "sdk-lifetime-model",
    allowBackground: true,
    declared: declaredCapabilitySchema.parse({ kind: "generation", generation: { input: ["text", "image"] } }),
  });
  const { resolved } = await harness.app.runtime.resolve({ task: "summarize", connectionId: connection.id, principal, cachedFacts: true });
  expect(resolved.api).toBe("agent-sdk");
  expect(resolved.task).toBe("summarize");
  await harness.settleBackground();
  return { ...resolved, task: "summarize" };
}

test("synchronous SDK execution refusal releases the already-armed side-generation idle timer", async () => {
  const failure = new Error("controlled synchronous SDK execution refusal");
  let atExecution = -1;
  let readPending = (): number => -1;
  const execute: AgentSdkQuery = vi.fn((): never => {
    atExecution = readPending();
    throw failure;
  });
  await using harness = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkQuery: execute });
  const connection = await savedSummarizer(harness);
  readPending = harness.timers.pending;
  const before = readPending();
  await expect(harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "timer control" }] })).rejects.toThrow();
  expect(execute).toHaveBeenCalled();
  expect(atExecution).toBe(before + 1);
  expect(readPending()).toBe(before);
});

test("asynchronous prompt preparation refusal releases idle ownership before SDK execution", async () => {
  const execute: AgentSdkQuery = vi.fn((): never => {
    throw new Error("SDK execution must not receive the refused prompt");
  });
  await using harness = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkQuery: execute });
  const connection = await savedSummarizer(harness);
  const before = harness.timers.pending();
  await expect(
    harness.app.runtime.executor.summarize({
      connection,
      inputs: [{ systemPrompt: "", userPrompt: "timer control", images: ["data:text/plain;base64,AA=="] }],
    }),
  ).rejects.toThrow("the Anthropic wire takes");
  expect(execute).not.toHaveBeenCalled();
  expect(harness.timers.pending()).toBe(before);
});

test("native SDK Query keeps idle ownership while its physical stream is active and clears it on normal settlement", async () => {
  const execute = createSdkProcessSpawner(new URL("./sdk-timer-process.mjs", import.meta.url));
  const closed = Promise.withResolvers<void>();
  const firstOutput = Promise.withResolvers<void>();
  let child: ChildProcessWithoutNullStreams | undefined;
  let readPending = (): number => -1;
  let atOutput = -1;
  const spawn: AgentSdkSpawn = vi.fn((options) => {
    child = execute(options);
    child.once("close", () => closed.resolve());
    child.stdout.once("data", () => {
      atOutput = readPending();
      firstOutput.resolve();
    });
    return child;
  });
  await using harness = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: spawn });
  const connection = await savedSummarizer(harness);
  readPending = harness.timers.pending;
  const before = readPending();
  try {
    const result = harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "timer control" }] });
    await firstOutput.promise;
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(atOutput).toBe(before + 1);
    expect((await result).items[0]?.text).toBe("settled native SDK reply");
    await closed.promise;
    expect(readPending()).toBe(before);
    expect(child?.exitCode).toBe(0);
    expect(child?.signalCode).toBeNull();
  } finally {
    if (child !== undefined) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
      await closed.promise;
    }
  }
});
