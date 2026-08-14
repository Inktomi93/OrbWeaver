import type { ReceiptEntry } from "../../scripts/docs/catalog.ts";
import { catalogReceipt, debtPathErrors, parseFrontmatter, validateReceiptEntry } from "../../scripts/docs/catalog.ts";
import { expect, test } from "../support/fixtures.ts";

const HASH = "a".repeat(64);
const COMMIT = "b".repeat(40);

function reviewed(overrides: Partial<ReceiptEntry> = {}): ReceiptEntry {
  return {
    path: "docs/example.md",
    assignedSha256: HASH,
    disposition: "current",
    authority: "current-reference",
    fullRead: true,
    verifiedSha256: HASH,
    verifiedCommit: COMMIT,
    verifiedAt: "2026-08-14",
    evidence: ["packages/example.ts:1"],
    summary: "Current behavior matches the document.",
    ...overrides,
  };
}

test("frontmatter parser keeps the deliberately flat schema machine-readable", () => {
  expect(parseFrontmatter("---\nkind: law\nstatus: active\nupdated: 2026-08-14\n---\n# Law\n")).toEqual({
    present: true,
    malformed: false,
    fields: { kind: "law", status: "active", updated: "2026-08-14" },
    errors: [],
  });
});

test("frontmatter parser rejects an unterminated or nested header instead of guessing", () => {
  expect(parseFrontmatter("---\nkind: law\n# Law\n").malformed).toBe(true);
  expect(parseFrontmatter("---\nmetadata:\n  owner: alex\n---\n").malformed).toBe(true);
});

test("a reviewed receipt requires full-read, content hash, commit, date, evidence, authority, and summary", () => {
  expect(validateReceiptEntry(reviewed())).toEqual([]);
  expect(
    validateReceiptEntry(
      reviewed({ authority: "unclassified", fullRead: false, verifiedSha256: null, verifiedCommit: null, verifiedAt: null, evidence: [], summary: "" }),
    ),
  ).toHaveLength(7);
});

test("a pending receipt cannot impersonate completed review evidence", () => {
  expect(
    validateReceiptEntry(
      reviewed({
        disposition: "pending",
        authority: "unclassified",
        fullRead: false,
        verifiedSha256: null,
        verifiedCommit: null,
        verifiedAt: null,
        evidence: [],
        summary: "",
      }),
    ),
  ).toEqual([]);
  expect(validateReceiptEntry(reviewed({ disposition: "pending" }))).toContain("docs/example.md: pending receipt must not claim review evidence");
});

test("the debt ratchet rejects substitution even when the total count stays flat", () => {
  const oldDebt = { pending: ["docs/old.md"], missingFrontmatter: [], invalidFrontmatter: [], malformedFrontmatter: [] };
  const substituted = { pending: ["docs/new.md"], missingFrontmatter: [], invalidFrontmatter: [], malformedFrontmatter: [] };
  expect(debtPathErrors(oldDebt, oldDebt)).toEqual([]);
  expect(debtPathErrors(substituted, oldDebt)).toEqual(["pending: new debt path docs/new.md is not in the ratchet allowance"]);
});

test("a newly tracked document reports a missing receipt instead of crashing catalog rendering", () => {
  expect(catalogReceipt(undefined, HASH)).toEqual({ receipt: null, receiptCurrent: false });
});
