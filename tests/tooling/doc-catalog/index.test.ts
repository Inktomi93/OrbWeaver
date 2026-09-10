// The receipt/frontmatter/ratchet RULES — the pure half of the documentation control plane, driven
// through the tool's front door with hand-built facts (no git, no tree). Relocated from
// tests/tooling/docs-catalog.test.ts at the #393 P5 move (Core-Tooling-Law.md §4.7 mirror).
import type { ReceiptClaim, ReceiptEntry, ReceiptFacts } from "../../../tooling/src/doc-catalog/index.ts";
import { catalogReceipt, debtPathErrors, parseFrontmatter, validateReceiptEntry } from "../../../tooling/src/doc-catalog/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const HASH_LENGTH = 64;
const COMMIT_LENGTH = 40;
const FIRST_LINE = 1;
const REVIEWED_RECEIPT_REQUIREMENTS = 7;
const HASH = "a".repeat(HASH_LENGTH);
const COMMIT = "b".repeat(COMMIT_LENGTH);
const ANCESTOR = "c".repeat(COMMIT_LENGTH);
const CLAIMS = [{ claim: "Current behavior", evidence: [{ kind: "code", target: "packages/example.ts:1" }] }];
const LAW_PATH = "docs/architecture/core/Core-Laws-and-Precedents.md";

function facts(overrides: Partial<ReceiptFacts> = {}): ReceiptFacts {
  return {
    currentSha256: HASH,
    verifiedBlobSha256: HASH,
    currentReceiptSnapshotExists: false,
    candidateTouchesReceiptPair: false,
    verifiedCommitExists: true,
    verifiedCommitIsAncestor: true,
    localEvidence: new Map([
      ["packages/example.ts", FIRST_LINE],
      ["tooling/src/doc-catalog/ops/tree.ts", FIRST_LINE],
      ["tests/example.test.ts", FIRST_LINE],
      ["tooling/src/verify/example.ts", FIRST_LINE],
    ]),
    lawSections: new Map([[LAW_PATH, new Map([["7", FIRST_LINE]])]]),
    provenanceCommits: new Set([ANCESTOR]),
    rulingAnchors: new Map([
      ["86", FIRST_LINE],
      ["139", FIRST_LINE],
    ]),
    ...overrides,
  };
}

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
    claims: CLAIMS,
    summary: "Current behavior matches the document.",
    ...overrides,
  };
}

function reviewedWithoutClaims(overrides: Partial<ReceiptEntry> = {}): ReceiptEntry {
  const { claims: _claims, ...entry } = reviewed(overrides);
  return entry;
}

function claimEvidence(kind: string, target: string): readonly ReceiptClaim[] {
  return [{ claim: "Stable authority", evidence: [{ kind, target }] }];
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
  ).toHaveLength(REVIEWED_RECEIPT_REQUIREMENTS);
});

test("a current receipt rejects self-attestation and an unbound verification commit", () => {
  expect(
    validateReceiptEntry(
      reviewed({ claims: [{ claim: "Self", evidence: [{ kind: "ruling", target: "docs/example.md:1" }] }] }),
      facts({ verifiedCommitIsAncestor: false, localEvidence: new Map([["docs/example.md", FIRST_LINE]]), provenanceCommits: new Set() }),
    ),
  ).toEqual(["docs/example.md: ruling evidence target must be D<n>", "docs/example.md: verifiedCommit is not an ancestor of HEAD"]);
});

test("a reviewed receipt binds current document bytes to a durable receipt snapshot", () => {
  expect(
    validateReceiptEntry(
      reviewed({ assignedSha256: "c".repeat(HASH_LENGTH) }),
      facts({ verifiedBlobSha256: "d".repeat(HASH_LENGTH), verifiedCommitExists: false, verifiedCommitIsAncestor: false, provenanceCommits: new Set() }),
    ),
  ).toEqual([
    "docs/example.md: current document and receipt do not coexist in a verified commit or the Git index",
    "docs/example.md: verifiedCommit does not resolve to a commit",
  ]);
  expect(validateReceiptEntry(reviewed(), facts({ verifiedBlobSha256: "d".repeat(HASH_LENGTH), currentReceiptSnapshotExists: true }))).toEqual([]);
  expect(validateReceiptEntry(reviewed(), facts({ candidateTouchesReceiptPair: true }))).toEqual([
    "docs/example.md: current document and receipt do not coexist in a verified commit or the Git index",
  ]);
  expect(validateReceiptEntry(reviewed(), facts({ candidateTouchesReceiptPair: true, currentReceiptSnapshotExists: true }))).toEqual([]);
  expect(validateReceiptEntry(reviewed(), facts({ currentSha256: "d".repeat(HASH_LENGTH), currentReceiptSnapshotExists: true }))).toEqual([
    "docs/example.md: verifiedSha256 does not match the current document",
  ]);
  expect(validateReceiptEntry(reviewed(), facts({ verifiedBlobSha256: "d".repeat(HASH_LENGTH) }))).toEqual([
    "docs/example.md: current document and receipt do not coexist in a verified commit or the Git index",
  ]);
});

test("an exact receipt snapshot never substitutes for a valid ancestor verification commit", () => {
  expect(validateReceiptEntry(reviewed(), facts({ currentReceiptSnapshotExists: true, verifiedCommitExists: false }))).toEqual([
    "docs/example.md: verifiedCommit does not resolve to a commit",
  ]);
  expect(validateReceiptEntry(reviewed(), facts({ currentReceiptSnapshotExists: true, verifiedCommitIsAncestor: false }))).toEqual([
    "docs/example.md: verifiedCommit is not an ancestor of HEAD",
  ]);
  expect(validateReceiptEntry(reviewed({ verifiedCommit: "deadbeef" }), facts({ currentReceiptSnapshotExists: true, verifiedCommitExists: false }))).toEqual([
    "docs/example.md: reviewed disposition requires a full git commit",
    "docs/example.md: verifiedCommit does not resolve to a commit",
  ]);
});

