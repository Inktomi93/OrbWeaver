import "./composed-real.ts";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import process from "node:process";
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import type { AgentSdkQuery, AgentSdkSpawn, Resolved } from "@orb/inference";
import { logRing } from "@orb/server/foundation/observability";
import { sql } from "drizzle-orm";
import { afterAll, vi } from "vitest";
import { expect, test } from "./fixtures.ts";
import { createSdkProcessSpawner } from "./sdk-process.ts";
import { createServerHarness } from "./server.ts";

// Select the real logger destinations before construction; the runner otherwise disables every log sink.
vi.hoisted(() => {
  vi.stubEnv("LOG_LEVEL", "error");
});
afterAll(() => vi.unstubAllEnvs());

const SDK_TOKEN = 'controlled-sdk-"<cross-chunk>\\token';

async function savedSummarizer(harness: Awaited<ReturnType<typeof createServerHarness>>, token = SDK_TOKEN): Promise<Resolved<"summarize">> {
  const principal = await harness.principalFor(harness.ownerId);
  const credential = await harness.services.credentials.add({ principal, provider: "claude-sub", key: token });
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

test("root cancellation joins its actual SDK child and owned grandchild exit before database cleanup", async () => {
  const execute = createSdkProcessSpawner(new URL("./sdk-timer-process.mjs", import.meta.url));
  const ready = Promise.withResolvers<number>();
  const eof = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  let child: ChildProcessWithoutNullStreams | undefined;
  let descendantExited = false;
  const spawn: AgentSdkSpawn = (options) => {
    child = execute(options);
    child.once("close", () => closed.resolve());
    child.stderr.on("data", (bytes: Buffer) => {
      const text = bytes.toString("utf8");
      const match = /sdk-owned:descendant:(\d+)/u.exec(text);
      if (match !== null) {
        ready.resolve(Number(match[1]));
      }
      if (text.includes("sdk-owned:stdin-eof")) {
        eof.resolve();
      }
      if (text.includes("sdk-owned:descendant-exit:")) {
        descendantExited = true;
      }
    });
    return child;
  };
  await using harness = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: spawn });
  const connection = await savedSummarizer(harness);
  const turn = harness.app.runtime.executor
    .summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "SDK_OWNED_DESCENDANT SDK_HOLD_UNTIL_CANCEL" }] })
    .then(
      () => {
        throw new Error("cancelled native turn unexpectedly succeeded");
      },
      (error: unknown) => error,
    );
  const pid = await ready.promise;
  let disposed = false;
  const disposal = harness[Symbol.asyncDispose]().then(() => {
    disposed = true;
  });
  try {
    expect(await Promise.race([eof.promise.then(() => "eof"), disposal.then(() => "disposed")])).toBe("eof");
    expect(disposed).toBe(false);
    expect(descendantExited).toBe(false);
    expect(() => process.kill(pid, 0)).not.toThrow();
    expect(await harness.db.all(sql`select 1 as live`)).toEqual([{ live: 1 }]);
  } finally {
    child?.stdin.end();
    process.kill(pid, "SIGUSR1");
    await Promise.all([disposal, closed.promise]);
  }
  expect(await turn).toMatchObject({ kind: "aborted" });
  expect(descendantExited).toBe(true);
  expect(child?.exitCode).toBe(0);
  expect(() => process.kill(pid, 0)).toThrow();
  await expect(harness.db.all(sql`select 1`)).rejects.toThrow();
  expect(harness.timers.pending()).toBe(0);
});

