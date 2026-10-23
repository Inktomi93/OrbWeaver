// Durable corpus publication and native consumers; each runner retains its own isolation and cleanup policy.

import { randomBytes } from "node:crypto";
import { appendFileSync, realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { runTool, UsageError } from "@orb/tooling/floor/cli/run-tool";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { exportProcessEnv, inheritedProcessEnv, processEnvValue } from "@orb/tooling/floor/process/process-env";
import { describeRunMarkerSweep, joinRunMarkerSweep, mintRunMarker, runMarkerEnv, runMarkerTranscriptTeardown } from "@orb/tooling/floor/process/run-marker";

import { privateCorpusExecutionEnv, privateCorpusExecutionSignal, privateCorpusTranscriptTeardown } from "./corpus-fixture-lifetime.ts";

const CONSUMER_TIMEOUT_MS = 600_000;
// One corpus e2e cell runs the whole single-user or local suite in one process. CI measured a signed-in cell at about
// 35 s per test across 35 tests plus a one-minute warm-up, roughly 22 minutes, and a ten-minute budget killed every one of
// them at the sixteenth test. Thirty minutes keeps about 35% headroom over that; the other consumers keep the base above.
const E2E_CELL_TIMEOUT_MS = 1_800_000;
const LOCAL_PASSWORD_BYTES = 32;
const PRIVATE_OUTPUT_UMASK = 0o077;
const USAGE =
  "corpus-fixture requires publish <new-directory>, private <snapshot-directory>, e2e|matrix [fixture-directory] [--] [native E2E arguments], or snap [fixture-directory] [--] [native Snap arguments]";

const INTERRUPTED_EXIT = 130;

async function consumerBaseMs(command: string): Promise<number> {
  if (command === "matrix") {
    return E2E_CELL_TIMEOUT_MS * (await import("../tests/e2e/support/modes.ts")).CORPUS_PROJECT_CELLS.length;
  }
  return command === "e2e" ? E2E_CELL_TIMEOUT_MS : CONSUMER_TIMEOUT_MS;
}

async function runPrivateCorpus(command: string, directory: string | undefined, args: readonly string[]): Promise<number | undefined> {
  if (directory === undefined || directory === "--" || command === "publish") {
    return;
  }
  const { assertPrivateCorpusOutput, assertPrivateCorpusOutputArguments, assertPrivateCorpusNetwork, privateCorpusParent } = await import(
    "@orb/testkit/node/composed"
  );
  const parent = command === "private" ? realpathSync(dirname(resolve(directory))) : privateCorpusParent(resolve(directory));
  if (parent === undefined) {
    return;
  }
  if (command === "snap") {
    throw new UsageError("Private corpus Snap stages have no private output owner; use the corpus matrix");
  }
  assertPrivateCorpusOutput(parent, join(parent, "owner-corpus-run"));
  if (args.some((argument) => /^(?:--config(?:=|$)|-c)/u.test(argument))) {
    throw new UsageError("Private corpus artifacts cannot override native output ownership");
  }
  assertPrivateCorpusOutputArguments(args);
  assertPrivateCorpusNetwork();
  const inherited = processEnvValue("CORPUS_PRIVATE_RUN_ROOT");
  if (inherited !== undefined) {
    assertPrivateCorpusOutput(parent, inherited);
    return;
  }
  const timeoutMs = budget(await consumerBaseMs(command));
  const executionEnv = command === "private" ? privateCorpusExecutionEnv(timeoutMs) : inheritedProcessEnv();
  process.umask(PRIVATE_OUTPUT_UMASK);
  const runRoot = await mkdtemp(join(parent, "owner-corpus-run-"));
  const temporary = join(runRoot, "tmp");
  await mkdir(temporary);
  const log = join(runRoot, "runtime.log");
  const marker = mintRunMarker();
  const result = await spawnNicedTranscript(
    "pnpm",
    ["--config.verify-deps-before-run=false", "exec", "node", "scripts/corpus-fixture.ts", command, directory, ...args],
    {
      cwd: process.cwd(),
      env: {
        ...executionEnv,
        ...runMarkerEnv(marker),
        CORPUS_PRIVATE_RUN_ROOT: runRoot,
        TMPDIR: temporary,
        TMP: temporary,
        TEMP: temporary,
        E2E_CORPUS_REPORT_PREFIX: join(runRoot, "browser"),
      },
      timeoutMs,
      teardown: command === "private" ? privateCorpusTranscriptTeardown(marker) : runMarkerTranscriptTeardown(marker),
      onChunk: (chunk) => appendFileSync(log, chunk, { mode: 0o600 }),
    },
  );
  if (command === "private") {
    await writeFile(log, result.transcript, { mode: 0o600 });
  }
  process.stdout.write(`Private corpus artifacts: ${runRoot}\n`);
  if (command === "private" && result.code === 0) {
    process.stdout.write(`Private corpus fixture: ${join(runRoot, "fixture")}\n`);
  }
  return result.code ?? 2;
}

async function runCorpusMatrix(directory: string | undefined, args: readonly string[]): Promise<number> {
  const { CORPUS_PROJECT_CELLS, parseProjectSelection } = await import("../tests/e2e/support/modes.ts");
  const { patterns, forwarded } = parseProjectSelection(args);
  const cells = CORPUS_PROJECT_CELLS.filter(({ name }) => patterns === undefined || patterns.some((pattern) => pattern.test(name)));
  if (cells.length === 0) {
    process.stderr.write("No corpus matrix projects matched the selection\n");
    return 1;
  }
  const completed: { readonly name: string; readonly code: number }[] = [];
  for (const cell of cells) {
    process.stdout.write(`Corpus matrix cell: ${cell.name}\n`);
    const marker = mintRunMarker();
    const privateRoot = processEnvValue("CORPUS_PRIVATE_RUN_ROOT");
    const prefix = privateRoot === undefined ? `reports/e2e-corpus-matrix/${cell.name}/${marker}` : join(privateRoot, cell.name, marker);
    if (privateRoot !== undefined) {
      await mkdir(dirname(prefix), { recursive: true, mode: 0o700 });
    }
    const result = await spawnNicedTranscript(
      "pnpm",
      [
        "--config.verify-deps-before-run=false",
        "exec",
        "node",
        "scripts/corpus-fixture.ts",
        "e2e",
        ...(directory === undefined || directory === "--" ? ["--"] : [directory, "--"]),
        `--project=${cell.name}`,
        ...forwarded,
      ],
      {
        cwd: process.cwd(),
        env: inheritedProcessEnv({ ...runMarkerEnv(marker), E2E_CORPUS_REPORT_PREFIX: prefix }),
        timeoutMs: budget(E2E_CELL_TIMEOUT_MS),
        teardown: runMarkerTranscriptTeardown(marker),
        onChunk: (chunk, stream) => {
          process[stream].write(chunk);
        },
      },
    );
    const code = result.code ?? 2;
    completed.push({ name: cell.name, code });
    process.stdout.write(`Corpus matrix verdict: ${cell.name} exit=${String(code)}\n`);
    if (code > 1) {
      break;
    }
  }
  const missing = cells.filter(({ name }) => !completed.some((cell) => cell.name === name)).map(({ name }) => name);
  const failed = completed.filter(({ code }) => code !== 0);
  process.stdout.write(
    `Corpus matrix: ${String(completed.length)} of ${String(cells.length)} cells completed; failures=${JSON.stringify(failed)}; missing=${JSON.stringify(missing)}\n`,
  );
  if (missing.length > 0 || failed.some(({ code }) => code > 1)) {
    return 2;
  }
  return failed.length > 0 ? 1 : 0;
}

function runNativeSnap(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  teardown?: Parameters<typeof spawnNicedTranscript>[2]["teardown"],
): ReturnType<typeof spawnNicedTranscript> {
  return spawnNicedTranscript("pnpm", ["--config.verify-deps-before-run=false", "snap", ...args], {
    cwd: process.cwd(),
    env,
    timeoutMs: budget(CONSUMER_TIMEOUT_MS),
    onChunk: (chunk, stream) => {
      process[stream].write(chunk);
    },
    ...(teardown === undefined ? {} : { teardown }),
  });
}

async function retireCorpusSnap(owner: string, marker: string, sourceDb: string, expected: boolean): Promise<void> {
  const { readBands, rowOwner, stageMarkerRoot, tearDownStageRow } = await import("@orb/tooling/snap");
  const home = stageMarkerRoot(process.cwd());
  try {
    const rows = readBands(home).filter((candidate) => rowOwner(candidate) === owner);
    if (rows.length > 1 || (expected && rows.length !== 1)) {
      throw new Error("Corpus Snap stage ownership was not confirmed");
    }
    for (const row of rows) {
      if (row.checkout !== process.cwd() || row.dbProvenance?.copiedFrom !== sourceDb) {
        throw new Error("Corpus Snap stage clone identity was not confirmed");
      }
      process.stdout.write(`Corpus Snap stage retiring: ${JSON.stringify({ owner, band: row.band, pid: row.ownerPid, startedAt: row.startedAt, sourceDb })}\n`);
      if (tearDownStageRow(home, row, "down").kind !== "stopped") {
        throw new Error("Corpus Snap stage teardown was not confirmed");
      }
    }
  } finally {
    await joinRunMarkerSweep(marker);
  }
  if (readBands(home).some((row) => rowOwner(row) === owner)) {
    throw new Error("Corpus Snap stage teardown was not confirmed");
  }
  process.stdout.write(`Corpus Snap stage retired: ${owner} (remaining 0)\n`);
}

async function runCorpusSnap(directory: string | undefined, nativeArgs: readonly string[]): Promise<number> {
  const { parseSnapArgs, stageOwnerKey } = await import("@orb/tooling/snap");
  const args = [...nativeArgs];
  const parsed = parseSnapArgs(args);
  if (
    parsed.help ||
    parsed.stageDown ||
    parsed.stageStatus ||
    parsed.stageSweep ||
    parsed.sessionStatus ||
    parsed.sessionClose !== null ||
    parsed.sessionExport !== null ||
    parsed.sessionSweep
  ) {
    return (await runNativeSnap(args, inheritedProcessEnv())).code ?? 2;
  }
  if (parsed.session !== null || parsed.stageWait !== null) {
    throw new UsageError("A corpus Snap provider is run-owned; use a one-shot or scenario drive, not a detached session or stage waiter");
  }
  const { localPath } = await import("@orb/db");
  const { prepareCorpusSnapFixture, runCorpusSnapConsumer } = await import("@orb/testkit/node/composed");
  const prepared = await prepareCorpusSnapFixture(directory === "--" ? undefined : directory);
  const database = localPath(prepared.fixture.layout.databaseUrl);
  if (database === undefined) {
    await prepared[Symbol.asyncDispose]();
    throw new Error("A corpus Snap stage requires a local database");
  }
  args.push("--stage-db", database);
  const marker = mintRunMarker();
  const label = `corpus-${marker}`;
  const owner = stageOwnerKey(process.cwd(), label);
  const env = inheritedProcessEnv({ ...runMarkerEnv(marker), ORB_SNAP_OWNER: label });
  const state = { interrupted: false, stageExpected: false };
  const code = await runCorpusSnapConsumer(
    prepared,
    async () => {
      const result = await runNativeSnap(args, env, {
        afterTimeoutKill: async () => describeRunMarkerSweep(await joinRunMarkerSweep(marker)),
        arm: (killGroup) => {
          const cancel = (): void => {
            state.interrupted = true;
            killGroup();
          };
          const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
          for (const signal of signals) {
            process.on(signal, cancel);
          }
          return {
            dispose: () => {
              for (const signal of signals) {
                process.removeListener(signal, cancel);
              }
            },
          };
        },
      });
      state.stageExpected = result.code === 0;
      return state.interrupted ? INTERRUPTED_EXIT : (result.code ?? 2);
    },
    () => retireCorpusSnap(owner, marker, database, state.stageExpected),
    (reason) => {
      process.stderr.write(
        `Corpus Snap completion unconfirmed: ${reason}; retained provider ${prepared.provider.baseUrl}, clone ${prepared.fixture.layout.root}, owner ${owner}, wrapper pid ${process.pid}\n`,
      );
    },
  );
  process.stdout.write(`Corpus provider requests: ${JSON.stringify(prepared.provider.requests)}\n`);
  return code;
}

async function writePrivateIntake(directory: string | undefined, nativeArgs: readonly string[]): Promise<number> {
  if (directory === undefined || nativeArgs.length > 0) {
    throw new UsageError(USAGE);
  }
  const parent = processEnvValue("CORPUS_PRIVATE_RUN_ROOT");
  if (parent === undefined) {
    throw new UsageError("Private corpus intake requires its owned private output root");
  }
  const { createCorpusCapsule, writePrivateCorpusFixture, rethrowPrivateCorpusFailure } = await import("@orb/testkit/node/composed");
  const { createCorpusRecipe } = await import("@orb/testkit/node/composed");
  try {
    const workloadExecutionSignal = privateCorpusExecutionSignal();
    workloadExecutionSignal.throwIfAborted();
    const { options } = await createCorpusRecipe(parent);
    workloadExecutionSignal.throwIfAborted();
    let retainFixture = false;
    await using rejectionCleanup = new AsyncDisposableStack();
    let fixture: Awaited<ReturnType<typeof writePrivateCorpusFixture>>;
    {
      await using capsule = await createCorpusCapsule({
        ...options,
        server: { ...options.server, workloadExecutionSignal },
        privateSourceDirectory: resolve(directory),
        directory: join(parent, "working"),
      });
      workloadExecutionSignal.throwIfAborted();
      fixture = await writePrivateCorpusFixture(capsule, join(parent, "fixture"), workloadExecutionSignal);
      rejectionCleanup.defer(async (): Promise<void> => {
        if (!retainFixture) {
          await rm(fixture.layout.root, { recursive: true, force: true });
        }
      });
      workloadExecutionSignal.throwIfAborted();
    }
    workloadExecutionSignal.throwIfAborted();
    retainFixture = true;
    process.stdout.write(`Private corpus fixture: ${fixture.layout.root}\n`);
    return 0;
  } catch (error) {
    return await rethrowPrivateCorpusFailure(parent, error);
  }
}

async function runCorpusFixture(command: string, directory: string | undefined, nativeArgs: readonly string[]): Promise<number> {
  const { createCorpusCapsule, publishCorpusFixture, loadCorpusFixture, cloneCorpusFixture } = await import("@orb/testkit/node/composed");
  const parent = await mkdtemp(join(tmpdir(), "orb-corpus-fixture-"));
  let consumerCompleted = true;
  await using ownership = new AsyncDisposableStack();
  ownership.defer(async (): Promise<void> => {
    if (consumerCompleted) {
      await rm(parent, { recursive: true, force: true });
    } else {
      process.stderr.write(`Consumer completion unconfirmed; retained corpus clone parent: ${parent}\n`);
    }
  });
  if (command === "publish") {
    if (directory === undefined || nativeArgs.length > 0) {
      throw new UsageError(USAGE);
    }
    const { createCorpusRecipe } = await import("@orb/testkit/node/composed");
    const { options } = await createCorpusRecipe(parent);
    const capsule = ownership.use(await createCorpusCapsule({ ...options, directory: join(parent, "source") }));
    const published = await publishCorpusFixture(capsule, resolve(directory));
    process.stdout.write(`Published corpus: ${published.layout.root}\n`);
    return 0;
  }
  const source = directory === "--" ? undefined : directory;
  const prepared = nativeArgs.includes("--list") ? undefined : await (await import("@orb/testkit/node/composed")).prepareCorpusSnapFixture(source);
  const clone = prepared?.fixture ?? (await cloneCorpusFixture(loadCorpusFixture(source), join(parent, "consumer")));
  ownership.defer(async (): Promise<void> => {
    if (consumerCompleted) {
      await (prepared ?? clone)[Symbol.asyncDispose]();
    }
  });
  const localClone = await cloneCorpusFixture(clone, join(parent, "local"));
  ownership.defer(async (): Promise<void> => {
    if (consumerCompleted) {
      await localClone[Symbol.asyncDispose]();
    }
  });
  process.stdout.write(`Corpus E2E clone: ${clone.layout.root}\n`);
  const marker = mintRunMarker();
  let escapedCompletion: ReturnType<typeof joinRunMarkerSweep> | undefined;
  const joinEscaped = (): ReturnType<typeof joinRunMarkerSweep> => {
    escapedCompletion ??= joinRunMarkerSweep(marker);
    return escapedCompletion;
  };
  consumerCompleted = false;
  try {
    const result = await spawnNicedTranscript("pnpm", ["--config.verify-deps-before-run=false", "e2e", "--grep=@smoke", ...nativeArgs], {
      cwd: process.cwd(),
      env: inheritedProcessEnv({
        ...runMarkerEnv(marker),
        E2E_CORPUS_FIXTURE: clone.layout.root,
        E2E_CORPUS_LOCAL_FIXTURE: localClone.layout.root,
        E2E_CORPUS_OWNER_PASSWORD: randomBytes(LOCAL_PASSWORD_BYTES).toString("hex"),
        E2E_CORPUS_MEMBER_PASSWORD: randomBytes(LOCAL_PASSWORD_BYTES).toString("hex"),
        E2E_ALLOW_DEV_TARGET: "0",
        E2E_LIVE: "0",
      }),
      timeoutMs: budget(E2E_CELL_TIMEOUT_MS),
      teardown: {
        ...runMarkerTranscriptTeardown(marker),
        afterTimeoutKill: async (): Promise<string | null> => describeRunMarkerSweep(await joinEscaped()),
      },
      onChunk: (chunk, stream) => {
        process[stream].write(chunk);
      },
    });
    return result.code ?? 2;
  } finally {
    // The runner's native close and its escaped marked children precede deletion of their writable clone.
    await joinEscaped();
    consumerCompleted = true;
  }
}

await runTool(async () => {
  const [command, directory, ...trailing] = process.argv.slice(2);
  if (command === undefined || !["publish", "private", "e2e", "snap", "matrix"].includes(command)) {
    throw new UsageError(USAGE);
  }
  const nativeArgs = command !== "publish" && directory !== "--" && trailing[0] === "--" ? trailing.slice(1) : trailing;
  exportProcessEnv("ORB_ENV_NO_FILE", "1");
  exportProcessEnv("CORPUS_AUTOINDEX", "false");
  const privateResult = await runPrivateCorpus(command, directory, nativeArgs);
  if (privateResult !== undefined) {
    return privateResult;
  }
  if (command === "private") {
    return await writePrivateIntake(directory, nativeArgs);
  }
  if (command === "matrix") {
    return await runCorpusMatrix(directory, nativeArgs);
  }
  if (command === "snap") {
    return await runCorpusSnap(directory, nativeArgs);
  }
  return await runCorpusFixture(command, directory, nativeArgs);
});
