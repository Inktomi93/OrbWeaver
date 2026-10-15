// Durable corpus publication and a disposable E2E consumer; the native producer and runner retain their own policies.
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
const USAGE = "corpus-fixture requires publish <new-directory> or e2e [published-directory] [--] [native E2E arguments]";

await runTool(async () => {
  const [command, directory, ...nativeArgs] = process.argv.slice(2);
  if (command !== "publish" && command !== "e2e") {
    throw new UsageError(USAGE);
  }
  exportProcessEnv("ORB_ENV_NO_FILE", "1");
  exportProcessEnv("CORPUS_AUTOINDEX", "false");
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
