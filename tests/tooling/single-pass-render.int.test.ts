// The grouped, per-occurrence reporter (TSMORPH-SINGLE-PASS-AUDIT.md §9.3 + owner rulings 1/2): the
// dispatcher emits EXHAUSTIVE per-token findings carrying only {file,line,column,token}; the reporter
// GROUPS by gate → prints the reason (message + fix) ONCE as the group header → lists ALL occurrences
// beneath as clickable `path:line:col` + the offending token. This pins that grouped shape: reason once,
// every token under it, distinct columns per token.
import { Project } from "ts-morph";
import { gate as noCallerUserIdGate } from "../../scripts/check/gates/no-caller-user-id.ts";
import { gate as offTokenGate } from "../../scripts/check/gates/no-off-token-radius-shadow.ts";
import { runPass } from "../../scripts/check/pass.ts";
import { renderPass } from "../../scripts/check/render.ts";
import { expect, test } from "../support/fixtures.ts";

const ROOT = "/repo";

function render(files: Readonly<Record<string, string>>): string {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [rel, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${rel}`, text);
  }
  const gates = [offTokenGate, noCallerUserIdGate];
  const result = runPass(gates, {
    root: ROOT,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  return renderPass(result, new Map(gates.map((g) => [g.name, g])));
}

test("the reporter groups by gate, prints the reason ONCE, and lists every token as path:line:col", () => {
  const out = render({
    "packages/ui/src/overlay/dialog.tsx":
      'export const A = <div className="rounded-lg shadow-md" />;\n',
    "packages/server/src/domain/chat/engine/turn.ts":
      "export function f(callerUserId: string) {}\n",
  });

  // Group header with the per-gate count + the reason once (message + fix), NOT repeated per occurrence.
  expect(out).toContain("✗ no-off-token-radius-shadow (2)");
  expect(out.match(/off-token default-scale radius\/shadow utility/gu)).toHaveLength(1);
  expect(out).toContain("fix: rounded-lg → rounded-card");

  // Both banned tokens listed as clickable jump-links with the offending token, at DISTINCT columns.
  expect(out).toContain("packages/ui/src/overlay/dialog.tsx:1:34  rounded-lg");
  expect(out).toContain("packages/ui/src/overlay/dialog.tsx:1:45  shadow-md");

  // The second gate is its own group with its own single reason.
  expect(out).toContain("✗ no-caller-user-id (1)");
  expect(out).toContain("packages/server/src/domain/chat/engine/turn.ts:1:19  callerUserId");

  expect(out).toContain("single-pass: 3 violation(s)");
});

test("a clean tree renders a ✓ per gate and a clean footer", () => {
  const out = render({
    "packages/ui/src/ok/ok.tsx": 'export const OK = <div className="rounded-card" />;\n',
  });
  expect(out).toContain("✓ no-off-token-radius-shadow");
  expect(out).toContain("✓ no-caller-user-id");
  expect(out).toContain("single-pass: clean");
});
