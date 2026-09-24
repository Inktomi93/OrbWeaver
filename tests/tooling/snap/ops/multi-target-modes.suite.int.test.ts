// Multi-target Snap modes prove their distinct identity contracts: pages share one browser context;
// contexts isolate fixture users; matrix varies environment, never human actors.
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { spawnNicedChild } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { vi } from "vitest";
import type { SnapArmFact } from "../../../../tooling/src/snap/contract/run-facts.ts";
import type { SnapRunIndex } from "../../../../tooling/src/snap/contract/run-index.ts";
import { parseSnapArgs, SNAP_HELP, snapFlagDescriptors } from "../../../../tooling/src/snap/index.ts";
import type { CliResult } from "../../../support/tool-fixtures.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(120_000, 4);
const READY_ATTEMPTS = 100;
const READY_POLL_MS = 50;
const AUTH_MODE_KEY = "AUTH_MODE";
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

const PAGE = `<!doctype html><html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>multi target</title></head>
<body data-local="initial"><main>multi target</main><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{},snap:()=>({fixture:true})}</script></body></html>`;

interface CoreRunData {
  readonly pages: number;
  readonly contexts: number;
  readonly captures: number;
}

interface CaptureManifest {
  readonly captures: readonly { readonly pageIndex: number; readonly evalResults: readonly { readonly text: string; readonly failed: boolean }[] }[];
}

function resultValue(stdout: string, key: string): string {
  const prefix = `${key}=`;
  const value = stdout
    .split(/\s+/u)
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);
  expect(value, `missing ${key} in:\n${stdout}`).toBeDefined();
  return value as string;
}

async function readRun(result: CliResult): Promise<{ readonly index: SnapRunIndex; readonly manifest: CaptureManifest }> {
  const index = JSON.parse(await readFile(resultValue(result.stdout, "index"), "utf8")) as SnapRunIndex;
  const manifest = JSON.parse(await readFile(resultValue(result.stdout, "json"), "utf8")) as CaptureManifest;
  return { index, manifest };
}

function coreRun(index: SnapRunIndex): CoreRunData {
  const fact = index.results?.batches.flatMap((batch) => batch.core).find((candidate) => candidate.schema === "snap-core-run-v1");
  expect(fact, "run index omitted snap-core-run-v1").toBeDefined();
  return (fact as { readonly data: CoreRunData }).data;
}

function screenshot(index: SnapRunIndex, suffix: string): SnapRunIndex["artifacts"][number] {
  const artifact = index.artifacts.find((candidate) => candidate.channel === "screenshot" && candidate.relativePath.endsWith(suffix));
  expect(artifact, `missing screenshot ${suffix}`).toBeDefined();
  return artifact as NonNullable<typeof artifact>;
}

function expectExactScope(subject: { readonly scope: SnapRunIndex["artifacts"][number]["scope"] }, context: number, page: number): void {
  expect(subject.scope).toMatchObject({
    kind: "scope-v1",
    context: { kind: "exact", value: context },
    page: { kind: "exact", value: page },
  });
}

function shotFacts(index: SnapRunIndex): readonly SnapArmFact[] {
  return index.results?.batches.flatMap((batch) => batch.arms).filter((fact) => fact.arm === "shot") ?? [];
}

function evalText(manifest: CaptureManifest, target: number): string {
  const capture = manifest.captures.find((candidate) => candidate.pageIndex === target);
  expect(capture, `missing capture ${String(target)}`).toBeDefined();
  expect(capture?.evalResults).toHaveLength(1);
  expect(capture?.evalResults[0]?.failed).toBe(false);
  return capture?.evalResults[0]?.text ?? "";
}

