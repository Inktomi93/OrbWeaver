// The process env module loads a local `.env` once at import, in the process's own working directory and environment.
// Each case starts a fresh node process on the real module, because nothing about that load can be varied in-process.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { AuthModeSource } from "@orb/contracts/identity";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, DEFAULT_USER_HANDLE_KEY, OWNER_GROUP_KEY } from "@orb/contracts/identity";
import { ENV_NO_FILE_KEY, ENV_NO_OVERRIDE_KEY } from "@orb/kit/env-file";
import { AUTH_MODE_DEFAULT_FALLBACK } from "@orb/server/foundation/env";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";

const CHILD = fileURLToPath(new URL("../../../support/node/env-file-child.ts", import.meta.url));
const UTF8_BOM = "﻿";

interface Resolved {
  readonly handle: unknown;
  readonly port: unknown;
  readonly ownerGroup: unknown;
}

const outcomeSchema = z.union([z.object({ env: z.record(z.string(), z.unknown()), authModeSource: z.string() }), z.object({ error: z.string() })]);

/** A fresh working directory holding no `.env` unless `dotenv` writes one. */
function launchDir(parent: string, name: string, dotenv: string | undefined): string {
  const cwd = mkdtempSync(join(parent, `${name}-`));
  if (dotenv !== undefined) {
    writeFileSync(join(cwd, ".env"), dotenv);
  }
  return cwd;
}

/** The resolved env of the production module started in a fresh directory with exactly `processEnv` and no `.env` unless `dotenv` writes one. */
function load(parent: string, name: string, dotenv: string | undefined, processEnv: Readonly<Record<string, string>> = {}): Resolved {
  return run(launchDir(parent, name, dotenv), processEnv);
}

/** The production module's whole outcome in a fresh process: the parsed record, or the refusal that stopped the boot. */
function boot(parent: string, name: string, dotenv: string | undefined, processEnv: Readonly<Record<string, string>> = {}): z.infer<typeof outcomeSchema> {
  return outcomeOf(launchDir(parent, name, dotenv), processEnv);
}

function outcomeOf(cwd: string, processEnv: Readonly<Record<string, string>>): z.infer<typeof outcomeSchema> {
  const child = spawnSync(process.execPath, [CHILD], { cwd, env: processEnv, encoding: "utf8" });
  return outcomeSchema.parse(JSON.parse(child.stdout));
}

function run(cwd: string, processEnv: Readonly<Record<string, string>>): Resolved {
  const outcome = outcomeOf(cwd, processEnv);
  if ("error" in outcome) {
    throw new Error(outcome.error);
  }
  // The path-valued keys follow the working directory, so a case compares only the keys a `.env` line can set here.
  return { handle: outcome.env[DEFAULT_USER_HANDLE_KEY], port: outcome.env["PORT"], ownerGroup: outcome.env[OWNER_GROUP_KEY] };
}

const FILE = "DEFAULT_USER_HANDLE=from-dotfile\nPORT=9001\nOWNER_GROUP=admins\n";
const SHELL = { [DEFAULT_USER_HANDLE_KEY]: "from-shell", ["PORT"]: "7777" };

test("a launch's .env beats an already-set shell export, and fills keys the shell never set", ({ importStagingDir }) => {
  const env = load(importStagingDir, "override", FILE, SHELL);
  expect(env.handle).toBe("from-dotfile");
  expect(env.port).toBe(9001);
  expect(env.ownerGroup).toBe("admins");
});

test.for([{ ["VITEST"]: "1" }, { [ENV_NO_OVERRIDE_KEY]: "1" }])(
  "with the override escape hatch %j the shell wins and the file still fills unset keys",
  (hatch, { importStagingDir }) => {
    const env = load(importStagingDir, "hatch", FILE, { ...SHELL, ...hatch });
    expect(env.handle).toBe("from-shell");
    expect(env.port).toBe(7777);
    expect(env.ownerGroup).toBe("admins");
  },
);

test("ORB_ENV_NO_FILE skips the file entirely, so the file's values never reach the record", ({ importStagingDir }) => {
  const baseline = load(importStagingDir, "baseline", undefined);
  const skipped = load(importStagingDir, "skipped", FILE, { [ENV_NO_FILE_KEY]: "1" });
  expect(skipped).toEqual(baseline);
  // Control: without the flag the same file changes the record.
  expect(load(importStagingDir, "loaded", FILE)).not.toEqual(baseline);
});

