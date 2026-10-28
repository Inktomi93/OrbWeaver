// Real listeners and private production records establish ownership; only the native process/time edges are scripted.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { test as toolingTest } from "@orb/testkit/tooling";
import type { ChildExit, FullPriorityChild, ProcessGroupDeps, RunNicedSyncResult } from "@orb/tooling/floor/process/proc";
import { spawnFullPriorityChild } from "@orb/tooling/floor/process/proc";
import { vi } from "vitest";
import type { ProcessTreeRow } from "../../../../tooling/src/floor/host/process-tree.ts";
import type { ProdRecord } from "../../../../tooling/src/stack/contract/types.ts";
import { serializeProdRecord } from "../../../../tooling/src/stack/lib/prod-record.ts";
import { RUN_DIR_ENV } from "../../../../tooling/src/stack/lib/stack-plan.ts";

interface StopFixture {
  readonly record: ProdRecord;
  readonly pidfile: string;
  readonly root: FullPriorityChild;
  readonly exited: Promise<ChildExit>;
  readonly leaf: FullPriorityChild;
  readonly leafPid: number;
  readonly process: ProcessGroupDeps;
  readonly state: {
    rows: ProcessTreeRow[];
    observation: RunNicedSyncResult | undefined;
    status: number;
    remove: "all" | "root" | "none";
    tasks: readonly string[][];
  };
  readonly now: () => number;
  readonly pause: (ms: number) => Promise<void>;
  readonly original: string;
}

export const test = toolingTest.extend<{ stop: StopFixture }>({
  stop: async ({ scratch, repoRoot }, use) => {
    const source = `const http = require("node:http"); const server = http.createServer((req, res) => { if (req.url === "/healthz") { res.end(JSON.stringify({harness:false})); } else { res.statusCode=404; res.end(); } }); process.on("SIGTERM", () => {}); server.listen(0,"127.0.0.1",()=>console.log(server.address().port));`;
    const root = spawnFullPriorityChild(process.execPath, ["-e", source], { detached: process.platform !== "win32", stdio: "pipe-stdout" });
    const leaf = spawnFullPriorityChild(process.execPath, ["-e", "setInterval(() => {},1000)"], { stdio: "ignore" });
    const exited = root.wait();
    const leafExited = leaf.wait();
    try {
      if (root.pid === undefined || leaf.pid === undefined || root.stdout === null) {
        throw new Error("owned listener fixture did not spawn");
      }
      const port = await Promise.race([
        new Promise<number>((resolve) => root.stdout?.once("data", (data: Buffer) => resolve(Number(data.toString("utf8").trim())))),
        exited.then((): never => {
          throw new Error("owned listener exited before binding");
        }),
      ]);
      vi.stubEnv(RUN_DIR_ENV, scratch);
      const record: ProdRecord = {
        mode: "prod",
        pid: root.pid,
        pgid: root.pid,
        port,
        startedAt: new Date(0).toISOString(),
        debug: false,
        repoRoot,
        logPath: join(scratch, "prod.log"),
      };
      const pidfile = join(scratch, "prod.json");
      writeFileSync(pidfile, serializeProdRecord(record));
      writeFileSync(record.logPath, "");
      const state: StopFixture["state"] = {
        rows: [
          { pid: root.pid, ppid: process.pid, identity: "20" },
          { pid: leaf.pid, ppid: root.pid, identity: "30" },
        ],
        observation: undefined,
        status: 0,
        remove: "all",
        tasks: [],
      };
      const processEdge: ProcessGroupDeps = {
        platform: "win32",
        signal: () => {
          throw new Error("Windows must not use POSIX process signals");
        },
        run: (command, args) => {
          if (command === "powershell.exe") {
            return state.observation ?? { status: 0, stdout: JSON.stringify(state.rows), stderr: "" };
          }
          if (command !== "taskkill") {
            throw new Error(`unexpected process command ${command}`);
          }
          state.tasks = [...state.tasks, [...args]];
          if (state.remove === "all") {
            state.rows = [];
          } else if (state.remove === "root") {
            state.rows = state.rows.filter((row) => row.pid !== root.pid);
          }
          return { status: state.status, stdout: "", stderr: "" };
        },
      };
      let now = 0;
      await use({
        record,
        pidfile,
        root,
        exited,
        leaf,
        leafPid: leaf.pid,
        process: processEdge,
        state,
        original: readFileSync(pidfile, "utf8"),
        now: () => now,
        pause: (ms) => {
          now += ms;
          return Promise.resolve();
        },
      });
    } finally {
      root.kill("SIGKILL");
      leaf.kill("SIGKILL");
      await Promise.all([exited, leafExited]);
      vi.unstubAllEnvs();
    }
  },
});

export { expect } from "@orb/testkit/tooling";
