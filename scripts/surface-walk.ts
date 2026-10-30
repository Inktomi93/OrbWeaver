import { appendFileSync, existsSync } from "node:fs";
import { appendFile, cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { AUTH_MODES } from "@orb/contracts/identity";
import { systemTimers } from "@orb/server/infra/timers";
import { SURFACE_DATA_MODES } from "@orb/testkit/iso";
import type { PreparedSurfaceData } from "@orb/testkit/node/helpers";
import {
  assertSurfaceLocalExecution,
  assertSurfaceRunOutput,
  createSurfaceArtifactRun,
  initializeSurfaceAgentEntry,
  openPreparedSurfaceRoot,
  prepareSurfaceData,
  SURFACE_AGENT_ENTRY,
  SURFACE_AGENT_SUMMARY,
  SURFACE_NATIVE_TIMEOUT_MS,
  SURFACE_OUTPUT_ROOT_ENV,
  SURFACE_RUN_CONFIG_ENV,
  surfaceClientBuildKey,
  surfaceNativeTimeout,
  surfaceReadCommand,
  surfaceRunConfigSchema,
} from "@orb/testkit/node/helpers";
import { runTool, UsageError } from "@orb/tooling/floor/cli/run-tool";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { joinRunMarkerSweep, mintRunMarker, runMarkerEnv, runMarkerTranscriptTeardown } from "@orb/tooling/floor/process/run-marker";
import { z } from "zod";

const REPORT_TEARDOWN_RESERVE_MS = 60_000;
const BUILD_TIMEOUT_MS = 180_000;
const PRIVATE_UMASK = 0o077;
const CLIENT_BUILDS_DIRECTORY = "client-builds";
const NATIVE_CONFIG = { walk: "playwright-surface.config.ts", controls: "playwright-surface-controls.config.ts" } as const;

function setPrivateCreationMode(): void {
  if (process.platform !== "win32") {
    process.umask(PRIVATE_UMASK);
  }
}

async function privateParent(requested: string | undefined): Promise<string> {
  if (requested !== undefined) {
    return resolve(requested);
  }
  const root = join(homedir(), ".local", "state", "orbweaver", "surface-walk");
  await mkdir(root, { recursive: true, mode: 0o700 });
  return root;
}

async function rememberRun(privateRoot: string, runRoot: string): Promise<void> {
  await initializeSurfaceAgentEntry(runRoot);
  const pointer = join(privateRoot, "latest.json");
  await assertSurfaceRunOutput(privateRoot, pointer);
  await writeFile(pointer, JSON.stringify({ runRoot }), { mode: 0o600 });
  process.stdout.write(`Surface local artifacts: ${runRoot}\n`);
}

async function assertNativeArguments(args: readonly string[]): Promise<void> {
  surfaceNativeTimeout(args, budget(SURFACE_NATIVE_TIMEOUT_MS), budget(REPORT_TEARDOWN_RESERVE_MS));
  const { assertPrivateCorpusOutputArguments, isPrivateCorpusConfigArgument } = await import("@orb/testkit/node/composed");
  assertPrivateCorpusOutputArguments(args);
  if (args.some(isPrivateCorpusConfigArgument)) {
    throw new UsageError("Surface artifacts require the dedicated local native configuration");
  }
  if (args.includes("--pass-with-no-tests")) {
    throw new UsageError("Surface walkthrough selection must collect actual native tests");
  }
}

async function nativeRun(command: keyof typeof NATIVE_CONFIG, runRoot: string, args: readonly string[], configFile?: string): Promise<number> {
  const marker = mintRunMarker();
  const temporary = join(runRoot, "tmp");
  await mkdir(temporary, { mode: 0o700 });
  const log = join(runRoot, "native.log");
  await assertSurfaceRunOutput(runRoot, log);
  try {
    const result = await spawnNicedTranscript(
      "pnpm",
      ["--config.verify-deps-before-run=false", "exec", "playwright", "test", `--config=${NATIVE_CONFIG[command]}`, ...args],
      {
        cwd: process.cwd(),
        env: inheritedProcessEnv({
          ...runMarkerEnv(marker),
          [SURFACE_OUTPUT_ROOT_ENV]: runRoot,
          [SURFACE_RUN_CONFIG_ENV]: configFile,
          TMPDIR: temporary,
          TMP: temporary,
          TEMP: temporary,
        }),
        timeoutMs: surfaceNativeTimeout(args, budget(SURFACE_NATIVE_TIMEOUT_MS), budget(REPORT_TEARDOWN_RESERVE_MS)) + budget(REPORT_TEARDOWN_RESERVE_MS),
        teardown: runMarkerTranscriptTeardown(marker),
        onChunk: (chunk) => appendFileSync(log, chunk, { mode: 0o600 }),
      },
    );
    await writeFile(log, result.transcript, { mode: 0o600 });
    await appendFile(
      join(runRoot, SURFACE_AGENT_ENTRY),
      `\n## Launcher process receipt\n\nNative child exit: ${String(result.code)}. A null exit is incomplete, not a native test verdict. Full process transcript: ${log}.\n`,
      { mode: 0o600 },
    );
    process.stdout.write(`Surface ${command}: exit=${String(result.code)}; local artifacts: ${runRoot}\n`);
    return result.code ?? 2;
  } finally {
    await joinRunMarkerSweep(marker);
  }
}

/** Route the read-first entry to the retained cause whenever the launcher stops before native collection. */
async function recordLauncherFailure(runRoot: string, stage: string, evidence: string): Promise<void> {
  await appendFile(
    join(runRoot, SURFACE_AGENT_ENTRY),
    `\n## Launcher failure\n\n${stage} did not complete. Original private cause: ${evidence}. No completed coverage is claimed by this failure.\n`,
    { mode: 0o600 },
  );
  process.stderr.write(`Surface E2E incomplete: ${stage}; cause retained at ${evidence}\n`);
}

/** Reuse the production client build whose source key matches the tree; build and retain it otherwise. Only the
 *  current key is kept, and a build whose inputs changed while it ran is refused rather than cached as current. */
async function currentClientBuild(privateRoot: string, runRoot: string, buildLog: string): Promise<string | null> {
  const builds = join(privateRoot, CLIENT_BUILDS_DIRECTORY);
  await mkdir(builds, { recursive: true, mode: 0o700 });
  const key = surfaceClientBuildKey(process.cwd());
  const current = join(builds, key);
  if (existsSync(join(current, "index.html"))) {
    await writeFile(buildLog, `Reused production client build ${key}; its build inputs match the working tree.\n`, { mode: 0o600 });
    return current;
  }
  const buildTemporary = join(runRoot, "build-tmp");
  await mkdir(buildTemporary, { mode: 0o700 });
  const pending = join(builds, `${key}.pending-${String(process.pid)}`);
  const build = await spawnNicedTranscript("pnpm", ["--filter", "@orb/client", "exec", "vite", "build", "--configLoader", "native", "--outDir", pending], {
    cwd: process.cwd(),
    env: inheritedProcessEnv({ ORB_ENV_NO_FILE: "1", TMPDIR: buildTemporary, TMP: buildTemporary, TEMP: buildTemporary }),
    timeoutMs: budget(BUILD_TIMEOUT_MS),
    onChunk: (chunk) => appendFileSync(buildLog, chunk, { mode: 0o600 }),
  });
  await writeFile(buildLog, build.transcript, { mode: 0o600 });
  if (build.code !== 0 || surfaceClientBuildKey(process.cwd()) !== key) {
    await rm(pending, { recursive: true, force: true });
    return null;
  }
  // Retire superseded builds; another launcher's in-progress build stays its own to finish or discard.
  for (const entry of await readdir(builds)) {
    if (!entry.includes(".pending-")) {
      await rm(join(builds, entry), { recursive: true, force: true });
    }
  }
  await rename(pending, current);
  return current;
}

async function preparedWalk(privateRoot: string, prepared: PreparedSurfaceData, authValue: string | undefined, nativeArgs: readonly string[]): Promise<number> {
  const clientDirectory = join(prepared.runRoot, "client");
  const buildLog = join(prepared.runRoot, "build.log");
  const buildTemporary = join(prepared.runRoot, "showcase-tmp");
  await mkdir(buildTemporary, { mode: 0o700 });
  const showcaseLog = join(prepared.runRoot, "showcase-build.log");
  const showcase = await spawnNicedTranscript("pnpm", ["--filter", "@orb/showcase-plugins", "build"], {
    cwd: process.cwd(),
    env: inheritedProcessEnv({ ORB_ENV_NO_FILE: "1", TMPDIR: buildTemporary, TMP: buildTemporary, TEMP: buildTemporary }),
    timeoutMs: budget(BUILD_TIMEOUT_MS),
    onChunk: (chunk) => appendFileSync(showcaseLog, chunk, { mode: 0o600 }),
  });
  await writeFile(showcaseLog, showcase.transcript, { mode: 0o600 });
  if (showcase.code !== 0) {
    await recordLauncherFailure(prepared.runRoot, "Showcase plugin build", showcaseLog);
    return 2;
  }
  const build = await currentClientBuild(privateRoot, prepared.runRoot, buildLog);
  if (build === null) {
    await recordLauncherFailure(prepared.runRoot, "Production client build", buildLog);
    return 2;
  }
  // The run serves its own copy, so a later build cannot change the bytes this run's evidence describes.
  await cp(build, clientDirectory, { recursive: true });
  const authMode = z.enum(AUTH_MODES).parse(authValue ?? (prepared.dataMode === "owner" ? "single-user" : "local"));
  await using server = await openPreparedSurfaceRoot(prepared, {
    clientDistDir: clientDirectory,
    authMode,
    time: { now: () => Date.now(), monotonicNow: () => performance.now(), timers: systemTimers },
  });
  const config = surfaceRunConfigSchema.parse({
    runRoot: prepared.runRoot,
    dataMode: prepared.dataMode,
    dataDirectory: prepared.layout.root,
    clientDirectory,
    provenancePath: join(prepared.runRoot, "provenance.json"),
    origin: server.origin,
    owner: prepared.owner,
    composition: "production-composed-harness",
    jobs: "disabled",
    rateLimitWindowMs: server.root.env.RATE_LIMIT_WINDOW_MS,
    authentication: server.authentication,
    generation: server.generation,
    subjects: server.subjects,
  });
  const configFile = join(prepared.runRoot, "native-config.json");
  await writeFile(configFile, JSON.stringify(config), { mode: 0o600, flag: "wx" });
  await writeFile(join(prepared.runRoot, "plugin-posture.json"), JSON.stringify(server.pluginPosture), { mode: 0o600, flag: "wx" });
  return await nativeRun("walk", prepared.runRoot, nativeArgs, configFile);
}

async function printAgentEntry(runRoot: string): Promise<void> {
  const entry = join(runRoot, SURFACE_AGENT_ENTRY);
  process.stdout.write(`Surface run root: ${runRoot}\nAgent entry: ${entry}\nRead: ${surfaceReadCommand(entry)}\n`);
  try {
    process.stdout.write(await readFile(join(runRoot, SURFACE_AGENT_SUMMARY), "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
    process.stdout.write(`No native summary: collection did not complete. Read the agent entry first: ${surfaceReadCommand(entry)}\n`);
  }
}

async function controlsRun(
  privateRoot: string,
  nativeArgs: readonly string[],
  values: { readonly data?: string; readonly "owner-data"?: string },
  remember: (root: string) => Promise<void>,
): Promise<number> {
  if (values.data !== undefined || values["owner-data"] !== undefined) {
    throw new UsageError("Framework controls use only their synthetic browser fixtures and take no application dataset");
  }
  const root = await createSurfaceArtifactRun(privateRoot);
  await remember(root);
  return await nativeRun("controls", root, nativeArgs);
}

await runTool(async () => {
  const environment = inheritedProcessEnv();
  assertSurfaceLocalExecution(environment);
  const [command, ...args] = process.argv.slice(2);
  if (command !== "walk" && command !== "controls") {
    throw new UsageError("surface-walk requires walk --data=synthetic|owner or controls");
  }
  const separator = args.indexOf("--");
  const ownArgs = separator === -1 ? args : args.slice(0, separator);
  const nativeArgs = separator === -1 ? [] : args.slice(separator + 1);
  const { values } = parseArgs({
    args: ownArgs,
    options: { data: { type: "string" }, auth: { type: "string" }, "private-root": { type: "string" }, "owner-data": { type: "string" } },
  });
  await assertNativeArguments(nativeArgs);
  const privateRoot = await privateParent(values["private-root"]);
  setPrivateCreationMode();
  let runRoot: string | undefined;
  try {
    if (command === "controls") {
      return await controlsRun(privateRoot, nativeArgs, values, async (root) => {
        runRoot = root;
        await rememberRun(privateRoot, root);
      });
    }
    const mode = z.enum(SURFACE_DATA_MODES).safeParse(values.data);
    if (!mode.success) {
      throw new UsageError("Select --data=synthetic or --data=owner explicitly");
    }
    await using prepared = await prepareSurfaceData({
      dataMode: mode.data,
      privateRoot,
      onRunCreated: async (root) => {
        runRoot = root;
        await rememberRun(privateRoot, root);
      },
      ...(values["owner-data"] === undefined ? {} : { ownerDataDirectory: resolve(values["owner-data"]) }),
    });
    return await preparedWalk(privateRoot, prepared, values.auth, nativeArgs);
  } catch (error) {
    if (runRoot === undefined) {
      throw error;
    }
    const failure = join(runRoot, "launcher-failure.txt");
    await writeFile(failure, error instanceof Error ? (error.stack ?? error.message) : String(error), { mode: 0o600 });
    await recordLauncherFailure(runRoot, "Launcher execution", failure);
    return 2;
  } finally {
    if (runRoot !== undefined) {
      await printAgentEntry(runRoot);
    }
  }
});
