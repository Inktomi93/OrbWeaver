// Real-subprocess proof that `lowerToolingPriority` replaces `nice -n 19` (owner-ruled: `nice` does not
// exist on Windows): a child spawned AFTER the call inherits the parent's lowered priority, with no
// wrapper binary involved. `proc.test.ts` mocks `node:child_process`, so this behavior — an OS-level
// inheritance property — is only observable through a real process tree.
import { execFileSync } from "node:child_process";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { nicedCommand, TOOLING_PRIORITY } from "@orb/tooling/floor/process/process-priority";
import { z } from "zod";

test("a child spawned after lowerToolingPriority inherits the lowered priority", () => {
  const script = [
    "import { pathToFileURL } from 'node:url';",
    "import os from 'node:os';",
    "import { spawn } from 'node:child_process';",
    `const mod = await import(pathToFileURL(${JSON.stringify(`${process.cwd()}/tooling/src/floor/process/process-priority.ts`)}).href);`,
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
    `const priority = await import(pathToFileURL(${JSON.stringify(`${process.cwd()}/tooling/src/floor/process/process-priority.ts`)}).href);`,
    `const proc = await import(pathToFileURL(${JSON.stringify(`${process.cwd()}/tooling/src/floor/process/proc.ts`)}).href);`,
    "priority.lowerToolingPriority();",
    "const read = proc.runNicedSync(process.execPath, ['-e', \"process.stdout.write(String(require('node:os').getPriority(process.pid)))\"]);",
    "process.stdout.write(read.stdout);",
  ].join("\n");

  const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });

  expect(Number(stdout)).toBe(TOOLING_PRIORITY);
});

// The supervised door's launcher sets its own priority; an unprivileged caller already below the target
// cannot be raised back to it, so the launcher must leave it there instead of failing to start.
test("a supervised sync door from a caller below the tooling priority keeps the caller's priority", () => {
  const below = TOOLING_PRIORITY + 5;
  const script = [
    "import { pathToFileURL } from 'node:url';",
    "import os from 'node:os';",
    `const proc = await import(pathToFileURL(${JSON.stringify(`${process.cwd()}/tooling/src/floor/process/proc.ts`)}).href);`,
    `os.setPriority(${String(below)});`,
    "const read = proc.runNicedSync(process.execPath, ['-e', \"process.stdout.write(String(require('node:os').getPriority(process.pid)))\"], { supervised: true });",
    "process.stdout.write(JSON.stringify(read));",
  ].join("\n");

  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  const read = z.object({ status: z.number().nullable(), stdout: z.string(), stderr: z.string() }).parse(JSON.parse(output));

  expect(read.status, read.stderr).toBe(0);
  expect(Number(read.stdout)).toBe(below);
});

test("win32 has no `nice`, so a sync door keeps the niced-exec launcher there", () => {
  const win = nicedCommand("git", ["status"], "win32");
  expect(win.command).toBe(process.execPath);
  expect(win.args.slice(1)).toEqual(["git", "status"]);
  expect(win.args[0]).toMatch(/niced-exec\.ts$/u);
  expect(nicedCommand("git", ["status"], "linux").command).toBe("nice");
});
