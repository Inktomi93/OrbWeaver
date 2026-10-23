// @subject packages/server/src/entry/compose/chat.ts
// @subject packages/server/src/primitives/regex/index.ts
// @subject packages/server/src/domain/chat/assembly/context.ts
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { z } from "zod";

const CHILD_DEADLINE_MS = 20_000;
const LOG_LEVEL_ENV = "LOG_LEVEL";
const stageSchema = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("executing"), mode: z.string() }),
  z.object({ stage: z.literal("complete"), mode: z.string(), maxRssKiB: z.number() }),
]);

for (const mode of ["normal", "full", "latest"] as const) {
  test(
    `the production root preserves ${mode} world-info key outcomes under the watchdog`,
    async () => {
      await using lifetime = new AsyncDisposableStack();
      const rootDir = await mkdtemp(join(tmpdir(), "orb-world-info-watchdog-"));
      lifetime.defer(() => rm(rootDir, { recursive: true, force: true }));
      const child = spawn(process.execPath, [fileURLToPath(new URL("./world-info-watchdog-child.ts", import.meta.url)), mode, rootDir], {
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        env: { ...inheritedProcessEnv(), [LOG_LEVEL_ENV]: "warn" },
        timeout: CHILD_DEADLINE_MS,
        killSignal: "SIGKILL",
      });
      const finished = Promise.withResolvers<{ code: number | null; signal: NodeJS.Signals | null }>();
      child.once("error", finished.reject);
      child.once("close", (code, signal) => finished.resolve({ code, signal }));
      lifetime.defer(async () => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
        await finished.promise;
      });
      const stages: z.infer<typeof stageSchema>[] = [];
      child.on("message", (message) => stages.push(stageSchema.parse(message)));
      if (child.stdout === null || child.stderr === null) {
        throw new Error("the native watchdog child did not create its requested output pipes");
      }
      let output = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        output += chunk;
      });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        output += chunk;
      });
      const result = await finished.promise;
      expect(stages[0], output).toEqual({ stage: "executing", mode });
      expect(result, JSON.stringify({ stages, output })).toEqual({ code: 0, signal: null });
      expect(stages[1]).toMatchObject({ stage: "complete", mode });
      const complete = stages[1];
      expect(complete?.stage === "complete" && complete.maxRssKiB < 2 * 1024 * 1024).toBe(true);
      expect(stages).toHaveLength(2);
    },
    CHILD_DEADLINE_MS + 5000,
  );
}
