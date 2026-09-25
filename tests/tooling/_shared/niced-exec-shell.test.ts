// Pure unit proof for niced-exec.ts's win32 shell decision and quoting — CI is Linux, so these run the
// LOGIC, never a real cmd.exe. Both were a real defect (leg 4, owner-ruled): `shell: true` on EVERY niced
// spawn, joining the operator's own args unescaped, so a Playwright `-g` regex with `|` or `&` could run a
// second command on Windows, and every non-win32 spawn printed node's DEP0190 for nothing.
import { needsWindowsShell, quoteWindowsShellArg } from "@orb/tooling/_shared/niced-exec-shell";
import { expect, test } from "../../support/tool-fixtures.ts";

test("needsWindowsShell: only a .cmd/.bat shim on win32 asks for a shell", () => {
  expect(needsWindowsShell("biome.cmd", "win32")).toBe(true);
  expect(needsWindowsShell("VITEST.BAT", "win32"), "case-insensitive").toBe(true);
  expect(needsWindowsShell("node.exe", "win32"), "a real .exe never needs a shell").toBe(false);
  expect(needsWindowsShell("biome", "win32"), "a bare name is not provably a shim").toBe(false);
  expect(needsWindowsShell("biome.cmd", "linux"), "POSIX never gets a shell, even for a .cmd-named file").toBe(false);
  expect(needsWindowsShell("biome.cmd", "darwin")).toBe(false);
});

test("quoteWindowsShellArg: an argument with no special characters passes through unchanged", () => {
  expect(quoteWindowsShellArg("plain")).toBe("plain");
  expect(quoteWindowsShellArg("--flag")).toBe("--flag");
  expect(quoteWindowsShellArg("")).toBe('""');
});

test("quoteWindowsShellArg: a space stays inside one quoted argument, never splitting it", () => {
  // The caret-escape pass also escapes the wrapping quotes — intentional: cmd.exe consumes the carets
  // during ITS OWN parsing, so what CreateProcessW sees is a plain `"hello world"`, one argument.
  expect(quoteWindowsShellArg("hello world")).toBe('^"hello world^"');
});

test.each([
  ["a & del /f", "&"],
  ["a | b", "|"],
  ["a > out.txt", ">"],
  ["a < in.txt", "<"],
  ["50% off", "%"],
  ["a^b", "^"],
])("quoteWindowsShellArg: %s carries its metacharacter %s caret-escaped, never bare", (raw, meta) => {
  const quoted = quoteWindowsShellArg(raw);
  expect(quoted, `${JSON.stringify(raw)} -> ${JSON.stringify(quoted)}`).toContain(`^${meta}`);
});

test("quoteWindowsShellArg: an embedded quote is backslash-escaped before the caret pass", () => {
  const quoted = quoteWindowsShellArg('a "quoted" value');
  expect(quoted).toContain('\\^"');
});

test("quoteWindowsShellArg: a Playwright -g regex carrying | and & cannot open a second command", () => {
  const quoted = quoteWindowsShellArg("foo|bar & del c:\\");
  expect(quoted.includes("^|") && quoted.includes("^&")).toBe(true);
});
