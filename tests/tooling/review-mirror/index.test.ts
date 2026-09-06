import { Project } from "ts-morph";
import type { ReviewMirrorEvidence } from "../../../tooling/src/review-mirror/index.ts";
import { assertReviewEvidence, censusPendingGuards, reviewEvidenceGaps, stripComments } from "../../../tooling/src/review-mirror/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const ROOT = "/review-fixture";

function evidence(): ReviewMirrorEvidence {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-25T00:00:00.000Z",
    sourceCommit: "a".repeat(40),
    mirror: {
      target: "/tmp/mirror",
      tracked: 10,
      mirroredFiles: 8,
      mirroredCode: 6,
      mirroredBytes: 100,
      stripped: 5,
      copied: 3,
      dropped: 2,
      errors: [],
      missingCode: [],
    },
    reviewFocus: [
      { id: "e5", family: "E5", title: "x", path: "x.ts", symbol: "x", why: "x", line: 1 },
      { id: "e6", family: "E6", title: "y", path: "y.ts", symbol: "y", why: "y", line: 1 },
    ],
    pendingGuard: {
      scannedTsx: 1,
      directControls: 1,
      reviewResiduals: 1,
      rows: [
        {
          path: "packages/client/src/x.tsx",
          line: 1,
          component: "X",
          control: "Button",
          handler: "<inline:1>",
          mutations: ["mutate"],
          disabled: null,
          classification: "missing",
        },
      ],
      totals: { "direct-pending": 0, "derived-pending": 0, epoch: 0, missing: 1, "other-guard": 0 },
    },
  };
}

test("TS stripping PRESERVES a suppression/directive marker instead of erasing gate-ownership evidence (#1496)", () => {
  const source =
    "// @orb-gate-ignore caught-failure-ownership(default:catch): optional read\n" +
    "const x = 1; // biome-ignore lint/x: reason\n" +
    "// @ts-expect-error narrow union\n" +
    "const y = 2; // plain narration, drop this\n";
  const stripped = stripComments("sample.ts", source);
  expect(stripped).toContain("@orb-gate-ignore caught-failure-ownership");
  expect(stripped).toContain("biome-ignore lint/x: reason");
  expect(stripped).toContain("@ts-expect-error narrow union");
  expect(stripped).not.toContain("plain narration");
});

test("TS stripping removes comments without corrupting regex, template or line positions", () => {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: this literal is the parser fixture's template source.
  const source = "const pattern = /https?:\\/\\//u; // prose\nconst value = `// ${pattern.source}`;\n/* block\ncomment */\nexport { value };\n";
  const stripped = stripComments("sample.ts", source);
  expect(stripped).toContain("/https?:\\/\\//u");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: expected source bytes, not a test interpolation.
  expect(stripped).toContain("`// ${pattern.source}`");
  expect(stripped).not.toContain("prose");
  expect(stripped).not.toContain("comment");
  expect(stripped.split("\n")).toHaveLength(source.split("\n").length);
});

// @instrument-proof: corrupt mirror and pending-guard populations are planted and the evidence door must reject the review verdict.
// @instrument-absence-proof: tracked, mirrored-code, and E7 census populations are emptied and must never read as a clean review sweep.
test("missing or empty generation evidence is an instrument error, never a clean zero", () => {
  const valid = evidence();
  expect(reviewEvidenceGaps(valid)).toEqual([]);
  expect(reviewEvidenceGaps({ ...valid, pendingGuard: { ...valid.pendingGuard, reviewResiduals: 0 } })).toContain(
    "E7 review-residual count does not equal missing plus unclassified and generation-guard controls",
  );
  const empty: ReviewMirrorEvidence = {
    ...valid,
    mirror: { ...valid.mirror, tracked: 0, mirroredFiles: 0, mirroredCode: 0, mirroredBytes: 0, missingCode: ["x.ts"] },
    pendingGuard: { ...valid.pendingGuard, scannedTsx: 0, directControls: 0, reviewResiduals: 0, rows: [] },
  };
  expect(reviewEvidenceGaps(empty)).toEqual(
    expect.arrayContaining([
      "git tracked-file census is empty",
      "mirror generation produced empty file/code/byte evidence",
      "mirror is missing 1 tracked code file(s)",
      "E7 Button/Switch pending-guard census is empty",
    ]),
  );
  expect(() => assertReviewEvidence(empty)).toThrow("review-mirror evidence is not a verdict");
});

test("the E7 census distinguishes direct, derived, epoch and genuinely missing guards", () => {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.createSourceFile(
    `${ROOT}/packages/client/src/example.tsx`,
    `export function Example() {
      const save = () => mutation.mutate();
      const busy = mutation.isPending || other;
      const epochSave = () => { if (requestEpoch !== currentEpoch) return; mutation.mutate(); };
      const requestIdSave = () => { const requestId = "request_fixture"; mutation.mutate({ requestId }); };
      const visibleSave = () => mutation.mutate();
      const nestedOnly = () => { queueMicrotask(() => mutation.mutate()); };
      return <>
        <Button onClick={() => mutation.mutate()} />
        <Button onClick={save} disabled={busy} />
        <Switch onCheckedChange={() => mutation.mutateAsync()} disabled={mutation.isPending} />
        <Button onClick={epochSave} />
        <Button onClick={requestIdSave} />
        <Button onClick={visibleSave} disabled={isPendingLabelVisible} />
        <Button onClick={save} disabled={canSave} />
        <Button onClick={nestedOnly} />
      </>;
    }
    `,
  );
  const census = censusPendingGuards(project, ROOT);
  expect(census.scannedTsx).toBe(1);
  expect(census.directControls).toBe(7);
  expect(census.reviewResiduals).toBe(5);
  expect(census.totals).toEqual({ "direct-pending": 1, "derived-pending": 1, epoch: 1, missing: 2, "other-guard": 2 });
  expect(census.rows.map((row) => row.line)).toEqual([9, 10, 11, 12, 13, 14, 15]);
});
