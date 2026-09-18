// The local-light BOOT WARM-UP runner + its process-local status registry. The properties under test are the
// four the feature exists for: boot is never blocked (start returns before any download settles), a second
// entry point JOINS the in-flight download instead of starting a second, a failure degrades to the lazy path
// with a published reason rather than a crash, and a box that plans nothing publishes nothing.
//
// The model cache is a fake here on purpose — the REAL single-flight lives one layer down in `createMemo`
// (pinned in `model-cache.test.ts`, incl. the preload-shares-the-inference-load pair); this file pins that the
// runner never calls `preload` twice for a slot, which is the half a fake can prove.

import { beforeEach, describe, vi } from "vitest";
import {
  __resetLocalLightPrefetchForTest,
  allLocalLightPrefetchStatuses,
  createLocalLightPrefetch,
  recordLocalLightLoadProgress,
} from "../../../../../../packages/server/src/infra/providers/backends/local-light/prefetch.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

const RERANK = "Xenova/ms-marco-MiniLM-L-6-v2";
const EMBED = "jinaai/jina-clip-v2";
const MATTE = "briaai/RMBG-1.4";
const NOW = 1_700_000_000_000;

const PLAN = [
  { slot: "rerank", modelId: RERANK },
  { slot: "embed", modelId: EMBED },
  { slot: "matte", modelId: MATTE },
] as const;

// The walk is a chain of .then/.finally per slot, so "let the detached work run" is several microtask turns
// per slot, not one. Deliberately generous and deterministic — no timers, so this never sleeps.
const MICROTASK_TURNS = 40;
async function settle(): Promise<void> {
  for (let i = 0; i < MICROTASK_TURNS; i += 1) {
    await Promise.resolve();
  }
}

function build(preload: (slot: string, modelId: string) => Promise<void>): ReturnType<typeof createLocalLightPrefetch> {
  return createLocalLightPrefetch({ cache: { preload }, now: () => NOW });
}

// The registry is module state shared by every handle in this worker (ASSUMES(single-replica), the same
// posture as the vLLM engine-status registry) — each test starts from an empty surface.
beforeEach(() => {
  __resetLocalLightPrefetchForTest();
});

describe("createLocalLightPrefetch", () => {
  test("start returns while the first download is still in flight (boot is never blocked)", async () => {
    const held = Promise.withResolvers<void>();
    const preload = vi.fn(() => held.promise);
    const handle = build(preload);

    const drain = handle.start(PLAN);

    // No await between start() and here: the walk is detached, so the caller already holds its drain.
    expect(typeof drain).toBe("function");
    await settle();
    expect(preload).toHaveBeenCalledTimes(1);
    expect(handle.status()["local-light:rerank"]?.status).toBe("downloading");
    // The slots behind the in-flight one are published as the PLAN, not as work already done.
    expect(handle.status()["local-light:embed"]?.status).toBe("queued");

    held.resolve();
    await settle();
  });

  test("walks the plan in order, one preload per slot, ending ready", async () => {
    const seen: string[] = [];
    const preload = vi.fn((slot: string) => {
      seen.push(slot);
      return Promise.resolve();
    });
    const handle = build(preload);

    handle.start(PLAN);
    await settle();

    expect(seen).toEqual(["rerank", "embed", "matte"]);
    expect(Object.values(handle.status()).every((r) => r.status === "ready")).toBe(true);
    expect(handle.status()["local-light:embed"]?.detail).toBe(`${EMBED} ready`);
  });

  test("a retry arriving MID-DOWNLOAD joins the in-flight load — one download, not two", async () => {
    const held = Promise.withResolvers<void>();
    const preload = vi.fn(() => held.promise);
    const handle = build(preload);

    handle.start(PLAN);
    await settle();
    expect(preload).toHaveBeenCalledTimes(1);

    const joined = handle.retry("local-light:rerank");
    await settle();

    // THE COUNTER: the second caller did not start a second download.
    expect(preload).toHaveBeenCalledTimes(1);
    held.resolve();
    await expect(joined).resolves.toBe(`${RERANK} ready`);
  });

  test("an EMPTY plan publishes nothing and loads nothing (prefetch off / no local-light role)", () => {
    const preload = vi.fn(() => Promise.resolve());
    const handle = build(preload);

    handle.start([]);

    expect(handle.status()).toEqual({});
    expect(allLocalLightPrefetchStatuses()).toEqual({});
    expect(preload).not.toHaveBeenCalled();
  });

  test("a failed slot publishes the reason, names the lazy fallback, and does not stop the walk", async () => {
    const preload = vi.fn((slot: string) => (slot === "rerank" ? Promise.reject(new Error("getaddrinfo ENOTFOUND huggingface.co")) : Promise.resolve()));
    const handle = build(preload);

    handle.start(PLAN);
    await settle();

    const failed = handle.status()["local-light:rerank"];
    expect(failed?.status).toBe("failed");
    expect(failed?.detail).toContain("ENOTFOUND");
    expect(failed?.detail).toContain("lazily on first use");
    // The offline box still warms whatever it can, and never sees a rejection escape the walk.
    expect(handle.status()["local-light:embed"]?.status).toBe("ready");
  });

  test("a progress tick republishes the slot with bytes + percent", async () => {
    const held = Promise.withResolvers<void>();
    const handle = build(() => held.promise);
    handle.start(PLAN);
    await settle();

    recordLocalLightLoadProgress({ modelId: RERANK, loaded: 46_137_344, total: 92_274_688 }, NOW);

    const record = handle.status()["local-light:rerank"];
    expect(record?.status).toBe("downloading");
    expect(record?.detail).toBe(`downloading ${RERANK} — 50% (44 MB / 88 MB)`);

    held.resolve();
    await settle();
  });

  test("a progress tick with no total stays phase-level (never a percentage of an unknown)", async () => {
    const held = Promise.withResolvers<void>();
    const handle = build(() => held.promise);
    handle.start(PLAN);
    await settle();

    recordLocalLightLoadProgress({ modelId: RERANK, loaded: 4096, total: 0 }, NOW);

    expect(handle.status()["local-light:rerank"]?.detail).toBe(`downloading ${RERANK}`);
    held.resolve();
    await settle();
  });

  test("a progress tick for a model NO slot planned is dropped, not published under someone else's slot", async () => {
    const held = Promise.withResolvers<void>();
    const handle = build(() => held.promise);
    handle.start(PLAN);
    await settle();
    const before = handle.status();

    recordLocalLightLoadProgress({ modelId: "someone/else", loaded: 1, total: 2 }, NOW);

    expect(handle.status()).toEqual(before);
    held.resolve();
    await settle();
  });

  test("the drain stops the walk before the next slot (shutdown mid-prefetch)", async () => {
    const first = Promise.withResolvers<void>();
    const preload = vi.fn(() => first.promise);
    const handle = build(preload);

    const drain = handle.start(PLAN);
    await settle();
    drain();
    first.resolve();
    await settle();

    // Only the slot that was already in flight ran; `embed`/`matte` were never started.
    expect(preload).toHaveBeenCalledTimes(1);
    expect(handle.status()["local-light:embed"]?.status).toBe("queued");
  });

  test("retry on a key that is not a prefetch slot answers honestly instead of loading something", async () => {
    const preload = vi.fn(() => Promise.resolve());
    const handle = build(preload);
    handle.start(PLAN);
    await settle();

    await expect(handle.retry("gen")).resolves.toBe("not a local-light prefetch slot");
    expect(preload).toHaveBeenCalledTimes(PLAN.length);
  });
});