async function startPageServer(): Promise<{ readonly base: string; readonly close: () => Promise<void> }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${String(address.port)}`,
    close: async () => await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error)))),
  };
}

// Production-shaped loopback boundary: the child exposes fixture health/config plus the real form-login
// and session-cookie doors. Snap still performs loginFixtureUser and cookie seeding; no storageState bypass.
const AUTH_FIXTURE_SOURCE = `
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
const ready = process.argv[2];
const credentials = new Map([["owner","owner-dev-pass"],["member","member-dev-pass"]]);
const sessions = new Map();
const page = '<!doctype html><html lang="en" data-app-ready="loading"><head><meta charset="utf-8"><title>fixture user</title></head><body><main id="viewer">loading</main><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{},snap:()=>({fixture:true})};fetch("/api/whoami").then(r=>r.json()).then(v=>{document.body.dataset.viewer=v.handle;document.body.dataset.session=v.session;document.querySelector("#viewer").textContent="viewer:"+v.handle;localStorage.setItem("viewer",v.handle);document.documentElement.dataset.appReady="settled"})</script></body></html>';
const server=createServer((request,response)=>{
  if(request.url==="/healthz"){response.writeHead(200);response.end("ok");return}
  if(request.url==="/api/auth/config"){response.writeHead(200,{"content-type":"application/json"});response.end(JSON.stringify({mode:"local",localEnabled:true,multiHumanCapable:true}));return}
  if(request.url==="/api/auth/login"&&request.method==="POST"){let body="";request.on("data",c=>body+=c);request.on("end",()=>{const form=new URLSearchParams(body);const handle=form.get("handle")??"";if(credentials.get(handle)!==form.get("password")){response.writeHead(401);response.end("bad login");return}const token=handle+"-session";sessions.set(token,handle);response.writeHead(200,{"set-cookie":"orb_session_insecure="+token+"; Path=/; HttpOnly; SameSite=Lax","content-type":"application/json"});response.end(JSON.stringify({ok:true}))});return}
  if(request.url==="/api/whoami"){const cookie=request.headers.cookie??"";const token=/orb_session_insecure=([^;]+)/.exec(cookie)?.[1]??"";const handle=sessions.get(token);if(handle===undefined){response.writeHead(401,{"content-type":"application/json"});response.end(JSON.stringify({error:"unauthorized",cookie}));return}response.writeHead(200,{"content-type":"application/json"});response.end(JSON.stringify({handle,session:token}));return}
  response.writeHead(200,{"content-type":"text/html; charset=utf-8"});response.end(page)
});
server.listen(0,"127.0.0.1",()=>{const address=server.address();writeFileSync(ready,JSON.stringify({port:address.port}))});
`;

async function startAuthFixture(scratch: string): Promise<{ readonly base: string; readonly close: () => Promise<void> }> {
  const script = join(scratch, "auth-fixture.mjs");
  const ready = join(scratch, "auth-fixture.ready.json");
  const logPath = join(scratch, "auth-fixture.log");
  await writeFile(script, AUTH_FIXTURE_SOURCE);
  const child = spawnNicedChild(process.execPath, [script, ready], { env: inheritedProcessEnv({ [AUTH_MODE_KEY]: "local" }), logPath });
  for (let attempt = 0; attempt < READY_ATTEMPTS && !existsSync(ready); attempt += 1) {
    if (child.hasExited()) {
      throw new Error(`auth fixture exited during boot: ${readFileSync(logPath, "utf8")}`);
    }
    await sleep(READY_POLL_MS);
  }
  if (!existsSync(ready)) {
    child.killGroup("SIGKILL");
    throw new Error(`auth fixture did not publish readiness: ${readFileSync(logPath, "utf8")}`);
  }
  const port = (JSON.parse(await readFile(ready, "utf8")) as { readonly port: number }).port;
  return {
    base: `http://127.0.0.1:${String(port)}`,
    close: async (): Promise<void> => {
      child.killGroup("SIGTERM");
      await sleep(READY_POLL_MS);
    },
  };
}

test("--pages 2 shares one context identity while keeping independent page DOM and exact -p scopes", async ({ runCli }) => {
  const server = await startPageServer();
  try {
    const result = await runCli(
      "snap",
      [
        "/",
        "--base",
        server.base,
        "--pages",
        "2",
        "--eval@0",
        "()=>{document.cookie='shared_cookie=zero; path=/';localStorage.setItem('shared','zero');document.body.dataset.local='zero';return {tab:document.body.dataset.local,shared:localStorage.getItem('shared'),cookie:document.cookie}}",
        "--eval@1",
        "()=>{const before=localStorage.getItem('shared');document.body.dataset.local='one';return {tab:document.body.dataset.local,shared:before,cookie:document.cookie}}",
        "--json",
        "--out",
        "multi-pages",
        "--no-deadcss",
        "--no-failure-evidence",
      ],
      { timeoutMs: CLI_TIMEOUT_MS },
    );
    await expect(result).toExitWith(EXIT.clean);
    const { index, manifest } = await readRun(result);
    expect(coreRun(index)).toMatchObject({ pages: 2, contexts: 1, captures: 2 });
    expect(index.resultPairs.find(([key]) => key === "users")).toBeUndefined();
    expect(JSON.stringify(index.results)).not.toMatch(/"users"|"viewerHandle"|"userHandle"/u);
    expect(evalText(manifest, 0)).toContain('"tab": "zero"');
    expect(evalText(manifest, 1)).toContain('"tab": "one"');
    expect(evalText(manifest, 1)).toContain('"shared": "zero"');
    expect(evalText(manifest, 1)).toContain("shared_cookie=zero");
    const p0 = screenshot(index, "snaps/multi-pages-p0.png");
    const p1 = screenshot(index, "snaps/multi-pages-p1.png");
    expectExactScope(p0, 0, 0);
    expectExactScope(p1, 0, 1);
    const facts = shotFacts(index);
    expect(facts).toHaveLength(2);
    expectExactScope(facts[0] as (typeof facts)[number], 0, 0);
    expectExactScope(facts[1] as (typeof facts)[number], 0, 1);
  } finally {
    await server.close();
  }
});

