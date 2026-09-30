// entry/index, booted for real with every app secret in its env: a child it starts afterwards gets none of them. The
// bug report's git call is the child, reached through a PATH wrapper that records the env it received.

import type { ChildProcess } from "node:child_process";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";
import { APP_SECRET_ENV_KEYS } from "../../../packages/server/src/foundation/env/index.ts";
import { expect, test } from "../../support/fixtures.ts";

const ENTRY = fileURLToPath(new URL("../../../packages/server/src/entry/index.ts", import.meta.url));
const BOOT_TIMEOUT_MS = 90_000;
const POLL_MS = 100;
const EXECUTABLE_MODE = 0o700;
const root = mkdtempSync(join(tmpdir(), "orb-entry-child-env-"));
let server: ChildProcess | undefined;

afterAll(async () => {
  if (server !== undefined && server.exitCode === null) {
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
  "the booted server's git child receives no app secret",
  async () => {
    const bin = join(root, "bin");
    const cwd = join(root, "cwd");
    const dump = join(root, "git.env");
    mkdirSync(bin);
    mkdirSync(cwd);
    const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
    writeFileSync(join(bin, "git"), `#!/bin/sh\nenv > '${dump}'\nexec '${realGit}' "$@"\n`);
    chmodSync(join(bin, "git"), EXECUTABLE_MODE);

    const port = await freePort();
    // biome-ignore-start lint/style/noProcessEnv: the server's environment IS the subject; it inherits this process's node settings.
    // biome-ignore-start lint/style/useNamingConvention: environment variable names are the server's fixed upper-case keys.
    const secrets: Record<(typeof APP_SECRET_ENV_KEYS)[number], string> = {
      SESSION_SECRET: randomBytes(32).toString("hex"),
      CREDENTIALS_KEY: randomBytes(32).toString("hex"),
      OIDC_CLIENT_SECRET: `oidc-${randomUUID()}`,
      OPENROUTER_API_KEY: `or-${randomUUID()}`,
      DEBUG_TOKEN: `debug-${randomUUID()}`,
      LOCAL_INITIAL_PASSWORD: `password-${randomUUID()}`,
    };
    const env = {
      ...process.env,
      ...secrets,
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
      ORB_ENV_NO_FILE: "1",
      DATA_DIR: join(root, "data"),
      PORT: String(port),
      LOCAL_LIGHT_PREFETCH: "off",
      CORPUS_AUTOINDEX: "false",
      SEED_CONTENT: "off",
    };
    // biome-ignore-end lint/style/useNamingConvention: end of the block above
    // biome-ignore-end lint/style/noProcessEnv: end of the block above
    server = spawn(process.execPath, [ENTRY], { cwd, env, stdio: ["ignore", "ignore", "inherit"] });
    const base = `http://127.0.0.1:${port}`;
    // @orb-waive test-determinism(performance.now): the SUBJECT is a real spawned server's boot latency; no frozen clock reaches that process
    await waitForHealth(base, performance.now() + BOOT_TIMEOUT_MS);

    const response = await fetch(`${base}/api/_debug/bug-report`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-debug-token": secrets.DEBUG_TOKEN },
      body: JSON.stringify({ note: "child env probe" }),
    });
    expect(response.status).toBe(200);

    const received = readFileSync(dump, "utf8");
    const leaked = APP_SECRET_ENV_KEYS.filter((key) => received.includes(`${key}=`) || received.includes(secrets[key]));
    expect(leaked).toEqual([]);
  },
  BOOT_TIMEOUT_MS + 30_000,
);
