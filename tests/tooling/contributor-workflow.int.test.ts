import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
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
export const inheritedProcessEnv = () => ({ ...process.env });
export async function launchProbeSession() { return { browser: {
  async newContext(options) {
    events.push("har:" + options.recordHar.mode + ":" + options.recordHar.content);
    return { async newPage() { return { on(event, callback) {
      if (event === "request") for (let i = 0; i < 171; i++) callback({ url: () => "http://localhost/module-" + i + ".js", resourceType: () => "script" });
    } }; }, async close() { events.push("close:context"); } };
  }, async close() { events.push("close:browser"); }
} }; }
export async function closeProbeSession(session) { await session.browser.close(); }
export async function awaitDevClientReady() {
  if (process.env.CASE === "readiness-failure") throw new Error("planted readiness failure");
}
`;

for (const scenario of ["ready", "readiness-failure", "endpoint-failure"] as const) {
  test(`contributor observations release only their sampler on ${scenario}`, ({ repoRoot, scratch }) => {
    const fake = join(scratch, "fakes.mjs");
    const entry = join(scratch, "startup.mjs");
    const proof = join(scratch, "proof.json");
    writeFileSync(fake, FAKES);
    const source = transpileModule(readFileSync(join(repoRoot, "scripts/ci/contributor-ready.ts"), "utf8"), {
      compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ESNext },
    }).outputText.replace(/from "(?:@orb\/tooling[^"]+|@playwright\/test)"/gu, `from ${JSON.stringify(pathToFileURL(fake).href)}`);
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

for (const [scenario, status] of [
  ["no-record", 0],
  ["invalid-pid", 1],
  ["stopped", 0],
  ["foreign-listener", 1],
  ["bound-port", 1],
  ["unknown-ports", 1],
] as const) {
  test(`contributor teardown preserves the ${scenario} ownership boundary`, ({ repoRoot, scratch }) => {
    const fake = join(scratch, "stop-fakes.mjs");
    const entry = join(scratch, "stop.mjs");
    const proof = join(scratch, "proof.json");
    writeFileSync(
      fake,
      `
      import fs from 'node:fs';const events=[];
      process.on('exit',()=>fs.writeFileSync(process.env.PROOF_PATH,JSON.stringify(events)));
      export const inheritedProcessEnv=()=>({...process.env});
      export const setTimeout=()=>Promise.resolve();
      export const killPidGroup=(pid,signal)=>events.push(['kill',pid,signal]);
      export async function sweepRunMarker(marker){events.push(['marker',marker]);return {};}
      export const describeRunMarkerSweep=()=>null;
      export const stackContext=(root)=>({root});
      export async function doDevDown(){events.push(['owned-down']);return process.env.CASE==='foreign-listener'?2:0;}
      export function listeningPids(){return process.env.CASE==='unknown-ports'?{kind:'refused',reason:'unknown'}:{kind:'resolved',value:new Map(process.env.CASE==='bound-port'?[[8788,77]]:[])};}
    `,
    );
    if (scenario !== "no-record") {
      writeFileSync(join(scratch, "contributor-dev.pid"), scenario === "invalid-pid" ? "0" : "100");
      writeFileSync(join(scratch, "contributor-dev.marker"), "owned-marker");
    }
    const source = transpileModule(readFileSync(join(repoRoot, "scripts/ci/contributor-stop.ts"), "utf8"), {
      compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ESNext },
    }).outputText.replace(/from "(?:@orb\/tooling[^"]+|node:timers\/promises)"/gu, `from ${JSON.stringify(pathToFileURL(fake).href)}`);
    writeFileSync(entry, source);
    const result = spawnSync(process.execPath, [entry], {
      encoding: "utf8",
      env: inheritedProcessEnv({
        ["RUNNER_TEMP"]: scratch,
        ["PROOF_PATH"]: proof,
        ["CASE"]: scenario,
        ["HEALTHZ"]: "http://localhost:8788/healthz",
        ["DEV_ORIGIN"]: "http://localhost:5173",
      }),
    });
    expect(result.status, result.stderr).toBe(status);
    const events = z.array(z.array(z.union([z.string(), z.number()]))).parse(JSON.parse(readFileSync(proof, "utf8")));
    expect(events).toEqual(
      scenario === "no-record" || scenario === "invalid-pid"
        ? []
        : [["kill", 100, "SIGTERM"], ["kill", 100, "SIGKILL"], ["marker", "owned-marker"], ["owned-down"]],
    );
  });
}