test("--contexts 2 logs in through the real door and isolates owner/member cookies, storage, actions, and -u scopes", async ({ runCli, scratch }) => {
  const fixture = await startAuthFixture(scratch);
  try {
    const result = await runCli(
      "snap",
      [
        "/",
        "--contexts",
        "2",
        "--fixture-server",
        fixture.base,
        "--fixture-base",
        fixture.base,
        "--eval@0",
        "()=>{const before=localStorage.getItem('target');localStorage.setItem('target','owner-only');document.body.dataset.local='owner-dom';return {viewer:document.body.dataset.viewer,session:document.body.dataset.session,viewerStorage:localStorage.getItem('viewer'),before,target:localStorage.getItem('target'),dom:document.body.dataset.local}}",
        "--eval@1",
        "()=>{const before=localStorage.getItem('target');localStorage.setItem('target','member-only');document.body.dataset.local='member-dom';return {viewer:document.body.dataset.viewer,session:document.body.dataset.session,viewerStorage:localStorage.getItem('viewer'),before,target:localStorage.getItem('target'),dom:document.body.dataset.local}}",
        "--json",
        "--out",
        "multi-contexts",
        "--no-deadcss",
        "--no-failure-evidence",
      ],
      { timeoutMs: CLI_TIMEOUT_MS },
    );
    await expect(result).toExitWith(EXIT.clean);
    const { index, manifest } = await readRun(result);
    expect(coreRun(index)).toMatchObject({ pages: 2, contexts: 2, captures: 2 });
    expect(index.resultPairs).toContainEqual(["users", "owner,member"]);
    const owner = evalText(manifest, 0);
    const member = evalText(manifest, 1);
    expect(owner).toContain('"viewer": "owner"');
    expect(owner).toContain('"session": "owner-session"');
    expect(owner).toContain('"viewerStorage": "owner"');
    expect(owner).toContain('"before": null');
    expect(owner).toContain('"target": "owner-only"');
    expect(owner).toContain('"dom": "owner-dom"');
    expect(member).toContain('"viewer": "member"');
    expect(member).toContain('"session": "member-session"');
    expect(member).toContain('"viewerStorage": "member"');
    expect(member).toContain('"before": null');
    expect(member).toContain('"target": "member-only"');
    expect(member).toContain('"dom": "member-dom"');
    const u0 = screenshot(index, "snaps/multi-contexts-u0.png");
    const u1 = screenshot(index, "snaps/multi-contexts-u1.png");
    expectExactScope(u0, 0, 0);
    expectExactScope(u1, 1, 0);
    const facts = shotFacts(index);
    expect(facts).toHaveLength(2);
    expectExactScope(facts[0] as (typeof facts)[number], 0, 0);
    expectExactScope(facts[1] as (typeof facts)[number], 1, 0);
  } finally {
    await fixture.close();
  }
});

test("multi-target modes refuse mixed pages+contexts and docs route actor choreography to E2E without a new flag", async ({ repoRoot }) => {
  expect(parseSnapArgs(["/", "--pages", "2", "--contexts", "2"]).errors).toContain("--contexts and --pages cannot both be greater than 1");
  expect(parseSnapArgs(["/", "--matrix", "--isolated", "--contexts", "2"]).errors.join("\n")).toContain(
    "--matrix does not combine with --pages/--contexts/--as",
  );
  expect(parseSnapArgs(["/", "--matrix", "--isolated", "--mobile", "--dark"]).errors.join("\n")).toContain("matrix owns the appearance/theme/device");
  const flags = snapFlagDescriptors().map((descriptor) => descriptor.flag);
  for (const flag of ["--actor", "--actors", "--user", "--identity", "--choreography"]) {
    expect(flags).not.toContain(flag);
  }
  expect(SNAP_HELP).toContain("alternating multi-human choreography belongs in E2E");
  const skill = await readFile(join(repoRoot, ".claude/skills/snap-driving/SKILL.md"), "utf8");
  const recipes = await readFile(join(repoRoot, ".claude/skills/snap-driving/reference/recipes.md"), "utf8");
  expect(skill).toMatch(/use E2E with one\s+explicit browser actor per human/u);
  expect(recipes).toMatch(/belongs in E2E with two explicit browser actors/u);
});
