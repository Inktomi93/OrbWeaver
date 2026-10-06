// entry/index, booted for real: a closed terminal window (SIGHUP) runs the graceful shutdown and exits 0 inside the
// window Windows allows before it terminates the process, instead of Node dying on the signal mid-write.

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const ENTRY = fileURLToPath(new URL("../../../packages/server/src/entry/index.ts", import.meta.url));
const BOOT_TIMEOUT_MS = 90_000;
const POLL_MS = 100;
// Windows terminates a process about 10 s after its console window closes.
const WINDOWS_HANGUP_GRACE_MS = 10_000;
const root = mkdtempSync(join(tmpdir(), "orb-entry-hangup-"));
let server: ChildProcess | undefined;

afterAll(async () => {
  if (server !== undefined && server.exitCode === null && server.signalCode === null) {
    server.kill("SIGKILL");
    await once(server, "exit");
  }
  rmSync(root, { recursive: true, force: true });
});

async function freePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  probe.close();
  if (address === null || typeof address === "string") {
    throw new Error("test: no TCP port");
  }
  return address.port;
}

async function waitForHealth(base: string, deadline: number): Promise<void> {
  // @orb-waive test-determinism(performance.now): the SUBJECT is a real spawned server's boot latency; no frozen clock reaches that process
  while (performance.now() < deadline) {
    if (server?.exitCode !== null) {
      throw new Error(`test: server exited during boot (${String(server?.exitCode)})`);
    }
    try {
      if ((await fetch(`${base}/healthz`)).ok) {
        return;
      }
    } catch {
      // Not listening yet.
    }
    await sleep(POLL_MS);
  }
  throw new Error("test: server did not become healthy");
}

test(
  "SIGHUP drains and exits 0 within the Windows console-close grace",
  async () => {
    const port = await freePort();
    // biome-ignore-start lint/style/noProcessEnv: the server's environment IS the subject; it inherits this process's node settings.
    // biome-ignore-start lint/style/useNamingConvention: environment variable names are the server's fixed upper-case keys.
    const env = {
      ...process.env,
      ORB_ENV_NO_FILE: "1",
      DATA_DIR: join(root, "data"),
      PORT: String(port),
      LOCAL_LIGHT_PREFETCH: "off",
      CORPUS_AUTOINDEX: "false",
      SEED_CONTENT: "off",
    };
    // biome-ignore-end lint/style/useNamingConvention: end of the block above
    // biome-ignore-end lint/style/noProcessEnv: end of the block above
    let output = "";
    server = spawn(process.execPath, [ENTRY], { env, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    server.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    // @orb-waive test-determinism(performance.now): the SUBJECT is a real spawned server's boot latency; no frozen clock reaches that process
    await waitForHealth(`http://127.0.0.1:${port}`, performance.now() + BOOT_TIMEOUT_MS);

    const exited = once(server, "exit");
    // @orb-waive test-determinism(performance.now): the SUBJECT is how long a real process takes to shut down
    const sent = performance.now();
    server.kill("SIGHUP");
    const [code, signal] = (await exited) as [number | null, NodeJS.Signals | null];
    // @orb-waive test-determinism(performance.now): the SUBJECT is how long a real process takes to shut down
    const elapsed = performance.now() - sent;

    // A process with no SIGHUP handler dies from the signal itself: code null, signal SIGHUP. Exit 0 is only
    // reachable through the completed shutdown.
    expect({ code, signal }, output).toEqual({ code: 0, signal: null });
    expect(elapsed).toBeLessThan(WINDOWS_HANGUP_GRACE_MS);
  },
  BOOT_TIMEOUT_MS + 30_000,
);
