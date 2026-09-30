import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { resolveStageCommand } from "../../../../tooling/src/verify/lib/stage-command.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("Windows resolves pinned command shims before PATH executables", ({ scratch }) => {
  const bin = join(scratch, "node_modules", ".bin");
  const system = join(scratch, "system");
  mkdirSync(bin, { recursive: true });
  mkdirSync(system);
  writeFileSync(join(bin, "pnpm"), "POSIX shim", { mode: 0o755 });
  writeFileSync(join(bin, "pnpm.cmd"), "@echo off", { mode: 0o644 });
  writeFileSync(join(system, "pnpm.exe"), "fixture", { mode: 0o644 });
  expect(resolveStageCommand(scratch, "pnpm", system, { platform: "win32", pathExt: ".EXE;.CMD" })).toEqual({
    kind: "workspace-bin",
    command: join(bin, "pnpm.cmd"),
  });
});

test("Windows searches semicolon PATH and respects executable extensions", ({ scratch }) => {
  const first = join(scratch, "first");
  const second = join(scratch, "second");
  mkdirSync(first);
  mkdirSync(second);
  writeFileSync(join(first, "node"), "POSIX shim", { mode: 0o755 });
  writeFileSync(join(second, "node.exe"), "fixture", { mode: 0o644 });
  const path = `${first};${second}`;
  expect(resolveStageCommand(scratch, "node", path, { platform: "win32", pathExt: ".EXE;.CMD" })).toEqual({
    kind: "system-program",
    command: join(second, "node.exe"),
  });
  expect(resolveStageCommand(scratch, "node.exe", path, { platform: "win32", pathExt: ".EXE;.CMD" }).kind).toBe("system-program");
  expect(resolveStageCommand(scratch, "node", path, { platform: "win32", pathExt: ".CMD" }).kind).toBe("unresolvable");
  expect(resolveStageCommand(scratch, "missing", path, { platform: "win32", pathExt: ".EXE;.CMD" }).kind).toBe("unresolvable");
});

test.skipIf(process.platform === "win32")("POSIX requires executable permission and does not expand Windows suffixes", ({ scratch }) => {
  writeFileSync(join(scratch, "tool"), "fixture", { mode: 0o644 });
  writeFileSync(join(scratch, "other.exe"), "fixture", { mode: 0o755 });
  expect(resolveStageCommand(scratch, "tool", scratch, { platform: "linux" }).kind).toBe("unresolvable");
  expect(resolveStageCommand(scratch, "other", scratch, { platform: "linux" }).kind).toBe("unresolvable");
  writeFileSync(join(scratch, "runnable"), "fixture", { mode: 0o755 });
  expect(resolveStageCommand(scratch, "runnable", scratch, { platform: "linux" }).kind).toBe("system-program");
});
