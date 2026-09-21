// The Git half of D139's exact-byte receipt contract. A normal pre-commit sees the candidate commit in
// the index, so the current document and its actual receipt source must be present there together; after
// commit, the index naturally equals HEAD and keeps proving the same pair. Every case uses an isolated
// repository.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFixtureGit, FIXTURE_GIT_CONFIG_ARGS, fixtureGitEnvironment } from "../../../../tooling/src/_shared/git-fixture.ts";
import { withProcessEnv } from "../../../../tooling/src/_shared/process-env.ts";
import type { Doc, EvidenceSources, ReceiptEntry } from "../../../../tooling/src/doc-catalog/index.ts";
import { __receiptFactsForTest, validateReceiptEntry } from "../../../../tooling/src/doc-catalog/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const DOC_PATH = "docs/example.md";
const RECEIPT_PATH = "receipts/custom-source.json";
const CURRENT_DOC = "# Current\n";
const CURRENT_RECEIPT = '{"receipt":"current"}\n';
const EVIDENCE_PATH = "packages/example.ts";
const BASE_EVIDENCE = "export const first = true;\n";
const CURRENT_EVIDENCE = `${BASE_EVIDENCE}export const second = true;\n`;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function git(root: string, ...args: readonly string[]): string {
  return execFixtureGit(root, ["-c", "user.name=Receipt Test", "-c", "user.email=receipt@example.invalid", ...args]).trim();
}

function gitAtIndex(root: string, index: string, ...args: readonly string[]): string {
  return execFileSync("git", [...FIXTURE_GIT_CONFIG_ARGS, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...fixtureGitEnvironment(), ["GIT_INDEX_FILE"]: index },
  }).trim();
}

function setup(root: string): { readonly entry: ReceiptEntry; readonly doc: Doc; readonly sources: EvidenceSources } {
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "packages"), { recursive: true });
  mkdirSync(join(root, "receipts"), { recursive: true });
  git(root, "init", "-q");
  writeFileSync(join(root, DOC_PATH), "# Previous\n");
  writeFileSync(join(root, RECEIPT_PATH), '{"receipt":"previous"}\n');
  writeFileSync(join(root, EVIDENCE_PATH), BASE_EVIDENCE);
  git(root, "add", DOC_PATH, RECEIPT_PATH, EVIDENCE_PATH);
  git(root, "commit", "-qm", "base");
  const verifiedCommit = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, DOC_PATH), CURRENT_DOC);
  writeFileSync(join(root, RECEIPT_PATH), CURRENT_RECEIPT);
  return {
    entry: {
      path: DOC_PATH,
      assignedSha256: sha256(CURRENT_DOC),
      disposition: "current",
      authority: "normative",
      fullRead: true,
      verifiedSha256: sha256(CURRENT_DOC),
      verifiedCommit,
      verifiedAt: "2026-09-10",
      evidence: ["D139"],
      claims: [{ claim: "Current", evidence: [{ kind: "ruling", target: "D139" }] }],
      summary: "Current bytes reviewed.",
    },
    doc: {
      path: DOC_PATH,
      lines: 1,
      bytes: Buffer.byteLength(CURRENT_DOC),
      sha256: sha256(CURRENT_DOC),
      canonicalSha256: null,
      frontmatter: { present: false, malformed: false, fields: {}, errors: [] },
    },
    sources: {
      localEvidence: new Map([[EVIDENCE_PATH, 1]]),
      lawSections: new Map(),
      ancestors: new Set([verifiedCommit]),
      rulingAnchors: new Map([["139", 1]]),
    },
  };
}

function withCurrentLocalEvidence(input: ReturnType<typeof setup>): ReturnType<typeof setup> {
  return {
    ...input,
    entry: { ...input.entry, claims: [{ claim: "Second export exists", evidence: [{ kind: "code", target: `${EVIDENCE_PATH}:2` }] }] },
    sources: { ...input.sources, localEvidence: new Map([[EVIDENCE_PATH, 2]]) },
  };
}

function snapshotExists(root: string, stage: readonly string[]): boolean {
  const { entry, doc, sources } = setup(root);
  if (stage.length > 0) {
    git(root, "add", ...stage);
  }
  return __receiptFactsForTest({ entry, doc, receiptSourcePath: RECEIPT_PATH, sources, repoRoot: root, isolateGitEnvironment: true })
    .currentReceiptSnapshotExists;
}

