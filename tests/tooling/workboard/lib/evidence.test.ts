// The pure evidence-overflow transform (#923 P2). The load-bearing property is DETERMINISM: verify
// writes the transformed field, done recomputes it from the same --evidence and compares — a transform
// that disagreed with itself would strand every over-column row one step before Done.
import { capEvidenceHard, evidenceText } from "../../../../tooling/src/workboard/lib/evidence.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const COLUMN_CAP = 1024;

test("at or under the column cap the transform is the identity, with nothing to post", () => {
  const short = "pnpm test:scoped tests/x.test.ts green 12/12";
  expect(evidenceText(short)).toEqual({ field: short, overflow: null });
  const exact = "x".repeat(COLUMN_CAP);
  expect(evidenceText(exact)).toEqual({ field: exact, overflow: null });
});

test("over the cap: the field carries head + pointer within the cap, the overflow carries the WHOLE text, deterministically", () => {
  const long = `receipt-${"y".repeat(2000)}`;
  const first = evidenceText(long);
  expect(first.field.length).toBeLessThanOrEqual(COLUMN_CAP);
  expect(first.field).toContain("full receipt in issue comment");
  expect(first.field.startsWith("receipt-")).toBe(true);
  expect(first.overflow).toContain(long);
  // Determinism IS the same-receipt rule: done's recomputation must equal what verify wrote.
  expect(evidenceText(long)).toEqual(first);
  // The pointer hash pairs the field with its comment.
  const digest = /comment ([0-9a-f]{8})\]/u.exec(first.field)?.[1];
  expect(first.overflow).toContain(`(${digest})`);
});

test("the hard cap refuses as misuse before any write", () => {
  expect(capEvidenceHard("fine")).toBe("fine");
  expect(() => capEvidenceHard("z".repeat(60_001))).toThrow("hard cap is 60000");
});
