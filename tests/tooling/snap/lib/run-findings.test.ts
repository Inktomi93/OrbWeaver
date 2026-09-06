// EVERY VOTING ARM OWES A ROW, AND EVERY ROW OWES ITS DISPOSITION (#1385 items 4 and 5).
//
// Two dogfood complaints, one layer. (5) a red `--contrast` run printed two `CONTRAST … FAIL` lines and
// exactly one composite finding: `run failed with no structured problem row … conflicts="producer-specific
// actionable evidence was absent"`. The evidence plainly existed — the fallback fired because no ANALYZER
// had written a problem artifact, which is true of most arms and says nothing about whether the run
// explained itself. (4) a `FINDING error | ResizeObserver loop …` printed beside `console-errors=0` and
// exit 0, with nothing on the row saying whether a reader should file it.
//
// Both are fixed at the drafting layer: a failing ARM VERDICT becomes its own row (with the arm's own
// detail and `next=` narrowing to `--arm <it>`), the fallback fires only when no arm is in a voting state,
// and every row states which run counter its evidence entered.
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { aggregateScope, artifactRef } from "@orb/tooling/_shared/artifact-scope";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { DiskSafeBrowserDiagnostic } from "../../../../tooling/src/snap/contract/browser-evidence-redaction.ts";
import type { SnapRunIndex } from "../../../../tooling/src/snap/contract/run-index.ts";
import { collectSnapFindings } from "../../../../tooling/src/snap/lib/run-findings.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SLOT_DIR = join(tmpdir(), "orb-findings-fixture");
const INDEX_PATH = `${SLOT_DIR}/run.json`;

function armVerdict(over: Partial<SnapRunIndex["verdict"]["arms"][number]>): SnapRunIndex["verdict"]["arms"][number] {
  return {
    arm: "contrast",
    source: "computed style + framebuffer contrast",
    lifetime: "settled page capture",
    state: "failed",
    artifacts: [],
    detail: null,
    ...over,
  };
}

function input(
  arms: readonly SnapRunIndex["verdict"]["arms"][number][],
  state: "failed" | "refused" | "passed" = "failed",
  diagnostics: readonly DiskSafeBrowserDiagnostic[] = [],
): Parameters<typeof collectSnapFindings>[0] {
  return {
    indexPath: INDEX_PATH,
    verdict: { exit: state === "passed" ? EXIT.clean : EXIT.violations, state, arms },
    artifacts: [],
    diagnosticsState: "complete",
    diagnostics,
  };
}

/** The redaction receipt every disk-safe record carries — a real empty one, so a diagnostic fixture is
 *  the contract's own shape rather than a double-cast past it (`no-test-fabrication`). */
const NO_LIMITS = {
  policy: { maxDepth: 8, maxFields: 256, maxStringBytes: 4096, maxBodyBytes: 0, maxEntries: 128, maxUrlBytes: 2048 },
  events: [],
} satisfies DiskSafeBrowserDiagnostic["_orbMeasuredLimit"];

/** A real analyzer artifact row — `readSnapAnalyzerProblems` gates on producer + schema, so both are the
 *  live spellings (`motion` / `snap-motion-v1`) rather than a shape cast past the reader. */
function motionArtifact(path: string): SnapRunIndex["artifacts"][number] {
  return {
    path,
    relativePath: artifactRef("motion/motion.json"),
    bytes: 1,
    producer: "motion",
    producerArm: "motion",
    schema: "snap-motion-v1",
    role: "primary",
    completeness: "complete",
    scope: aggregateScope(),
  };
}

function diagnostic(over: Partial<DiskSafeBrowserDiagnostic>): DiskSafeBrowserDiagnostic {
  return {
    origin: "page-console",
    source: "console-api",
    level: "error",
    category: null,
    text: "boom",
    timestamp: 0,
    location: null,
    stack: null,
    requestId: null,
    issueCode: null,
    details: null,
    backendNodeId: null,
    contextIndex: 0,
    pageIndex: 0,
    evidenceWindow: 0,
    raw: null,
    _orbMeasuredLimit: NO_LIMITS,
    ...over,
  };
}

