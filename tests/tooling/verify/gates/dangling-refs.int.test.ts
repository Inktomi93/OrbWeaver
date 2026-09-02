// The PERMANENT PIN for `dangling-refs`'s ABSENT-BY-DESIGN arm (issue #775). The defect it fixes is a LYING
// INSTRUMENT, not a bad doc: `scripts/probes/st-goldens/sillytavern-runtime` is a GITIGNORED captured
// SillyTavern install, so it exists on a full working checkout and never on a fresh worktree — and arm 3
// resolved it with `existsSync`. The identical commit was therefore GREEN on main and RED in every worktree,
// for the same doc line. A verdict that depends on WHERE it ran is wrong in one of the two places, and the
// fresh-worktree red is the one lanes actually pay for.
//
// The PASS half is un-provable in conformance: the exemption arms are guarded on the real-tree anchor, and
// planting that anchor in a mini-project turns on every OTHER stale arm at once. So the honoured case lives
// here, against the real tree, with planted controls in BOTH directions.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { gate as danglingRefs } from "../../../../tooling/src/verify/gates/dangling-refs.ts";
import type { Finding } from "../../../../tooling/src/verify/index.ts";
import { projectCtx, runPass } from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const GATE = "dangling-refs";
const ABSENT_PATH = "scripts/probes/st-goldens/sillytavern-runtime";
const CITE = "scripts/probes/st-goldens/README.md";

/** The gate's own justification, re-derived independently: the path must be named by a LITERAL `.gitignore`
 *  rule. Spelled out here rather than imported — a pin that calls the subject's own reader proves only that
 *  the reader agrees with itself. */
