import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

test("canonical media provisioning is authenticated, bounded and preserves every failed prerequisite", async ({ repoRoot, scratch, fakeBin }) => {
  const source = readFileSync(join(repoRoot, "scripts/ci/install-media.sh"), "utf8");
  expect(source).toContain("timeout 300s");
  expect(source).toContain("timeout 600s");
  await fakeBin(
    "sudo",
    "import fs from 'node:fs';const args=process.argv.slice(2);fs.appendFileSync('calls.jsonl',JSON.stringify(args)+'\\n');if(args.includes(process.env.FAIL_PHASE))process.exit(71);if(args.includes('install'))fs.writeFileSync('media-ready','yes');",
  );
  for (const tool of ["ffmpeg", "ffprobe"]) {
    await fakeBin(
      tool,
      "import fs from 'node:fs';process.exitCode=fs.existsSync('media-ready')&&process.env.BROKEN_TOOL!==process.argv[1].split('/').at(-1)?0:1;",
    );
  }
  for (const [scenario, status, count, broken] of [
    ["healthy", 0, 0, ""],
    ["missing", 0, 2, ""],
    ["update", 71, 1, ""],
    ["install", 71, 2, ""],
    ["broken", 1, 2, "ffprobe"],
  ] as const) {
    rmSync(join(scratch, "media-ready"), { force: true });
    writeFileSync(join(scratch, "calls.jsonl"), "");
    if (scenario === "healthy") {
      writeFileSync(join(scratch, "media-ready"), "yes");
    }
    const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", source], { cwd: scratch, env: { ["FAIL_PHASE"]: scenario, ["BROKEN_TOOL"]: broken } });
    expect(result.code, result.stderr).toBe(status);
    const calls = readFileSync(join(scratch, "calls.jsonl"), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((row) => z.array(z.string()).parse(JSON.parse(row)));
    expect(calls).toHaveLength(count);
    for (const call of calls) {
      expect(call).toEqual(
        expect.arrayContaining([
          "-n",
          "Acquire::Retries=3",
          "Acquire::http::Timeout=30",
          "Acquire::https::Timeout=30",
          "Acquire::AllowInsecureRepositories=false",
          "APT::Get::AllowUnauthenticated=false",
        ]),
      );
    }
  }
});
