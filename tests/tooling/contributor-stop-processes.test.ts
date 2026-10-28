// The contributor entry runs unchanged apart from injected Windows OS/time edges; fallback ownership and ports stay real.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { spawnFullPriorityChild, spawnNiced } from "@orb/tooling/floor/process/proc";
import { mintRunMarker } from "@orb/tooling/floor/process/run-marker";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { z } from "zod";
import { expect, test } from "./_windows-processes.ts";

const taskSchema = z.array(z.array(z.string()));

for (const scenario of ["wrapper-exits", "wrapper-absent", "observation-refused", "termination-refused"] as const) {
  test(`contributor stop retains its process authority when ${scenario}`, async ({ windows, repoRoot, scratch }) => {
    const listenerScript = join(scratch, "listener.mjs");
    writeFileSync(
      listenerScript,
      'import net from "node:net"; const server = net.createServer(); server.listen(0, "127.0.0.1", () => process.stdout.write(String(server.address().port)));',
    );
    const listener = spawnFullPriorityChild(process.execPath, [listenerScript, windows.checkout], {
      detached: process.platform !== "win32",
      stdio: "pipe-stdout",
    });
    const exit = listener.wait();
    try {
      if (listener.stdout === null) {
        throw new Error("owned listener did not spawn");
      }
      const port = await new Promise<number>((resolve) => listener.stdout?.once("data", (bytes: Buffer) => resolve(Number(bytes.toString("utf8")))));
      expect(port).toBeGreaterThan(0);
      // Only the absent-wrapper case needs the real owned-port fallback to terminate a physical child.
      if (scenario !== "wrapper-absent") {
        listener.kill("SIGKILL");
        await exit;
      }
      const tasks = join(scratch, "taskkill.json");
      const edge = join(scratch, "process-edge.mjs");
      const entry = join(scratch, "contributor-stop.mjs");
      const proc = pathToFileURL(join(repoRoot, "tooling/src/floor/process/proc.ts")).href;
      writeFileSync(
        edge,
        `import { writeFileSync } from "node:fs";
        import { killPidGroup as kill, observeProcessGroup as observe } from ${JSON.stringify(proc)};
        let rows = ${JSON.stringify(scenario === "wrapper-absent" ? [] : windows.state.rows)};
        const tasks = [];
        process.on("exit", () => writeFileSync(${JSON.stringify(tasks)}, JSON.stringify(tasks)));
        const deps = { platform: "win32", run(command, args) {
          if (command === "powershell.exe") return { status: ${scenario === "observation-refused" ? "5" : "0"}, stdout: JSON.stringify(rows), stderr: "" };
          if (command !== "taskkill") throw new Error("unexpected process command");
          tasks.push(args);
          if (${scenario !== "termination-refused"}) rows = [];
          return { status: ${scenario === "termination-refused" ? "5" : "0"}, stdout: "", stderr: "" };
        } };
        export const killPidGroup = (pid, signal) => kill(pid, signal, deps);
        export const observeProcessGroup = pid => observe(pid, deps);
        export const setTimeout = async () => {};
        `,
      );
      const imports = new Map([
        ["@orb/tooling/floor/process/proc", pathToFileURL(edge).href],
        ["node:timers/promises", pathToFileURL(edge).href],
        ["@orb/tooling/floor/host/platform", pathToFileURL(join(repoRoot, "tooling/src/floor/host/platform.ts")).href],
        ["@orb/tooling/floor/process/process-env", pathToFileURL(join(repoRoot, "tooling/src/floor/process/process-env.ts")).href],
        ["@orb/tooling/floor/process/run-marker", pathToFileURL(join(repoRoot, "tooling/src/floor/process/run-marker.ts")).href],
        ["@orb/tooling/stack", pathToFileURL(join(repoRoot, "tooling/src/stack/index.ts")).href],
      ]);
      const source = transpileModule(readFileSync(join(repoRoot, "scripts/ci/contributor-stop.ts"), "utf8"), {
        compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ESNext },
      }).outputText.replace(/from "([^"]+)"/gu, (original: string, specifier: string) => {
        const target = imports.get(specifier);
        return target === undefined ? original : `from ${JSON.stringify(target)}`;
      });
      writeFileSync(entry, source);
      writeFileSync(join(scratch, "contributor-dev.pid"), String(windows.rootPid));
      writeFileSync(join(scratch, "contributor-dev.marker"), mintRunMarker());
      const result = await spawnNiced(process.execPath, [entry], {
        cwd: windows.checkout,
        env: {
          ["RUNNER_TEMP"]: scratch,
          ["HEALTHZ"]: `http://127.0.0.1:${String(port)}/healthz`,
          ["DEV_ORIGIN"]: `http://127.0.0.1:${String(port)}`,
        },
        timeoutMs: 20_000,
      });
      const refused = scenario === "observation-refused" || scenario === "termination-refused";
      expect(result.code, result.stderr).toBe(refused ? 1 : 0);
      expect(result.stdout.includes("No escaped dev descendants remain")).toBe(!refused);
      expect(result.stdout.includes("ports are free")).toBe(!refused);
      expect(taskSchema.parse(JSON.parse(readFileSync(tasks, "utf8")))).toEqual(
        scenario === "wrapper-absent" || scenario === "observation-refused" ? [] : [["/PID", String(windows.rootPid), "/PID", String(windows.leafPid), "/F"]],
      );
      expect(result.stdout.includes("descendant termination unverified")).toBe(scenario === "wrapper-absent");
      expect(result.stdout).not.toContain("STOPPED dev tree");
      if (scenario === "wrapper-absent") {
        await exit;
      }
      expect(windows.root.hasExited()).toBe(false);
      expect(windows.leaf.hasExited()).toBe(false);
    } finally {
      listener.kill("SIGKILL");
      await exit;
    }
  });
}