test("a failing arm becomes its OWN row carrying the arm's detail — the fallback does not fire beside it", async () => {
  const detail = "2 contrast check(s) failed: CONTRAST [data-slot=x]: 1.69:1 FAIL (text · need 4.5) · CONTRAST [data-slot=y]: 2.10:1 FAIL";
  const findings = await collectSnapFindings(input([armVerdict({ detail })]));

  expect(findings).toHaveLength(1);
  expect(findings[0]?.what).toBe(detail);
  expect(findings[0]?.arms).toEqual(["contrast"]);
  // The row narrows to the arm that produced it, so `next=` is a command that replays exactly this.
  expect(findings[0]?.next).toContain("--arm contrast");
  // The fallback's own text is a CLAIM about the run, and it may only be made when it is true.
  expect(findings.some((row) => row.what.includes("no structured problem row"))).toBe(false);
  expect(findings[0]?.disposition).toEqual({ counted: true, reason: "contrast-arm" });
});

test("an arm that failed without a detail still gets a row that names the arm and its state", async () => {
  const findings = await collectSnapFindings(input([armVerdict({ arm: "assert", state: "refused", detail: null })]));

  expect(findings).toHaveLength(1);
  expect(findings[0]?.what).toContain("assert");
  expect(findings[0]?.what).toContain("refused");
});

test("a WITHHELD arm's row cannot claim completeness — an absent measurement is not a complete one", async () => {
  const findings = await collectSnapFindings(input([armVerdict({ arm: "motion", state: "withheld", detail: "nothing composited" })]));

  expect(findings[0]?.completeness).toBe("incomplete");
});

test("a LOAD-SUSPECT arm annotates even a PASSING run, and the annotation can never be counted (#1616)", async () => {
  // The ruling's reader half. The arm MEASURED (there is a number), so nothing withheld and nothing
  // refused — but the number was taken on a loaded box and must not be read as a verdict. If the row only
  // appeared on non-passing runs, the common case (a green run whose rate is load-suspect) would publish
  // the number with nothing beside it saying so.
  const findings = await collectSnapFindings(
    input([armVerdict({ arm: "motion", state: "load-suspect", detail: "dropped 47.54% at loadavg 26.1/24" })], "passed"),
  );

  const annotation = findings.find((row) => row.arms.includes("motion"));
  expect(annotation?.severity).toBe("annotation");
  expect(annotation?.what).toBe("dropped 47.54% at loadavg 26.1/24");
  expect(annotation?.disposition).toEqual({ counted: false, reason: "load-suspect" });
  // The arm's threshold went unjudged, so the row may not claim a complete reading.
  expect(annotation?.completeness).toBe("incomplete");
  // (`correlation` is the drafting-layer dedup key and is stripped before emission — the emitted row
  // names the arm through `where`.)
  expect(annotation?.where).toBe("arm motion");
  // NEGATIVE CONTROL: it is not a voting row, so the passing run stays free of error rows.
  expect(findings.some((row) => row.severity === "error")).toBe(false);
});

test("a failing arm gets its row even BESIDE another error row — the arm rows are not a fallback (#1566)", async () => {
  // The defect: #1385 emitted these inside the "no error draft at all" branch, so a contrast failure
  // alongside an unrelated page error got no row of its own. The page error is a DIFFERENT fact, and the
  // arm that actually voted went unexplained on the end card.
  const findings = await collectSnapFindings(
    input([armVerdict({ detail: "2 contrast check(s) failed: CONTRAST [x]: 1.69:1 FAIL" })], "failed", [
      diagnostic({ origin: "page-error", source: "pageerror", text: "TypeError: boom" }),
    ]),
  );

  expect(findings.some((row) => row.what.includes("TypeError: boom"))).toBe(true);
  expect(findings.some((row) => row.arms.includes("contrast"))).toBe(true);
});

test("a console line that merely MENTIONS an arm does not cost that arm its own problem row", async () => {
  // THE REGRESSION THIS FILE MISSED ONCE (#1566 review). The first dedup counted EVERY draft's arms as
  // "described", including the console-attributed ANNOTATION rows — so this exact fixture (a failing
  // `motion` arm beside the app's own `[drop]` console line, which is attributed to `motion`) lost the
  // arm's error row and fell through to the fallback, whose text claims the producer evidence was absent
  // while sitting beside it. The old assertion — `filter(arms.includes("motion")).length === 1` — was
  // satisfied by the ANNOTATION alone, so it could not see the error row disappear. These assert the row
  // by its SEVERITY and its CONTENT, which is what actually changed.
  const findings = await collectSnapFindings(
    input([armVerdict({ arm: "motion", detail: "dropped frames over budget" })], "failed", [
      diagnostic({ text: "%c10:54:43.115 [drop]%c 70ms rendered frame mid-animation (budget 50ms)" }),
    ]),
  );

  const problem = findings.find((row) => row.severity === "error");
  expect(problem?.arms).toEqual(["motion"]);
  expect(problem?.what).toBe("dropped frames over budget");
  // The fallback's claim is FALSE here, so it must not be made.
  expect(findings.some((row) => row.what.includes("no structured problem row"))).toBe(false);
  // …and the annotation still rides beside it — the arm row REPLACES nothing.
  expect(findings.some((row) => row.severity === "annotation" && row.arms.includes("motion"))).toBe(true);
});