function gitignoreNames(repoRoot: string, path: string): boolean {
  return readFileSync(join(repoRoot, ".gitignore"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .some((line) => line === path || line === `${path}/` || line === `/${path}` || line === `/${path}/`);
}

describe("dangling-refs — gitignored paths are absent by design, not phantoms", () => {
  test("the exemption's justification holds on the real tree, and the control does not", ({ repoRoot }) => {
    expect(gitignoreNames(repoRoot, ABSENT_PATH), `${ABSENT_PATH} must be gitignored — that IS the exemption`).toBe(true);
    // PLANTED NEGATIVE CONTROL: a reader that answers "yes" to anything would make the arm unfailable.
    expect(gitignoreNames(repoRoot, "scripts/probes/st-goldens/__not-ignored-control"), "the reader must be able to say no").toBe(false);
    expect(existsSync(join(repoRoot, CITE)), "the cite that justifies the row must resolve").toBe(true);
  });

  test("the real-tree run reports no phantom for the gitignored path, in a checkout that lacks it", ({ repoRoot }) => {
    // This gate is SELF-CONTAINED (it reads docs off disk and needs no sibling's verdict), so it runs alone
    // — a whole-corpus pass here would cost minutes to prove one gate's arm.
    const result = runPass([danglingRefs], projectCtx(repoRoot));
    expect(result.toolErrors).toEqual([]);
    const findings: readonly Finding[] = result.gates.find((g) => g.name === GATE)?.findings ?? [];
    // The point of the arm: this must hold whether or not the gitignored subtree is present on THIS checkout.
    expect(findings.filter((f) => (f.message ?? "").includes(ABSENT_PATH))).toEqual([]);
    // And the row must not have gone silent by accident — the whole gate is still clean, so a NEW phantom
    // anywhere in the core docs still reds. (A green here that came from a broken scan is caught by the
    // gate's own zero-scan alarm at report scope.)
    expect(findings).toEqual([]);
  }, 600_000);

  // The OTHER direction (#26 regression): #775's original fix moved the env-dependence rather than removing
  // it — with the gitignored subtree PRESENT on a full checkout the path resolves, so it was never a phantom,
  // so the shared phantom-hitRefs stale arm falsely red its GITIGNORED_ABSENT row ("matches no live phantom").
  // The verdict must be identical whether or not the subtree is checked out here, so we plant it and re-run.
  test("the real-tree run stays clean when the gitignored subtree IS present on THIS checkout", ({ repoRoot }) => {
    const abs = join(repoRoot, ABSENT_PATH);
    const planted = !existsSync(abs); // a full checkout already has it — only plant (and clean up) if absent
    if (planted) {
      mkdirSync(abs, { recursive: true });
    }
    try {
      expect(existsSync(abs), "the gitignored subtree must be present for this direction of the arm").toBe(true);
      const result = runPass([danglingRefs], projectCtx(repoRoot));
      expect(result.toolErrors).toEqual([]);
      const findings: readonly Finding[] = result.gates.find((g) => g.name === GATE)?.findings ?? [];
      // No stale-row red for the now-RESOLVING gitignored path, and the whole gate is still clean.
      expect(findings.filter((f) => (f.message ?? "").includes(ABSENT_PATH))).toEqual([]);
      expect(findings).toEqual([]);
    } finally {
      if (planted) {
        rmSync(abs, { recursive: true, force: true });
      }
    }
  }, 600_000);
});

// THE DERIVED-CORPUS PIN (#1036). The defect was again a LYING INSTRUMENT, not a bad doc: arms 2-4 read a
// HAND-NAMED pair of directories, so `GATE-AUTHORING.md` — the law every gate author is routed to — sat
// outside the citation net entirely and its cite of the population controls rotted with nothing watching.
// Conformance cannot prove this half: its examples live in a SYNTHETIC tree, so a green mini-project says
// nothing about whether the corpus derivation reaches the REAL law files or stops at the REAL frozen ones.
// Both directions are planted here, against the real tree.
const CORPUS_GHOST = "domain/__p1036_ghost_domain__/x.ts";
const LAW_OUTSIDE_DOC = "tooling/src/verify/gates/GATE-AUTHORING.md";
const FROZEN_DOC = "docs/architecture/history/Pain-Ledger.md";

/** Append a line to a REAL tracked doc, run the gate, and put the file back byte-for-byte. */
function withAppendedLine<T>(repoRoot: string, rel: string, line: string, body: () => T): T {
  const abs = join(repoRoot, rel);
  const original = readFileSync(abs, "utf8");
  try {
    writeFileSync(abs, `${original}\n${line}\n`);
    return body();
  } finally {
    writeFileSync(abs, original);
  }
}

function danglingFindings(repoRoot: string): readonly Finding[] {
  const result = runPass([danglingRefs], projectCtx(repoRoot));
  expect(result.toolErrors).toEqual([]);
  return result.gates.find((g) => g.name === GATE)?.findings ?? [];
}

describe("dangling-refs — the derived corpus reaches living law outside docs/ and stops at frozen evidence", () => {
  test("a phantom path planted in GATE-AUTHORING.md is FOUND", ({ repoRoot }) => {
    const findings = withAppendedLine(repoRoot, LAW_OUTSIDE_DOC, `The shape lives at \`${CORPUS_GHOST}\`.`, () => danglingFindings(repoRoot));
    const hit = findings.filter((f) => f.file === LAW_OUTSIDE_DOC && (f.message ?? "").includes(CORPUS_GHOST));
    expect(hit.length, "the law every gate author reads must be inside the citation net").toBe(1);
  }, 600_000);

  test("the same phantom planted in a FROZEN history doc is not flagged", ({ repoRoot }) => {
    const findings = withAppendedLine(repoRoot, FROZEN_DOC, `It used to live at \`${CORPUS_GHOST}\`.`, () => danglingFindings(repoRoot));
    // Documentation-Law.md §"Relocation & retirement" step 5: frozen evidence keeps the path that was true
    // then and is NOT repointed, so resolving its cites would red a doc for obeying the law.
    expect(findings, "frozen evidence is out of the corpus by CLASS — a widening must not swallow it").toEqual([]);
  }, 600_000);

  test("every declared corpus class is populated on the real tree", ({ repoRoot }) => {
    const result = runPass([danglingRefs], projectCtx(repoRoot));
    const scan = result.gates.find((g) => g.name === GATE)?.scan;
    // The population receipt is what makes a class SILENTLY emptying loud (#946). A zero here would mean the
    // catalog census or the hand-named law set stopped resolving — the blind-gate placebo, in numbers.
    for (const source of ["citation-corpus:law", "citation-corpus:design", "citation-corpus:law-outside-docs"]) {
      const population = scan?.populations.find((p) => p.source === source);
      expect(population?.members ?? 0, `${source} must resolve members on the real tree`).toBeGreaterThan(0);
      expect(population?.unresolved ?? 0, `${source} must resolve every declaration it saw`).toBe(0);
    }
  }, 600_000);
});
