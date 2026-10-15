import "./composed-real.ts";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import process from "node:process";
import { declaredCapabilitySchema } from "@orb/contracts/inference";
import type { VerifyAuthResult } from "@orb/contracts/providers";
import type { AgentSdkNativeOptions, AgentSdkQuery, AgentSdkSpawn, ChatResult, Resolved } from "@orb/inference";
import { ProviderError, toChatRequest } from "@orb/inference";
import { logRing, runInRequest } from "@orb/server/foundation/observability";
import { sql } from "drizzle-orm";
import { afterAll, vi } from "vitest";
import { z } from "zod";
import { expect, test } from "./fixtures.ts";
import { createSdkProcessIdentity, createSdkProcessSpawner } from "./sdk-process.ts";
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

function nativeSdkOptions(onNativeProcessCreated?: NonNullable<AgentSdkNativeOptions["onNativeProcessCreated"]>): AgentSdkNativeOptions {
  const identify = createSdkProcessIdentity();
  return {
    executable: "node",
    executableArgs: ["--no-warnings"],
    pathToClaudeCodeExecutable: new URL("./sdk-timer-process.mjs", import.meta.url).pathname,
    onNativeProcessCreated: (child): void => {
      identify(child);
      onNativeProcessCreated?.(child);
    },
  };
}

test("physical SDK identity replays deterministically without colliding across custom and direct-native launches", async () => {
  const frameSchema = z.object({ type: z.string(), uuid: z.uuid(), ["session_id"]: z.uuid() });
  const replay = async (native: boolean): Promise<z.infer<typeof frameSchema>[][]> => {
    const launches: string[] = [];
    const observe = (child: ChildProcessWithoutNullStreams): void => {
      const index = launches.length;
      launches.push("");
      child.stdout.on("data", (bytes: Buffer) => {
        launches[index] += bytes.toString("utf8");
      });
    };
    const execute = createSdkProcessSpawner(new URL("./sdk-timer-process.mjs", import.meta.url));
    await using harness = await createServerHarness({
      secretBoxKey: Buffer.alloc(32, 1),
      ...(native
        ? { sdkNative: nativeSdkOptions(observe) }
        : {
            sdkSpawn: (options) => {
              const child = execute(options);
              observe(child);
              return child;
            },
          }),
    });
    const connection = await savedSummarizer(harness);
    for (const userPrompt of ["first deterministic launch", "second deterministic launch"]) {
      expect((await harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt }] })).items[0]?.text).toBe(
        "settled native SDK reply",
      );
    }
    return launches.map((output) =>
      output
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .flatMap((frame) => {
          const parsed = frameSchema.safeParse(frame);
          return parsed.success ? [parsed.data] : [];
        }),
    );
  };
  for (const native of [false, true]) {
    const first = await replay(native);
    expect(first).toHaveLength(2);
    expect(first.map((frames) => frames.map((frame) => frame.type))).toEqual([
      ["system", "assistant", "result"],
      ["system", "assistant", "result"],
    ]);
    expect(new Set(first.flat().map((frame) => frame.uuid)).size).toBe(6);
    expect(new Set(first.flat().map((frame) => frame.session_id)).size).toBe(2);
    expect(await replay(native)).toEqual(first);
  }
});

test("default native transport retains prepared executable and argv while joining actual child close", async () => {
  let child: ChildProcessWithoutNullStreams | undefined;
  let closed = false;
  await using harness = await createServerHarness({
    secretBoxKey: Buffer.alloc(32, 1),
    sdkNative: nativeSdkOptions((value) => {
      child = value;
      value.once("close", () => {
        closed = true;
      });
    }),
  });
  const connection = await savedSummarizer(harness);
  const result = await harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "native default control" }] });
  expect(result.items[0]?.text).toBe("settled native SDK reply");
  expect(child?.spawnargs.slice(0, 3)).toEqual(["node", "--no-warnings", new URL("./sdk-timer-process.mjs", import.meta.url).pathname]);
  expect(child?.spawnargs).toContain("--strict-mcp-config");
  expect(child?.spawnargs).toContain("--input-format");
  expect(closed).toBe(true);
  expect(child?.exitCode).toBe(0);
});

