// entry — the local-light BOOT WARM-UP, end to end over the WHOLE composition root (#2403). The property is
// the reason the feature exists: on a GPU-less box (VLLM_DISABLED, so every derive role reroutes to the
// in-process tier) the gigabyte-scale weight download must NOT gate boot. So the download is replaced with a
// DEFERRED promise that never settles, and every assertion runs while it is still in flight: `/healthz`
// answers 200, a real tRPC query answers over HTTP, and the admin engine read shows the `downloading` row.
//
// The fake is INJECTED at the composition root (`providerSeams.localLightCache`), not mocked: everything
// above the transformers.js edge — the backend registry, the prefetch handle, the plan, lifecycle's post-bind
// schedule, the admin read-model, the transport — is the real production wiring. Substituting that one edge
// is the only honest way to pin this; a real prefetch here would fetch ~3.7 GB from HuggingFace.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import type { LocalLightModelCache } from "@orb/server/infra/providers";
import { afterAll, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-ll-prefetch-int-"));
const CACHE_DIR = join(TEMP_DIR, "models");
const OK = 200;
const POLL_ATTEMPTS = 30;
const POLL_DELAY_MS = 100;
const BOOT_TEST_TIMEOUT_MS = 30_000;

const preloads: string[] = [];
const held = Promise.withResolvers<void>();

/** The real cache's shape with ONE behaviour changed: `preload` never settles. The inference methods are
 *  unreachable in this test (nothing runs a turn) and answer emptily. */
const heldCache: LocalLightModelCache = {
  embedTexts: () => Promise.resolve([]),
  scorePairs: () => Promise.resolve([]),
  embedImages: () => Promise.resolve([]),
  embedClipTexts: () => Promise.resolve([]),
  removeBackground: () => Promise.resolve(new Uint8Array()),
  preload: (slot: string): Promise<void> => {
    preloads.push(slot);
    return held.promise;
  },
};

vi.stubEnv("DATABASE_URL", `file:${join(TEMP_DIR, "orb.db")}`);
vi.stubEnv("AUTH_MODE", "single-user");
// No GPU: every derive role reroutes onto the in-process tier, which is the box this feature is for.
vi.stubEnv("VLLM_DISABLED", "true");
vi.stubEnv("ASSETS_DIR", join(TEMP_DIR, "assets"));
vi.stubEnv("LOCAL_LIGHT_CACHE_DIR", CACHE_DIR);
// Boot installs the SSRF egress firewall; this test's own polls reach the server under test through the same
// global fetch, so it needs the operator allowlist seam (the lifecycle int test carries the same line).
vi.stubEnv("EGRESS_ALLOWLIST", "localhost");

// Dynamic import AFTER the env stubs so `foundation/env` freezes the throwaway config.
const { createLifecycle } = await import("../../../packages/server/src/entry/lifecycle.ts").catch((error: unknown) => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
  throw error;
});

const lifecycle = createLifecycle({ listenPort: 0, providerSeams: { localLightCache: heldCache } });

afterAll(async () => {
  try {
    held.resolve();
    await lifecycle.shutdown();
  } finally {
    rmSync(TEMP_DIR, { force: true, recursive: true });
  }
});

async function pollUntil<T>(attempt: () => Promise<T | null>): Promise<T> {
  for (let i = 0; i < POLL_ATTEMPTS; i += 1) {
    const value = await attempt();
    if (value !== null) {
      return value;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, POLL_DELAY_MS);
    });
  }
  throw new Error("condition never became true");
}

test(
  "boot serves healthz + a tRPC query WHILE the local-light weights are still downloading",
  async () => {
    await lifecycle.boot();

    const address = lifecycle.listeningAddress();
    if (address === null) {
      throw new Error("boot completed without publishing the bound listener address");
    }
    const base = `http://localhost:${String(address.port)}`;

    // (1) BOOT DID NOT AWAIT THE DOWNLOAD. `boot()` has already resolved above and the preload is still
    // pending — if the download were awaited anywhere in the boot path, this line is unreachable.
    const healthz = await pollUntil(async () => {
      try {
        return await fetch(`${base}/healthz`);
      } catch {
        return null;
      }
    });
    expect(healthz.status).toBe(OK);
    expect(await healthz.json()).toMatchObject({ status: "ok" });

    // (2) AND A REAL REQUEST IS SERVED, not merely the health probe: the tRPC query below answers 200 over
    // HTTP while the download is pending. The single-user loopback owner fallback authorizes this admin
    // query, which is also the surface the download reports its progress on.
    // (3) AND THE WARM-UP IS VISIBLY IN FLIGHT on that same read. `rerank` is first (smallest weights). The
    // post-bind schedule is deliberately detached, so the row appears a beat AFTER boot() resolves — which is
    // itself the property under test, hence a poll rather than a same-tick read.
    const rows = await pollUntil(async () => {
      const res = await fetch(`${base}/api/trpc/admin.vllmEngines`);
      if (res.status !== OK) {
        return null;
      }
      const body = (await res.json()) as { result?: { data?: Record<string, { status: string; port: number; storePath: string }> } };
      const data = body.result?.data ?? {};
      return data["local-light:rerank"] === undefined ? null : data;
    });
    expect(rows["local-light:rerank"]?.status).toBe("downloading");
    // A slot behind the in-flight one is published as the plan, never as finished work.
    expect(rows["local-light:embed"]?.status).toBe("queued");
    // The in-process tier has no port — the row says so rather than inventing one — and its one real
    // deployment fact is the weights cache this box was pointed at.
    expect(rows["local-light:rerank"]?.port).toBe(0);
    expect(rows["local-light:rerank"]?.storePath).toBe(CACHE_DIR);

    // (4) ONE download in flight: the walk is sequential, so nothing raced ahead of the pending slot.
    expect(preloads).toEqual(["rerank"]);
    process.stdout.write(`ll-prefetch-int: preloads=${preloads.join(",")}\n`);
  },
  BOOT_TEST_TIMEOUT_MS,
);
