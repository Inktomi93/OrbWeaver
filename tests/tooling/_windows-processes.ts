// Windows-edge controls retain owned Node children and script only native process observations and termination results.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { test as toolingTest } from "@orb/testkit/tooling";
import { processInfo } from "../../tooling/src/floor/host/platform.ts";
import type { ProcessTreeRow } from "../../tooling/src/floor/host/process-tree.ts";
import type { ChildExit, FullPriorityChild, ProcessGroupDeps } from "../../tooling/src/floor/process/proc.ts";
import { spawnFullPriorityChild } from "../../tooling/src/floor/process/proc.ts";
import { SESSION_INSTRUMENT } from "../../tooling/src/snap/lib/session-plan.ts";

interface ProcessState {
  rows: ProcessTreeRow[];
  tasks: string[][];
  observationFails: boolean;
  status: number;
  removeTargets: boolean;
}

interface WindowsProcesses {
  readonly checkout: string;
  readonly root: FullPriorityChild;
  readonly rootPid: number;
  readonly rootExit: Promise<ChildExit>;
  readonly leaf: FullPriorityChild;
  readonly leafPid: number;
  readonly slotDir: string;
  readonly state: ProcessState;
  readonly process: ProcessGroupDeps;
}

export const test = toolingTest.extend<{ windows: WindowsProcesses }>({
  windows: async ({ scratch, repoRoot }, use) => {
    const checkout = join(scratch, "checkout");
    const rootScript = join(scratch, "root.mjs");
    const leafScript = join(scratch, "leaf.mjs");
    const artifactModule = pathToFileURL(join(repoRoot, "tooling/src/floor/artifacts/artifacts.ts")).href;
    writeFileSync(
      rootScript,
      `import { openRunSlot } from ${JSON.stringify(artifactModule)}; const slot = openRunSlot(${JSON.stringify(checkout)}, ${JSON.stringify(SESSION_INSTRUMENT)}); process.stdout.write(JSON.stringify({ slotDir: slot.dir })); setInterval(() => {}, 1000);`,
    );
    writeFileSync(leafScript, 'process.stdout.write("ready"); setInterval(() => {}, 1000);');
    const root = spawnFullPriorityChild(process.execPath, [rootScript, checkout], { detached: process.platform !== "win32", stdio: "pipe-stdout" });
    const leaf = spawnFullPriorityChild(process.execPath, [leafScript, checkout], { detached: process.platform !== "win32", stdio: "pipe-stdout" });
    const rootExit = root.wait();
    const leafExit = leaf.wait();
    try {
      if (root.pid === undefined || leaf.pid === undefined || root.stdout === null || leaf.stdout === null) {
        throw new Error("owned process fixture did not spawn");
      }
      const [rootReady] = await Promise.all([
        new Promise<string>((resolve) => root.stdout?.once("data", (bytes: Buffer) => resolve(bytes.toString("utf8")))),
        new Promise<void>((resolve) => leaf.stdout?.once("data", () => resolve())),
      ]);
      const metadata: unknown = JSON.parse(rootReady);
      const slotDir = typeof metadata === "object" && metadata !== null ? Reflect.get(metadata, "slotDir") : undefined;
      if (
        typeof slotDir !== "string" ||
        processInfo(root.pid)?.cmdline.includes(checkout) !== true ||
        processInfo(leaf.pid)?.cmdline.includes(checkout) !== true
      ) {
        throw new Error("owned process fixture did not establish its real checkout identity");
      }
      const state: ProcessState = {
        rows: [
          { pid: root.pid, ppid: process.pid, identity: "20" },
          { pid: leaf.pid, ppid: root.pid, identity: "30" },
        ],
        tasks: [],
        observationFails: false,
        status: 0,
        removeTargets: true,
      };
      const processEdge: ProcessGroupDeps = {
        platform: "win32",
        signal: () => {
          throw new Error("Windows must not use a POSIX signal");
        },
        run: (command, args) => {
          if (command === "powershell.exe") {
            return state.observationFails
              ? { status: 5, stdout: "", stderr: "planted observation refusal" }
              : { status: 0, stdout: JSON.stringify(state.rows), stderr: "" };
          }
          if (command !== "taskkill") {
            throw new Error(`unexpected process command ${command}`);
          }
          const targets = args.flatMap((arg, index) => (arg === "/PID" ? [Number(args[index + 1])] : []));
          if (targets.some((pid) => pid !== root.pid && pid !== leaf.pid)) {
            throw new Error("termination selected an unowned pid");
          }
          state.tasks.push([...args]);
          if (state.removeTargets && state.status === 0) {
            state.rows = state.rows.filter((row) => !targets.includes(row.pid));
          }
          return { status: state.status, stdout: "", stderr: "" };
        },
      };
      await use({ checkout, root, rootPid: root.pid, rootExit, leaf, leafPid: leaf.pid, slotDir, state, process: processEdge });
    } finally {
      root.kill("SIGKILL");
      leaf.kill("SIGKILL");
      await Promise.all([rootExit, leafExit]);
    }
  },
});

export { expect } from "@orb/testkit/tooling";
