// The Git half of D139's exact-byte receipt contract. A normal pre-commit sees the candidate commit in
// the index, so the current document and its actual receipt source must be present there together; after
// commit, the index naturally equals HEAD and keeps proving the same pair. Every case uses an isolated
// repository.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Doc, EvidenceSources, ReceiptEntry } from "../../../../tooling/src/doc-catalog/index.ts";
import { __receiptFactsForTest, validateReceiptEntry } from "../../../../tooling/src/doc-catalog/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const DOC_PATH = "docs/example.md";
const RECEIPT_PATH = "receipts/custom-source.json";
const CURRENT_DOC = "# Current\n";
const CURRENT_RECEIPT = '{"receipt":"current"}\n';

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function git(root: string, ...args: readonly string[]): string {
  // A suite launched by a Git hook may inherit its temporary candidate index; fixtures must never point
  // that ambient Git state at the real repository. Production deliberately preserves the same variables.
  return execFileSync(
    "env",
    [
      "-u",
      "GIT_DIR",
      "-u",
      "GIT_WORK_TREE",
      "-u",
      "GIT_INDEX_FILE",
      "git",
      "-c",
      "user.name=Receipt Test",
      "-c",
      "user.email=receipt@example.invalid",
      ...args,
    ],
    { cwd: root, encoding: "utf8" },
  ).trim();
}

function setup(root: string): { readonly entry: ReceiptEntry; readonly doc: Doc; readonly sources: EvidenceSources } {
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "receipts"), { recursive: true });
  git(root, "init", "-q");
  writeFileSync(join(root, DOC_PATH), "# Previous\n");
  writeFileSync(join(root, RECEIPT_PATH), '{"receipt":"previous"}\n');
  git(root, "add", DOC_PATH, RECEIPT_PATH);
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
      frontmatter: { present: false, malformed: false, fields: {}, errors: [] },
    },
    sources: { localEvidence: new Map(), lawSections: new Map(), ancestors: new Set([verifiedCommit]), rulingAnchors: new Map([["139", 1]]) },
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