test("typed claim evidence resolves its role-specific local targets", () => {
  expect(
    validateReceiptEntry(
      reviewed({
        claims: [
          {
            claim: "The behavior is implemented and covered.",
            evidence: [
              { kind: "code", target: "packages/example.ts:1" },
              { kind: "code", target: "tooling/src/doc-catalog/ops/tree.ts:1" },
              { kind: "test", target: "tests/example.test.ts:1" },
              { kind: "gate", target: "tooling/src/verify/example.ts:1" },
              { kind: "ruling", target: "D139" },
              { kind: "law", target: `${LAW_PATH} §7` },
              { kind: "issue", target: "#52" },
              { kind: "upstream", target: "https://example.com/source" },
              { kind: "provenance", target: `git:${ANCESTOR}` },
            ],
          },
        ],
      }),
      facts(),
    ),
  ).toEqual([]);
});

test("stable law and ruling targets survive line movement", () => {
  const claims = [
    {
      claim: "Stable authority",
      evidence: [
        { kind: "law", target: `${LAW_PATH} §7` },
        { kind: "ruling", target: "D139" },
      ],
    },
  ];
  expect(validateReceiptEntry(reviewed({ claims }), facts())).toEqual([]);
  expect(validateReceiptEntry(reviewed({ claims }), facts({ localEvidence: new Map([[LAW_PATH, FIRST_LINE]]) }))).toEqual([]);
});

test("stable authority targets reject missing, duplicate, malformed, and wrong-kind anchors", () => {
  expect(validateReceiptEntry(reviewed({ claims: claimEvidence("ruling", "D86") }), facts())).toEqual([]);
  expect(validateReceiptEntry(reviewed({ claims: claimEvidence("ruling", "D142") }), facts())).toEqual([
    "docs/example.md: ruling evidence target does not resolve: D142",
  ]);
  expect(validateReceiptEntry(reviewed({ claims: claimEvidence("ruling", "D139") }), facts({ rulingAnchors: new Map([["139", 2]]) }))).toEqual([
    "docs/example.md: ruling evidence target is ambiguous: D139",
  ]);
  expect(validateReceiptEntry(reviewed({ claims: claimEvidence("ruling", "D079") }), facts())).toEqual([
    "docs/example.md: ruling evidence target must be D<n>",
  ]);
  expect(validateReceiptEntry(reviewed({ claims: claimEvidence("ruling", "D80") }), facts())).toEqual([
    "docs/example.md: ruling evidence target is reserved: D80",
  ]);
  expect(validateReceiptEntry(reviewed({ claims: claimEvidence("law", `${LAW_PATH} §8`) }), facts())).toEqual([
    `docs/example.md: law evidence target does not resolve: ${LAW_PATH} §8`,
  ]);
  expect(
    validateReceiptEntry(reviewed({ claims: claimEvidence("law", `${LAW_PATH} §7`) }), facts({ lawSections: new Map([[LAW_PATH, new Map([["7", 2]])]]) })),
  ).toEqual([`docs/example.md: law evidence target is ambiguous: ${LAW_PATH} §7`]);
  expect(validateReceiptEntry(reviewed({ claims: claimEvidence("law", "D139") }), facts())).toEqual([
    "docs/example.md: law evidence target must be current-law-path §<section>",
  ]);
  expect(validateReceiptEntry(reviewed({ claims: claimEvidence("ruling", `${LAW_PATH} §7`) }), facts())).toEqual([
    "docs/example.md: ruling evidence target must be D<n>",
  ]);
});

test("archive and vendor lifecycle attestations do not impersonate current claim review", () => {
  expect(validateReceiptEntry(reviewedWithoutClaims({ disposition: "archive", authority: "historical" }))).toEqual([]);
  expect(validateReceiptEntry(reviewedWithoutClaims({ disposition: "vendor-snapshot", authority: "vendor" }))).toEqual([]);
  expect(validateReceiptEntry(reviewedWithoutClaims({ disposition: "generated-artifact", authority: "generated" }))).toEqual([]);
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
  expect(debtPathErrors(substituted, oldDebt)).toEqual([
    "pending: new debt path docs/new.md is not in the ratchet allowance",
    "pending: stale debt path docs/old.md remains in the ratchet allowance",
  ]);
});

test("the debt ratchet rejects stale allowances in every debt category", () => {
  const current = { pending: [], missingFrontmatter: [], invalidFrontmatter: [], malformedFrontmatter: [] };
  const stale = {
    pending: ["docs/pending.md"],
    missingFrontmatter: ["docs/missing.md"],
    invalidFrontmatter: ["docs/invalid.md"],
    malformedFrontmatter: ["docs/malformed.md"],
  };
  expect(debtPathErrors(current, stale)).toEqual([
    "pending: stale debt path docs/pending.md remains in the ratchet allowance",
    "missingFrontmatter: stale debt path docs/missing.md remains in the ratchet allowance",
    "invalidFrontmatter: stale debt path docs/invalid.md remains in the ratchet allowance",
    "malformedFrontmatter: stale debt path docs/malformed.md remains in the ratchet allowance",
  ]);
});

test("a newly tracked document reports a missing receipt instead of crashing catalog rendering", () => {
  expect(catalogReceipt(undefined, HASH)).toEqual({ receipt: null, receiptCurrent: false });
});