test("default native root cancellation joins actual child and reaped descendant before database cleanup", async () => {
  const ready = Promise.withResolvers<number>();
  const eof = Promise.withResolvers<void>();
  const grace = Promise.withResolvers<void>();
  const actualClosed = Promise.withResolvers<void>();
  let child: ChildProcessWithoutNullStreams | undefined;
  let descendantExited = false;
  let closed = false;
  await using harness = await createServerHarness({
    secretBoxKey: Buffer.alloc(32, 1),
    sdkNative: nativeSdkOptions((value) => {
      child = value;
      value.once("close", () => {
        closed = true;
        actualClosed.resolve();
      });
      value.stderr.on("data", (bytes: Buffer) => {
        const text = bytes.toString("utf8");
        const match = /sdk-owned:descendant:(\d+)/u.exec(text);
        if (match !== null) {
          ready.resolve(Number(match[1]));
        }
        if (text.includes("sdk-owned:native-grace")) {
          grace.resolve();
        }
        if (text.includes("sdk-owned:stdin-eof")) {
          eof.resolve();
        }
        if (text.includes("sdk-owned:descendant-exit:")) {
          descendantExited = true;
        }
      });
    }),
  });
  const connection = await savedSummarizer(harness);
  const turn = harness.app.runtime.executor
    .summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "SDK_OWNED_DESCENDANT SDK_HOLD_UNTIL_CANCEL SDK_DEFAULT_GRACE" }] })
    .then(
      () => {
        throw new Error("cancelled native default turn unexpectedly succeeded");
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
    expect(await Promise.race([grace.promise.then(() => "grace"), disposal.then(() => "disposed")])).toBe("grace");
    expect(disposed).toBe(false);
    expect(descendantExited).toBe(false);
    expect(closed).toBe(false);
    expect(() => process.kill(pid, 0)).not.toThrow();
    expect(await harness.db.all(sql`select 1 as live`)).toEqual([{ live: 1 }]);
  } finally {
    child?.stdin.end();
    process.kill(pid, "SIGUSR1");
    await Promise.all([disposal, actualClosed.promise]);
  }
  expect(await turn).toMatchObject({ kind: "aborted" });
  expect(closed).toBe(true);
  expect(descendantExited).toBe(true);
  expect(child?.exitCode).toBe(0);
  expect(() => process.kill(pid, 0)).toThrow();
  await expect(harness.db.all(sql`select 1`)).rejects.toThrow();
});

test("default native observer construction refusal retains original fault and joins the adopted child", async () => {
  const failure = new ProviderError({ kind: "invalid", retryable: false, message: "controlled native observation refusal" });
  let child: ChildProcessWithoutNullStreams | undefined;
  let closed = false;
  await using harness = await createServerHarness({
    secretBoxKey: Buffer.alloc(32, 1),
    sdkNative: nativeSdkOptions((value) => {
      child = value;
      value.once("close", () => {
        closed = true;
      });
      throw failure;
    }),
  });
  const connection = await savedSummarizer(harness);
  const observed = await harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "not dispatched" }] }).then(
    () => {
      throw new Error("native observation refusal unexpectedly succeeded");
    },
    (error: unknown) => error,
  );
  expect(observed).toBeInstanceOf(ProviderError);
  if (!(observed instanceof ProviderError)) {
    throw new Error("native observation refusal lost its provider classification");
  }
  expect(observed.kind).toBe("invalid");
  // The side-generation owner adds its item envelope; the native construction fault remains its exact cause.
  expect(observed.cause).toBe(failure);
  await harness[Symbol.asyncDispose]();
  expect(child).toBeDefined();
  expect(closed).toBe(true);
  await expect(harness.db.all(sql`select 1`)).rejects.toThrow();
});

