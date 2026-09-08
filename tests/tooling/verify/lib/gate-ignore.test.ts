// The FINDING-ARM half of the `@orb-gate-ignore` suppressor (issue #828). The node arm's grammar is proven
// by gate-conformance and its CONSUMPTION verdicts by tests/tooling/gate-ignore-grammar.repo.int.test.ts; this
// pins the arm neither can reach cheaply — a `visitFile` line-scanner reporting through `ctx.report(finding)`,
// which until #828 bypassed every marker by construction (so `test-determinism` had no per-site escape).
// The carrier is a SYNTHETIC line-scanner gate driven straight through `runPass` over an in-memory project:
// no corpus load, no real tree, milliseconds. What it proves: line-adjacency (§4.3 / the house
// escape-marker law), the position match against `Finding.token` (§4.3a), the mention fence, that a
// file-level finding stays UNSUPPRESSIBLE, the consumption COUNT the stale/over-exempt arms read (§4.4),
// and `markerImmune` — a gate that audits the vocabulary can never be silenced by it.
import type { Finding, GateDescriptor, GateRunCtx } from "../../../../tooling/src/verify/contract/gate.ts";
import { gateIgnoreUseCount, runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const FILE = "packages/ui/src/probe/x.ts";
/** The banned lexeme the synthetic scanner reports, once per occurrence — two on one line is §4.3a's
 *  "one line, two guarded things" shape, reachable here because the scanner emits a `token`. */
const BANNED = ["alpha", "beta"] as const;

function scanFile(sf: { getFullText: () => string; getFilePath: () => string }, ctx: GateRunCtx, name: string): void {
  const file = sf.getFilePath().replace(`${ctx.root}/`, "");
  for (const [index, line] of sf.getFullText().split("\n").entries()) {
    for (const token of BANNED) {
      if (line.includes(`${token}(`)) {
        ctx.report({ file, line: index + 1, column: 0, token, message: `${name}: ambient ${token}` });
      }
    }
  }
}

/** A line-scanner reporting through the explicit-`Finding` overload — `test-determinism`'s exact shape. */
const scanner: GateDescriptor = {
  name: "line-scan-probe",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  message: "synthetic line-scan probe",
  visitFile: (sf, ctx) => {
    scanFile(sf, ctx, "line-scan-probe");
  },
  mustFlag: [{ files: "const x = alpha();\n", why: "unused here — the loader's self-proof requirement" }],
  mustPass: [{ files: "const x = 1;\n", why: "unused here — the loader's self-proof requirement" }],
};

/** The same scanner, but declared as an auditor of the exemption vocabulary: markers must never reach it. */
const immuneScanner: GateDescriptor = { ...scanner, name: "vocabulary-auditor", markerImmune: true };

/** A gate whose only finding is FILE-LEVEL (line 0) — the shape that must stay unsuppressible. */
const fileLevel: GateDescriptor = {
  ...scanner,
  name: "file-level-probe",
  visitFile: (sf, ctx) => {
    ctx.report({ file: sf.getFilePath().replace(`${ctx.root}/`, ""), line: 0, column: 0, message: "file-level verdict" });
  },
};

function run(source: string, gate: GateDescriptor = scanner): readonly Finding[] {
  const { project, root } = ctxFor({ [FILE]: source });
  return (
    runPass([gate], {
      root,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    }).gates[0]?.findings ?? []
  );
}

test("CONTROL — the synthetic line-scanner bites, and reports through the Finding overload", () => {
  expect(run("export const a = alpha();\n").map((f) => f.token)).toEqual(["alpha"]);
});

test("a well-formed marker on the line IMMEDIATELY above a Finding-arm violation suppresses it", () => {
  expect(run("// @orb-gate-ignore line-scan-probe: probe — the general Finding-arm escape (#828)\nexport const a = alpha();\n")).toEqual([]);
});

test("the marker is LINE-ADJACENT — one line too far suppresses nothing, and consumes nothing", () => {
  const source = "// @orb-gate-ignore line-scan-probe: probe — one line too far\n\nexport const a = alpha();\n";
  expect(run(source).map((f) => f.line)).toEqual([3]);
  // The marker consumed nothing this run — which is exactly what `gate-ignore-inventory`'s STALE arm reads.
  expect(gateIgnoreUseCount(FILE, 1)).toBe(0);
});

test("consumption is COUNTED at the marker's line, so the stale + over-exempt arms see the Finding arm", () => {
  expect(run("// @orb-gate-ignore line-scan-probe: probe — consumed once\nexport const a = alpha();\n")).toEqual([]);
  expect(gateIgnoreUseCount(FILE, 1)).toBe(1);
  // §4.3a: ONE unpositioned marker over a line carrying TWO guarded things absolves both — the count is
  // what makes that visible as an OVER-EXEMPTION instead of a silent second exemption.
  expect(run("// @orb-gate-ignore line-scan-probe: probe — unpositioned, absolves both\nexport const a = [alpha(), beta()];\n")).toEqual([]);
  expect(gateIgnoreUseCount(FILE, 1)).toBe(2);
});

test("§4.3a — a POSITION-named marker absolves only its own token; the sibling on the same line still reds", () => {
  const source = "// @orb-gate-ignore line-scan-probe(alpha): probe — position-scoped\nexport const a = [alpha(), beta()];\n";
  expect(run(source).map((f) => f.token)).toEqual(["beta"]);
});

test("a marker naming a DEAD position suppresses nothing", () => {
  expect(run("// @orb-gate-ignore line-scan-probe(gamma): probe — names a token that is not there\nexport const a = alpha();\n").map((f) => f.token)).toEqual([
    "alpha",
  ]);
});

test("a MALFORMED (bare) marker suppresses nothing — a marker that exempts nothing must not look like protection", () => {
  expect(run("// @orb-gate-ignore line-scan-probe\nexport const a = alpha();\n").map((f) => f.token)).toEqual(["alpha"]);
});

test("a marker naming a DIFFERENT gate suppresses nothing", () => {
  expect(run("// @orb-gate-ignore some-other-gate: probe — not this gate\nexport const a = alpha();\n").map((f) => f.token)).toEqual(["alpha"]);
});

test("MENTION FENCE — a marker quoted mid-comment, or spelled inside a string, never suppresses", () => {
  const quoted = "// see `// @orb-gate-ignore line-scan-probe: x` — a quotation must never suppress\nexport const a = alpha();\n";
  expect(run(quoted).map((f) => f.token)).toEqual(["alpha"]);
  const inString = 'export const doc = "// @orb-gate-ignore line-scan-probe: x";\nexport const a = alpha();\n';
  expect(run(inString).map((f) => f.token)).toEqual(["alpha"]);
});

test("a FILE-LEVEL finding (line 0) has no line above it and is unsuppressible by construction", () => {
  const source = "// @orb-gate-ignore file-level-probe: probe — cannot reach a file-level verdict\nexport const a = 1;\n";
  expect(run(source, fileLevel).map((f) => f.line)).toEqual([0]);
});

test("a violation on line 1 is unsuppressible too — there is no line above it to carry a marker", () => {
  expect(run("export const a = alpha();\n").map((f) => f.line)).toEqual([1]);
});

test("markerImmune — a gate that AUDITS the vocabulary can never be silenced by it", () => {
  const source = "// @orb-gate-ignore vocabulary-auditor: probe — must NOT absolve the report that indicts it\nexport const a = alpha();\n";
  expect(run(source, immuneScanner).map((f) => f.token)).toEqual(["alpha"]);
  // The BOTH-DIRECTIONS control: the identical marker over the identical scanner WITHOUT the flag does
  // suppress, so the row above is testing the flag and not a typo in the fixture.
  expect(run(source, { ...immuneScanner, markerImmune: false })).toEqual([]);
});
