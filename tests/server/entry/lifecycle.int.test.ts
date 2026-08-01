// entry/lifecycle — the boot/shutdown protocol, end to end. The 4e CHECKPOINT as an int test: boot the
// WHOLE composition root over a throwaway file db (vLLM disabled, single-user), prove `GET /healthz` serves
// 200 ok (migrations ran, the service graph wired, the listener is up), then prove `shutdown()` flips the
// box: healthz reports 503 and the listener stops accepting. env is stubbed BEFORE the dynamic import so
// `foundation/env` parses the throwaway config (it is frozen at module load).

import { rmSync } from "node:fs";
import { afterAll, vi } from "vitest";
import { expect, test } from "../../support/fixtures";

// A fixed high port + temp db (the integration lane runs serially — no INTRA-suite contention; no random
// ids, the determinism gate bans Math.random). NOT the env-default 8788: a running dev stack holds that,
// and pre-fix the collision was SILENT — boot's bind failed but `waitForHealthz` polled the DEV server's
// healthz and got its 200, so the test green-ran against a neighbor process until the shutdown half lied
// (2026-07-09). Boot now rejects on a failed bind (entry/lifecycle.ts), so a collision here fails loudly
// at `boot()` instead. Cleaned up in afterAll.
const PORT = 18_788;
const DB_PATH = "/tmp/orb-lifecycle-int.db";
const ASSETS_DIR = "/tmp/orb-lifecycle-int-assets";
const HEALTHZ_URL = `http://localhost:${PORT}/healthz`;
const OK = 200;
const SERVICE_UNAVAILABLE = 503;
const POLL_ATTEMPTS = 30;
const POLL_DELAY_MS = 100;

function cleanupDbFiles(): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

vi.stubEnv("DATABASE_URL", `file:${DB_PATH}`);
vi.stubEnv("PORT", String(PORT));
vi.stubEnv("AUTH_MODE", "single-user");
vi.stubEnv("VLLM_DISABLED", "true");
vi.stubEnv("ASSETS_DIR", ASSETS_DIR);
// Boot now installs the SSRF egress firewall (infra/network/egress — the reinstated boot call), which blocks
// private/loopback egress GLOBALLY via undici's dispatcher. This test's own `waitForHealthz`/shutdown polls
// hit `http://localhost:PORT` through that same global fetch, so they need the operator allowlist seam — the
// exact mechanism for "an internal host you legitimately need to reach" (here, the server under test).
vi.stubEnv("EGRESS_ALLOWLIST", "localhost");

cleanupDbFiles();

// Dynamic import AFTER the env stubs so `foundation/env` freezes the throwaway config.
const { createLifecycle } = await import("../../../packages/server/src/entry/lifecycle.ts");

const lifecycle = createLifecycle();

afterAll(async () => {
  await lifecycle.shutdown();
  cleanupDbFiles();
  rmSync(ASSETS_DIR, { force: true, recursive: true });
});

/** Poll healthz until the freshly-bound listener answers (serve() binds async; a few ms in practice). */
async function waitForHealthz(): Promise<Response> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: a readiness poll is sequential by nature — each probe must complete before the next.
      const res = await fetch(HEALTHZ_URL);
      return res;
    } catch {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, POLL_DELAY_MS);
      });
    }
  }
  throw new Error("healthz listener never came up");
}

test("boot migrates + serves healthz 200; shutdown flips it to 503 and stops accepting", async () => {
  await lifecycle.boot();

  const live = await waitForHealthz();
  expect(live.status).toBe(OK);
  expect(await live.json()).toEqual({ status: "ok", harness: false });

  await lifecycle.shutdown();

  // After the listener closes, the connection is refused (proves it stopped accepting). If the OS hadn't
  // released the socket yet, a served response must carry the drain 503 — never a live 200.
  let refused = false;
  let drainedStatus: number | null = null;
  try {
    drainedStatus = (await fetch(HEALTHZ_URL)).status;
  } catch {
    refused = true;
  }
  expect(refused || drainedStatus === SERVICE_UNAVAILABLE).toBe(true);
});
