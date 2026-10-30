// The process env module loads a local `.env` once at import, in the process's own working directory and environment.
// Each case starts a fresh node process on the real module, because nothing about that load can be varied in-process.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node";
import { z } from "zod";

const CHILD = fileURLToPath(new URL("../../../support/node/env-file-child.ts", import.meta.url));
const UTF8_BOM = "﻿";

interface Resolved {
  readonly handle: unknown;
  readonly port: unknown;
  readonly ownerGroup: unknown;
}

const outcomeSchema = z.union([z.object({ env: z.record(z.string(), z.unknown()) }), z.object({ error: z.string() })]);

/** The resolved env of the production module started in `cwd` with exactly `processEnv` and no `.env` unless `dotenv` writes one. */
function load(parent: string, name: string, dotenv: string | undefined, processEnv: Readonly<Record<string, string>> = {}): Resolved {
  const cwd = mkdtempSync(join(parent, `${name}-`));
  if (dotenv !== undefined) {
    writeFileSync(join(cwd, ".env"), dotenv);
  }
  return run(cwd, processEnv);
}

function run(cwd: string, processEnv: Readonly<Record<string, string>>): Resolved {
  const child = spawnSync(process.execPath, [CHILD], { cwd, env: processEnv, encoding: "utf8" });
  const outcome = outcomeSchema.parse(JSON.parse(child.stdout));
  if ("error" in outcome) {
    throw new Error(outcome.error);
  }
  // The path-valued keys follow the working directory, so a case compares only the keys a `.env` line can set here.
  return { handle: outcome.env["DEFAULT_USER_HANDLE"], port: outcome.env["PORT"], ownerGroup: outcome.env["OWNER_GROUP"] };
}

const FILE = "DEFAULT_USER_HANDLE=from-dotfile\nPORT=9001\nOWNER_GROUP=admins\n";
const SHELL = { ["DEFAULT_USER_HANDLE"]: "from-shell", ["PORT"]: "7777" };

test("a launch's .env beats an already-set shell export, and fills keys the shell never set", ({ importStagingDir }) => {
  const env = load(importStagingDir, "override", FILE, SHELL);
  expect(env.handle).toBe("from-dotfile");
  expect(env.port).toBe(9001);
  expect(env.ownerGroup).toBe("admins");
});

test.for([{ ["VITEST"]: "1" }, { ["ORB_ENV_NO_OVERRIDE"]: "1" }])(
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
  const skipped = load(importStagingDir, "skipped", FILE, { ["ORB_ENV_NO_FILE"]: "1" });
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
