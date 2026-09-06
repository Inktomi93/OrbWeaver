import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { spawnNicedChild } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";

const READY_ATTEMPTS = 100;
const READY_POLL_MS = 50;
const AUTH_MODE_KEY = "AUTH_MODE";

const SOURCE = `
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
const ready = process.argv[2];
const credentials = new Map([["owner","owner-dev-pass"],["member","member-dev-pass"]]);
const sessions = new Map();
const page = '<!doctype html><html lang="en" data-app-ready="loading"><body><main id="viewer">loading</main><script>globalThis.__orb={consoleErrors:()=>({records:[],dropped:0,cap:128}),resetEvidence:()=>{},snap:()=>({fixture:true})};fetch("/api/whoami").then(r=>r.json()).then(v=>{document.body.dataset.viewer=v.handle;document.querySelector("#viewer").textContent="viewer:"+v.handle;localStorage.setItem("viewer",v.handle);document.documentElement.dataset.appReady="settled"})</script></body></html>';
const server=createServer((request,response)=>{
  if(request.url==="/healthz"){response.writeHead(200);response.end("ok");return}
  if(request.url==="/api/auth/config"){response.writeHead(200,{"content-type":"application/json"});response.end(JSON.stringify({mode:"local",localEnabled:true,multiHumanCapable:true}));return}
  if(request.url==="/api/auth/login"&&request.method==="POST"){let body="";request.on("data",c=>body+=c);request.on("end",()=>{const form=new URLSearchParams(body);const handle=form.get("handle")??"";if(credentials.get(handle)!==form.get("password")){response.writeHead(401);response.end("bad login");return}const token=handle+"-session";sessions.set(token,handle);response.writeHead(200,{"set-cookie":"orb_session="+token+"; Path=/; HttpOnly; SameSite=Lax","content-type":"application/json"});response.end(JSON.stringify({ok:true}))});return}
  if(request.url==="/api/whoami"){const cookie=request.headers.cookie??"";const token=/orb_session=([^;]+)/.exec(cookie)?.[1]??"";const handle=sessions.get(token);if(handle===undefined){response.writeHead(401);response.end("unauthorized");return}response.writeHead(200,{"content-type":"application/json"});response.end(JSON.stringify({handle}));return}
  response.writeHead(200,{"content-type":"text/html; charset=utf-8"});response.end(page)
});
server.listen(0,"127.0.0.1",()=>{const address=server.address();writeFileSync(ready,JSON.stringify({port:address.port}))});
`;

export async function startFilmstripAuthFixture(scratch: string): Promise<{ readonly base: string; readonly close: () => Promise<void> }> {
  const script = join(scratch, "filmstrip-auth-fixture.mjs");
  const ready = join(scratch, "filmstrip-auth-fixture.ready.json");
  const logPath = join(scratch, "filmstrip-auth-fixture.log");
  await writeFile(script, SOURCE);
  const child = spawnNicedChild(process.execPath, [script, ready], { env: inheritedProcessEnv({ [AUTH_MODE_KEY]: "local" }), logPath });
  for (let attempt = 0; attempt < READY_ATTEMPTS && !existsSync(ready); attempt += 1) {
    if (child.hasExited()) {
      throw new Error(`filmstrip auth fixture exited during boot: ${readFileSync(logPath, "utf8")}`);
    }
    await sleep(READY_POLL_MS);
  }
  if (!existsSync(ready)) {
    child.killGroup("SIGKILL");
    throw new Error(`filmstrip auth fixture did not publish readiness: ${readFileSync(logPath, "utf8")}`);
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