test("default native asynchronous spawn refusal joins actual close without a PID receipt", async () => {
  let child: ChildProcessWithoutNullStreams | undefined;
  let closed = false;
  await using harness = await createServerHarness({
    secretBoxKey: Buffer.alloc(32, 1),
    sdkNative: {
      ...nativeSdkOptions((value) => {
        child = value;
        value.once("close", () => {
          closed = true;
        });
      }),
      cwd: new URL("./absent-sdk-physical-cwd", import.meta.url).pathname,
    },
  });
  const connection = await savedSummarizer(harness);
  await expect(harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "not dispatched" }] })).rejects.toThrow();
  await harness[Symbol.asyncDispose]();
  expect(child).toBeDefined();
  expect(child?.pid).toBeUndefined();
  expect(closed).toBe(true);
});

test("default native decoder retains split UTF8 diagnostics with known credential redaction", async () => {
  let child: ChildProcessWithoutNullStreams | undefined;
  const logScope = "sdk-default-native-utf8";
  await using harness = await runInRequest(logScope, () =>
    createServerHarness({
      secretBoxKey: Buffer.alloc(32, 1),
      sdkNative: nativeSdkOptions((value) => {
        child = value;
      }),
    }),
  );
  const connection = await savedSummarizer(harness);
  await expect(
    harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "SDK_DIAGNOSTIC_CRASH" }] }),
  ).rejects.toMatchObject({ kind: "server" });
  expect(child?.exitCode).toBe(7);
  const lines = logRing.recent().filter((line) => line.includes(`"requestId":"${logScope}"`) && line.includes("sdk-diagnostic:"));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toContain("café");
  expect(lines[0]).toContain("complete");
  expect(lines.some((line) => line.includes(SDK_TOKEN) || line.includes(JSON.stringify(SDK_TOKEN).slice(1, -1)))).toBe(false);
});

test("default native caller cancellation joins actual child while leaving its graph usable", async () => {
  const controller = new AbortController();
  const ready = Promise.withResolvers<void>();
  let child: ChildProcessWithoutNullStreams | undefined;
  let closed = false;
  await using harness = await createServerHarness({
    secretBoxKey: Buffer.alloc(32, 1),
    sdkNative: nativeSdkOptions((value) => {
      child = value;
      value.once("close", () => {
        closed = true;
      });
      value.stderr.on("data", (bytes: Buffer) => {
        if (bytes.toString("utf8").includes("sdk-owned:holding")) {
          ready.resolve();
        }
      });
    }),
  });
  const connection = await savedSummarizer(harness);
  const turn = harness.app.runtime.executor.summarize({
    connection,
    signal: controller.signal,
    inputs: [{ systemPrompt: "", userPrompt: "SDK_HOLD_UNTIL_CANCEL" }],
  });
  const refusal = expect(turn).rejects.toMatchObject({ kind: "aborted" });
  await ready.promise;
  controller.abort();
  await refusal;
  expect(closed).toBe(true);
  expect(child?.exitCode).toBe(0);
  expect(await harness.db.all(sql`select 1 as live`)).toEqual([{ live: 1 }]);
});

// Public opaque fixture material exceeds the SDK's bounded native error tail; it is not a real credential.
const PUBLIC_NATIVE_LONG_TOKEN = `native-public-${"N".repeat(2400)}-fixture-end`;
test("default native stderr protects an oversized known opaque credential in application diagnostics", async () => {
  const logScope = "sdk-default-native-oversized";
  await using harness = await runInRequest(logScope, () => createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkNative: nativeSdkOptions() }));
  const connection = await savedSummarizer(harness, PUBLIC_NATIVE_LONG_TOKEN);
  await expect(
    harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "SDK_SHAPED_DIAGNOSTIC:intact" }] }),
  ).rejects.toMatchObject({ kind: "server" });
  const lines = logRing
    .recent()
    .filter(
      (line) =>
        line.includes(`"requestId":"${logScope}"`) &&
        (line.includes("sdk-shaped-diagnostic:intact:") || line.includes("Claude Code process exited with code 7")),
    );
  expect(lines).toHaveLength(1);
  expect(lines.some((line) => line.includes("N".repeat(32)))).toBe(false);
});