test("a missing .env, and one that cannot be read as a file, leave the schema defaults standing", ({ importStagingDir }) => {
  const baseline = load(importStagingDir, "baseline", undefined);
  const unreadable = mkdtempSync(join(importStagingDir, "dir-"));
  mkdirSync(join(unreadable, ".env"));
  expect(run(unreadable, {})).toEqual(baseline);
  expect(load(importStagingDir, "filled", FILE)).not.toEqual(baseline);
});

test("a UTF-8 byte-order mark does not rename the file's first key", ({ importStagingDir }) => {
  const env = load(importStagingDir, "bom", `${UTF8_BOM}DEFAULT_USER_HANDLE=bommed\nPORT=9100\n`);
  expect(env.handle).toBe("bommed");
  expect(env.port).toBe(9100);
});

// The owner fallback and the peers it admits are launch-time decisions. `.env` loads with override on, so a value
// written there would ride into every launch from the directory, dev and prod alike; the boot refuses it instead.
test.for(["AUTH_FALLBACK=owner", "AUTH_FALLBACK_TRUSTED_PEERS=172.16.0.0/12"])(
  "%s written in .env refuses the boot, while the same value from the launch environment boots",
  (line, { importStagingDir }) => {
    const [key = "", value = ""] = line.split("=");
    expect(boot(importStagingDir, "pinned", `AUTH_MODE=single-user\n${line}\n`)).toEqual({ error: expect.any(String) });

    // Controls: the same file without the line boots at the mode's default, and the launch environment may set it.
    const unpinned = boot(importStagingDir, "unpinned", "AUTH_MODE=single-user\n");
    expect(unpinned).toMatchObject({ env: { [AUTH_FALLBACK_KEY]: AUTH_MODE_DEFAULT_FALLBACK["single-user"] } });
    expect(boot(importStagingDir, "launched", "AUTH_MODE=single-user\n", { [key]: value })).toMatchObject({ env: { [key]: expect.anything() } });
  },
);

// Windows reads `auth_mode` as AUTH_MODE, so the loader and the parse do on every platform, and the share panel still
// names where the value came from. Only the loader's own name matching needs a process; the parse's refusals have their
// cases in `env-name-case.test.ts`. Each case below starts one.
const LOWER_AUTH_MODE = AUTH_MODE_KEY.toLowerCase();

test("a lower-case key in .env sets its schema key, and the file stays its source", ({ importStagingDir }) => {
  expect(boot(importStagingDir, "lower", `${LOWER_AUTH_MODE}=local\n`)).toMatchObject({
    env: { [AUTH_MODE_KEY]: "local" },
    authModeSource: "env-file" satisfies AuthModeSource,
  });
});

test("a lower-case key from the launch sets its schema key, and the launch stays its source", ({ importStagingDir }) => {
  expect(boot(importStagingDir, "launched", undefined, { [LOWER_AUTH_MODE]: "local" })).toMatchObject({
    env: { [AUTH_MODE_KEY]: "local" },
    authModeSource: "process-env" satisfies AuthModeSource,
  });
});

// A file holds both lines on every platform, where a launch environment on Windows would merge them into one.
test("a .env that sets one key in two spellings refuses the boot and names both", ({ importStagingDir }) => {
  expect(boot(importStagingDir, "spellings", `${AUTH_MODE_KEY}=local\n${LOWER_AUTH_MODE}=single-user\n`)).toEqual({
    error: expect.stringContaining(`${AUTH_MODE_KEY} and ${LOWER_AUTH_MODE}`),
  });
});

// The session cookie's transport is decided per request; the deleted knob must stay inert, never fatal and never
// carried into the record, wherever an old line still sets it.
test.for(["true", "false", "1", "TRUE"])("SESSION_COOKIE_INSECURE=%s boots and reaches no record field", (spelling, { importStagingDir }) => {
  const launched = boot(importStagingDir, "launched", undefined, { [AUTH_MODE_KEY]: "local", ["SESSION_COOKIE_INSECURE"]: spelling });
  expect(launched).toMatchObject({ env: { [AUTH_MODE_KEY]: "local" } });
  expect("env" in launched && Object.hasOwn(launched.env, "SESSION_COOKIE_INSECURE")).toBe(false);

  const filed = boot(importStagingDir, "filed", `AUTH_MODE=local\nPORT=9001\nSESSION_COOKIE_INSECURE=${spelling}\n`);
  expect(filed).toMatchObject({ env: { [AUTH_MODE_KEY]: "local", ["PORT"]: 9001 } });
  expect("env" in filed && Object.hasOwn(filed.env, "SESSION_COOKIE_INSECURE")).toBe(false);
});
