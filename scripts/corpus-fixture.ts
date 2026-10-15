// Durable corpus publication and native consumers; each runner retains its own isolation and cleanup policy.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { runTool, UsageError } from "@orb/tooling/floor/cli/run-tool";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { exportProcessEnv, inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { describeRunMarkerSweep, joinRunMarkerSweep, mintRunMarker, runMarkerEnv, runMarkerTranscriptTeardown } from "@orb/tooling/floor/process/run-marker";

const CONSUMER_TIMEOUT_MS = 600_000;
const USAGE =
  "corpus-fixture requires publish <new-directory>, e2e [published-directory] [--] [native E2E arguments], or snap [published-directory] [--] [native Snap arguments]";

async function runCorpusSnap(directory: string | undefined, nativeArgs: readonly string[]): Promise<number> {
  const { parseSnapArgs } = await import("@orb/tooling/snap");
  const args = [...nativeArgs];
  if (!parseSnapArgs(args).help) {
    const { localPath } = await import("@orb/db");
    const { loadCorpusFixture } = await import("@orb/testkit/node/corpus.ts");
    const source = loadCorpusFixture(directory === "--" ? undefined : directory);
    const database = localPath(source.layout.databaseUrl);
    if (database === undefined) {
      throw new Error("A corpus Snap stage requires a local database");
    }
    args.push("--stage-db", database);
  }
  // Snap's existing stage owner clones DB/CAS, retains the warm stage and handles --stage-down.
  const result = await spawnNicedTranscript("pnpm", ["--config.verify-deps-before-run=false", "snap", ...args], {
    cwd: process.cwd(),
    env: inheritedProcessEnv(),
    timeoutMs: budget(CONSUMER_TIMEOUT_MS),
    onChunk: (chunk, stream) => {
      process[stream].write(chunk);
    },
  });
  return result.code ?? 2;
}

await runTool(async () => {
  const [command, directory, ...trailing] = process.argv.slice(2);
  if (command !== "publish" && command !== "e2e" && command !== "snap") {
    throw new UsageError(USAGE);
  }
  const nativeArgs = command !== "publish" && directory !== "--" && trailing[0] === "--" ? trailing.slice(1) : trailing;
  exportProcessEnv("ORB_ENV_NO_FILE", "1");
  exportProcessEnv("CORPUS_AUTOINDEX", "false");
  if (command === "snap") {
    return await runCorpusSnap(directory, nativeArgs);
  }
  const { createCorpusCapsule, publishCorpusFixture, loadCorpusFixture, cloneCorpusFixture } = await import("@orb/testkit/node/corpus.ts");
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
    const { createCorpusRecipe } = await import("@orb/testkit/node/corpus-recipe.ts");
    const { options } = await createCorpusRecipe(parent);
    const capsule = ownership.use(await createCorpusCapsule({ ...options, directory: join(parent, "source") }));
    const published = await publishCorpusFixture(capsule, resolve(directory));
    process.stdout.write(`Published corpus: ${published.layout.root}\n`);
    return 0;
  }
  const published = loadCorpusFixture(directory === "--" ? undefined : directory);
  const clone = await cloneCorpusFixture(published, join(parent, "consumer"));
  ownership.defer(async (): Promise<void> => {
    if (consumerCompleted) {
      await clone[Symbol.asyncDispose]();
    }
  });
  const marker = mintRunMarker();
  let escapedCompletion: ReturnType<typeof joinRunMarkerSweep> | undefined;
  const joinEscaped = (): ReturnType<typeof joinRunMarkerSweep> => {
    escapedCompletion ??= joinRunMarkerSweep(marker);
    return escapedCompletion;
  };
  consumerCompleted = false;
  try {
    const result = await spawnNicedTranscript("pnpm", ["--config.verify-deps-before-run=false", "e2e:smoke", ...nativeArgs], {
      cwd: process.cwd(),
      env: inheritedProcessEnv({ ...runMarkerEnv(marker), E2E_CORPUS_FIXTURE: clone.layout.root, E2E_ALLOW_DEV_TARGET: "0", E2E_LIVE: "0" }),
      timeoutMs: budget(CONSUMER_TIMEOUT_MS),
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
});
