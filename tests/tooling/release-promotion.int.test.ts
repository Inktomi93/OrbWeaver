import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

const API = `
const source='a'.repeat(40),head='b'.repeat(40),mode=process.env.PROMOTION_CASE;
globalThis.fetch=async(url)=>{
 const path=new URL(url).pathname;
 if(mode==='read-failure') return new Response('{}',{status:403});
 if(path.includes('/commits/v'))return new Response(JSON.stringify({sha:mode==='wrong-tag'?'c'.repeat(40):source}));
 if(path.endsWith('/commits/release'))return new Response(JSON.stringify({sha:head}));
 if(path.includes('/compare/'))return new Response(JSON.stringify({merge_base_commit:{sha:mode==='off-branch'?'c'.repeat(40):source}}));
 if(path.includes('/contents/'))return new Response(JSON.stringify({encoding:'base64',content:Buffer.from(JSON.stringify({version:mode==='newer-head'?'0.2.0':'0.1.3'})).toString('base64')}));
 if(path.endsWith('/releases/latest')){
   if(mode==='bootstrap')return new Response('{}',{status:404});
   if(mode==='latest-failure')return new Response('{}',{status:500});
   return new Response(JSON.stringify({tag_name:mode==='newer-latest'?'v0.2.0':'v0.1.3',draft:false,prerelease:false}));
 }
 throw Error('unexpected read');
};
`;

for (const [scenario, status] of [
  ["equal-retry", 0],
  ["bootstrap", 0],
  ["newer-head", 2],
  ["newer-latest", 2],
  ["read-failure", 2],
  ["latest-failure", 2],
  ["wrong-tag", 2],
  ["off-branch", 2],
] as const) {
  test(`stable pointer promotion rejects obsolete or unproven ${scenario} state`, async ({ repoRoot, scratch }) => {
    const preload = join(scratch, "api.mjs");
    writeFileSync(preload, API);
    const result = await spawnNiced(process.execPath, ["--import", preload, join(repoRoot, "scripts/ci/release-promotion.ts")], {
      env: {
        ["GH_TOKEN"]: "fixture-token",
        ["GITHUB_REPOSITORY"]: "proof/repo",
        ["SOURCE_SHA"]: "a".repeat(40),
        ["VERSION"]: "0.1.3",
        ["TAG"]: "v0.1.3",
        ["PROMOTION_CASE"]: scenario,
      },
    });
    expect(result.code, result.stderr).toBe(status);
  });
}

test("both stable pointer writes retain the native admission failure under implicit bash-e", async ({ repoRoot, scratch, fakeBin }) => {
  const steps = z
    .object({ jobs: z.record(z.string(), z.object({ steps: z.array(z.object({ run: z.string().optional(), name: z.string().optional() })) })) })
    .parse((await import("yaml")).parse(readFileSync(join(repoRoot, ".github/workflows/release.yml"), "utf8"))).jobs;
  const docker = steps["image"]?.steps.find((step) => step.name === "Advertise the verified image as latest")?.run;
  const notes = steps["notes"]?.steps.find((step) => step.run?.includes("gh release edit") === true)?.run;
  await fakeBin("pnpm", "process.exit(71);");
  await fakeBin("docker", "import fs from 'node:fs';fs.writeFileSync('promoted','yes');");
  await fakeBin("gh", "import fs from 'node:fs';fs.writeFileSync('promoted','yes');");
  for (const source of [docker, notes]) {
    const result = await spawnNiced("bash", ["-e", "-c", z.string().parse(source)], { cwd: scratch });
    expect(result.code, result.stderr).toBe(71);
    expect(() => readFileSync(join(scratch, "promoted"), "utf8")).toThrow();
  }
});