test("the exact current document and actual receipt source staged together form an atomic snapshot", ({ scratch }) => {
  expect(snapshotExists(scratch, [DOC_PATH, RECEIPT_PATH])).toBe(true);
});

test("staging only the document or only the receipt cannot attest uncommitted companion bytes", ({ scratch }) => {
  expect(snapshotExists(join(scratch, "doc-only"), [DOC_PATH])).toBe(false);
  expect(snapshotExists(join(scratch, "receipt-only"), [RECEIPT_PATH])).toBe(false);
});

test("working receipt bytes that differ from the staged receipt invalidate the pair", ({ scratch }) => {
  const facts = setup(scratch);
  git(scratch, "add", DOC_PATH, RECEIPT_PATH);
  writeFileSync(join(scratch, RECEIPT_PATH), '{"receipt":"changed-after-stage"}\n');
  expect(
    __receiptFactsForTest({ ...facts, receiptSourcePath: RECEIPT_PATH, repoRoot: scratch, isolateGitEnvironment: true }).currentReceiptSnapshotExists,
  ).toBe(false);
});

test("a candidate receipt refuses typed evidence that exists only in unstaged worktree bytes", ({ scratch }) => {
  const facts = withCurrentLocalEvidence(setup(scratch));
  writeFileSync(join(scratch, EVIDENCE_PATH), CURRENT_EVIDENCE);
  git(scratch, "add", DOC_PATH, RECEIPT_PATH);

  const drifted = __receiptFactsForTest({ ...facts, receiptSourcePath: RECEIPT_PATH, repoRoot: scratch, isolateGitEnvironment: true });
  expect(drifted.candidateEvidencePathsDifferFromIndex).toContain(EVIDENCE_PATH);
  expect(validateReceiptEntry(facts.entry, drifted)).toContain(`${DOC_PATH}: code evidence target differs from the candidate Git index: ${EVIDENCE_PATH}:2`);

  git(scratch, "add", EVIDENCE_PATH);
  const complete = __receiptFactsForTest({ ...facts, receiptSourcePath: RECEIPT_PATH, repoRoot: scratch, isolateGitEnvironment: true });
  expect(complete.candidateEvidencePathsDifferFromIndex).not.toContain(EVIDENCE_PATH);
  expect(validateReceiptEntry(facts.entry, complete)).toEqual([]);
});

test("an unchanged receipt refuses a code-only candidate that removes its cited line", ({ scratch }) => {
  const facts = withCurrentLocalEvidence(setup(scratch));
  writeFileSync(join(scratch, EVIDENCE_PATH), CURRENT_EVIDENCE);
  git(scratch, "add", DOC_PATH, RECEIPT_PATH, EVIDENCE_PATH);
  git(scratch, "commit", "-qm", "reviewed baseline");

  writeFileSync(join(scratch, EVIDENCE_PATH), BASE_EVIDENCE);
  git(scratch, "add", EVIDENCE_PATH);
  writeFileSync(join(scratch, EVIDENCE_PATH), CURRENT_EVIDENCE);

  const partial = __receiptFactsForTest({ ...facts, receiptSourcePath: RECEIPT_PATH, repoRoot: scratch, isolateGitEnvironment: true });
  expect(partial.candidateTouchesReceiptPair).toBe(false);
  expect(partial.candidateChangedPaths).toContain(EVIDENCE_PATH);
  expect(validateReceiptEntry(facts.entry, partial)).toContain(`${DOC_PATH}: code evidence target differs from the candidate Git index: ${EVIDENCE_PATH}:2`);

  git(scratch, "add", EVIDENCE_PATH);
  const complete = __receiptFactsForTest({ ...facts, receiptSourcePath: RECEIPT_PATH, repoRoot: scratch, isolateGitEnvironment: true });
  expect(complete.candidateChangedPaths).not.toContain(EVIDENCE_PATH);
  expect(validateReceiptEntry(facts.entry, complete)).toEqual([]);
});

