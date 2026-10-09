import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

test.skipIf(process.platform !== "linux")(
  "owner timing admission binds hardware, trusted main and one bounded attempt",
  async ({ repoRoot, scratch, fakeBin }) => {
    const checkout = join(scratch, "checkout");
    const state = join(scratch, "state");
    const config = join(scratch, "config");
    const calls = join(scratch, "calls.jsonl");
    mkdirSync(join(checkout, ".git"), { recursive: true });
    writeFileSync(
      config,
      `EXPECTED_MACHINE_ID=${readFileSync("/etc/machine-id", "utf8").trim()}\nEXPECTED_UID=1000\nEXPECTED_CPU_MODEL=fixture-cpu\nTIMING_HARDWARE_CLASS=inktomi-owner\nCHECKOUT_DIR='${checkout}'\nSTATE_DIR='${state}'\nPNPM_BIN='${join(scratch, "fake-bin/pnpm")}'\n`,
    );
    const source = readFileSync(join(repoRoot, "scripts/ci/owner-timing.sh"), "utf8").replace("config=/etc/orbweaver-owner-timing.conf", `config='${config}'`);
    await fakeBin("stat", "const args=process.argv.slice(2);console.log(args[1]==='%u'?'0':process.env.CASE==='writable'?'666':'644');");
    await fakeBin("id", "console.log('1000');");
    await fakeBin("lscpu", "console.log(JSON.stringify({lscpu:[{field:'Model name:',data:process.env.CASE==='wrong-host'?'other-cpu':'fixture-cpu'}]}));");
    await fakeBin(
      "git",
      `
    import fs from 'node:fs';const args=process.argv.slice(2);fs.appendFileSync(process.env.CALLS_PATH,JSON.stringify(['git',...args])+'\\n');
    if(args[0]==='remote')console.log(process.env.CASE==='foreign-origin'?'https://example.invalid/fork.git':'https://github.com/Inktomi93/OrbWeaver.git');
    else if(args[0]==='status'){if(process.env.CASE==='dirty')console.log('M package.json');}
    else if(args.includes('fetch')){if(process.env.CASE==='fetch-failure')process.exit(71);}
    else if(args[0]==='rev-parse')console.log('a'.repeat(40));
    else if(args[0]==='cat-file')console.log('commit');
  `,
    );
    await fakeBin(
      "pnpm",
      `
    import fs from 'node:fs';const args=process.argv.slice(2);fs.appendFileSync(process.env.CALLS_PATH,JSON.stringify(['pnpm',...args])+'\\n');
    if(args[0]==='test:ct'){
      if(process.env.CASE==='red')process.exit(47);
      fs.mkdirSync('reports/runs/ct/fixture',{recursive:true});fs.writeFileSync('reports/ct-flaky.json','{}');fs.writeFileSync('reports/runs/ct/fixture/ct-flaky.json','{}');
    }
  `,
    );
    const execute = (scenario: string, mode = "--poll"): ReturnType<typeof spawnNiced> =>
      spawnNiced("bash", ["-euo", "pipefail", "-c", source, "owner-timing", mode], {
        cwd: scratch,
        env: {
          ["CASE"]: scenario,
          ["CALLS_PATH"]: calls,
          ["GITHUB_ACTIONS"]: scenario === "github" ? "true" : "",
          ...(scenario === "runner-context" ? { ["RUNNER_ENVIRONMENT"]: "" } : {}),
        },
      });
    for (const [scenario, exit] of [
      ["writable", 1],
      ["wrong-host", 1],
      ["github", 1],
      ["runner-context", 1],
      ["foreign-origin", 1],
      ["dirty", 1],
      ["fetch-failure", 71],
    ] as const) {
      writeFileSync(calls, "");
      const result = await execute(scenario);
      expect(result.code, result.stderr).toBe(exit);
      expect(readFileSync(calls, "utf8")).not.toContain('"pnpm"');
    }
    writeFileSync(calls, "");
    const red = await execute("red");
    expect(red.code, red.stderr).toBe(47);
    expect(readFileSync(join(state, "last-attempt.sha"), "utf8")).toBe(`${"a".repeat(40)}\n`);
    const skipped = await execute("ready");
    expect(skipped.code, skipped.stderr).toBe(0);
    const requests = readFileSync(calls, "utf8")
      .trim()
      .split("\n")
      .map((line) => z.array(z.string()).parse(JSON.parse(line)));
    expect(requests.filter((args) => args[0] === "pnpm" && args[1] === "test:ct")).toHaveLength(1);
    expect(requests.filter((args) => args.includes("fetch"))).toEqual(
      expect.arrayContaining([
        ["git", "-c", "credential.helper=", "fetch", "--no-tags", "https://github.com/Inktomi93/OrbWeaver.git", "refs/heads/main:refs/remotes/origin/main"],
      ]),
    );
  },
);
