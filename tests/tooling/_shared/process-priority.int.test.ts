// Real-subprocess proof that `lowerToolingPriority` replaces `nice -n 19` (owner-ruled: `nice` does not
// exist on Windows): a child spawned AFTER the call inherits the parent's lowered priority, with no
// wrapper binary involved. `proc.test.ts` mocks `node:child_process`, so this behavior — an OS-level
// inheritance property — is only observable through a real process tree.
import { execFileSync } from "node:child_process";
import process from "node:process";
import { nicedCommand, TOOLING_PRIORITY } from "@orb/tooling/_shared/process-priority";
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

// POSIX sync doors spawn through `nice`, which ADDS to the caller's niceness; a caller already at the tooling priority
// must still hand its child exactly that priority, not the clamped maximum.
test("a sync door's child lands at the tooling priority from a caller that is already lowered", () => {
  const script = [
    "import { pathToFileURL } from 'node:url';",
    `const priority = await import(pathToFileURL(${JSON.stringify(`${process.cwd()}/tooling/src/_shared/process-priority.ts`)}).href);`,
    `const proc = await import(pathToFileURL(${JSON.stringify(`${process.cwd()}/tooling/src/_shared/proc.ts`)}).href);`,
    "priority.lowerToolingPriority();",
    "const read = proc.runNicedSync(process.execPath, ['-e', \"process.stdout.write(String(require('node:os').getPriority(process.pid)))\"]);",
    "process.stdout.write(read.stdout);",
  ].join("\n");

  const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });

  expect(Number(stdout)).toBe(TOOLING_PRIORITY);
});

test("win32 has no `nice`, so a sync door keeps the niced-exec launcher there", () => {
  const win = nicedCommand("git", ["status"], "win32");
  expect(win.command).toBe(process.execPath);
  expect(win.args.slice(1)).toEqual(["git", "status"]);
  expect(win.args[0]).toMatch(/niced-exec\.ts$/u);
  expect(nicedCommand("git", ["status"], "linux").command).toBe("nice");
});
