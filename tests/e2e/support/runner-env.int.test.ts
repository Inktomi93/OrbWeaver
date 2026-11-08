// The Playwright runner's environment and import graph, observed through the real config and Playwright's own
// webServer spawn: a recording key never reaches a stack, and collecting the specs never loads the server env module.
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { AUTH_MODE_KEY } from "@orb/contracts/identity";
import { OPENROUTER_API_KEY_ENV } from "@orb/server/foundation/env/record";
import { expect, test } from "@orb/testkit/node";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { joinRunMarkerSweep, mintRunMarker, runLeaseEnv, runMarkerTranscriptTeardown } from "@orb/tooling/floor/process/run-marker";
import { LONG_TEST_TIMEOUT_BASE_MS } from "@orb/tooling/floor/testing/test-tags";
import type { TestOptions } from "vitest";
import { z } from "zod";
import { E2E_TAPE_UPSTREAM_API_KEY_ENV } from "./modes.ts";

const PLAYWRIGHT_CLI = createRequire(import.meta.url).resolve("@playwright/test/cli");
const ENV_LOADER = fileURLToPath(new URL("../../../packages/server/src/foundation/env/index.ts", import.meta.url));
const EXECUTION_MS = budget(LONG_TEST_TIMEOUT_BASE_MS);
const CASE = { tags: ["slow"], timeout: EXECUTION_MS * 2 } satisfies TestOptions;
// Every planted value carries this marker, so a probe reports which names hold one without printing a value.
const CANARY = "orb-runner-env-canary";
const CONTROL = "ORB_RUNNER_ENV_CONTROL";
// An AUTH_MODE the env schema refuses: any load of the server env module in a process holding it throws at load.
const REFUSED_AUTH_MODE = "orb-runner-env-refused";

// The webServer command is replaced with this probe; Playwright still merges and spawns the config's env itself.
const WEB_SERVER_PROBE = `import { createServer } from "node:http";
const [port, marker] = process.argv.slice(2);
const held = Object.keys(process.env).filter((key) => process.env[key]?.includes(marker)).sort();
createServer((_request, response) => response.end(JSON.stringify(held))).listen(Number(port), "127.0.0.1");
`;

// Loads the real config, then starts each configured webServer through Playwright's own plugin.
const CONFIG_PROBE = `import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import config from "./playwright.config.ts";
const [, probeFile, marker] = process.argv;
const { webServer } = createRequire(createRequire(import.meta.url).resolve("@playwright/test/cli"))("playwright/lib/runner");
const held = (env) => Object.keys(env).filter((key) => env[key]?.includes(marker)).sort();
async function freePort() {
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const { port } = socket.address();
  socket.close();
  await once(socket, "close");
  return port;
}
const servers = [];
for (const server of config.webServer) {
  const port = await freePort();
  const url = "http://127.0.0.1:" + port + "/";
  const plugin = webServer({ ...server, command: JSON.stringify(process.execPath) + " " + JSON.stringify(probeFile) + " " + port + " " + marker, url, stdout: "ignore" });
  await plugin.setup(config, process.cwd(), {});
  try {
    servers.push({ mode: server.env.AUTH_MODE, held: await (await fetch(url)).json() });
  } finally {
    await plugin.teardown();
  }
}
process.stdout.write(JSON.stringify({ runner: held(process.env), servers }));
`;

const probeReportSchema = z.object({
  runner: z.array(z.string()),
  servers: z.array(z.object({ mode: z.string(), held: z.array(z.string()) })),
});

interface RunResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly transcript: string;
}

async function runNode(args: readonly string[], env: NodeJS.ProcessEnv): Promise<RunResult> {
  const lease = mintRunMarker();
  let stdout = "";
  try {
    const result = await spawnNicedTranscript(process.execPath, args, {
      cwd: process.cwd(),
      env: inheritedProcessEnv({ ...env, ...runLeaseEnv(lease) }),
      timeoutMs: EXECUTION_MS,
      teardown: runMarkerTranscriptTeardown(lease),
      onChunk: (chunk, stream): void => {
        if (stream === "stdout") {
          stdout += chunk;
        }
      },
    });
    return { code: result.code, stdout, transcript: result.transcript };
  } finally {
    await joinRunMarkerSweep(lease);
  }
}

test("a recording runner's credentials reach no webServer, while its other variables still do", CASE, async ({ importStagingDir }) => {
  const probeFile = join(importStagingDir, "web-server-probe.mjs");
  await writeFile(probeFile, WEB_SERVER_PROBE);
  // `--list` keeps the config from minting the OIDC issuer certificate; it selects every mode.
  const run = await runNode(["--input-type=module", "-e", CONFIG_PROBE, "--", probeFile, CANARY, "--list"], {
    ["E2E_TAPE_RECORD"]: "1",
    ["E2E_LIVE"]: "0",
    ["E2E_ALLOW_DEV_TARGET"]: "0",
    [E2E_TAPE_UPSTREAM_API_KEY_ENV]: `${CANARY}-recording-key`,
    [OPENROUTER_API_KEY_ENV]: `${CANARY}-app-key`,
    [CONTROL]: `${CANARY}-control`,
  });
  expect(run.code, run.transcript).toBe(0);
  const report = probeReportSchema.parse(JSON.parse(run.stdout));
  expect(report.runner).toEqual([CONTROL, E2E_TAPE_UPSTREAM_API_KEY_ENV, OPENROUTER_API_KEY_ENV].sort());
  expect(report.servers.map(({ mode }) => mode).sort()).toEqual(["forward-header", "local", "oidc", "single-user"]);
  expect(report.servers.filter(({ held }) => held.join() !== CONTROL)).toEqual([]);
});

test("collecting every e2e spec never loads the server env module into the runner", CASE, async () => {
  const refused = { [AUTH_MODE_KEY]: REFUSED_AUTH_MODE };
  // The control: under this env, a process that loads the module refuses at load and names the key.
  const control = await runNode([`--import=${ENV_LOADER}`, "-e", ""], refused);
  expect(control.code, control.transcript).not.toBe(0);
  expect(control.transcript).toContain(AUTH_MODE_KEY);

  const collection = await runNode([PLAYWRIGHT_CLI, "test", "-c", "playwright.config.ts", "--list", "--reporter=json"], refused);
  expect(collection.code, collection.transcript).toBe(0);
  const report = z.object({ errors: z.array(z.unknown()), suites: z.array(z.unknown()) }).parse(JSON.parse(collection.stdout));
  expect(report.errors).toEqual([]);
  expect(report.suites.length).toBeGreaterThan(0);
});