test("normal native SDK settlement waits for its owned descendant exit, not only result or Query cleanup", async () => {
  const execute = createSdkProcessSpawner(new URL("./sdk-timer-process.mjs", import.meta.url));
  const ready = Promise.withResolvers<number>();
  const eof = Promise.withResolvers<void>();
  let child: ChildProcessWithoutNullStreams | undefined;
  let descendantExited = false;
  const spawn: AgentSdkSpawn = (options) => {
    child = execute(options);
    child.stderr.on("data", (bytes: Buffer) => {
      const text = bytes.toString("utf8");
      const match = /sdk-owned:descendant:(\d+)/u.exec(text);
      if (match !== null) {
        ready.resolve(Number(match[1]));
      }
      if (text.includes("sdk-owned:stdin-eof")) {
        eof.resolve();
      }
      if (text.includes("sdk-owned:descendant-exit:")) {
        descendantExited = true;
      }
    });
    return child;
  };
  await using harness = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: spawn });
  const connection = await savedSummarizer(harness);
  let settled = false;
  const result = harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "SDK_OWNED_DESCENDANT" }] }).then((value) => {
    settled = true;
    return value;
  });
  const pid = await ready.promise;
  try {
    await eof.promise;
    expect(settled).toBe(false);
    expect(descendantExited).toBe(false);
    expect(() => process.kill(pid, 0)).not.toThrow();
  } finally {
    process.kill(pid, "SIGUSR1");
    expect((await result).items[0]?.text).toBe("settled native SDK reply");
  }
  expect(descendantExited).toBe(true);
  expect(child?.exitCode).toBe(0);
  expect(() => process.kill(pid, 0)).toThrow();
});

test("raw SDK startup failure retains scrubbed split-UTF8 stderr diagnostics and joins the real child", async () => {
  const execute = createSdkProcessSpawner(new URL("./sdk-timer-process.mjs", import.meta.url));
  let child: ChildProcessWithoutNullStreams | undefined;
  const spawn: AgentSdkSpawn = (options) => {
    child = execute(options);
    return child;
  };
  await using harness = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: spawn });
  const connection = await savedSummarizer(harness);
  await expect(
    harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "SDK_DIAGNOSTIC_CRASH" }] }),
  ).rejects.toMatchObject({ kind: "server" });
  expect(child?.exitCode).toBe(7);
  const diagnostics = logRing.recent(100).filter((line) => line.includes("sdk-diagnostic:"));
  expect(diagnostics).toHaveLength(1);
  const text = diagnostics.join("\n");
  expect(text).toContain("café");
  expect(text).toContain("complete");
  expect(text.includes(SDK_TOKEN)).toBe(false);
  expect(text.includes(JSON.stringify(SDK_TOKEN).slice(1, -1))).toBe(false);
  expect(text.includes(SDK_TOKEN.slice(0, 12))).toBe(false);
});

test("native catalog and verify queries close their actual children after native control probes", async () => {
  const execute = createSdkProcessSpawner(new URL("./sdk-timer-process.mjs", import.meta.url));
  const children: ChildProcessWithoutNullStreams[] = [];
  const closed = new Set<ChildProcessWithoutNullStreams>();
  const spawn: AgentSdkSpawn = (options) => {
    expect(options.env["CLAUDE_CODE_OAUTH_TOKEN"] === SDK_TOKEN).toBe(true);
    expect(options.env["ANTHROPIC_API_KEY"]).toBeUndefined();
    const child = execute(options);
    children.push(child);
    child.once("close", () => closed.add(child));
    return child;
  };
  await using harness = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: spawn });
  const connection = await savedSummarizer(harness);
  const listing = await harness.app.runtime.diagnostics.listModels({ connection });
  expect(listing).toEqual({ listed: false, reason: "the provider listed no models" });
  expect(children).toHaveLength(1);
  expect(children.every((child) => closed.has(child) && child.exitCode === 0)).toBe(true);
  const verified = await harness.app.runtime.diagnostics.verifyAuth({ connection });
  expect(verified).toMatchObject({ source: "max-pro-sub", ok: true, reply: "settled native SDK reply" });
  expect(children).toHaveLength(2);
  expect(children.every((child) => closed.has(child) && child.exitCode === 0)).toBe(true);
});

