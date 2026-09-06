// #1245 — THE LYING INSTRUMENT: biome reporting a clean verdict over ZERO processed files. A JSONC comment
// placed directly before an element of `biome.json`'s `overrides` array breaks the config parse WHOLE;
// biome then ignores every path, prints no diagnostic at ANY `--diagnostic-level`, and — under the
// `--no-errors-on-unmatched` the registry's scoped argv carries — exits 0 saying `Checked 0 files`. Every
// lane reading that stage green has measured nothing.
//
// The transcripts below are REAL captures from biome 2.5.1 on this repo (2026-09-06), taken with the defect
// planted in a copy of biome.json and then restored — that is the red-first receipt this pin freezes. The
// live arm re-runs the control probe against the CURRENT config, so the sentinel going ignored (which would
// make every zero refuse forever) is caught here rather than in a lane's floor.
import type { StageDef } from "../../../../tooling/src/verify/index.ts";
import {
  auditBiomeTranscript,
  auditedExit,
  auditLine,
  auditOf,
  controlProbeCount,
  parseCheckedFileCount,
  REGISTRY,
} from "../../../../tooling/src/verify/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** The captured biome transcripts (see the header): the defect prints the SAME summary line as a healthy
 *  run over an ignored-only selection — which is exactly why the count alone cannot discriminate. */
const TRANSCRIPT_ZERO = "Checked 0 files in 3s. No fixes applied.\n";
const TRANSCRIPT_ONE = "Checked 1 file in 3s. No fixes applied.\n";
const TRANSCRIPT_MANY = "Checked 412 files in 7s. No fixes applied.\n";

const CONTROL_BROKEN = (): number => 0;
const CONTROL_HEALTHY = (): number => 1;
const CONTROL_UNAVAILABLE = (): null => null;

function biomeStage(): StageDef {
  const row = REGISTRY.find((stage) => stage.name === "lint:biome");
  if (row === undefined) {
    throw new Error("no lint:biome row in the registry");
  }
  return row;
}

test("parseCheckedFileCount reads biome's own summary line, singular and plural", () => {
  expect(parseCheckedFileCount(TRANSCRIPT_ZERO)).toBe(0);
  expect(parseCheckedFileCount(TRANSCRIPT_ONE)).toBe(1);
  expect(parseCheckedFileCount(TRANSCRIPT_MANY)).toBe(412);
});

test("output with NO count line REFUSES — an unknown processed count is never a verdict", () => {
  const audit = auditBiomeTranscript("some future reporter output\n", CONTROL_HEALTHY);
  expect(audit?.kind).toBe("refusal");
  expect(audit?.message).toMatch(/Checked N files/u);
});

test("the LIE arm: 0 files checked and the control ALSO 0 ⇒ REFUSAL naming the biome.json cause", () => {
  const audit = auditBiomeTranscript(TRANSCRIPT_ZERO, CONTROL_BROKEN);
  expect(audit?.kind).toBe("refusal");
  expect(audit?.message).toMatch(/biome\.json IS NOT BEING APPLIED/u);
  expect(audit?.message).toMatch(/overrides/u);
});

test("the HONEST-EMPTY arm: 0 files checked but the control measured ⇒ a NOTICE, never a refusal", () => {
  const audit = auditBiomeTranscript(TRANSCRIPT_ZERO, CONTROL_HEALTHY);
  expect(audit?.kind).toBe("notice");
  expect(audit?.message).toMatch(/every selected path is ignored by biome\.json/u);
});

test("an UNRUNNABLE control refuses too — an undiscriminated zero is not a verdict either", () => {
  const audit = auditBiomeTranscript(TRANSCRIPT_ZERO, CONTROL_UNAVAILABLE);
  expect(audit?.kind).toBe("refusal");
  expect(audit?.message).toMatch(/control probe/u);
});

test("a real measurement audits to nothing — and never pays for the control probe", () => {
  let controlRuns = 0;
  const counting = (): number => {
    controlRuns += 1;
    return 1;
  };
  expect(auditBiomeTranscript(TRANSCRIPT_MANY, counting)).toBeNull();
  expect(controlRuns).toBe(0);
});

test("the lint:biome REGISTRY row carries the audit — the wiring is the half that can silently vanish", () => {
  expect(biomeStage().auditTranscript).toBeTypeOf("function");
});

test("a refusal makes the stage a TOOL ERROR whatever the child's exit said; a notice moves nothing", () => {
  expect(auditedExit(0, { kind: "refusal", message: "x" })).toBe(2);
  expect(auditedExit(1, { kind: "refusal", message: "x" })).toBe(2);
  expect(auditedExit(0, { kind: "notice", message: "x" })).toBe(0);
  expect(auditedExit(1, { kind: "notice", message: "x" })).toBe(1);
  expect(auditedExit(0, null)).toBe(0);
});

test("the audit line lands in the stage transcript, so the log and the failure excerpt carry the reason", () => {
  expect(auditLine(null)).toBe("");
  expect(auditLine({ kind: "refusal", message: "measured nothing" })).toContain("[verify-audit refusal] measured nothing");
});

test("a stage already classified a TOOL ERROR is not re-diagnosed by an audit", ({ repoRoot }) => {
  const stage: StageDef = { ...biomeStage(), auditTranscript: () => ({ kind: "refusal", message: "should not be asked" }) };
  expect(auditOf(stage, 2, TRANSCRIPT_ZERO, repoRoot)).toBeNull();
  expect(auditOf(stage, 3, TRANSCRIPT_ZERO, repoRoot)).toBeNull();
  expect(auditOf(stage, 0, TRANSCRIPT_ZERO, repoRoot)?.kind).toBe("refusal");
  expect(auditOf(stage, 1, TRANSCRIPT_ZERO, repoRoot)?.kind).toBe("refusal");
});

test("a stage with NO audit is untouched — the seam is per-tool, not a policy applied to everything", ({ repoRoot }) => {
  const eslint = REGISTRY.find((stage) => stage.name === "lint:eslint");
  expect(eslint?.auditTranscript).toBeUndefined();
  expect(eslint === undefined ? null : auditOf(eslint, 0, TRANSCRIPT_ZERO, repoRoot)).toBeNull();
});

// ── the LIVE control (spawns biome): the discrimination is only as good as its sentinel ──
// Its own wall clock, scaled: biome's scanner takes 3-6s on a quiet box and vitest's default ceiling is
// smaller than that under contention — a timeout here would be a claim about the box, not about the config.
test(
  "the control probe measures ≥1 file under THIS repo's real biome.json",
  ({ repoRoot }) => {
    expect(controlProbeCount(repoRoot)).toBeGreaterThan(0);
  },
  scaledBudget(60_000),
);
