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
  expect(Buffer.byteLength(first.field, "utf8")).toBeLessThanOrEqual(COLUMN_CAP);
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

// #1920: GitHub accepted 512 é / 256 emoji (1024 UTF-8 bytes), refused one more
// of either, and refused the original 1026-byte ASCII split on scratch issue #2336.
test("the column limit counts UTF-8 bytes, preserving complete characters and the full receipt", () => {
  for (const character of ["x", "é", "界", "🙂"]) {
    const width = Buffer.byteLength(character, "utf8");
    const fits = character.repeat(Math.floor(COLUMN_CAP / width));
    expect(evidenceText(fits)).toEqual({ field: fits, overflow: null });
    const long = fits + character;
    const result = evidenceText(long);
    expect(Buffer.byteLength(result.field, "utf8")).toBeLessThanOrEqual(COLUMN_CAP);
    expect(result.field).toContain("full receipt in issue comment");
    expect(result.field.isWellFormed()).toBe(true);
    expect(result.overflow).toContain(long);
    const prefix = result.field.slice(0, result.field.indexOf(" … ["));
    expect(long.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeGreaterThan(0);
    expect(Buffer.byteLength(result.field + character, "utf8")).toBeGreaterThan(COLUMN_CAP);
    expect(evidenceText(long)).toEqual(result);
  }
});