test("unexpected physical stderr failure stays visible at graph settlement without stranding cleanup", async () => {
  const execute = createSdkProcessSpawner(new URL("./sdk-timer-process.mjs", import.meta.url));
  const failure = new Error("controlled SDK diagnostic read failed");
  let child: ChildProcessWithoutNullStreams | undefined;
  const spawn: AgentSdkSpawn = (options) => {
    child = execute(options);
    const owned = child;
    owned.stderr.once("data", () => owned.stderr.destroy(failure));
    return owned;
  };
  await using harness = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: spawn });
  const connection = await savedSummarizer(harness);
  await expect(
    harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "SDK_DIAGNOSTIC_CRASH" }] }),
  ).rejects.toMatchObject({ kind: "server" });
  await expect(harness[Symbol.asyncDispose]()).rejects.toBeInstanceOf(AggregateError);
  expect(child?.exitCode).not.toBeNull();
  await expect(harness.db.all(sql`select 1`)).rejects.toThrow();
  expect(harness.timers.pending()).toBe(0);
});

test("native raw exit diagnostics include stderr drained by a real descendant after the direct child exits", async () => {
  const execute = createSdkProcessSpawner(new URL("./sdk-timer-process.mjs", import.meta.url));
  let child: ChildProcessWithoutNullStreams | undefined;
  const spawn: AgentSdkSpawn = (options) => {
    child = execute(options);
    return child;
  };
  await using harness = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: spawn });
  const connection = await savedSummarizer(harness);
  await expect(harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "SDK_LATE_DIAGNOSTIC" }] })).rejects.toMatchObject(
    { kind: "server" },
  );
  expect(child?.exitCode).toBe(7);
  const lines = logRing.recent(100).filter((line) => line.includes("sdk-late-diagnostic:"));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain("café complete");
});

// Deliberately public fixture material; repeated bytes expose redaction boundaries without real credentials.
const PUBLIC_OVERLAP_TOKEN = "aaaaaaaaaaaaaaaa";
test("native stderr never publishes overlapping public fixture credential fragments across chunks", async () => {
  const execute = createSdkProcessSpawner(new URL("./sdk-timer-process.mjs", import.meta.url));
  const spawn: AgentSdkSpawn = (options) => {
    const child = execute(options);
    child.stderr.once("data", () => child.kill("SIGUSR2"));
    return child;
  };
  await using harness = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: spawn });
  const connection = await savedSummarizer(harness, PUBLIC_OVERLAP_TOKEN);
  await expect(
    harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "SDK_OVERLAP_DIAGNOSTIC" }] }),
  ).rejects.toMatchObject({ kind: "server" });
  const lines = logRing.recent(100).filter((line) => line.includes("sdk-overlap-diagnostic:"));
  expect(lines).toHaveLength(1);
  expect(lines.some((line) => line.includes(PUBLIC_OVERLAP_TOKEN.slice(0, 8)))).toBe(false);
  expect(lines[0]).toContain("complete");
});

// Public synthetic fixture material; this shape deliberately triggers the generic sk-token fallback.
const PUBLIC_SHAPED_TOKEN = `sk-${"P".repeat(80)}-public-fixture-tail`;
test.each(["intact", "split"] as const)("native stderr protects a known sk-shaped public credential (%s)", async (mode) => {
  const execute = createSdkProcessSpawner(new URL("./sdk-timer-process.mjs", import.meta.url));
  const spawn: AgentSdkSpawn = (options) => {
    const child = execute(options);
    if (mode === "split") {
      child.stderr.once("data", () => child.kill("SIGUSR2"));
    }
    return child;
  };
  await using harness = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: spawn });
  const connection = await savedSummarizer(harness, PUBLIC_SHAPED_TOKEN);
  await expect(
    harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: `SDK_SHAPED_DIAGNOSTIC:${mode}` }] }),
  ).rejects.toMatchObject({ kind: "server" });
  const lines = logRing.recent(100).filter((line) => line.includes(`sdk-shaped-diagnostic:${mode}:`));
  expect(lines).toHaveLength(1);
  expect(lines.some((line) => line.includes(PUBLIC_SHAPED_TOKEN))).toBe(false);
  expect(lines.some((line) => line.includes(PUBLIC_SHAPED_TOKEN.slice(32)))).toBe(false);
  expect(lines[0]).toContain("complete");
});