test("an arm a PRODUCER already described gets no second row — de-duplicated by PROVENANCE, not by mention", async () => {
  // The other half: a real analyzer artifact (motion's own problem rows) has said everything the per-arm
  // row would, so a second one would be noise wearing the same arm's name. The discriminator is WHO WROTE
  // IT — a producer's structured evidence dedups; a console observation does not (the arm above).
  const artifact = join(SLOT_DIR, "motion", "motion.json");
  await mkdir(dirname(artifact), { recursive: true });
  await writeFile(
    artifact,
    JSON.stringify({
      problems: [
        { arm: "motion", kind: "threshold", metric: "dropped-frames", subject: "[data-slot=list]", observed: "30%", threshold: "5%", detail: "over budget" },
      ],
    }),
  );

  const findings = await collectSnapFindings({
    ...input([armVerdict({ arm: "motion", detail: "dropped frames over budget" })]),
    artifacts: [motionArtifact(artifact)],
  });

  // ONE motion problem row, and it is the PRODUCER's (its metric, not the arm verdict's detail).
  const problems = findings.filter((row) => row.severity === "error" && row.arms.includes("motion"));
  expect(problems).toHaveLength(1);
  expect(problems[0]?.what).toContain("dropped-frames");
  expect(findings.some((row) => row.what === "dropped frames over budget")).toBe(false);
});

// #1780: the exemption row is a note about a measurement that did NOT fail. Two things it must never do:
// redden a clean run, and spend the agent-readable body budget on its 580-byte condition list.
test("an EXEMPTION problem row reads as a non-counting annotation naming the carve-out, not as an error", async () => {
  const artifact = join(SLOT_DIR, "motion", "motion.json");
  await mkdir(dirname(artifact), { recursive: true });
  await writeFile(
    artifact,
    JSON.stringify({
      problems: [
        {
          arm: "motion",
          kind: "exemption",
          metric: "loaf-style-layout-count",
          subject: "measurement-window",
          observed: "0 budgeted, 1 excused",
          threshold: "bounded-input-dispatch-layout-frame",
          detail:
            "one style/layout Long Animation Frame was excused under the bounded-input-dispatch-layout-frame exemption (#1647), which requires all four of: …",
        },
      ],
    }),
  );

  const findings = await collectSnapFindings({ ...input([armVerdict({ arm: "motion", state: "passed" })], "passed"), artifacts: [motionArtifact(artifact)] });
  const row = findings.find((finding) => finding.what.includes("loaf-style-layout-count"));

  expect(row?.severity).toBe("annotation");
  expect(row?.what).toBe("loaf-style-layout-count: 0 budgeted, 1 excused (bounded-input-dispatch-layout-frame)");
  // The carve-out is NAMED on the printed row; the conditions stay in the artifact behind `next=`.
  expect(row?.what).not.toContain("requires all four of");
  expect(findings.some((finding) => finding.severity === "error")).toBe(false);
});

test("THE FALLBACK STILL EXISTS: a non-passing run with no voting arm at all keeps the unattributed row", async () => {
  // The negative control for the two arms above. Without it, "the fallback did not fire" would be
  // satisfied by a fallback that can no longer fire at all — which would hide an exit nobody described.
  const findings = await collectSnapFindings(input([armVerdict({ state: "passed" })]));

  expect(findings).toHaveLength(1);
  expect(findings[0]?.what).toContain("no structured problem row");
  expect(findings[0]?.disposition).toEqual({ counted: false, reason: "unattributed-exit" });
});

test("a PASSING run produces no rows at all — neither the arm rows nor the fallback", async () => {
  expect(await collectSnapFindings(input([armVerdict({ state: "passed" })], "passed"))).toHaveLength(0);
});
