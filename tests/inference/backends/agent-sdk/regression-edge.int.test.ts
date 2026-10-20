import { once } from "node:events";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { testProcessEnv } from "@orb/tooling/floor/process/process-env";
import { physicalSdkScenario } from "./regression-edge.fixtures.ts";

test("a failed SDK fixture scope closes its owned live child but retains the leak refusal", async () => {
  const edge = physicalSdkScenario({ hang: true });
  const child = edge.spawn({ command: process.execPath, args: [], cwd: edge.directory, env: testProcessEnv(), signal: new AbortController().signal });
  let closeObserved = false;
  const closed = once(child, "close").then(() => {
    closeObserved = true;
  });
  try {
    const initialized = once(child.stdout, "data");
    child.stdin.write(`${JSON.stringify({ type: "control_request", ["request_id"]: "fixture-control", request: { subtype: "initialize" } })}\n`);
    await initialized;
    await expect(edge[Symbol.asyncDispose]()).rejects.toThrow("native Query left a controlled SDK child running");
    expect(closeObserved).toBe(true);
    expect(child.signalCode).toBe("SIGTERM");
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
    await closed;
  }
});
