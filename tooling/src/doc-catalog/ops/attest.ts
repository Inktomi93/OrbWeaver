// RE-ATTESTATION (#1996): the one mechanical writer for the four fields a lane used to hand-edit across
// nine receipt files — `assignedSha256`, `verifiedSha256`, `verifiedCommit`, `verifiedAt`. Every other
// field of a row (disposition, authority, evidence, claims, summary) is a HUMAN JUDGMENT and is copied
// through untouched; this verb only re-states "the bytes I reviewed are the bytes on the tree now".
//
// WHY IT CANNOT SWEEP. A receipt asserts that a human READ the document (D139), so a helper that makes
// re-attesting cheap makes attesting-WITHOUT-reading cheap by the same stroke. The selection is therefore
// EXPLICIT document paths and nothing else: no pattern, no directory, no "--all-stale", no default. The
// refusals below are the feature, not its error handling, and `tests/tooling/doc-catalog/attest.test.ts`
// pins each one — including that a single refusal writes NOTHING, so a mixed selection can never land a
// partial sweep beside the row the caller actually read.
//
// The plan is PURE (`planAttestation`): every tree and git fact arrives as data and the clock arrives as
// `today`, so the whole verb is testable with hand-built inputs and no repository.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import type { AttestInput, AttestPlan, AttestRefusal, Doc, Lane, LaneConfig, Receipt, ReceiptEntry } from "../contract/types.ts";
import { LANES_PATH } from "../lib/vocab.ts";
import { documents, headCommit, indexFileMatchesWorkingTree, json, loadReceipts, receiptPath, root, stableJson, today } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc-catalog:attest <doc-path…>");

/** A selection argument that is not a plain repo-relative file path. A glob reaching the corpus is the
 *  exact shape this verb exists to refuse, so it is rejected on its SHAPE — before any tree read. */
const PATTERN_RE = /[*?[\]{}]/u;
/** Enough SHA to identify a document in a message; the row itself always carries the full digest. */
const SHA_ECHO_LENGTH = 12;

function misuse(message: string): AttestRefusal {
  return { kind: "misuse", message };
}

function violation(message: string): AttestRefusal {
  return { kind: "violation", message };
}

function selectionShapeRefusals(selection: readonly string[]): readonly AttestRefusal[] {
  if (selection.length === 0) {
    return [
      misuse(
        "attest names the documents to re-attest EXPLICITLY — there is no corpus sweep and no default selection. A receipt asserts that a human read the document, so a verb that could re-attest everything would attest what nobody read.",
      ),
    ];
  }
  const seen = new Set<string>();
  const refusals: AttestRefusal[] = [];
  for (const argument of selection) {
    if (PATTERN_RE.test(argument) || argument.endsWith("/") || argument.split("/").includes("..")) {
      refusals.push(misuse(`${argument}: attest takes document PATHS, never a pattern or a directory — name each document you actually read`));
    }
    if (seen.has(argument)) {
      refusals.push(misuse(`${argument}: named twice`));
    }
    seen.add(argument);
  }
  return refusals;
}

function rowRefusals(path: string, doc: Doc | undefined, entry: ReceiptEntry | undefined, unstagedDocuments: ReadonlySet<string>): readonly AttestRefusal[] {
  if (doc === undefined) {
    return [violation(`${path}: not a catalogued document`)];
  }
  if (entry === undefined) {
    return [violation(`${path}: no receipt row — run pnpm doc-catalog:sync, then author the row by hand once you have read it`)];
  }
  if (entry.disposition === "pending") {
    return [
      violation(
        `${path}: the row is PENDING — it has never been reviewed, and re-attestation cannot mint a first review. Read the document and author the row (disposition, authority, evidence, claims, summary) by hand.`,
      ),
    ];
  }
  if (entry.verifiedSha256 === doc.sha256) {
    return [violation(`${path}: already attested at ${doc.sha256.slice(0, SHA_ECHO_LENGTH)} — re-attesting would move verifiedAt without a read`)];
  }
  return unstagedDocuments.has(path)
    ? [
        violation(
          `${path}: the document's worktree bytes are not in the Git index — stage it first, because the receipt asserts a document/receipt pair that coexists`,
        ),
      ]
    : [];
}

