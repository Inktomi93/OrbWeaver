import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

const API_FIXTURE = `
import fs from 'node:fs';
const mode = process.env.APPROVAL_CASE;
const calls=[];
process.on('exit',()=>fs.writeFileSync(process.env.CALLS_PATH,JSON.stringify(calls)));
const head='a'.repeat(40),base='b'.repeat(40);
const repo={full_name:'Inktomi93/OrbWeaver'};
const bot={login:'github-actions[bot]',id:41898282,type:'Bot'};
const app = mode !== 'plugin';
const plugin = mode === 'plugin' || mode === 'combined';
const candidate={id:17,event:'pull_request',head_sha:head,path:'.github/workflows/ci.yml',conclusion:'action_required',actor:bot,head_repository:repo,pull_requests:[{number:42}]};
const pr={number:42,state:'open',user:bot,head:{sha:head,ref:'release-please--branches--release--components--orbweaver',repo},base:{sha:base,ref:'release',repo},changed_files:2};
const paths=['.release-please-manifest.json',...(app?['package.json']:[]),...(plugin?['packages/plugin-authoring-version.txt','packages/plugin-sdk/package.json','packages/plugin-toolchain/package.json']:[])];
pr.changed_files=paths.length;
if(mode==='fork') {pr.head.repo={full_name:'outsider/OrbWeaver'};candidate.head_repository=pr.head.repo;}
if(mode==='wrong-author') pr.user={...bot,id:99};
if(mode==='wrong-actor') candidate.actor={...bot,login:'outsider'};
if(mode==='wrong-path') candidate.path='.github/workflows/release.yml';
if(mode==='wrong-head') candidate.head_sha='c'.repeat(40);
if(mode==='wrong-base') pr.base.ref='main';
if(mode==='extra-file') {paths.push('.github/workflows/ci.yml');pr.changed_files++;}
if(mode==='truncated') pr.changed_files++;
let prReads=0,runReads=0;
globalThis.fetch=async (url,options={})=>{
  const parsed=new URL(url);
  if(parsed.origin!=='https://api.github.com'||!parsed.pathname.startsWith('/repos/Inktomi93/OrbWeaver/')) throw Error('foreign API scope');
  const path=parsed.pathname.slice('/repos/Inktomi93/OrbWeaver/'.length);
  calls.push({path,method:options.method});
  if(path==='actions/runs/17/approve') return new Response('{}',{status:mode==='denied'?403:200});
  let data;
  if(path==='actions/runs/17') {
    runReads++;
    data=mode==='run-race'&&runReads>1?{...candidate,head_sha:'d'.repeat(40)}:mode==='already-approved'&&runReads>1?{...candidate,conclusion:'success'}:candidate;
  } else if(path==='pulls/42') {
    prReads++;
    data=mode==='head-race'&&prReads>1?{...pr,head:{...pr.head,sha:'d'.repeat(40)}}:pr;
  } else if(path==='pulls/42/files') data=paths.map(filename=>({filename,status:mode==='renamed'?'renamed':'modified'}));
  else if(path.startsWith('contents/')) {
    const filename=path.slice('contents/'.length),old=parsed.searchParams.get('ref')===base;
    const version=filename==='package.json'?(old||!app?'0.1.3':'0.2.0'):(old||!plugin?'0.2.1':'0.2.2');
    let body;
    if(filename==='.release-please-manifest.json') body=JSON.stringify({'.':old||!app?'0.1.3':'0.2.0',packages:old||!plugin?'0.2.1':'0.2.2'});
    else if(filename==='packages/plugin-authoring-version.txt') body=version+'\\n';
    else body=JSON.stringify({name:filename,version:mode==='wrong-version'&&!old?'9.9.9':version,scripts:{prepare:mode==='code-change'&&!old?'changed':'unchanged'}});
    data={encoding:'base64',content:Buffer.from(body).toString('base64')};
  } else throw Error('unexpected request '+path);
  return new Response(JSON.stringify(data),{status:200});
};
`;

for (const [scenario, status, approvals] of [
  ["app", 0, 1],
  ["plugin", 0, 1],
  ["combined", 0, 1],
  ["fork", 0, 0],
  ["wrong-author", 0, 0],
  ["wrong-actor", 0, 0],
  ["wrong-path", 0, 0],
  ["wrong-head", 0, 0],
  ["wrong-base", 0, 0],
  ["code-change", 2, 0],
  ["wrong-version", 2, 0],
  ["extra-file", 2, 0],
  ["truncated", 2, 0],
  ["renamed", 2, 0],
  ["head-race", 2, 0],
  ["run-race", 2, 0],
  ["already-approved", 0, 0],
  ["denied", 2, 1],
] as const) {
  test(`release execution approval preserves the ${scenario} boundary`, async ({ repoRoot, scratch }) => {
    const preload = join(scratch, "api.mjs");
    const event = join(scratch, "event.json");
    const calls = join(scratch, "calls.json");
    writeFileSync(preload, API_FIXTURE);
    writeFileSync(event, JSON.stringify({ repository: { ["full_name"]: "Inktomi93/OrbWeaver" }, ["workflow_run"]: { id: 17 } }));
    const result = await spawnNiced(process.execPath, ["--import", preload, join(repoRoot, "scripts/ci/approve-release-run.ts")], {
      cwd: scratch,
      env: {
        ["GH_TOKEN"]: "fixture-token",
        ["GITHUB_EVENT_PATH"]: event,
        ["GITHUB_REPOSITORY"]: "Inktomi93/OrbWeaver",
        ["APPROVAL_CASE"]: scenario,
        ["CALLS_PATH"]: calls,
      },
    });
    expect(result.code, result.stderr).toBe(status);
    const requests = z.array(z.object({ path: z.string(), method: z.string() })).parse(JSON.parse(readFileSync(calls, "utf8")));
    expect(requests.filter((request) => request.method === "POST")).toEqual(approvals === 0 ? [] : [{ path: "actions/runs/17/approve", method: "POST" }]);
    expect(result.stdout + result.stderr).not.toContain("fixture-token");
  });
}