const NATIVE_STARTUP_ARGS = ["--import", new URL("./sdk-native-startup-failure.mjs", import.meta.url).href];

test.each(["chat", "agent", "verify"] as const)("default native startup diagnostics use safe owned provenance for %s", async (operation) => {
  let closed = false;
  await using harness = await createServerHarness({
    secretBoxKey: Buffer.alloc(32, 1),
    sdkNative: {
      ...nativeSdkOptions((child) => {
        child.once("close", () => {
          closed = true;
        });
      }),
      executableArgs: NATIVE_STARTUP_ARGS,
    },
  });
  const saved = await savedSummarizer(harness, PUBLIC_NATIVE_LONG_TOKEN);
  const principal = await harness.principalFor(harness.ownerId);
  const { resolved } = await harness.app.runtime.resolve({ task: "chat", connectionId: saved.connectionId, principal, cachedFacts: true });
  if (resolved.task !== "chat") {
    throw new Error("native projection did not resolve its actual chat task");
  }
  const chat = { ...resolved, task: resolved.task };
  const request = (async (): Promise<ChatResult | VerifyAuthResult> => {
    if (operation === "agent") {
      const { resolved: agent } = await harness.app.runtime.resolve({ task: "agent", connectionId: saved.connectionId, principal, cachedFacts: true });
      if (agent.task !== "agent") {
        throw new Error("native executor did not resolve its actual agent task");
      }
      const mounted = toChatRequest({
        connection: chat,
        params: {},
        systemPrompt: { static: "", dynamic: "" },
        history: [{ role: "user", content: [{ type: "text", text: "native startup boundary" }] }],
        tools: {
          offer: {
            definitions: [],
            turnLimit: 1,
            execute: (): never => {
              throw new Error("unscripted native boundary tool execution");
            },
          },
        },
      });
      if (mounted.api !== "agent-sdk" || mounted.toolServer === undefined) {
        throw new Error("the public SDK projection did not mount its actual tool server");
      }
      return harness.app.runtime.executor.runAgentTurn({
        connection: { ...agent, task: agent.task },
        prompt: "native startup boundary",
        systemPrompt: "",
        mcpServer: mounted.toolServer,
      });
    }
    if (operation === "chat") {
      return harness.app.runtime.executor.runChatTurn({
        api: "agent-sdk",
        connection: chat,
        posture: "side-gen",
        params: {},
        prompt: "not physically dispatched",
        systemPrompt: { static: "", dynamic: "" },
      });
    }
    return harness.app.runtime.diagnostics.verifyAuth({ connection: resolved });
  })();
  const failure = await request.then(
    () => {
      throw new Error("failed native startup unexpectedly succeeded");
    },
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(ProviderError);
  if (!(failure instanceof ProviderError)) {
    throw new Error("native startup lost its provider error projection");
  }
  expect(failure.kind).toBe("server");
  expect(failure.message).toContain("code 7");
  expect(failure.message.includes("N".repeat(32))).toBe(false);
  expect(failure.cause).toBeInstanceOf(Error);
  if (!(failure.cause instanceof Error)) {
    throw new Error("native startup lost its safe cause projection");
  }
  expect(failure.cause.message.includes("N".repeat(32))).toBe(false);
  expect(failure.cause.stack?.includes("N".repeat(32))).toBe(false);
  expect(failure.cause.cause).toBeUndefined();
  expect(closed).toBe(true);
  const lines = logRing.recent(100).filter((line) => line.includes("sdk-native-startup-failure:"));
  expect(lines.some((line) => line.includes("N".repeat(32)))).toBe(false);
});

test("default native catalog refusal uses safe owned exit diagnostics", async () => {
  let closed = false;
  await using harness = await createServerHarness({
    secretBoxKey: Buffer.alloc(32, 1),
    sdkNative: {
      ...nativeSdkOptions((child) => {
        child.once("close", () => {
          closed = true;
        });
      }),
      executableArgs: NATIVE_STARTUP_ARGS,
    },
  });
  const connection = await savedSummarizer(harness, PUBLIC_NATIVE_LONG_TOKEN);
  const result = await harness.app.runtime.diagnostics.listModels({ connection });
  expect(result.listed).toBe(false);
  if (result.listed) {
    throw new Error("failed native catalog unexpectedly succeeded");
  }
  expect(result.reason.includes("N".repeat(32))).toBe(false);
  expect(result.reason).toContain("code 7");
  expect(closed).toBe(true);
  const lines = logRing.recent(100).filter((line) => line.includes("sdk-native-startup-failure:"));
  expect(lines.some((line) => line.includes("N".repeat(32)))).toBe(false);
});

test("default native concurrent exit does not relabel an unrelated caller event failure", async () => {
  const original = new Error("controlled caller event failure");
  let child: ChildProcessWithoutNullStreams | undefined;
  await using harness = await createServerHarness({
    secretBoxKey: Buffer.alloc(32, 1),
    sdkNative: nativeSdkOptions((value) => {
      child = value;
    }),
  });
  const saved = await savedSummarizer(harness);
  const principal = await harness.principalFor(harness.ownerId);
  const { resolved } = await harness.app.runtime.resolve({ task: "chat", connectionId: saved.connectionId, principal, cachedFacts: true });
  if (resolved.task !== "chat") {
    throw new Error("caller failure did not resolve its actual chat task");
  }
  const observed = await harness.app.runtime.executor
    .runChatTurn({
      api: "agent-sdk",
      connection: { ...resolved, task: resolved.task },
      posture: "side-gen",
      params: {},
      prompt: "SDK_CONCURRENT_CALLER_FAILURE",
      systemPrompt: { static: "", dynamic: "" },
      onEvent: () => {
        throw original;
      },
    })
    .then(
      () => {
        throw new Error("caller event failure unexpectedly succeeded");
      },
      (error: unknown) => error,
    );
  expect(observed).toBeInstanceOf(ProviderError);
  if (!(observed instanceof ProviderError)) {
    throw new Error("caller event failure lost its provider projection");
  }
  expect(child?.exitCode).toBe(7);
  expect(observed.kind).toBe("server");
  expect(observed.message).toBe(original.message);
  expect(observed.cause).toBeInstanceOf(Error);
  if (!(observed.cause instanceof Error)) {
    throw new Error("caller event failure lost its safe cause");
  }
  expect(observed.cause.message).toBe(original.message);
  expect(observed.cause.cause).toBeUndefined();
});

test("default native stderr never publishes a confirmed known credential prefix on physical EOF", async () => {
  await using harness = await createServerHarness({ secretBoxKey: Buffer.alloc(32, 1), sdkNative: nativeSdkOptions() });
  const connection = await savedSummarizer(harness, PUBLIC_NATIVE_LONG_TOKEN);
  await expect(harness.app.runtime.executor.summarize({ connection, inputs: [{ systemPrompt: "", userPrompt: "SDK_PREFIX_EOF" }] })).rejects.toMatchObject({
    kind: "server",
  });
  const lines = logRing.recent(100).filter((line) => line.includes("sdk-prefix-eof:"));
  expect(lines).toHaveLength(1);
  expect(lines.some((line) => line.includes("N".repeat(32)))).toBe(false);
  expect(lines[0]).toContain("█");
});
