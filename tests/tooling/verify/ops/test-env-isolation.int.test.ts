// Static verification never loads app configuration; spawned workers reject ambient deployment values.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, plantFile, plantLink, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { testProcessEnv } from "@orb/tooling/floor/process/process-env";
import { scaledBudget } from "../../_load-budget.ts";

const FILE_KEYS = ["AUTH_MODE", "DEBUG_TOKEN", "OIDC_ALLOWED_GROUPS", "OWNER_HANDLES", "ORB_UNAPPROVED_TEST_KEY"] as const;
const SYNTHETIC_ENV = [
  "AUTH_MODE=single-user",
  "DEBUG_TOKEN=synthetic-env-isolation-token",
  "OIDC_ALLOWED_GROUPS=synthetic-env-isolation-group",
  "OWNER_HANDLES=synthetic-env-isolation-owner",
  "ORB_UNAPPROVED_TEST_KEY=synthetic-env-isolation-value",
  "",
].join("\n");

test("verify help keeps server boot and env outside its static import graph even with a linked env file", {
  timeout: scaledBudget(60_000),
}, ({ repoRoot, scratch }) => {
  const envFile = plantFile(scratch, "synthetic.env", SYNTHETIC_ENV);
  plantLink(scratch, ".env", envFile, "file");
  const report = join(scratch, "import-observation.json");
  const observer = plantFile(
    scratch,
    "observe-imports.mjs",
    `import {registerHooks} from "node:module";
import {writeFileSync} from "node:fs";
const forbidden=[];
registerHooks({resolve(specifier,context,next){const resolved=next(specifier,context);if(/packages\\/server\\/src\\/(?:entry\\/boot\\/index|foundation\\/env\\/index)\\.ts$/u.test(new URL(resolved.url).pathname)){forbidden.push(resolved.url);}return resolved;}});
process.on("exit",()=>writeFileSync(${JSON.stringify(report)},JSON.stringify({forbidden,keys:${JSON.stringify(FILE_KEYS)}.filter(key=>Object.hasOwn(process.env,key))})));`,
  );
  const child = runNicedSync(process.execPath, ["--import", observer, join(repoRoot, "tooling/src/verify/cli.ts"), "scoped-test", "--help"], {
    cwd: scratch,
    env: testProcessEnv({ ["ORB_ENV_NO_FILE"]: undefined }),
    maxBuffer: 4_194_304,
  });
  expect(child.status, child.stderr).toBe(0);
  expect(JSON.parse(readFileSync(report, "utf8"))).toEqual({ forbidden: [], keys: [] });
});

test("the actual scoped-test worker cannot read a linked env file or inherit deployment keys", {
  timeout: scaledBudget(60_000),
}, ({ repoRoot, scratch }) => {
  const envFile = plantFile(scratch, "synthetic.env", SYNTHETIC_ENV);
  plantLink(scratch, ".env", envFile, "file");
  plantLink(scratch, "node_modules", join(repoRoot, "node_modules"), "dir");
  plantLink(scratch, "scripts", join(repoRoot, "scripts"), "dir");
  plantFile(scratch, "package.json", '{"name":"synthetic-worker-env-isolation","private":true,"type":"module"}\n');
  plantFile(scratch, "vitest.config.ts", 'export default {test:{include:["worker.test.ts"],maxWorkers:1,globalSetup:[]}};\n');
  plantFile(scratch, "vitest.runtime.config.ts", 'export {default} from "./vitest.config.ts";\n');
  const report = join(scratch, "worker-observation.json");
  const serverEnv = pathToFileURL(join(repoRoot, "packages/server/src/foundation/env/index.ts")).href;
  plantFile(
    scratch,
    "worker.test.ts",
    `import {writeFileSync} from "node:fs";
import {expect,test} from "vitest";
test("the spawned worker has an intentional environment",async()=>{
await import(${JSON.stringify(serverEnv)});
const keys=${JSON.stringify(FILE_KEYS)}.filter(key=>Object.hasOwn(process.env,key));
writeFileSync(${JSON.stringify(report)},JSON.stringify({keys,noFile:process.env.ORB_ENV_NO_FILE}));
expect(keys).toEqual([]);
expect(process.env.ORB_ENV_NO_FILE).toBe("1");
});`,
  );
  const child = runNicedSync(process.execPath, [join(repoRoot, "tooling/src/verify/cli.ts"), "scoped-test", "node", "worker.test.ts"], {
    cwd: scratch,
    env: testProcessEnv({ ["ORB_ENV_NO_FILE"]: undefined }),
    maxBuffer: 4_194_304,
  });
  expect(child.status, child.stdout + child.stderr).toBe(0);
  expect(JSON.parse(readFileSync(report, "utf8"))).toEqual({ keys: [], noFile: "1" });
});
