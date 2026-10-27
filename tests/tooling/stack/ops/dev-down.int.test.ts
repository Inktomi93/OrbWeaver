import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { z } from "zod";
import { EXIT } from "../../../../tooling/src/floor/cli/exit-contract.ts";
import type { ListeningPortsRead } from "../../../../tooling/src/floor/host/platform.ts";
import { killPidGroup } from "../../../../tooling/src/floor/process/proc.ts";
import { doDevDown, stackContext } from "../../../../tooling/src/stack/index.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { PLANTED_PORTS } from "../_dev-verbs.ts";

for (const owned of [true, false]) {
  test(`recordless teardown ${owned ? "stops its checkout's listener" : "refuses a foreign listener"}`, { timeout: scaledBudget(30_000) }, async ({
    scratch,
  }) => {
    const checkout = join(scratch, "checkout");
    const sourceDir = owned ? checkout : `${checkout}-foreign`;
    mkdirSync(sourceDir, { recursive: true });
    const script = join(sourceDir, "listener.mjs");
    writeFileSync(
      script,
      `import { createServer } from "node:http";
const server = createServer((_request, response) => response.end("owned-probe"));
server.listen(0, "127.0.0.1", () => process.stdout.write(JSON.stringify({ port: server.address().port }) + "\\n"));`,
    );
    const child = spawn(process.execPath, [script], { detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    try {
      const [bytes] = await once(child.stdout, "data");
      const { port } = z.object({ port: z.number().int().positive() }).parse(JSON.parse(String(bytes)));
      const context = stackContext(
        checkout,
        Object.fromEntries([
          ["PORT", String(port)],
          ["VITE_PORT", String(port)],
          ["STACK_RUN_DIR", join(scratch, "private-record")],
        ]),
        null,
      );
      const exited = once(child, "exit");
      const outcome = await doDevDown(context);
      expect(outcome).toBe(owned ? 0 : 1);
      let reply: string | null = null;
      if (owned) {
        await exited;
      } else {
        const response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(scaledBudget(5000)) });
        reply = await response.text();
      }
      expect(child.exitCode !== null || child.signalCode !== null).toBe(owned);
      expect(reply).toBe(owned ? null : "owned-probe");
    } finally {
      killPidGroup(child.pid, "SIGKILL");
    }
  });
}

for (const finalRead of ["free", "refused", "held"] as const) {
  test(`after stopping its owned group, teardown observes an unnamed sibling socket until ${finalRead}`, { timeout: scaledBudget(60_000) }, async ({
    scratch,
  }) => {
    const checkout = join(scratch, "checkout");
    mkdirSync(checkout);
    const script = join(checkout, "listener.mjs");
    writeFileSync(
      script,
      `import { createServer } from "node:http";
const server = createServer((_request, response) => response.end());
server.listen(0, "127.0.0.1", () => process.stdout.write(JSON.stringify({ port: server.address().port }) + "\\n"));`,
    );
    const child = spawn(process.execPath, [script], { detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    try {
      const [bytes] = await once(child.stdout, "data");
      const { port } = z.object({ port: z.number().int().positive() }).parse(JSON.parse(String(bytes)));
      const siblingPort = port === PLANTED_PORTS.vite ? PLANTED_PORTS.server : PLANTED_PORTS.vite;
      const context = stackContext(
        checkout,
        Object.fromEntries([
          ["PORT", String(port)],
          ["VITE_PORT", String(siblingPort)],
          ["STACK_RUN_DIR", join(scratch, "run")],
        ]),
        null,
      );
      let postExitReads = 0;
      const readPorts = (): ListeningPortsRead => {
        if (child.exitCode === null && child.signalCode === null) {
          if (child.pid === undefined) {
            throw new Error("the planted child has no pid");
          }
          return { kind: "read", value: new Map([[port, { kind: "pid", pid: child.pid }]]) };
        }
        postExitReads += 1;
        if (postExitReads <= 2) {
          return { kind: "read", value: new Map([[siblingPort, { kind: "unknown" }]]) };
        }
        if (finalRead === "free") {
          return { kind: "read", value: new Map() };
        }
        return finalRead === "held"
          ? { kind: "read", value: new Map([[siblingPort, { kind: "unknown" }]]) }
          : { kind: "refused", reason: "planted unreadable socket table after stop" };
      };
      const outcome = await doDevDown(context, {}, { readPorts });
      expect(outcome).toBe(finalRead === "free" ? EXIT.clean : EXIT.toolError);
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
      expect(postExitReads).toBeGreaterThanOrEqual(3);
    } finally {
      killPidGroup(child.pid, "SIGKILL");
    }
  });
}
