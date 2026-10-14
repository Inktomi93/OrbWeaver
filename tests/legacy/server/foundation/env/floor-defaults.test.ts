// @module-tag requires-process-chdir

import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { EMPTY_DIR, reimportEnvWith, restoreProcessEnvAfterEach } from "./_support.ts";

describe("foundation/env — the floor parse (defaults + transforms)", () => {
  restoreProcessEnvAfterEach();

  // The PROD-SAFETY defaults for the debug/observability gates. Pinned HERE — against an empty env in an
  // empty cwd — rather than in the wire-capture unit test, which reads the ambient `env` and therefore
  // inherits whatever the repo `.env` says: an operator debugging with `WIRE_CAPTURE=on` turned that test
  // red and it read as a code regression. A default flipped to "on" would ship capture into prod silently,
  // so the guarantee belongs somewhere no local file can mask it.
  test("the debug/observability gates default OFF (no local .env can mask this)", async () => {
    const { env } = await reimportEnvWith({});
    expect(env.WIRE_CAPTURE).toBe("off");
    expect(env.RPG_TRACE).toBe("off");
    expect(env.DEBUG_TOKEN).toBeUndefined();
  });

  test("the zero-infra single-user default needs no SSO/secret vars", async () => {
    const { env } = await reimportEnvWith({});
    expect(env.AUTH_MODE).toBe("single-user");
    expect(env.AUTH_FALLBACK).toBe("owner");
    expect(env.DEFAULT_USER_HANDLE).toBe("owner");
    expect(env.PORT).toBe(8788);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.NODE_ENV).toBe("development");
  });

  // The local-light (transformers.js/ONNX) weights must land under the DATA ROOT, not in the lib's own
  // `node_modules/@huggingface/transformers/.cache/`: that path is on the read-only rootfs in the
  // container — so the first download fails and the GPU-less tier is dead for exactly the audience it
  // exists for — and on bare metal every `pnpm install` throws multi-GB weights away.
  test("LOCAL_LIGHT_CACHE_DIR defaults under the data root's cache and takes an override", async () => {
    const { env } = await reimportEnvWith({});
    expect(env.LOCAL_LIGHT_CACHE_DIR).toBe("./data/cache/models/transformers");
    const overridden = await reimportEnvWith({ LOCAL_LIGHT_CACHE_DIR: "/srv/orb-models" });
    expect(overridden.env.LOCAL_LIGHT_CACHE_DIR).toBe("/srv/orb-models");
  });

  test("LOCAL_LIGHT_CPU_PERCENT defaults to half and refuses invalid percentages", async () => {
    expect((await reimportEnvWith({})).env).toHaveProperty("LOCAL_LIGHT_CPU_PERCENT", 50);
    expect((await reimportEnvWith({ LOCAL_LIGHT_CPU_PERCENT: "75" })).env).toHaveProperty("LOCAL_LIGHT_CPU_PERCENT", 75);
    for (const value of ["0", "101", "50.5", "NaN", "Infinity", ""]) {
      await expect(reimportEnvWith({ LOCAL_LIGHT_CPU_PERCENT: value })).rejects.toThrow("LOCAL_LIGHT_CPU_PERCENT");
    }
  });

  // Every data slot reads as its EFFECTIVE path, and `DATA_LAYOUT` carries the slots with no key of their own.
  test("the data slots resolve from DATA_DIR: the defaults, a re-rooted tree, and an explicit slot that wins", async () => {
    const { env } = await reimportEnvWith({});
    expect(env.DATA_DIR).toBe("./data");
    expect(env.DATABASE_URL).toBe(pathToFileURL(join(EMPTY_DIR, "data/db/orbweaver.db")).href);
    expect(env.ASSETS_DIR).toBe("./data/assets");
    expect(env.USER_RUNTIME_DIR).toBe("./data/users");
    expect(env.IMPORT_STAGING_DIR).toBe("./data/cache/import-staging");
    expect(env.DATA_LAYOUT.secrets).toBe("./data/secrets");
    expect(env.DATA_LAYOUT.backups).toBe("./data/backups");
    expect(env.DATA_LAYOUT.variants).toBe("./data/cache/variants");
    expect(env.DATA_LAYOUT.reports).toBe("./data/reports");

    const rerooted = await reimportEnvWith({ DATA_DIR: "/srv/orb", ASSETS_DIR: "/blobs" });
    expect(rerooted.env.DATABASE_URL).toBe("file:///srv/orb/db/orbweaver.db");
    expect(rerooted.env.ASSETS_DIR).toBe("/blobs");
    expect(rerooted.env.DATA_LAYOUT.secrets).toBe("/srv/orb/secrets");
    expect([...rerooted.env.DATA_LAYOUT.explicit]).toEqual(["ASSETS_DIR"]);
  });

  // A skipped db would boot onto a fresh empty one: the parse refuses the name and names the key that keeps it.
  test("DATA_LAYOUT_SKIP is checked at parse: a name an env key keeps refuses the boot and names that key", async () => {
    await expect(reimportEnvWith({ DATA_LAYOUT_SKIP: "orbweaver.db" })).rejects.toThrow("DATABASE_URL");
    await expect(reimportEnvWith({ DATA_LAYOUT_SKIP: "import-report" })).rejects.toThrow("import-reports");
  });

  test("rate-limit budgets are boot-env with the documented floor", async () => {
    const { env } = await reimportEnvWith({});
    expect(env.RATE_LIMIT_AI_TURN).toBe(30);
    expect(env.RATE_LIMIT_PUBLIC_IP).toBe(60);
    expect(env.RATE_LIMIT_AUTHED).toBe(600);
    expect(env.RATE_LIMIT_LOGIN).toBe(10);
    expect(env.RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  test("the boolean-string toggles transform to real booleans", async () => {
    const { env } = await reimportEnvWith({ CORPUS_AUTOINDEX: "false", EGRESS_FIREWALL: "true" });
    expect(env.CORPUS_AUTOINDEX).toBe(false);
    expect(env.EGRESS_FIREWALL).toBe(true);
  });

  // `envBool` is `z.stringbool` with PINNED `{truthy:["true"], falsy:["false"], case:"sensitive"}`. Bare
  // `z.stringbool()` is case-INSENSITIVE and also accepts 1/0/yes/no/on/off — adopting it unpinned would
  // silently widen every boolean knob's vocabulary. These are the spellings that MUST stay boot-fatal, so a
  // future author who drops the params gets a RED here instead of a quiet posture drift.
  test.each(["TRUE", "True", "1", "yes", "on", "", " true"])("env boolean knobs REFUSE the widened spelling %j at boot", async (spelling) => {
    await expect(reimportEnvWith({ EGRESS_FIREWALL: spelling })).rejects.toThrow();
  });

  test("env boolean knobs still accept exactly lowercase true/false (and 0/off are NOT falsy)", async () => {
    expect((await reimportEnvWith({ EGRESS_FIREWALL: "false" })).env.EGRESS_FIREWALL).toBe(false);
    expect((await reimportEnvWith({ EGRESS_FIREWALL: "true" })).env.EGRESS_FIREWALL).toBe(true);
    await expect(reimportEnvWith({ EGRESS_FIREWALL: "0" })).rejects.toThrow();
    await expect(reimportEnvWith({ EGRESS_FIREWALL: "off" })).rejects.toThrow();
  });

  test("processEnvSnapshot returns a copy of the raw process.env (the agent-sdk baseline)", async () => {
    const { processEnvSnapshot } = await reimportEnvWith({ SOME_HOST_VAR: "present" });
    const snap = processEnvSnapshot();
    expect(snap["SOME_HOST_VAR"]).toBe("present");
    // A copy, not the live object — mutating the snapshot must not touch process.env.
    snap["SOME_HOST_VAR"] = "mutated";
    expect(process.env["SOME_HOST_VAR"]).toBe("present");
  });
});
