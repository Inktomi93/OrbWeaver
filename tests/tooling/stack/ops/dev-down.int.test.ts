import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/tooling";
import { z } from "zod";
import { EXIT } from "../../../../tooling/src/floor/cli/exit-contract.ts";
import type { ListeningPortsRead } from "../../../../tooling/src/floor/host/platform.ts";
import { listeningPids } from "../../../../tooling/src/floor/host/platform.ts";
import { killPidGroup } from "../../../../tooling/src/floor/process/proc.ts";
import { doDevDown, stackContext } from "../../../../tooling/src/stack/index.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { PLANTED_PORTS } from "../_dev-verbs.ts";

// Where the listener's script lives, relative to the checkout the teardown is aimed at. The mirror carries the
// checkout's whole path as its tail, so a prefix-blind ownership test reads it as the checkout's own.
const LISTENER_HOMES = [
  { name: "stops its checkout's listener", owned: true, home: (checkout: string): string => checkout },
  { name: "refuses a sibling-prefix listener", owned: false, home: (checkout: string): string => `${checkout}-foreign` },
  { name: "refuses a listener under a foreign leading prefix", owned: false, home: (checkout: string): string => join(`${checkout}-mirror`, checkout) },
] as const;

for (const { name, owned, home } of LISTENER_HOMES) {
  test(`recordless teardown ${name}`, { timeout: scaledBudget(30_000) }, async ({ scratch }) => {
    const checkout = join(scratch, "checkout");
    const sourceDir = home(checkout);
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
      const chunks: unknown[] = await once(child.stdout, "data");
      const [bytes] = chunks;
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

/** A checkout-owned listener that ignores TERM (and says so), so the stop escalates to KILL. */
async function plantStubbornListener(scratch: string): Promise<{
  readonly child: ReturnType<typeof spawn>;
  readonly pid: number;
  readonly context: ReturnType<typeof stackContext>;
  readonly termSeen: () => boolean;
}> {
  const checkout = join(scratch, "checkout");
  mkdirSync(checkout, { recursive: true });
  const script = join(checkout, "listener.mjs");
  writeFileSync(
    script,
    `import { createServer } from "node:http";
process.on("SIGTERM", () => process.stdout.write("term\\n"));
const server = createServer((_request, response) => response.end());
server.listen(0, "127.0.0.1", () => process.stdout.write(JSON.stringify({ port: server.address().port }) + "\\n"));`,
  );
  const child = spawn(process.execPath, [script], { detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  const chunks: unknown[] = await once(child.stdout, "data");
  const { port } = z.object({ port: z.number().int().positive() }).parse(JSON.parse(String(chunks[0])));
  let seen = false;
  child.stdout.on("data", (bytes) => {
    seen ||= String(bytes).includes("term");
  });
  if (child.pid === undefined) {
    throw new Error("the planted child has no pid");
  }
  const context = stackContext(
    checkout,
    Object.fromEntries([
      ["PORT", String(port)],
      ["VITE_PORT", String(port)],
      ["STACK_RUN_DIR", join(scratch, "private-record")],
    ]),
    null,
  );
  return { child, pid: child.pid, context, termSeen: () => seen };
}

const STOP_TIMEOUT = scaledBudget(120_000);

test("a holder replaced during the TERM grace is refused the KILL and left standing", { timeout: STOP_TIMEOUT }, async ({ scratch }) => {
  const { child, context, termSeen } = await plantStubbornListener(scratch);
  try {
    const outcome = await doDevDown(
      context,
      {},
      { readPorts: () => listeningPids(), incarnationOf: () => ({ kind: "live", identity: termSeen() ? "replacement" : "original" }) },
    );
    expect(outcome).toBe(EXIT.violations);
    expect(termSeen(), "the original incarnation still got its TERM").toBe(true);
    expect(child.exitCode === null && child.signalCode === null, "the replacement was not KILLed").toBe(true);
  } finally {
    killPidGroup(child.pid, "SIGKILL");
  }
});

test("a holder of the same incarnation that survives TERM is KILLed", { timeout: STOP_TIMEOUT }, async ({ scratch }) => {
  const { child, context } = await plantStubbornListener(scratch);
  const exited = once(child, "exit");
  try {
    const outcome = await doDevDown(context, {}, { readPorts: () => listeningPids(), incarnationOf: () => ({ kind: "live", identity: "original" }) });
    expect(outcome).toBe(EXIT.clean);
    await exited;
    expect(child.signalCode).toBe("SIGKILL");
  } finally {
    killPidGroup(child.pid, "SIGKILL");
  }
});

test("a holder whose identity cannot be read is never signalled", { timeout: STOP_TIMEOUT }, async ({ scratch }) => {
  const { child, context, termSeen } = await plantStubbornListener(scratch);
  try {
    const unreadableAtPin = await doDevDown(context, {}, { readPorts: () => listeningPids(), incarnationOf: () => ({ kind: "unknown" }) });
    expect(unreadableAtPin).toBe(EXIT.toolError);
    let reads = 0;
    await expect(
      doDevDown(
        context,
        {},
        { readPorts: () => listeningPids(), incarnationOf: () => (++reads === 1 ? { kind: "live", identity: "original" } : { kind: "unknown" }) },
      ),
    ).rejects.toThrow("identity unavailable");
    expect(termSeen()).toBe(false);
    expect(child.exitCode === null && child.signalCode === null).toBe(true);
  } finally {
    killPidGroup(child.pid, "SIGKILL");
  }
});

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
      const chunks: unknown[] = await once(child.stdout, "data");
      const [bytes] = chunks;
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
      expect(child.exitCode ?? child.signalCode).not.toBeNull();
      expect(postExitReads).toBeGreaterThanOrEqual(3);
    } finally {
      killPidGroup(child.pid, "SIGKILL");
    }
  });
}
