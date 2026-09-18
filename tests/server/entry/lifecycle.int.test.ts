// entry/lifecycle — the boot/shutdown protocol, end to end. The 4e CHECKPOINT as an int test: boot the
// WHOLE composition root over a throwaway file db (vLLM disabled, single-user), prove `GET /healthz` serves
// 200 ok (migrations ran, the service graph wired, the listener is up), then prove `shutdown()` flips the
// box: healthz reports 503 and the listener stops accepting. env is stubbed BEFORE the dynamic import so
// `foundation/env` parses the throwaway config (it is frozen at module load).

import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { versionIdentity } from "@orb/server/foundation/version";
import { afterAll, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

// The OS assigns this invocation's listener port (`listenPort: 0` below); reserving a port and then
// rebinding would recreate the race. DB, WAL/SHM siblings and assets remain process-owned too.
const TEMP_DIR = mkdtempSync(join(tmpdir(), "orb-lifecycle-int-"));
const DB_PATH = join(TEMP_DIR, "orb.db");
const ASSETS_DIR = join(TEMP_DIR, "assets");
const OK = 200;
const SERVICE_UNAVAILABLE = 503;
const POLL_ATTEMPTS = 30;
const POLL_DELAY_MS = 100;

vi.stubEnv("DATABASE_URL", `file:${DB_PATH}`);
vi.stubEnv("AUTH_MODE", "single-user");
vi.stubEnv("VLLM_DISABLED", "true");
vi.stubEnv("ASSETS_DIR", ASSETS_DIR);
// Boot now installs the SSRF egress firewall (infra/network/egress — the reinstated boot call), which blocks
// private/loopback egress GLOBALLY via undici's dispatcher. This test's own `waitForHealthz`/shutdown polls
// hit `http://localhost:PORT` through that same global fetch, so they need the operator allowlist seam — the
// exact mechanism for "an internal host you legitimately need to reach" (here, the server under test).
vi.stubEnv("EGRESS_ALLOWLIST", "localhost");

// Dynamic import AFTER the env stubs so `foundation/env` freezes the throwaway config. A module-load
// failure happens before Vitest can run afterAll, so release the owned root on that path here.
const { createLifecycle } = await import("../../../packages/server/src/entry/lifecycle.ts").catch((error: unknown) => {
  rmSync(TEMP_DIR, { force: true, recursive: true });
  throw error;
});

const lifecycle = createLifecycle({ listenPort: 0 });

afterAll(async () => {
  try {
    await lifecycle.shutdown();
  } finally {
    rmSync(TEMP_DIR, { force: true, recursive: true });
  }
});

/** Poll healthz until the freshly-bound listener answers (serve() binds async; a few ms in practice). */
async function waitForHealthz(url: string): Promise<Response> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url);
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
  expect(lifecycle.listeningAddress()).toBeNull();
  await lifecycle.boot();

  const address = lifecycle.listeningAddress();
  expect(address).not.toBeNull();
  if (address === null) {
    throw new Error("boot completed without publishing the bound listener address");
  }
  expect(address.port).toBeGreaterThan(0);
  process.stdout.write(`lifecycle-int: bound ${address.address}:${String(address.port)}\n`);
  const healthzUrl = `http://localhost:${String(address.port)}/healthz`;

  const live = await waitForHealthz(healthzUrl);
  expect(live.status).toBe(OK);
  expect(await live.json()).toEqual({ status: "ok", harness: false, version: versionIdentity() });

  await lifecycle.shutdown();

  // After the listener closes, the connection is refused (proves it stopped accepting). If the OS hadn't
  // released the socket yet, a served response must carry the drain 503 — never a live 200.
  let refused = false;
  let drainedStatus: number | null = null;
  try {
    drainedStatus = (await fetch(healthzUrl)).status;
  } catch {
    refused = true;
  }
  expect(refused || drainedStatus === SERVICE_UNAVAILABLE).toBe(true);
  expect(lifecycle.listeningAddress()).toBeNull();
  await lifecycle.shutdown();
  expect(lifecycle.listeningAddress()).toBeNull();
});

test("boot still rejects a real listener collision and failed boot can release its owned resources", async () => {
  const blocker = createServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(0, "127.0.0.1", resolve);
  });
  const address = blocker.address();
  if (address === null || typeof address === "string") {
    throw new Error("port blocker did not publish an IP listener address");
  }
  const blocked = createLifecycle({ listenPort: address.port });
  try {
    await expect(blocked.boot()).rejects.toMatchObject({ code: "EADDRINUSE" });
    expect(blocked.listeningAddress()).toBeNull();
  } finally {
    await blocked.shutdown();
    await new Promise<void>((resolve, reject) => {
      blocker.close((error) => {
        if (error !== undefined) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
});
