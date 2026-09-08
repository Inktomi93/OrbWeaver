// The grouped, per-occurrence reporter (TSMORPH-SINGLE-PASS-AUDIT.md §9.3 + owner rulings 1/2): the
// dispatcher emits EXHAUSTIVE per-token findings carrying only {file,line,column,token}; the reporter
// GROUPS by gate → prints the reason (message + fix) ONCE as the group header → lists ALL occurrences
// beneath as clickable `path:line:col` + the offending token. This pins that grouped shape: reason once,
// every token under it, distinct columns per token.
import { Node, Project, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../../../../tooling/src/verify/index.ts";
import { renderPass, runPass } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";

const PROOF = { files: "export const fixture = true;\n", why: "test-owned legacy adapter fixture" } as const;

const offTokenGate: GateDescriptor = {
  name: "no-off-token-radius-shadow",
  docRow: "test-owned",
  status: "active",
  scopeSafety: "incremental-safe",
  message: "off-token default-scale radius/shadow utility",
  fix: "rounded-lg → rounded-card",
  scanRoot: (path) => path.startsWith("packages/ui/") || path.startsWith("packages/client/"),
  kinds: [SyntaxKind.StringLiteral],
  visit: (node, _sourceFile, ctx): void => {
    if (!Node.isStringLiteral(node)) {
      return;
    }
    for (const token of ["rounded-lg", "shadow-md"]) {
      const offset = node.getText().indexOf(token);
      if (offset >= 0) {
        ctx.report(node, { token, offset });
      }
    }
  },
  mustFlag: [PROOF],
  mustPass: [PROOF],
};

const noCallerUserIdGate: GateDescriptor = {
  name: "no-caller-user-id",
  docRow: "test-owned",
  status: "active",
  scopeSafety: "incremental-safe",
  message: "callerUserId is forbidden",
  scanRoot: () => true,
  kinds: [SyntaxKind.Identifier],
  visit: (node, _sourceFile, ctx): void => {
    if (Node.isIdentifier(node) && node.getText() === "callerUserId") {
      ctx.report(node, { token: "callerUserId", offset: 0 });
    }
  },
  mustFlag: [PROOF],
  mustPass: [PROOF],
};

function render(files: Readonly<Record<string, string>>, opts?: { readonly zeroScanAlarm: boolean }): string {
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
  return renderPass(result, new Map(gates.map((g) => [g.name, g])), opts);
}

test("the reporter groups by gate, prints the reason ONCE, and lists every token as path:line:col", () => {
  const out = render({
    "packages/ui/src/overlay/dialog.tsx": 'export const A = <div className="rounded-lg shadow-md" />;\n',
    "packages/server/src/domain/chat/engine/turn.ts": "export function f(callerUserId: string) {}\n",
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

// ── per-gate SCAN HEALTH (Codex GA-H-01) ──────────────────────────────────────────────────────────────
// A verdict with no denominator is unauditable: ✓ reads the same whether the gate examined the file or
// never saw it. Every gate line therefore carries `scanned <admitted>/<offered> files`.

test("every gate line carries the scan denominator behind its verdict", () => {
  const out = render({
    "packages/ui/src/ok/ok.tsx": 'export const OK = <div className="rounded-card" />;\n',
    "packages/server/src/domain/chat/engine/turn.ts": "export function f(userId: string) {}\n",
  });
  // The off-token gate is scoped to the UI/client class strings: one of the two files is in its scanRoot.
  expect(out).toContain("✓ no-off-token-radius-shadow  ·  scanned 1/2 files");
  // no-caller-user-id scans the whole packages+tests corpus: both files.
  expect(out).toContain("✓ no-caller-user-id  ·  scanned 2/2 files");
});

test("a gate that scanned NOTHING renders LOUD, not green — and is counted in the footer", () => {
  // The zero-scan placebo, planted with a REAL gate: hand the UI-scoped gate a tree with no UI file, so
  // its scanRoot admits nothing. Its ✓ would be vacuous — every scanRoot regression looks exactly like it.
  const out = render(
    {
      "packages/server/src/domain/chat/engine/turn.ts": "export function f(userId: string) {}\n",
    },
    { zeroScanAlarm: true },
  );
  expect(out).toContain("⚠ no-off-token-radius-shadow  ·  scanned 0/1 files — SCANNED ZERO FILES");
  expect(out).not.toContain("✓ no-off-token-radius-shadow");
  expect(out).toContain("single-pass: 1 gate(s) SCANNED ZERO FILES — the checker is BLIND, not clean");
  // The gate that DID read the file is untouched by the alarm.
  expect(out).toContain("✓ no-caller-user-id  ·  scanned 1/1 files");
});

test("the zero-scan alarm is OFF by default — a scoped run legitimately hands a gate no files", () => {
  const out = render({
    "packages/server/src/domain/chat/engine/turn.ts": "export function f(userId: string) {}\n",
  });
  expect(out).toContain("✓ no-off-token-radius-shadow  ·  scanned 0/1 files");
  expect(out).not.toContain("SCANNED ZERO FILES");
});
