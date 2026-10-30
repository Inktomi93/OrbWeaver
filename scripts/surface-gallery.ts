import { appendFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { readSurfaceOutputRoot } from "@orb/testkit/node/helpers";
import { runTool } from "@orb/tooling/floor/cli/run-tool";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { spawnFullPriorityChild, spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";

const BUILD_TIMEOUT_MS = 180_000;

await runTool(async () => {
  const root = await readSurfaceOutputRoot();
  const cwd = join(process.cwd(), "packages", "client");
  const output = join(root, "gallery-client");
  const common = ["exec", "vite"];
  const options = ["--configLoader", "native", "--mode", "component-test", "--outDir", output];
  const env = inheritedProcessEnv({ ORB_ENV_NO_FILE: "1" });
  const build = await spawnNicedTranscript("pnpm", [...common, "build", ...options], {
    cwd,
    env,
    timeoutMs: budget(BUILD_TIMEOUT_MS),
    onChunk: (chunk) => appendFileSync(join(root, "gallery-build.log"), chunk, { mode: 0o600 }),
  });
  if (build.code !== 0) {
    return build.code ?? 2;
  }
  const preview = spawnFullPriorityChild("pnpm", [...common, "preview", ...options], { cwd, env, stdio: "inherit" });
  const stop = (): void => {
    preview.kill("SIGTERM");
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    const result = await preview.wait();
    if (result.error !== undefined) {
      throw result.error;
    }
    return result.code ?? 2;
  } finally {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
    preview.kill("SIGTERM");
  }
});
