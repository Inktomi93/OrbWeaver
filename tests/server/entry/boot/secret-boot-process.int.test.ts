// The boot's secret controls over the real server process: the scrub a spawned child observes, and the cookie-mode
// refusal that keeps a pepperless password hasher from ever serving a login.
// @subject packages/server/src/entry/index.ts
// @subject packages/server/src/entry/lifecycle.ts
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { AUTH_MODE_KEY } from "@orb/contracts/identity";
import { ENV_NO_FILE_KEY } from "@orb/kit/env-file";
import { DATA_LAYOUT_DIRS, SECRET_FILE_NAMES } from "@orb/server/foundation/data-layout";
import type { EnvKey } from "@orb/server/foundation/env/record";
import { APP_SECRET_ENV_KEYS } from "@orb/server/foundation/env/record";
import { expect, test } from "@orb/testkit/node";
import { freeLoopbackPort } from "@orb/testkit/node/helpers";
import { processEnvValue } from "@orb/tooling/floor/process/process-env";
import { onTestFinished } from "vitest";

const ENTRY = fileURLToPath(new URL("../../../../packages/server/src/entry/index.ts", import.meta.url));
const DATABASE_URL_KEY = "DATABASE_URL" satisfies EnvKey;
const INHERITED_CONTROL = "ORB_CHILD_ENV_CONTROL";
const UNUSABLE_KEYFILE = "not a 32-byte key\n";
const LISTENING = "boot: listening";

// On request, reports which variables a child started with no explicit env inherits from the running server.
const CHILD_ENV_PROBE = `import { spawnSync } from "node:child_process";
process.on("message", () => {
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(Object.keys(process.env)))"], { encoding: "utf8" });
  process.send?.(JSON.parse(child.stdout));
});`;

function entryEnv(dataDir: string): NodeJS.ProcessEnv {
  return {
    ["PATH"]: processEnvValue("PATH"),
    ["HOME"]: processEnvValue("HOME"),
    [ENV_NO_FILE_KEY]: "1",
    ["DATA_DIR"]: dataDir,
    ["LOCAL_LIGHT_PREFETCH"]: "off",
    ["CORPUS_AUTOINDEX"]: "false",
    ["EGRESS_FIREWALL"]: "false",
    ["LOG_LEVEL"]: "info",
  };
}

test("a booted server starts its children without one app secret in their inherited env", { tags: "slow" }, async ({ importStagingDir }) => {
  const child = spawn(process.execPath, [`--import=data:text/javascript,${encodeURIComponent(CHILD_ENV_PROBE)}`, ENTRY], {
    env: {
      ...entryEnv(importStagingDir),
      ["PORT"]: String(await freeLoopbackPort()),
      [AUTH_MODE_KEY]: "single-user",
      [INHERITED_CONTROL]: "1",
      // Hex of the key width: the one value every secret's schema accepts.
      ...Object.fromEntries(APP_SECRET_ENV_KEYS.map((key) => [key, "ab".repeat(32)])),
      [DATABASE_URL_KEY]: `file:${join(importStagingDir, "child-env.db")}`,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const exited = once(child, "exit");
  onTestFinished(async () => {
    child.kill("SIGKILL");
    await exited;
  });
  let output = "";
  const listening = Promise.withResolvers<void>();
  const capture = (chunk: Buffer): void => {
    output += chunk.toString();
    if (output.includes(LISTENING)) {
      listening.resolve();
    }
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);
  expect(await Promise.race([listening.promise.then(() => "listening"), exited.then(() => "exited")]), output).toBe("listening");

  const reported = once(child, "message");
  child.send("report");
  const [inherited] = (await reported) as [readonly string[]];
  expect(inherited).toContain(INHERITED_CONTROL);
  expect(inherited.filter((key) => APP_SECRET_ENV_KEYS.includes(key as EnvKey))).toEqual([]);
  expect(inherited).not.toContain(DATABASE_URL_KEY);
});

test("a cookie mode refuses to boot over an unusable session keyfile, and leaves the file in place", { tags: "slow" }, async ({ importStagingDir }) => {
  const secrets = join(importStagingDir, DATA_LAYOUT_DIRS.secrets);
  const keyfile = join(secrets, SECRET_FILE_NAMES.sessionSecret);
  await mkdir(secrets, { recursive: true });
  await writeFile(keyfile, UNUSABLE_KEYFILE);
  const child = spawn(process.execPath, [ENTRY], {
    env: { ...entryEnv(importStagingDir), ["PORT"]: String(await freeLoopbackPort()), [AUTH_MODE_KEY]: "local" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = once(child, "close");
  let output = "";
  // A listening server has failed the refusal, so stop it now rather than wait for the test timeout.
  const capture = (chunk: Buffer): void => {
    output += chunk.toString();
    if (output.includes(LISTENING)) {
      child.kill("SIGKILL");
    }
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  const [code] = await closed;
  expect(code, output).toBe(1);
  expect(await readFile(keyfile, "utf8")).toBe(UNUSABLE_KEYFILE);
});
