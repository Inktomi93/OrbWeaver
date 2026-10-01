import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { listProcesses, pnpmInvocation } from "@orb/tooling/_shared/platform";
import { killPidGroup } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { RUN_MARKER_ENV, runMarkerOwnerPid, sweepRunMarker } from "@orb/tooling/_shared/run-marker";
import { z } from "zod";
import { devMarkerPreload, serverSpawnPlan } from "../../../../tooling/src/dev/lib/plan.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CEILING = scaledBudget(20_000);
const childRecord = z.object({ pid: z.number().int().positive(), marker: z.string(), nodeOptions: z.string() });

for (const launcher of ["node", "pnpm"] as const) {
  test.skipIf(process.platform === "win32")(
    `${launcher}: the long-lived child owns the marker and escaped descendants remain sweepable`,
    { timeout: CEILING },
    async ({ repoRoot, scratch }) => {
      const markerFile = join(scratch, "marker");
      const descendantFile = join(scratch, "descendant.json");
      const preload = join(scratch, "preload.mjs");
      writeFileSync(preload, devMarkerPreload(markerFile, pathToFileURL(join(repoRoot, "tooling/src/_shared/run-marker.ts")).href));
      const descendant = join(scratch, "descendant.mjs");
      writeFileSync(
        descendant,
        `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(descendantFile)}, JSON.stringify({ pid: process.pid, marker: process.env[${JSON.stringify(RUN_MARKER_ENV)}], nodeOptions: process.env.NODE_OPTIONS }));
setInterval(() => {}, 1000);`,
      );
      const leader = join(scratch, "leader.mjs");
      writeFileSync(
        leader,
        `import { spawn } from "node:child_process";
spawn(process.execPath, [${JSON.stringify(descendant)}], { detached: true, stdio: "ignore" }).unref();
setInterval(() => {}, 1000);`,
      );
      const env: NodeJS.ProcessEnv = { ...inheritedProcessEnv() };
      env["NODE_OPTIONS"] = `--no-warnings --import=${pathToFileURL(preload).href}`;
      delete env[RUN_MARKER_ENV];
      writeFileSync(join(scratch, "package.json"), JSON.stringify({ private: true, scripts: { dev: "node leader.mjs" } }));
      const invocation = pnpmInvocation({ ambient: inheritedProcessEnv(), platform: process.platform, nodePath: process.execPath, args: ["run", "dev"] });
      if (invocation.kind === "refused") {
        throw new Error(invocation.reason);
      }
      const child =
        launcher === "node"
          ? spawn(process.execPath, [leader], { env, detached: true, stdio: "ignore" })
          : spawn(invocation.command, [...invocation.args], { cwd: scratch, env, detached: true, stdio: "ignore" });
      const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });
      let marker: string | undefined;
      try {
        // @orb-waive test-determinism(Date.now): this deadline bounds real OS child startup; a frozen clock cannot measure the external process. Ends if startup uses an injected clock.
        const deadline = Date.now() + CEILING / 2;
        // @orb-waive test-determinism(Date.now): polling must expire while a real child fails to publish its file. Ends if the child and polling loop share an injected clock.
        while (!existsSync(descendantFile) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const recorded = childRecord.parse(JSON.parse(readFileSync(descendantFile, "utf8")));
        marker = readFileSync(markerFile, "utf8");
        const parents = new Map(listProcesses().map((entry) => [entry.pid, entry.ppid]));
        let owner: number | null | undefined = runMarkerOwnerPid(marker);
        const seen = new Set<number>();
        while (owner !== child.pid && owner !== null && owner !== undefined && !seen.has(owner)) {
          seen.add(owner);
          owner = parents.get(owner);
        }
        expect(owner, "the marker owner must still belong to the live launched subtree").toBe(child.pid);
        expect(recorded.marker).toBe(marker);
        expect(recorded.nodeOptions).toContain("--no-warnings");
        expect(recorded.nodeOptions).not.toContain(pathToFileURL(preload).href);
        const exited = once(child, "exit");
        killPidGroup(child.pid, "SIGKILL");
        await exited;
        const swept = await sweepRunMarker(marker);
        expect([...swept.terminated, ...swept.killed]).toContain(recorded.pid);
        expect(unrelated.exitCode).toBeNull();
        expect(unrelated.signalCode).toBeNull();
      } finally {
        killPidGroup(child.pid, "SIGKILL");
        killPidGroup(unrelated.pid, "SIGKILL");
        if (marker !== undefined) {
          await sweepRunMarker(marker);
        }
      }
    },
  );
}

test("the Windows watch plan ignores directory and cache churn but restarts on loaded source edits", { timeout: CEILING }, async ({ scratch }) => {
  const serverDir = join(scratch, "server");
  const entryDir = join(serverDir, "src", "entry");
  const dependencyDir = join(scratch, "dependency", "src");
  mkdirSync(entryDir, { recursive: true });
  mkdirSync(dependencyDir, { recursive: true });
  const dependency = join(dependencyDir, "value.ts");
  writeFileSync(dependency, 'export const value = "first";');
  writeFileSync(
    join(entryDir, "index.ts"),
    `import { value } from ${JSON.stringify(pathToFileURL(dependency).href)}; console.log("BOOT:" + value); setInterval(() => {}, 1000);`,
  );
  const plan = serverSpawnPlan({
    platform: "win32",
    nodePath: process.execPath,
    server: { name: "@orb/server", dir: serverDir, workspaceDeps: [] },
    watchRoots: [join(serverDir, "src"), dependencyDir],
    cwd: scratch,
    env: {},
  });
  const child = spawn(plan.command, [...plan.args], { cwd: plan.cwd, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    output += chunk;
  });
  try {
    await expect.poll(() => output, { timeout: scaledBudget(5000) }).toContain("BOOT:first");
    utimesSync(dependencyDir, new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"));
    writeFileSync(join(dependencyDir, "cache.tmp"), "unrelated");
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(output.match(/BOOT:/gu)).toHaveLength(1);
    writeFileSync(dependency, 'export const value = "second";');
    await expect.poll(() => output, { timeout: scaledBudget(5000) }).toContain("BOOT:second");
    expect(output.match(/BOOT:/gu)).toHaveLength(2);
  } finally {
    const exited = once(child, "exit");
    killPidGroup(child.pid, "SIGKILL");
    await exited;
  }
});
