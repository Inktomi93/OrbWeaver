// Self-test for the `test-mock-doctrine` gate (scripts/check/gates/test-mock-doctrine.ts —
// core/Spine-Testing.md §3: vi.mock of an INTERNAL module is banned; fake at the edges, inject at the root).
// Proves each internal-target form fires — a relative path, a raw `packages/…` path, AND the `@orb/*`
// workspace alias — and that a third-party bare/`node:` edge passes. The `@orb/` case is the NEGATIVE-SPACE
// pin for the exact blind spot the gate shipped with: every internal cross-package import uses the alias, so
// `vi.mock("@orb/server/…")` slipped through undetected until the alias was added to the internal-target set.
//
// The `vi.mock(...)` calls live inside STRING fixtures (not this file's own AST) — the gate walks AST call
// expressions, so a call written as a string literal is invisible to it and can't self-trip.
import { Project } from "ts-morph";
import { testMockDoctrine } from "../../scripts/check/gates/test-mock-doctrine.ts";
import type { CheckContext } from "../../scripts/check/harness.ts";
import { expect, test } from "../support/fixtures.ts";

const F = "tests/server/domain/widget/thing.int.test.ts";

function ctxFor(files: Record<string, string>, root = "/repo"): CheckContext {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${root}/${path}`, text);
  }
  return { root, project };
}

const mock = (target: string): string => `import { vi } from "vitest";\nvi.mock("${target}");\n`;

test("fires on a relative-path vi.mock", () => {
  const v = testMockDoctrine.run(ctxFor({ [F]: mock("../src/foo") }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("internal module");
});

test("fires on a raw packages/ vi.mock", () => {
  expect(testMockDoctrine.run(ctxFor({ [F]: mock("packages/server/src/foo") }))).toHaveLength(1);
});

test("fires on an @orb/-aliased vi.mock (the closed blind spot)", () => {
  const v = testMockDoctrine.run(ctxFor({ [F]: mock("@orb/server/domain/chat") }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("@orb/server/domain/chat");
});

test("passes a third-party edge (bare name + node: builtin)", () => {
  const src = `${mock("better-sqlite3")}${mock("node:fs")}`;
  expect(testMockDoctrine.run(ctxFor({ [F]: src }))).toEqual([]);
});
