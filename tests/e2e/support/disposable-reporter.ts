// Native CLI reporting follows webServer teardown; uncertain shutdown retains the run's data.
import { existsSync } from "node:fs";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { dirname, join, sep } from "node:path";
import process from "node:process";
import type { FullResult, Reporter } from "@playwright/test/reporter";
import { E2E_REPORT_PREFIX, E2E_RUN_IS_OWNER, E2E_RUN_ROOT, selectedModeProjects } from "./modes.ts";

const LOG_TAIL_BYTES = 256 * 1024;
const PORT_PROBE_MS = 500;

function portMayBeBound(port: number, host: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const socket = connect({ port, host });
    const finish = (reason: string | undefined): void => {
      socket.destroy();
      resolve(reason);
    };
    const endpoint = `${host}:${String(port)}`;
    socket.once("connect", () => finish(`${endpoint} still accepts connections`));
    socket.once("error", (error) => finish("code" in error && error.code === "ECONNREFUSED" ? undefined : `${endpoint}: ${error.message}`));
    socket.setTimeout(PORT_PROBE_MS, () => finish(`${endpoint} probe timed out`));
  });
}

async function retainLogTail(source: string, destination: string): Promise<void> {
  try {
    await using file = await open(source, "r");
    const { size } = await file.stat();
    const buffer = Buffer.alloc(Math.min(size, LOG_TAIL_BYTES));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, Math.max(0, size - buffer.length));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, buffer.subarray(0, bytesRead));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}

// biome-ignore lint/style/noDefaultExport: Playwright loads a reporter module through its default class export.
export default class DisposableReporter implements Reporter {
  private status: FullResult["status"] | undefined;
  private evidenceFailed = false;
  private readonly modes = selectedModeProjects(process.argv).filter((mode) => mode.webServerEnv["DATA_DIR"]?.startsWith(`${E2E_RUN_ROOT}${sep}`) === true);

  printsToStdio(): boolean {
    return false;
  }

  async onEnd(result: FullResult): Promise<void> {
    this.status = result.status;
    if (!E2E_RUN_IS_OWNER || result.status === "passed") {
      return;
    }
    try {
      for (const mode of this.modes) {
        const stack = mode.webServerEnv["STACK_RUN_DIR"];
        if (stack === undefined) {
          continue;
        }
        for (const log of ["server.log", "client.log"]) {
          await retainLogTail(join(stack, log), join(`${E2E_REPORT_PREFIX}-results`, "stack", mode.name, log));
        }
      }
    } catch (error) {
      this.evidenceFailed = true;
      process.stderr.write(`E2E stack-log retention failed: ${String(error)}\n`);
    }
  }

  async onExit(): Promise<void> {
    if (!(E2E_RUN_IS_OWNER && existsSync(E2E_RUN_ROOT))) {
      return;
    }
    const ui = process.argv.some((argument) => /^--ui(?:$|=|-)/u.test(argument));
    const ports = this.modes.flatMap((mode) => [Number(mode.webServerEnv["PORT"]), Number(mode.webServerEnv["VITE_PORT"])]);
    const bound = await Promise.all(ports.flatMap((port) => [portMayBeBound(port, "127.0.0.1"), portMayBeBound(port, "::1")]));
    const reasons = [
      ...(ui ? ["UI mode retains its deferred webServers"] : []),
      ...(this.status === undefined ? ["no completed native result"] : []),
      ...(this.status === "timedout" ? ["native run timed out"] : []),
      ...(this.evidenceFailed ? ["failure evidence was not retained"] : []),
      ...bound.filter((reason) => reason !== undefined),
    ];
    if (reasons.length > 0) {
      process.stderr.write(`E2E cleanup unconfirmed (${reasons.join("; ")}); retained disposable data: ${E2E_RUN_ROOT}\n`);
      return;
    }
    try {
      await rm(E2E_RUN_ROOT, { recursive: true, force: true });
    } catch (error) {
      process.stderr.write(`E2E cleanup failed; retained disposable data: ${E2E_RUN_ROOT}: ${String(error)}\n`);
    }
  }
}
