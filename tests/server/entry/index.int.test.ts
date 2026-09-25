// entry/index — the process entry point, spawned for real. An environment the env parse refuses must stop the boot
// with each refused key named by its path, and no parser dump or stack trace to bury them.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const ENTRY = fileURLToPath(new URL("../../../packages/server/src/entry/index.ts", import.meta.url));
const DATA_DIR = mkdtempSync(join(tmpdir(), "orb-entry-env-refusal-"));
const SPAWN_TIMEOUT_MS = 60_000;
const STACK_FRAME_RE = /^\s+at /mu;

afterAll(() => {
  rmSync(DATA_DIR, { force: true, recursive: true });
});

test(
  "a refused environment exits 1 naming each refused key, with no stack trace",
  () => {
    // Two refusals the parse reports together: an unknown sign-in mode and a port it cannot bind. No `.env` is read.
    // biome-ignore-start lint/style/noProcessEnv: the child's environment IS the subject; it inherits this process's PATH and node settings.
    // biome-ignore-start lint/style/useNamingConvention: environment variable names are the server's fixed upper-case keys.
    const childEnv = { ...process.env, ORB_ENV_NO_FILE: "1", DATA_DIR, AUTH_MODE: "bogus", PORT: "0" };
    // biome-ignore-end lint/style/useNamingConvention: end of the block above
    // biome-ignore-end lint/style/noProcessEnv: end of the block above
    const run = spawnSync(process.execPath, [ENTRY], { env: childEnv, encoding: "utf8", timeout: SPAWN_TIMEOUT_MS });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("AUTH_MODE");
    expect(run.stderr).toContain("PORT");
    expect(run.stderr).not.toContain("ZodError");
    expect(run.stderr).not.toMatch(STACK_FRAME_RE);
  },
  SPAWN_TIMEOUT_MS,
);