function attestedEntry(entry: ReceiptEntry, doc: Doc, commit: string, at: string): ReceiptEntry {
  return { ...entry, assignedSha256: doc.sha256, verifiedSha256: doc.sha256, verifiedCommit: commit, verifiedAt: at };
}

/** The whole verb as a total function over data: what would be written, what was refused, and why. A
 *  single refusal cancels EVERY write — a partial landing is how an unread row sneaks in beside a read
 *  one, and that is precisely the failure this verb must not make cheap. */
export function planAttestation(input: AttestInput): AttestPlan {
  const refusals = [...selectionShapeRefusals(input.selection)];
  const docsByPath = new Map(input.docs.map((doc) => [doc.path, doc] as const));
  const rowsByPath = new Map(input.receipts.flatMap((receipt) => receipt.entries.map((entry) => [entry.path, entry] as const)));
  const attested: string[] = [];
  for (const path of new Set(input.selection)) {
    const rejected = rowRefusals(path, docsByPath.get(path), rowsByPath.get(path), input.unstagedDocuments);
    if (rejected.length > 0) {
      refusals.push(...rejected);
    } else {
      attested.push(path);
    }
  }
  const commit = input.headCommit;
  if (commit === null && attested.length > 0) {
    refusals.push(violation("HEAD does not resolve to a commit, so the attested commit cannot be established"));
  }
  if (refusals.length > 0 || commit === null) {
    return { writes: [], attested: [], refusals };
  }
  const selected = new Set(attested);
  const writes = input.receipts
    .filter((receipt) => receipt.entries.some((entry) => selected.has(entry.path)))
    .map((receipt) => ({
      path: receiptPathOf(input.config, receipt.lane),
      receipt: {
        ...receipt,
        entries: receipt.entries.map((entry) =>
          selected.has(entry.path) ? attestedEntry(entry, docsByPath.get(entry.path) as Doc, commit, input.today) : entry,
        ),
      } satisfies Receipt,
    }));
  return { writes, attested: attested.toSorted((left, right) => left.localeCompare(right)), refusals: [] };
}

function receiptPathOf(config: LaneConfig, laneId: string): string {
  return receiptPath(config.lanes.find((candidate) => candidate.id === laneId) as Lane);
}

/** `pnpm doc-catalog:attest <doc-path…>`. Exit 3 = the selection is not an explicit document list;
 *  1 = a named row cannot be re-attested (and NOTHING was written); 0 = every named row re-attested. */
export function runAttest(selection: readonly string[]): ExitCode {
  const config = json<LaneConfig>(LANES_PATH);
  const docs = documents();
  const commit = headCommit();
  const known = new Set(docs.map((doc) => doc.path));
  const unstagedDocuments = new Set(selection.filter((path) => known.has(path) && !indexFileMatchesWorkingTree(path)));
  const plan = planAttestation({ config, docs, receipts: loadReceipts(config), selection, headCommit: commit, today: today(), unstagedDocuments });
  if (plan.refusals.length > 0) {
    warn(`doc-catalog:attest — NOTHING WRITTEN; ${plan.refusals.length} refusal(s):\n${plan.refusals.map(({ message }) => `  ${message}`).join("\n")}`);
    return plan.refusals.some(({ kind }) => kind === "misuse") ? EXIT.misuse : EXIT.violations;
  }
  for (const write of plan.writes) {
    writeFileSync(join(root, write.path), stableJson(write.receipt));
  }
  for (const path of plan.attested) {
    print(`doc-catalog:attest — re-attested ${path} at ${(commit ?? "").slice(0, SHA_ECHO_LENGTH)}`);
  }
  print(
    `doc-catalog:attest — wrote ${String(plan.writes.length)} receipt file(s); stage the documents AND the receipts together, then run pnpm doc-catalog:write`,
  );
  return EXIT.clean;
}
