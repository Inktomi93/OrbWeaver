import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { z } from "zod";
import { killPidGroup } from "../../../../tooling/src/_shared/proc.ts";
import { doDevDown, stackContext } from "../../../../tooling/src/stack/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

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
