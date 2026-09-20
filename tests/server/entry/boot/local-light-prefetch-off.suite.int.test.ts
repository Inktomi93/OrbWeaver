// entry — `LOCAL_LIGHT_PREFETCH=off` over the WHOLE composition root (#2403): the knob's promise is that the
// box behaves EXACTLY as it did before the warm-up existed. So this boots the same GPU-less configuration as
// its `-boot` sibling (VLLM_DISABLED ⇒ every derive role reroutes onto the in-process tier — the arm that
// DOES prefetch when the knob is on) and pins the two halves of "nothing happened": no weight load was
// started, and no local-light row was published for an operator to misread as in-flight work.
//
// A separate FILE rather than a case: `foundation/env` freezes its parse at module load, so one process can
// hold exactly one value of the knob. The cache is INJECTED at the composition root, same as the sibling.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocalLightModelCache } from "@orb/inference";
import { afterAll, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-ll-prefetch-off-"));
const OK = 200;
const POLL_ATTEMPTS = 30;
const POLL_DELAY_MS = 100;
const SETTLE_READS = 3;
const BOOT_TEST_TIMEOUT_MS = 30_000;

const preloads: string[] = [];

/** Records rather than downloads: a call here is exactly the defect this file exists to catch. */
const recordingCache: LocalLightModelCache = {
  embedTexts: () => Promise.resolve([]),
  scorePairs: () => Promise.resolve([]),
  embedImages: () => Promise.resolve([]),
  embedClipTexts: () => Promise.resolve([]),
  removeBackground: () => Promise.resolve(new Uint8Array()),
  preload: (slot: string): Promise<void> => {
    preloads.push(slot);
    return Promise.resolve();
  },
};

vi.stubEnv("DATABASE_URL", `file:${join(TEMP_DIR, "orb.db")}`);
vi.stubEnv("AUTH_MODE", "single-user");
vi.stubEnv("VLLM_DISABLED", "true");
vi.stubEnv("ASSETS_DIR", join(TEMP_DIR, "assets"));
vi.stubEnv("LOCAL_LIGHT_CACHE_DIR", join(TEMP_DIR, "models"));
vi.stubEnv("LOCAL_LIGHT_PREFETCH", "off");
vi.stubEnv("EGRESS_ALLOWLIST", "localhost");

const { createLifecycle } = await import("../../../../packages/server/src/entry/lifecycle.ts").catch((error: unknown) => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
  throw error;
});

const lifecycle = createLifecycle({ listenPort: 0, providerSeams: { localLight: { cache: recordingCache } } });

afterAll(async () => {
  try {
    await lifecycle.shutdown();
  } finally {
    rmSync(TEMP_DIR, { force: true, recursive: true });
  }
});

async function pollUntilOk(url: string): Promise<Response> {
  for (let i = 0; i < POLL_ATTEMPTS; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status === OK) {
        return res;
      }
    } catch {
      // the listener is still binding — retry below
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, POLL_DELAY_MS);
    });
  }
  throw new Error(`never answered 200: ${url}`);
}

test(
  "LOCAL_LIGHT_PREFETCH=off downloads nothing and publishes no local-light row",
  async () => {
    await lifecycle.boot();
    const address = lifecycle.listeningAddress();
    if (address === null) {
      throw new Error("boot completed without publishing the bound listener address");
    }
    const base = `http://localhost:${String(address.port)}`;

    // Read the engine surface REPEATEDLY: the schedule is detached, so a single same-tick read would pass
    // even against a prefetch that simply had not started yet. Three spaced reads past the point where the
    // ON arm has already published (its sibling test lands within one poll) is the honest negative.
    for (let i = 0; i < SETTLE_READS; i += 1) {
      const res = await pollUntilOk(`${base}/api/trpc/admin.vllmEngines`);
      const body = (await res.json()) as { result?: { data?: Record<string, unknown> } };
      expect(Object.keys(body.result?.data ?? {}).filter((k) => k.startsWith("local-light:"))).toEqual([]);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, POLL_DELAY_MS);
      });
    }

    expect(preloads).toEqual([]);
  },
  BOOT_TEST_TIMEOUT_MS,
);
