// @subject scripts/corpus-fixture.ts
// @subject scripts/corpus-fixture-lifetime.ts
// The native clone's module graph belongs to import time, not the case's execution budget.
import "@orb/tooling/snap";
import { once } from "node:events";
import { watch } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as physicalTurn } from "node:timers/promises";
import { localPath } from "@orb/db";
import type { BoxLoad } from "@orb/tooling/floor/host/load-budget";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { processCompletion } from "@orb/tooling/floor/host/platform";
import { spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { joinRunMarkerSweep, mintRunMarker, runMarkerEnv } from "@orb/tooling/floor/process/run-marker";
import { TERM_GRACE_BASE_MS } from "@orb/tooling/floor/process/stop-escalation";
import {
  PRIVATE_EXECUTION_EXPIRY_ENV,
  privateCorpusExecutionEnv,
  privateCorpusExecutionSignal,
  privateCorpusTranscriptTeardown,
} from "../../../scripts/corpus-fixture-lifetime.ts";
import { createCorpusCapsule, loadCorpusFixture, writePrivateCorpusFixture } from "./corpus.ts";
import { createCorpusRecipe } from "./corpus-recipe.ts";
import { expect, test } from "./fixtures.ts";

// Private admission refuses a CI environment; these tests run in CI, so they hand it an environment without those flags.
const LOCAL_ENVIRONMENT = inheritedProcessEnv({ ["CI"]: undefined, ["GITHUB_ACTIONS"]: undefined });

test("the private parent overwrites expiry before startup and reserves canonical grace inside its one hard budget", async () => {
  const quietBox = (): BoxLoad => ({ loadavg1: 0, cpuCount: 24 });
  const hardBudgetMs = budget(600_000, quietBox);
  const start = 1_800_000_000_000;
  let clockReads = 0;
  const env = privateCorpusExecutionEnv(
    hardBudgetMs,
    () => {
      clockReads += 1;
      return start;
    },
    quietBox,
    (overrides) => ({ [PRIVATE_EXECUTION_EXPIRY_ENV]: "untrusted inherited expiry", ...overrides }),
  );
  const expiry = env[PRIVATE_EXECUTION_EXPIRY_ENV];
  expect(clockReads).toBe(1);
  expect(Number(expiry) - start + budget(TERM_GRACE_BASE_MS, quietBox)).toBe(hardBudgetMs);
  const signal = privateCorpusExecutionSignal(expiry, () => Number(expiry) - 20);
  expect(signal.aborted).toBe(false);
  await once(signal, "abort");
  expect(signal.aborted).toBe(true);
  expect(signal.reason).toMatchObject({ name: "TimeoutError" });
  const expired = privateCorpusExecutionSignal(expiry, () => Number(expiry));
  expect(expired.aborted).toBe(true);
  expect(() => expired.throwIfAborted()).toThrow(expired.reason);
});

test("private child metadata refuses missing, nonfinite and negative expiry without echoing it", () => {
  for (const expiry of [undefined, "", " ", "not an epoch", "NaN", "Infinity", "-Infinity", "-1"]) {
    expect(() => privateCorpusExecutionSignal(expiry, () => 0)).toThrow(/^Private corpus execution expiry is missing or invalid$/u);
  }
  expect(privateCorpusExecutionSignal("0", () => 0).aborted).toBe(true);
});

test("expired setup refuses before capsule filesystem or graph work begins", async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-corpus-expired-setup-"));
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(() => rm(parent, { recursive: true, force: true }));
  const { options } = await createCorpusRecipe(parent);
  const signal = privateCorpusExecutionSignal("0", () => 0);
  const directory = join(parent, "never-created");
  await expect(createCorpusCapsule({ ...options, server: { ...options.server, workloadExecutionSignal: signal }, directory })).rejects.toBe(signal.reason);
  await expect(access(directory)).rejects.toThrow();
});

