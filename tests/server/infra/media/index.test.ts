// The process edge is controlled so abort, overflow and deadline tests prove close-before-cleanup ordering.
import { ChildProcess, spawn } from "node:child_process";
import { getEventListeners } from "node:events";
import { readFile, stat } from "node:fs/promises";
import { PassThrough } from "node:stream";
import type { prepareVideo } from "@orb/server/infra/media";
import { createVideoPreparer } from "@orb/server/infra/media";
import { vi } from "vitest";
import type { ManualTimer } from "../../../support/clock.ts";
import { createManualTimer } from "../../../support/clock.ts";
import { test as base, expect } from "../../../support/fixtures.ts";

// FFmpeg is the external process boundary; no internal collaborator is mocked.
vi.mock("node:child_process", async (original) => ({ ...(await original<typeof import("node:child_process")>()), spawn: vi.fn() }));

const INPUT = Uint8Array.from([1, 2, 3]);
const CAP = 8;

interface FakeChild extends ChildProcess {
  readonly stdout: PassThrough;
  readonly stderr: PassThrough;
}

interface DecoderHarness {
  readonly timer: ManualTimer;
  readonly children: FakeChild[];
  readonly spawned: Promise<FakeChild>;
  readonly nextSpawn: () => Promise<FakeChild>;
  readonly prepare: typeof prepareVideo;
}