test("the worktree-index census preserves a leading-space path beside its normal spelling", ({ scratch }) => {
  const facts = setup(scratch);
  const spaced = " leading.ts";
  const normal = "leading.ts";
  writeFileSync(join(scratch, spaced), "export const spaced = true;\n");
  writeFileSync(join(scratch, normal), "export const normal = true;\n");
  git(scratch, "add", DOC_PATH, RECEIPT_PATH, spaced, normal);
  git(scratch, "commit", "-qm", "path baseline");
  writeFileSync(join(scratch, spaced), "export const spaced = false;\n");
  writeFileSync(join(scratch, normal), "export const normal = false;\n");

  const observed = __receiptFactsForTest({ ...facts, receiptSourcePath: RECEIPT_PATH, repoRoot: scratch, isolateGitEnvironment: true });
  expect(observed.candidateEvidencePathsDifferFromIndex).toEqual(new Set([spaced, normal]));
});

test("typed evidence closure honors an alternate candidate index", async ({ scratch }) => {
  const facts = withCurrentLocalEvidence(setup(scratch));
  const index = join(scratch, "candidate.index");
  writeFileSync(join(scratch, EVIDENCE_PATH), CURRENT_EVIDENCE);
  gitAtIndex(scratch, index, "read-tree", "HEAD");
  gitAtIndex(scratch, index, "add", DOC_PATH, RECEIPT_PATH);

  await withProcessEnv("GIT_INDEX_FILE", index, () => {
    const drifted = __receiptFactsForTest({ ...facts, receiptSourcePath: RECEIPT_PATH, repoRoot: scratch });
    expect(validateReceiptEntry(facts.entry, drifted)).toContain(`${DOC_PATH}: code evidence target differs from the candidate Git index: ${EVIDENCE_PATH}:2`);

    gitAtIndex(scratch, index, "add", EVIDENCE_PATH);
    const complete = __receiptFactsForTest({ ...facts, receiptSourcePath: RECEIPT_PATH, repoRoot: scratch });
    expect(validateReceiptEntry(facts.entry, complete)).toEqual([]);
    return Promise.resolve();
  });
});

test("after the atomic pair commits, HEAD preserves the snapshot without index state", ({ scratch }) => {
  const facts = setup(scratch);
  git(scratch, "add", DOC_PATH, RECEIPT_PATH);
  git(scratch, "commit", "-qm", "atomic receipt");
  expect(
    __receiptFactsForTest({ ...facts, receiptSourcePath: RECEIPT_PATH, repoRoot: scratch, isolateGitEnvironment: true }).currentReceiptSnapshotExists,
  ).toBe(true);
});

test("a valid HEAD pair cannot mask a conflicting staged document", ({ scratch }) => {
  const facts = setup(scratch);
  git(scratch, "add", DOC_PATH, RECEIPT_PATH);
  git(scratch, "commit", "-qm", "atomic receipt");
  const entry = { ...facts.entry, verifiedCommit: git(scratch, "rev-parse", "HEAD") };
  writeFileSync(join(scratch, DOC_PATH), "# Next candidate\n");
  git(scratch, "add", DOC_PATH);
  writeFileSync(join(scratch, DOC_PATH), CURRENT_DOC);
  const observed = __receiptFactsForTest({ ...facts, entry, receiptSourcePath: RECEIPT_PATH, repoRoot: scratch, isolateGitEnvironment: true });
  expect(observed.verifiedBlobSha256).toBe(entry.verifiedSha256);
  expect(observed.candidateTouchesReceiptPair).toBe(true);
  expect(validateReceiptEntry(entry, observed)).toContain(`${DOC_PATH}: current document and receipt do not coexist in a verified commit or the Git index`);
});

test("a valid HEAD pair cannot mask a conflicting staged receipt", ({ scratch }) => {
  const facts = setup(scratch);
  git(scratch, "add", DOC_PATH, RECEIPT_PATH);
  git(scratch, "commit", "-qm", "atomic receipt");
  const entry = { ...facts.entry, verifiedCommit: git(scratch, "rev-parse", "HEAD") };
  writeFileSync(join(scratch, RECEIPT_PATH), '{"receipt":"next-candidate"}\n');
  git(scratch, "add", RECEIPT_PATH);
  writeFileSync(join(scratch, RECEIPT_PATH), CURRENT_RECEIPT);
  const observed = __receiptFactsForTest({ ...facts, entry, receiptSourcePath: RECEIPT_PATH, repoRoot: scratch, isolateGitEnvironment: true });
  expect(observed.verifiedBlobSha256).toBe(entry.verifiedSha256);
  expect(observed.candidateTouchesReceiptPair).toBe(true);
  expect(validateReceiptEntry(entry, observed)).toContain(`${DOC_PATH}: current document and receipt do not coexist in a verified commit or the Git index`);
});