test("private copy joins its native stage and removes late output instead of promoting a fixture", { timeout: budget(15_000) }, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-corpus-expired-copy-"));
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(() => rm(parent, { recursive: true, force: true }));
  const published = loadCorpusFixture();
  if (published.replay === undefined) {
    throw new Error("The native fixture source has no replay state");
  }
  const source = { ...published, replay: published.replay, privateParent: parent };
  const database = localPath(source.layout.databaseUrl);
  if (database === undefined) {
    throw new Error("The native fixture source is not local");
  }
  const before = await readFile(database);
  const controller = new AbortController();
  const reason = new DOMException("The caller expired during fixture copy", "TimeoutError");
  const directory = join(parent, "late-fixture");
  const reached = Promise.withResolvers<void>();
  const watcher = watch(parent, (_event, filename) => {
    if (filename === "late-fixture") {
      reached.resolve();
      controller.abort(reason);
    }
  });
  try {
    const result = writePrivateCorpusFixture(source, directory, controller.signal, LOCAL_ENVIRONMENT).then(
      () => null,
      (error: unknown) => error,
    );
    await reached.promise;
    expect(await result).toBe(reason);
  } finally {
    watcher.close();
  }
  await expect(access(directory)).rejects.toThrow();
  // Byte identity through Buffer#equals: a deep `toEqual` walks the multi-megabyte database one element at a time.
  expect((await readFile(database)).equals(before)).toBe(true);
  const refused = join(parent, "pre-expired");
  await expect(writePrivateCorpusFixture(source, refused, controller.signal, LOCAL_ENVIRONMENT)).rejects.toBe(reason);
  await expect(access(refused)).rejects.toThrow();
  const completed = await writePrivateCorpusFixture(source, join(parent, "completed"), undefined, LOCAL_ENVIRONMENT);
  expect(completed.wire).toEqual(source.wire);
});

test("private timeout retirement waits for observed completion and refuses unknown ownership", async () => {
  const marker = mintRunMarker(800, 1_800_000_000_000);
  const release = Promise.withResolvers<void>();
  let gone = false;
  let joined = false;
  let sleeps = 0;
  const deps = {
    selfPid: 800,
    processTable: () => [{ pid: 810, ppid: 1, cmdline: "native child", environ: null, cpuMs: null }],
    parentOf: () => 1,
    identitiesOf: () => [marker],
    alive: () => !gone,
    signal: (): void => undefined,
    completionOf: () => (gone ? ({ kind: "gone" } as const) : ({ kind: "live", identity: "original" } as const)),
    sleep: async (): Promise<void> => {
      if (++sleeps > 1) {
        await release.promise;
      }
    },
  };
  const completion = privateCorpusTranscriptTeardown(marker, deps)
    .afterTimeoutKill()
    .then(() => {
      joined = true;
    });
  try {
    await physicalTurn();
    expect(joined).toBe(false);
  } finally {
    gone = true;
    release.resolve();
    await completion;
  }
  expect(joined).toBe(true);
  await expect(privateCorpusTranscriptTeardown(marker, { ...deps, completionOf: () => ({ kind: "unknown" }) }).afterTimeoutKill()).rejects.toThrow(
    "identity unavailable",
  );
});

test("private hard timeout joins its group and escaped marked descendant before reporting completion", { timeout: budget(60_000) }, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-private-retirement-"));
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(() => rm(parent, { recursive: true, force: true }));
  const marker = mintRunMarker();
  const escaped = join(parent, "escaped.pid");
  const script = `setsid bash -c 'echo $$ > ${escaped}; exec sleep 600' > /dev/null 2>&1 & sleep 600`;
  try {
    const result = await spawnNicedTranscript("bash", ["-c", script], {
      cwd: parent,
      env: inheritedProcessEnv(runMarkerEnv(marker)),
      timeoutMs: budget(4000),
      teardown: privateCorpusTranscriptTeardown(marker),
    });
    expect(result.code).toBeNull();
    expect(result.transcript).toContain("TIMED OUT");
    const pid = Number((await readFile(escaped, "utf8")).trim());
    expect(Number.isSafeInteger(pid)).toBe(true);
    const completion = processCompletion(pid);
    expect(completion.kind === "gone" || completion.kind === "zombie").toBe(true);
    expect(result.transcript).not.toContain("teardown failed");
  } finally {
    await joinRunMarkerSweep(marker);
  }
});
