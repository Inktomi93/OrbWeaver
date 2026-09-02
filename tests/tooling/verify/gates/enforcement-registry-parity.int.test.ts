// The PERMANENT PIN for `enforcement-registry-parity`'s DESCRIPTION-MIRROR arms (#910). The checker
// compared gate NAME SETS and the registered-gate COUNT and never the descriptions, so a doc row that
// COPIED a descriptor's runtime `message` could drift forever: `Core-Enforcement-Active-Gates.md`'s
// `no-if-is-group` row was a verbatim copy that had rotted into pre-#901 vocabulary — the string a
// violating agent actually READS taught retired words, and a doc-only repair would have created a
// divergence nothing catches (#909).
//
// Red-first receipt, 2026-09-01: with the widened checker run against the REAL tree BEFORE the doc was
// repaired, three live rows came back as undeclared mirrors (`no-if-is-group`, `no-context-returntype`,
// `no-decorators`) that the old name-set checker was structurally blind to.
//
// Conformance proves the arms in synthetic mini-projects; THIS drives the REAL descriptor over planted
// roots in both directions, and asserts the real tree's own mirror rows stay byte-equal.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Node } from "ts-morph";
import { Project } from "ts-morph";
import { describe } from "vitest";
import type { Finding, GateRunCtx } from "../../../../tooling/src/verify/contract/gate.ts";
import { gate } from "../../../../tooling/src/verify/gates/enforcement-registry-parity.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const DOC_REL = "docs/architecture/core/Core-Enforcement-Active-Gates.md";
const GATE_REL = "tooling/src/verify/gates/x.ts";
const MESSAGE = "the exact runtime text";
/** The message as it is SPELLED in a descriptor — a quoted literal, the default initializer under test. */
const MESSAGE_LITERAL = JSON.stringify(MESSAGE);
/** Restated, not imported: the test is the SECOND opinion on the marker vocabulary, not a re-import of
 *  the subject's own constant. */
const MARKER = "(@mirrors-message)";
/** The real-tree arm parses all ~250 gate files with ts-morph and evaluates each descriptor message; the
 *  parallel lane default of 5s is a contention flake, not a verdict. */
const REAL_TREE_TIMEOUT_MS = 30_000;

function runGate(root: string): readonly Finding[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const findings: Finding[] = [];
  const ctx: GateRunCtx = {
    root,
    project,
    scope: { kind: "project" },
    files: [],
    checker: () => project.getTypeChecker(),
    report: (arg: Node | Finding): void => {
      if ("file" in arg) {
        findings.push(arg);
      }
    },
    scan: () => undefined,
  };
  gate.run?.(ctx);
  return findings;
}

function plant(root: string, rel: string, content: string): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

/** A minimal real-shaped registry: ONE active descriptor `x`, and a doc whose count + ACTIVE row agree —
 *  so the only thing under test is the row's DESCRIPTION. */
function plantRegistry(root: string, description: string, message = MESSAGE_LITERAL): void {
  plant(root, GATE_REL, `export const gate = { name: "x", status: "active", message: ${message} };\n`);
  plant(root, DOC_REL, `## Layer 3 — Structural gates\n\n(1 registered gates)\n\n| \`x\` | ${description} |\n\n### Layer 3 — DORMANT structural gates\n`);
}

const messages = (findings: readonly Finding[]): string => findings.map((f) => f.message ?? "").join("\n");

describe("enforcement-registry-parity — the MIRROR arms, both directions", () => {
  test("a DECLARED mirror that drifted from its descriptor's message is RED", ({ scratch }) => {
    plantRegistry(scratch, `the DRIFTED text ${MARKER}`);
    expect(messages(runGate(scratch))).toContain("declares itself a MIRROR");
  });

  test("the SAME row matching byte-for-byte is silent — the control's other direction", ({ scratch }) => {
    plantRegistry(scratch, `${MESSAGE} ${MARKER}`);
    expect(runGate(scratch)).toEqual([]);
  });

  test("an UNDECLARED byte-equal copy is RED — the vocabulary cannot be optional", ({ scratch }) => {
    // Without this arm a lane could copy a message and simply not say so, and the pair would drift
    // exactly as #909's did: invisible because nothing knew it was coupled.
    plantRegistry(scratch, MESSAGE);
    expect(messages(runGate(scratch))).toContain("does not declare it");
  });

  test("independent PROSE is never compared — the declared limit, written down", ({ scratch }) => {
    plantRegistry(scratch, "a short human summary of what x enforces");
    expect(runGate(scratch)).toEqual([]);
  });

  test("a declared mirror whose message the evaluator CANNOT read refuses loudly", ({ scratch }) => {
    plantRegistry(scratch, `whatever it says ${MARKER}`, 'buildMessage("x")');
    expect(messages(runGate(scratch))).toContain("UNKEEPABLE");
  });

  test("a mirror assembled from `+`-concatenated fragments still matches — the real message shape", ({ scratch }) => {
    // Every message in the live corpus is built this way; a StringLiteral-only reader would call this
    // unreadable and the marker would be unusable on any real gate.
    plantRegistry(scratch, `the exact runtime text ${MARKER}`, '"the exact " + "runtime text"');
    expect(runGate(scratch)).toEqual([]);
  });
});

describe("enforcement-registry-parity — the REAL tree", () => {
  test(
    "every row declaring itself a mirror matches its descriptor byte-for-byte",
    ({ repoRoot }) => {
      expect(runGate(repoRoot)).toEqual([]);
    },
    REAL_TREE_TIMEOUT_MS,
  );

  test("the marker vocabulary is OCCUPIED — an empty one would make the arms vacuous", ({ repoRoot }) => {
    // The denominator receipt: three rows carried a byte-exact copy at mint (2026-09-01). A doc with zero
    // markers would pass every arm above while proving nothing about the real table.
    const doc = readFileSync(join(repoRoot, DOC_REL), "utf8");
    expect(doc.split(MARKER).length - 1).toBeGreaterThanOrEqual(3);
  });
});