function fakeChild(): FakeChild {
  return Object.assign(new ChildProcess(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
}

const test = base.extend<{ decoder: DecoderHarness }>({
  decoder: async ({}, use) => {
    const harness = makeHarness();
    try {
      await use(harness);
    } finally {
      for (const child of harness.children) {
        child.emit("close", 0);
        child.stdout.destroy();
        child.stderr.destroy();
      }
      vi.mocked(spawn).mockReset();
    }
  },
});

function makeHarness(): DecoderHarness {
  const timer = createManualTimer();
  const children: FakeChild[] = [];
  const spawned = Promise.withResolvers<FakeChild>();
  let arrival = Promise.withResolvers<FakeChild>();
  vi.mocked(spawn).mockImplementation(() => {
    const child = fakeChild();
    children.push(child);
    spawned.resolve(child);
    const next = arrival;
    arrival = Promise.withResolvers<ReturnType<typeof fakeChild>>();
    next.resolve(child);
    return child;
  });
  return { timer, children, spawned: spawned.promise, nextSpawn: (): Promise<FakeChild> => arrival.promise, prepare: createVideoPreparer(timer.schedule) };
}

function sourcePath(): string {
  const argv = vi.mocked(spawn).mock.calls.at(-1)?.[1];
  if (!Array.isArray(argv)) {
    throw new Error("The decoder did not supply an argv array.");
  }
  const input = argv[argv.indexOf("-i") + 1];
  if (typeof input !== "string") {
    throw new Error("The decoder did not supply its private input.");
  }
  return input;
}

test("original MP4/WebM is byte-identical, but every arm obeys the input cap", async ({ decoder }) => {
  expect(await decoder.prepare(INPUT, " VIDEO/MP4; profile=test ", "original")).toBe(INPUT);
  expect(await decoder.prepare(INPUT, "video/webm", "original")).toBe(INPUT);
  await expect(decoder.prepare(INPUT, "video/mp4", "original", { maxBytes: 2 })).rejects.toThrow("byte limit");
  await expect(decoder.prepare(INPUT, "video/unsupported", "original")).rejects.toThrow("supported video");
  expect(spawn).not.toHaveBeenCalled();
});

test("a pre-aborted caller spawns nothing and preserves its reason", async ({ decoder }) => {
  const controller = new AbortController();
  const reason = new Error("caller stopped");
  controller.abort(reason);
  await expect(decoder.prepare(INPUT, "video/mp4", "720", { signal: controller.signal })).rejects.toBe(reason);
  expect(spawn).not.toHaveBeenCalled();
  expect(decoder.timer.armed()).toEqual([]);
});

test("success waits for close, removes private input, and clears its listener and deadline", async ({ decoder }) => {
  const controller = new AbortController();
  const result = decoder.prepare(INPUT, "video/mp4", "720", { signal: controller.signal });
  const child = await decoder.spawned;
  const input = sourcePath();
  expect(new Uint8Array(await readFile(input))).toEqual(INPUT);
  expect((await stat(input)).mode % 0o1000).toBe(0o600);
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(1);
  child.stdout.write(Buffer.from([5, 6]));
  child.stdout.write(Buffer.from([7]));
  child.emit("exit", 0);
  expect(await readFile(input)).toEqual(Buffer.from(INPUT));
  child.emit("close", 0);
  expect(await result).toEqual(Uint8Array.from([5, 6, 7]));
  await expect(stat(input)).rejects.toMatchObject({ code: "ENOENT" });
  expect(decoder.timer.armed()).toEqual([]);
  expect(decoder.timer.cancelled()).toEqual([60_000]);
  expect(getEventListeners(controller.signal, "abort")).toEqual([]);
  controller.abort();
  expect(child.kill).not.toHaveBeenCalled();
});

for (const lengths of [[CAP + 1], [CAP - 1, 2]]) {
  test(`output overflow ${lengths.join("+")} rejects without partial success and kills once before cleanup`, async ({ decoder }) => {
    const result = decoder.prepare(INPUT, "video/mp4", "720", { maxBytes: CAP });
    const rejection = expect(result).rejects.toThrow("resized video exceeds");
    const child = await decoder.spawned;
    const input = sourcePath();
    for (const length of lengths) {
      child.stdout.write(Buffer.alloc(length));
    }
    child.stdout.write(Buffer.alloc(CAP));
    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
    expect(await readFile(input)).toEqual(Buffer.from(INPUT));
    child.emit("close", null);
    await rejection;
    await expect(stat(input)).rejects.toMatchObject({ code: "ENOENT" });
    expect(decoder.timer.armed()).toEqual([]);
  });
}

test("caller abort closes only its child, keeps scratch until close, and preserves cancellation", async ({ decoder }) => {
  const sibling = fakeChild();
  const controller = new AbortController();
  const reason = new Error("caller stopped");
  const result = decoder.prepare(INPUT, "video/mp4", "720", { signal: controller.signal });
  const rejection = expect(result).rejects.toBe(reason);
  const child = await decoder.spawned;
  const input = sourcePath();
  controller.abort(reason);
  child.stdout.write(Buffer.from([8]));
  expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
  expect(sibling.kill).not.toHaveBeenCalled();
  expect(await readFile(input)).toEqual(Buffer.from(INPUT));
  child.emit("close", null);
  await rejection;
  await expect(stat(input)).rejects.toMatchObject({ code: "ENOENT" });
  expect(getEventListeners(controller.signal, "abort")).toEqual([]);
});

test("owned deadline is a fault, not caller cancellation; it also waits for close", async ({ decoder }) => {
  const controller = new AbortController();
  const result = decoder.prepare(INPUT, "video/mp4", "720", { signal: controller.signal });
  const rejection = expect(result).rejects.toThrow("timed out");
  const child = await decoder.spawned;
  const input = sourcePath();
  expect(decoder.timer.armed()).toEqual([60_000]);
  decoder.timer.fire();
  expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
  expect(controller.signal.aborted).toBe(false);
  expect(await readFile(input)).toEqual(Buffer.from(INPUT));
  child.emit("close", null);
  await rejection;
  await expect(stat(input)).rejects.toMatchObject({ code: "ENOENT" });
  expect(getEventListeners(controller.signal, "abort")).toEqual([]);
});

test("missing executable, failed decoding and empty output never become original-byte successes", async ({ decoder }) => {
  const first = decoder.prepare(INPUT, "video/mp4", "720");
  const rejection = expect(first).rejects.toThrow("not installed");
  const child = await decoder.spawned;
  child.emit("error", new Error("ffmpeg not installed"));
  child.emit("close", -1);
  await rejection;
  for (const code of [1, 0]) {
    const arrival = decoder.nextSpawn();
    const next = decoder.prepare(INPUT, "video/mp4", "720");
    const failed = expect(next).rejects.toThrow("could not be prepared");
    const current = await arrival;
    current.emit("close", code);
    await failed;
  }
});

test("stderr is drained without retaining or exposing input-derived diagnostics", async ({ decoder }) => {
  const result = decoder.prepare(INPUT, "video/mp4", "720");
  const rejection = expect(result).rejects.toThrow(/^The attachment could not be prepared as video\.$/u);
  const child = await decoder.spawned;
  const concat = vi.spyOn(Buffer, "concat");
  const diagnostics = Buffer.alloc(32_768, "private-path-and-secret");
  try {
    child.stderr.write(diagnostics);
    child.emit("close", 1);
    await rejection;
    expect(concat.mock.calls.flatMap(([parts]) => parts).some((part) => part.buffer === diagnostics.buffer)).toBe(false);
    expect(child.stderr.readableLength).toBe(0);
  } finally {
    concat.mockRestore();
  }
});

test("an aborted caller after spawn cannot be missed while its listener is being attached", async ({ decoder }) => {
  const controller = new AbortController();
  const reason = new Error("stop during spawn");
  const original = vi.mocked(spawn).getMockImplementation();
  if (original === undefined) {
    throw new Error("The process edge was not configured.");
  }
  vi.mocked(spawn).mockImplementation((...args) => {
    const child = original(...args);
    controller.abort(reason);
    return child;
  });
  const result = decoder.prepare(INPUT, "video/mp4", "720", { signal: controller.signal });
  const rejection = expect(result).rejects.toBe(reason);
  const child = await decoder.spawned;
  expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
  child.emit("close", null);
  await rejection;
});
