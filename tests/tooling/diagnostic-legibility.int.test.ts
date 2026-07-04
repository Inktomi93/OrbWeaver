// Self-test for the `diagnostic-legibility` meta-gate (scripts/check/gates/diagnostic-legibility.ts —
// LIVE in report.ts's ALL_CHECKS). The gate reads gate/grit SOURCE files from disk, so it self-tests
// over a REAL temp-dir fixture tree (a fake `gates/` + `grit/` pair fed to the exported `scanDirs`),
// never the real corpus. Proves BOTH directions: a pointerless diagnostic FIRES (gate message, grit
// message, and a `MSG`-table value) and a pointered / terse-ok-marked one is CLEAN — plus the
// `hasPointer` token matrix (doc path · code dir · @orb specifier · concrete file · bare → false).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasPointer, scanDirs } from "../../scripts/check/gates/diagnostic-legibility.ts";
import type { Violation } from "../../scripts/check/harness.ts";
import { expect, test } from "../support/fixtures.ts";

/** Write a `gates/` + `grit/` fixture tree in a temp dir, run `scanDirs`, hand back the violations. */
function scan(files: Record<string, string>): Violation[] {
  const root = mkdtempSync(join(tmpdir(), "orb-diaglegi-"));
  try {
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, text);
    }
    return scanDirs(join(root, "gates"), join(root, "grit"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const fired = (v: Violation[], file: string): boolean => v.some((x) => x.file === file);

test("a gate `message:` with no pointer FIRES", () => {
  const v = scan({ "gates/bad.ts": 'export const c = { message: "just fix the thing" };\n' });
  expect(fired(v, "bad.ts")).toBe(true);
});

test("a gate `message:` with a *.md pointer is CLEAN", () => {
  const v = scan({ "gates/good.ts": 'export const c = { message: "fix it (Foo-Bar.md §3)." };\n' });
  expect(v).toEqual([]);
});

test("a gate `message:` with a code-home path is CLEAN", () => {
  const v = scan({
    "gates/good.ts": 'export const c = { message: "route it through packages/kit/src/ids.ts" };\n',
  });
  expect(v).toEqual([]);
});

test("a `message:` resolved through a same-file const is checked (pointerless const FIRES)", () => {
  const v = scan({
    "gates/bad.ts":
      'const MESSAGE = "no home for this rule";\nexport const c = { message: MESSAGE };\n',
  });
  expect(fired(v, "bad.ts")).toBe(true);
});

test("a `MSG`-table string value with no pointer FIRES (the shorthand-`{ message }` idiom)", () => {
  const v = scan({
    "gates/bad.ts":
      'const MSG = { verb: "bare table diagnostic" } as const;\nexport const use = MSG.verb;\n',
  });
  expect(fired(v, "bad.ts")).toBe(true);
});

test("a `// terse-ok:` marker on the line above the message ESCAPES the gate", () => {
  const v = scan({
    "gates/terse.ts":
      'export const c = {\n  // terse-ok: fix is fully self-contained, no doc covers it\n  message: "just do the obvious thing",\n};\n',
  });
  expect(v).toEqual([]);
});

test("a grit `register_diagnostic` message with no pointer FIRES", () => {
  const v = scan({ "grit/bad.grit": 'message="bare grit diagnostic"\n' });
  expect(fired(v, "bad.grit")).toBe(true);
});

test("a grit message with a *.md pointer is CLEAN", () => {
  const v = scan({ "grit/good.grit": 'message="fix it. See Foo.md §1."\n' });
  expect(v).toEqual([]);
});

test("hasPointer accepts doc / code-dir / @orb / concrete-file, rejects bare prose", () => {
  expect(hasPointer("see Spine-Testing.md §5")).toBe(true);
  expect(hasPointer("route through features/chat/hooks/")).toBe(true);
  expect(hasPointer("import from @orb/kit/ids")).toBe(true);
  expect(hasPointer("delete the entry in bus-coverage.ts")).toBe(true);
  expect(hasPointer("just fix it, no pointer here")).toBe(false);
  expect(hasPointer("a bare §7.5 reference resolves to nothing")).toBe(false);
});
