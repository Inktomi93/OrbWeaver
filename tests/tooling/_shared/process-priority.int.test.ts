// Real-subprocess proof that `lowerToolingPriority` replaces `nice -n 19` (owner-ruled: `nice` does not
// exist on Windows): a child spawned AFTER the call inherits the parent's lowered priority, with no
// wrapper binary involved. `proc.test.ts` mocks `node:child_process`, so this behavior — an OS-level
// inheritance property — is only observable through a real process tree.
import { execFileSync } from "node:child_process";
import process from "node:process";
import { TOOLING_PRIORITY } from "@orb/tooling/_shared/process-priority";
import { expect, test } from "../../support/tool-fixtures.ts";

test("a child spawned after lowerToolingPriority inherits the lowered priority", () => {
  const script = [
    "import { pathToFileURL } from 'node:url';",
    "import os from 'node:os';",
    "import { spawn } from 'node:child_process';",
    `const mod = await import(pathToFileURL(${JSON.stringify(`${process.cwd()}/tooling/src/_shared/process-priority.ts`)}).href);`,
    "mod.lowerToolingPriority();",
    "const kid = spawn(process.execPath, ['-e', \"process.stdout.write(String(require('node:os').getPriority(process.pid)))\"]);",
    "let out = '';",
    "kid.stdout.on('data', (d) => { out += d; });",
    "kid.on('exit', () => { process.stdout.write(out); process.exit(0); });",
  ].join("\n");

  const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });

  expect(Number(stdout)).toBe(TOOLING_PRIORITY);
});

test("TOOLING_PRIORITY is below-normal (10), not `nice`'s old IDLE-mapped 19 on Windows", () => {
  expect(TOOLING_PRIORITY).toBe(10);
});
