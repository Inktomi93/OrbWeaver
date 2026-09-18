// RE-ATTESTATION's refusals ARE the feature (#1996). A receipt asserts that a human READ the document
// (D139), so the danger in a helper that makes re-attesting cheap is that it makes attesting-without-
// reading cheap by the same stroke. Every arm below is one of the two directions: the verb WRITES exactly
// the four mechanical fields for a named, already-reviewed, actually-changed row — and REFUSES, by name
// and without writing anything, for every selection that would let an unread document acquire a receipt.
//
// The plan is pure, so these run with hand-built docs/receipts, no repository and no clock.
import type { AttestInput, Doc, LaneConfig, Receipt, ReceiptEntry } from "../../../../tooling/src/doc-catalog/index.ts";
import { planAttestation } from "../../../../tooling/src/doc-catalog/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const HASH_LENGTH = 64;
const COMMIT_LENGTH = 40;
const OLD_HASH = "a".repeat(HASH_LENGTH);
const NEW_HASH = "b".repeat(HASH_LENGTH);
const OTHER_HASH = "c".repeat(HASH_LENGTH);
const OLD_COMMIT = "1".repeat(COMMIT_LENGTH);
const HEAD = "2".repeat(COMMIT_LENGTH);
const TODAY = "2026-09-12";
const REVIEWED = "docs/architecture/core/Reviewed.md";
const SECOND = "docs/design/second.md";

const CONFIG: LaneConfig = {
  schemaVersion: 1,
  lanes: [
    { id: "core", issue: 1, patterns: ["docs/architecture/core/**"] },
    { id: "design", issue: 2, patterns: ["docs/design/**"] },
  ],
};

function doc(path: string, sha256: string, canonicalSha256: string | null = sha256): Doc {
  return {
    path,
    lines: 10,
    bytes: 100,
    sha256,
    canonicalSha256,
    frontmatter: { present: true, malformed: false, fields: { kind: "law", status: "active", updated: TODAY }, errors: [] },
  };
}

function reviewedEntry(path: string, overrides: Partial<ReceiptEntry> = {}): ReceiptEntry {
  return {
    path,
    assignedSha256: OLD_HASH,
    disposition: "current",
    authority: "normative",
    fullRead: true,
    verifiedSha256: OLD_HASH,
    verifiedCommit: OLD_COMMIT,
    verifiedAt: "2026-09-01",
    evidence: ["read in full"],
    claims: [{ claim: "states the law", evidence: [{ kind: "code", target: "tooling/src/doc-catalog/cli.ts:1" }] }],
    summary: "the reviewed row",
    ...overrides,
  };
}

function receipt(lane: string, entries: readonly ReceiptEntry[]): Receipt {
  return { schemaVersion: 1, lane, issue: lane === "core" ? 1 : 2, entries };
}

function input(overrides: Partial<AttestInput> = {}): AttestInput {
  return {
    config: CONFIG,
    docs: [doc(REVIEWED, NEW_HASH), doc(SECOND, OTHER_HASH)],
    receipts: [receipt("core", [reviewedEntry(REVIEWED)]), receipt("design", [reviewedEntry(SECOND, { assignedSha256: OLD_HASH, verifiedSha256: OLD_HASH })])],
    selection: [REVIEWED],
    headCommit: HEAD,
    today: TODAY,
    unstagedDocuments: new Set<string>(),
    evidenceErrors: new Map<string, readonly string[]>(),
    ...overrides,
  };
}

test("a named, reviewed, changed row is re-attested in exactly the four mechanical fields", () => {
  const plan = planAttestation(input());
  expect(plan.refusals).toEqual([]);
  expect(plan.attested).toEqual([REVIEWED]);
  // ONE receipt file, not both: a lane whose rows were not named is never rewritten.
  expect(plan.writes.map(({ path }) => path)).toEqual(["docs/catalog/receipts/core.json"]);
  expect(plan.writes[0]?.receipt.entries[0]).toEqual({
    ...reviewedEntry(REVIEWED),
    assignedSha256: NEW_HASH,
    verifiedSha256: NEW_HASH,
    verifiedCanonicalSha256: NEW_HASH,
    verifiedCommit: HEAD,
    verifiedAt: TODAY,
  });
});

test("the selection cannot be empty, a pattern, a directory, an escape, or a repeat", () => {
  const empty = planAttestation(input({ selection: [] }));
  expect(empty.writes).toEqual([]);
  expect(empty.refusals.map(({ kind }) => kind)).toEqual(["misuse"]);
  expect(empty.refusals[0]?.message).toContain("there is no corpus sweep and no default selection");

  for (const pattern of ["docs/**/*.md", "docs/architecture/core/", "docs/../etc/passwd", "docs/{a,b}.md"]) {
    const refused = planAttestation(input({ selection: [pattern] }));
    expect(refused.writes, pattern).toEqual([]);
    expect(
      refused.refusals.some(({ message }) => message.includes("never a pattern or a directory")),
      pattern,
    ).toBe(true);
  }

  const twice = planAttestation(input({ selection: [REVIEWED, REVIEWED] }));
  expect(twice.writes).toEqual([]);
  expect(twice.refusals.map(({ message }) => message)).toContain(`${REVIEWED}: named twice`);
});

