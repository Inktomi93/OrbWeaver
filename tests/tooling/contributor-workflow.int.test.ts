import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

const FAKES = `
import { writeFileSync } from "node:fs";
const events = [];
process.on("exit", () => writeFileSync(process.env.PROOF_PATH, JSON.stringify(events)));
Object.defineProperty(process, "platform", { value: "win32" });
globalThis.fetch = async () => ({ ok: process.env.CASE !== "endpoint-failure" });
export const RUN_MARKER_ENV = "ORB_RUN_MARKER";
export const devMarkerPreload = () => "";
export function spawnFullPriorityChild(command) {
  events.push("spawn:" + command);
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  return { pid: command === "pnpm" ? 100 : 101, unref() {},
    wait() { events.push("wait:" + command); return command === "pnpm" && process.env.CASE === "endpoint-failure" ? Promise.resolve({ code: 1 }) : pending; },
    kill() { events.push("kill:" + command); finish({ code: 0 }); }
  };
}
export const chromium = { async launch() { return {
  async newContext(options) {
    events.push("har:" + options.recordHar.mode + ":" + options.recordHar.content);
    return { async newPage() { return { on(event, callback) {
      if (event === "request") for (let i = 0; i < 171; i++) callback({ url: () => "http://localhost/module-" + i + ".js", resourceType: () => "script" });
    } }; }, async close() { events.push("close:context"); } };
  }, async close() { events.push("close:browser"); }
}; } };
export async function awaitDevClientReady() {
  if (process.env.CASE === "readiness-failure") throw new Error("planted readiness failure");
}
`;

for (const scenario of ["ready", "readiness-failure", "endpoint-failure"] as const) {
  test(`contributor observations release only their sampler on ${scenario}`, ({ repoRoot, scratch }) => {
    const workflow = readFileSync(join(repoRoot, ".github/workflows/contributor.yml"), "utf8");
    const start = workflow.indexOf('          import { writeFileSync } from "node:fs";');
    const end = workflow.indexOf("          NODE", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const fake = join(scratch, "fakes.mjs");
    const entry = join(scratch, "startup.mjs");
    const proof = join(scratch, "proof.json");
    writeFileSync(fake, FAKES);
    const source = workflow
      .slice(start, end)
      .replace(/^ {10}/gmu, "")
      .replace(/from "(?:\.\/tooling[^"]+|@playwright\/test)"/gu, `from ${JSON.stringify(pathToFileURL(fake).href)}`);
    writeFileSync(entry, source);
    const result = spawnSync(process.execPath, [entry], {
      encoding: "utf8",
      env: inheritedProcessEnv(
        Object.fromEntries([
          ["RUNNER_TEMP", scratch],
          ["PROOF_PATH", proof],
          ["CASE", scenario],
          ["HEALTHZ", "http://localhost/healthz"],
          ["DEV_ORIGIN", "http://localhost"],
        ]),
      ),
    });
    expect(result.status).toBe(scenario === "ready" ? 0 : 1);
    const events = z.array(z.string()).parse(JSON.parse(readFileSync(proof, "utf8")));
    expect(events).toEqual([
      "spawn:pnpm",
      "wait:pnpm",
      "spawn:pwsh",
      "wait:pwsh",
      ...(scenario === "endpoint-failure" ? [] : ["har:full:omit", "close:context", "close:browser"]),
      "kill:pwsh",
    ]);
    const pending = join(scratch, "contributor-pending.json");
    expect(existsSync(pending)).toBe(scenario === "readiness-failure");
    const rows = existsSync(pending)
      ? z.array(z.object({ path: z.string(), type: z.string(), ageMs: z.number() })).parse(JSON.parse(readFileSync(pending, "utf8")))
      : [];
    expect(rows.length).toBe(scenario === "readiness-failure" ? 171 : 0);
  });
}
