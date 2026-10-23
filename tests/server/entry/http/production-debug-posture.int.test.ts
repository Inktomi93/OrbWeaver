// @subject packages/server/src/entry/http/app.ts
import process from "node:process";
import { expect, test } from "@orb/testkit/node";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { testProcessEnv } from "@orb/tooling/floor/process/process-env";
import { LONG_TEST_TIMEOUT_BASE_MS } from "@orb/tooling/floor/testing/test-tags";

const PROBE_PATHS = ["/api/_debug/info", "/api/_debug/db/chats", "/api/_debug/wire/captures"] as const;
const DEBUG_TOKEN = "production-debug-posture-synthetic-token";
// A fresh native process parses the real launch config before constructing the production HTTP graph.
const OBSERVE_PRODUCTION = `
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {authMeSchema} from "@orb/contracts/identity";
import {env,ownerFallbackCredentialInput} from "@orb/server/foundation/env";
import {createServerHarness} from "@orb/testkit/node/composed";
const clientDistDir=await mkdtemp(join(tmpdir(),"orb-production-debug-"));
try{
await writeFile(join(clientDistDir,"index.html"),"<!doctype html><title>Production debug fixture</title>");
await using root=await createServerHarness({physicalPeer:()=>"127.0.0.1",startJobs:false,clientDistDir});
const me=await root.http.request("/api/auth/me",{headers:{host:"localhost"}});
const auth=authMeSchema.parse(await me.json());
const probes=[];
for(const path of ${JSON.stringify(PROBE_PATHS)}){
const bare=await root.http.request(path,{headers:{host:"localhost"}});
const body=await bare.json();
let tokenStatus=null;
if(env.DEBUG_TOKEN!==undefined){
const token=await root.http.request(path,{headers:{host:"localhost","x-debug-token":env.DEBUG_TOKEN}});
tokenStatus=token.status;await token.arrayBuffer();
}
probes.push({path,bareStatus:bare.status,refusal:typeof body.reason==="string",tokenStatus});
}
console.log(JSON.stringify({posture:ownerFallbackCredentialInput(),authenticated:auth.authenticated,role:auth.role,probes}));
}finally{await rm(clientDistDir,{recursive:true,force:true});}
`;

test.for([
  { configuredToken: false, expectedStatus: 404 },
  { configuredToken: true, expectedStatus: 401 },
])("production HTTP composition refuses a bare loopback owner with token=$configuredToken", { tags: "slow" }, ({ configuredToken, expectedStatus }) => {
  const child = runNicedSync(process.execPath, ["--input-type=module", "--eval", OBSERVE_PRODUCTION], {
    env: testProcessEnv({
      ["NODE_ENV"]: "production",
      ["AUTH_MODE"]: "single-user",
      ["AUTH_FALLBACK"]: "owner",
      ["AUTH_FALLBACK_TRUSTED_PEERS"]: "",
      ["BIND_HOST"]: "127.0.0.1",
      ["ORB_CONTAINER"]: "false",
      ["OWNER_HANDLES"]: "production-debug-owner",
      ["DEBUG_TOKEN"]: configuredToken ? DEBUG_TOKEN : undefined,
      ["LOG_LEVEL"]: "silent",
    }),
    timeout: budget(LONG_TEST_TIMEOUT_BASE_MS),
  });
  expect(child.status, child.stderr).toBe(0);
  expect(JSON.parse(child.stdout)).toEqual({
    posture: { nodeEnv: "production", authFallback: "owner", fallbackWidened: false },
    authenticated: true,
    role: "owner",
    probes: PROBE_PATHS.map((path) => ({
      path,
      bareStatus: expectedStatus,
      refusal: true,
      tokenStatus: configuredToken ? 200 : null,
    })),
  });
});