test("a row that would let an UNREAD document acquire a receipt is refused by name", () => {
  const pending = planAttestation(
    input({ receipts: [receipt("core", [reviewedEntry(REVIEWED, { disposition: "pending", fullRead: false, verifiedSha256: null })])] }),
  );
  expect(pending.writes).toEqual([]);
  expect(pending.refusals[0]?.message).toContain("has never been reviewed, and re-attestation cannot mint a first review");

  const unknown = planAttestation(input({ selection: ["docs/design/never-catalogued.md"] }));
  expect(unknown.refusals[0]?.message).toBe("docs/design/never-catalogued.md: not a catalogued document");

  const noRow = planAttestation(input({ receipts: [receipt("core", [])] }));
  expect(noRow.refusals[0]?.message).toContain("no receipt row — run pnpm doc-catalog:sync");

  // Re-attesting an UNCHANGED row would move `verifiedAt` forward without anybody reading anything —
  // the date would then assert a read that never happened.
  const unchanged = planAttestation(input({ docs: [doc(REVIEWED, OLD_HASH), doc(SECOND, OTHER_HASH)] }));
  expect(unchanged.writes).toEqual([]);
  expect(unchanged.refusals[0]?.message).toContain("re-attesting would move verifiedAt without a read");

  const unstaged = planAttestation(input({ unstagedDocuments: new Set([REVIEWED]) }));
  expect(unstaged.writes).toEqual([]);
  expect(unstaged.refusals[0]?.message).toContain("not in the Git index");

  const headless = planAttestation(input({ headCommit: null }));
  expect(headless.writes).toEqual([]);
  expect(headless.refusals[0]?.message).toContain("HEAD does not resolve to a commit");
});

// THE GRAMMAR HALF (#1996). A re-attest copies the row's judgment fields through untouched — including
// its EVIDENCE, which the tree can invalidate without touching the document: a renamed `code` file, a
// renumbered `law §N`, a `provenance` commit rebased out of HEAD's ancestry. Before this arm the verb
// wrote first and the lane discovered it at `check:doc-catalog`, in the stage it was trying to get
// through. The grammars are not re-spelled here or in the op — `lib/receipt-rules.ts` owns them and the
// driver hands their verdict in as data, so the plan stays pure.
test("a row whose cited evidence no longer resolves is REFUSED before the write, naming the grammar", () => {
  const broken = planAttestation(
    input({ evidenceErrors: new Map([[REVIEWED, [`${REVIEWED}: code evidence target does not resolve: packages/moved/away.ts:3`]]]) }),
  );
  expect(broken.writes).toEqual([]);
  expect(broken.attested).toEqual([]);
  expect(broken.refusals.map(({ kind }) => kind)).toEqual(["violation"]);
  expect(broken.refusals[0]?.message).toContain("would land a receipt that reds at check:doc-catalog");
  expect(broken.refusals[0]?.message).toContain("code evidence target does not resolve: packages/moved/away.ts:3");

  // The other direction, and the control that the arm is keyed on CONTENT rather than on the map being
  // present at all: an empty error list for the same row writes exactly as before.
  const clean = planAttestation(input({ evidenceErrors: new Map([[REVIEWED, []]]) }));
  expect(clean.refusals).toEqual([]);
  expect(clean.writes).toHaveLength(1);

  // A broken row does not take an unrelated lane's row down with it by silence — it takes it down LOUDLY,
  // because the write set is all-or-nothing and the refusal names which row failed.
  const mixed = planAttestation(
    input({
      selection: [REVIEWED, SECOND],
      docs: [doc(REVIEWED, NEW_HASH), doc(SECOND, NEW_HASH)],
      evidenceErrors: new Map([[SECOND, [`${SECOND}: ruling evidence target is reserved: D88`]]]),
    }),
  );
  expect(mixed.writes).toEqual([]);
  expect(mixed.refusals.map(({ message }) => message.includes(SECOND))).toEqual([true]);
});

test("ONE refusal cancels EVERY write, so a mixed selection can never land a partial sweep", () => {
  const mixed = planAttestation(input({ selection: [REVIEWED, "docs/design/never-catalogued.md"] }));
  expect(mixed.attested).toEqual([]);
  expect(mixed.writes).toEqual([]);
  expect(mixed.refusals.map(({ message }) => message)).toEqual(["docs/design/never-catalogued.md: not a catalogued document"]);

  // The positive control for that arm: the SAME good row alone still writes, so the empty write set
  // above is the refusal doing its job and not the plan being inert.
  expect(planAttestation(input({ selection: [REVIEWED] })).writes).toHaveLength(1);
});
