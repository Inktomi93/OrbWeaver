// @module-tag requires-process-chdir
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { envFileText, SIGN_IN_TARGET_MODES, signInModeEnvLines } from "@orb/contracts/identity";
import { ENV_FROM_FILE_KEY } from "@orb/kit/env-file";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { startLaunch } from "../../../../../tooling/src/stack/index.ts";
import { dirWithEnvFile, EMPTY_DIR, reimportEnvIn, restoreProcessEnvAfterEach } from "./_support.ts";

// The Multi-user sign-in helper names where AUTH_MODE came from and prints the lines that switch it. The source must
// match the loader's precedence, and every printed block must boot where the helper says to put it.

describe("the sign-in helper: AUTH_MODE's source and the printed switch lines", () => {
  restoreProcessEnvAfterEach();

  test("a .env value is the env-file source, and it wins over a launcher's export", async () => {
    const dir = dirWithEnvFile("AUTH_MODE=local\n");
    const mod = await reimportEnvIn(dir, { AUTH_MODE: "single-user" }, { vitest: false });
    expect(mod.env.AUTH_MODE).toBe("local");
    expect(mod.authModeSource()).toBe("env-file");
  });

  test("under no-override the launcher's export wins, so the source is the process even though .env declares it", async () => {
    const dir = dirWithEnvFile("AUTH_MODE=single-user\n");
    const mod = await reimportEnvIn(dir, { ORB_ENV_NO_OVERRIDE: "1", AUTH_MODE: "local" }, { vitest: false });
    expect(mod.env.AUTH_MODE).toBe("local");
    expect(mod.authModeSource()).toBe("process-env");
  });

  test("a container's env_file value is the process source; unset anywhere is the default", async () => {
    expect((await reimportEnvIn(EMPTY_DIR, { AUTH_MODE: "local" }, { vitest: false })).authModeSource()).toBe("process-env");
    const unset = await reimportEnvIn(dirWithEnvFile("PORT=9001\n"), {}, { vitest: false });
    expect(unset.env.AUTH_MODE).toBe("single-user");
    expect(unset.authModeSource()).toBe("default");
  });

  // `pnpm start --share` and `--port` re-send every `.env` value on the child env with the file's override off. The
  // child env below is the launcher's own, and the server reads it from the same directory.
  function launchedIn(
    dir: string,
    text: string,
    invocation: { readonly port: number | null; readonly share: boolean },
    ambient: Record<string, string>,
  ): Promise<typeof import("@orb/server/foundation/env")> {
    const launch = startLaunch({
      repoRoot: dir,
      nodePath: "/usr/bin/node",
      fileEnv: parseEnv(text),
      ambient,
      invocation: { build: "skip", setup: false, ...invocation },
      logPath: join(dir, "server.log"),
    });
    return reimportEnvIn(dir, launch.plan.env, { vitest: false });
  }

  test.each([
    { port: null, share: true },
    { port: 9100, share: false },
  ])("a launch that restates .env (%o) still reports AUTH_MODE as set in .env, even over a differing shell export", async (invocation) => {
    const text = "AUTH_MODE=local\n";
    const mod = await launchedIn(dirWithEnvFile(text), text, invocation, { AUTH_MODE: "oidc" });
    expect(mod.env.AUTH_MODE).toBe("local");
    expect(mod.authModeSource()).toBe("env-file");
  });

  test("a restating launch over a .env without AUTH_MODE reports the shell export as the process's", async () => {
    const text = "PORT=8788\n";
    const mod = await launchedIn(dirWithEnvFile(text), text, { port: 9100, share: false }, { AUTH_MODE: "local" });
    expect(mod.env.AUTH_MODE).toBe("local");
    expect(mod.authModeSource()).toBe("process-env");
  });

  test("a restated-keys list the file does not back claims nothing", async () => {
    const mod = await reimportEnvIn(dirWithEnvFile("PORT=8788\n"), { AUTH_MODE: "local", [ENV_FROM_FILE_KEY]: "AUTH_MODE" }, { vitest: false });
    expect(mod.authModeSource()).toBe("process-env");
  });

  // Listed and declared, but the process holds another value: the file did not supply what the server runs.
  test("a listed key whose value differs from the file's reads as the process's", async () => {
    const mod = await reimportEnvIn(
      dirWithEnvFile("AUTH_MODE=single-user\n"),
      { AUTH_MODE: "local", ORB_ENV_NO_OVERRIDE: "1", [ENV_FROM_FILE_KEY]: "AUTH_MODE" },
      { vitest: false },
    );
    expect(mod.env.AUTH_MODE).toBe("local");
    expect(mod.authModeSource()).toBe("process-env");
  });

  // `--share` on a just-me box runs this launch in the local sign-in mode: the mode comes from the flag, not the file.
  test("--share over a single-user .env runs local, and the mode reads as the launch's, not the file's", async () => {
    const text = "AUTH_MODE=single-user\n";
    const mod = await launchedIn(dirWithEnvFile(text), text, { port: null, share: true }, {});
    expect(mod.env.AUTH_MODE).toBe("local");
    expect(mod.authModeSource()).toBe("process-env");
  });

  test.each(SIGN_IN_TARGET_MODES)("bare metal: the %s lines in .env boot a production server in that mode", async (mode) => {
    const lines = signInModeEnvLines(mode, "bare-metal");
    expect(lines.map(([key]) => key)).not.toContain("AUTH_FALLBACK");
    const mod = await reimportEnvIn(dirWithEnvFile(envFileText(lines)), { NODE_ENV: "production" }, { vitest: false });
    expect(mod.env.AUTH_MODE).toBe(mode);
    expect(mod.env.AUTH_FALLBACK).toBe("deny");
    expect(mod.authModeSource()).toBe("env-file");
  });

  // Compose reads docker/orbweaver.local.env after the shipped file, so its lines override the shipped no-login pair.
  test.each(SIGN_IN_TARGET_MODES)("container: the %s lines over the shipped docker env boot a production server in that mode", async (mode) => {
    const shipped = parseEnv(readFileSync(new URL("../../../../../docker/orbweaver.env", import.meta.url), "utf8"));
    const local = parseEnv(envFileText(signInModeEnvLines(mode, "container")));
    const mod = await reimportEnvIn(
      EMPTY_DIR,
      { ...shipped, ...local, NODE_ENV: "production", BIND_HOST: "0.0.0.0", ORB_CONTAINER: "true" },
      { vitest: false },
    );
    expect(mod.env.AUTH_MODE).toBe(mode);
    expect(mod.env.AUTH_FALLBACK).toBe("deny");
    expect(mod.authModeSource()).toBe("process-env");
  });
});
