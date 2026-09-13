// RE-ATTESTATION (#1996): the one mechanical writer for the four fields a lane used to hand-edit across
// nine receipt files — `assignedSha256`, `verifiedSha256`, `verifiedCommit`, `verifiedAt`. Every other
// field of a row (disposition, authority, evidence, claims, summary) is a HUMAN JUDGMENT and is copied
// through untouched; this verb only re-states "the bytes I reviewed are the bytes on the tree now".
//
// WHY IT CANNOT SWEEP. A receipt asserts that a human READ the document (D139), so a helper that makes
// re-attesting cheap makes attesting-WITHOUT-reading cheap by the same stroke. The selection is therefore
// EXPLICIT document paths and nothing else: no pattern, no directory, no "--all-stale", no default. The
// refusals below are the feature, not its error handling, and `tests/tooling/doc-catalog/ops/attest.test.ts`
// pins each one — including that a single refusal writes NOTHING, so a mixed selection can never land a
// partial sweep beside the row the caller actually read. Those arms are PURE (they drive `planAttestation`
// with hand-built data); the DRIVER's own wiring is pinned separately by `ops/attest.int.test.ts`, which
// cuts the call rather than the branch (#2238).
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
import type { AttestEvidenceResolver, AttestInput, AttestPlan, AttestRefusal, Doc, Lane, LaneConfig, Receipt, ReceiptEntry } from "../contract/types.ts";
import { receiptEvidenceErrors } from "../lib/receipt-rules.ts";
import { LANES_PATH } from "../lib/vocab.ts";
import {
  documents,
  headAncestors,
  headCommit,
  indexFileMatchesWorkingTree,
  json,
  loadReceipts,
  localEvidenceLines,
  receiptFacts,
  receiptPath,
  root,
  stableJson,
  stableLawSections,
  stableRulingAnchors,
  today,
} from "./tree.ts";

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

/** The GRAMMAR refusal (#1996). A re-attest restates "the bytes I reviewed are the bytes on the tree now"
 *  and copies every judgment field through — including the evidence, which the TREE can invalidate without
 *  touching the document: a renamed `code` file, a renumbered `law §N`, a `provenance` commit rebased out
 *  of HEAD's ancestry. Writing first and discovering that at `check:doc-catalog` puts the failure in the
 *  stage the lane was trying to get through; judging first puts it in the operator's hands with the row
 *  still intact. The grammars are not re-spelled here — `lib/receipt-rules.ts` owns them. */
function evidenceRefusals(path: string, errors: readonly string[]): readonly AttestRefusal[] {
  return errors.map((error) =>
    violation(`${path}: the row's evidence no longer resolves, so re-attesting would land a receipt that reds at check:doc-catalog — ${error}`),
  );
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
    const rejected = [
      ...rowRefusals(path, docsByPath.get(path), rowsByPath.get(path), input.unstagedDocuments),
      ...evidenceRefusals(path, input.evidenceErrors.get(path) ?? []),
    ];
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

/** The driver's ONE tree read for the grammar half: the evidence sources resolve once for the whole
 *  selection, and each selected row's typed evidence is judged through `lib/receipt-rules.ts`. The
 *  catalog stage uses that same grammar after its disposition checks; re-attestation deliberately also
 *  diagnoses stale evidence on a pending row, although the independent pending refusal still forbids writing it.
 *
 *  The candidate-index arms are handed their NEUTRAL values (`candidateTouchesPair: false`, an empty
 *  changed-path set), which short-circuits the index-coexistence tail inside the local-evidence reader.
 *  That is deliberate and is the whole boundary of this check: coexistence is a claim about a receipt that
 *  has not been written yet, so judging it here would refuse every honest re-attest. What survives is
 *  exactly the six grammars — shape, root, resolution, ambiguity, the reserved-ruling window, ancestry.
 *
 *  A LIFECYCLE row (archive / generated-artifact / superseded / vendor-snapshot, or generated / historical /
 *  vendor authority) owes no typed claims AT ALL — `isLifecycleReceipt` exempts it in the reader — so this
 *  check is silent on one by contract, not by omission. Worth knowing before probing: a first end-to-end
 *  probe of this arm aimed at `docs/history/README.md`, whose row is `archive`, and read the correct write
 *  as a missing refusal. */
export function resolveEvidenceErrors(
  selection: readonly string[],
  docs: readonly Doc[],
  receipts: readonly Receipt[],
  tree: { readonly repoRoot: string; readonly isolateGitEnvironment: boolean } = { repoRoot: root, isolateGitEnvironment: false },
): ReadonlyMap<string, readonly string[]> {
  const { isolateGitEnvironment, repoRoot } = tree;
  const selected = new Set(selection);
  const rows = receipts.flatMap((receipt) => receipt.entries.filter((entry) => selected.has(entry.path)));
  if (rows.length === 0) {
    return new Map();
  }
  const sources = {
    localEvidence: localEvidenceLines(repoRoot, isolateGitEnvironment),
    lawSections: stableLawSections(docs, repoRoot),
    ancestors: headAncestors(repoRoot, isolateGitEnvironment),
    rulingAnchors: stableRulingAnchors(repoRoot),
  };
  const docsByPath = new Map(docs.map((doc) => [doc.path, doc] as const));
  return new Map(
    rows.flatMap((entry) => {
      const doc = docsByPath.get(entry.path);
      if (doc === undefined) {
        return [];
      }
      const facts = receiptFacts(
        entry,
        doc,
        {
          path: undefined,
          candidateTouchesPair: false,
          candidateChangedPaths: new Set<string>(),
          candidateEvidencePathsDifferFromIndex: new Set<string>(),
          repoRoot,
          isolateGitEnvironment,
        },
        sources,
      );
      return [[entry.path, receiptEvidenceErrors(entry, facts)] as const];
    }),
  );
}

/** `pnpm doc-catalog:attest <doc-path…>`. Exit 3 = the selection is not an explicit document list;
 *  1 = a named row cannot be re-attested (and NOTHING was written); 0 = every named row re-attested.
 *
 *  `resolveEvidence` is the tree-reading half, INJECTED with the production reader as its default (#2238).
 *  It is a seam because the alternative is unprovable: the plan is pure and its spec hands the map in as
 *  data, so replacing this call with an empty map left every one of the suite's 68 tests green — the verb
 *  kept refusing everything the ROW rules refuse and silently stopped refusing moved EVIDENCE. The spec
 *  cuts the call through this parameter; `ops/attest.int.test.ts` is the pin. */
export function runAttestAtRoot(repoRoot: string) {
  const isolateGitEnvironment = repoRoot !== root;
  const defaultResolver: AttestEvidenceResolver = (selection, docs, receipts) =>
    resolveEvidenceErrors(selection, docs, receipts, { repoRoot, isolateGitEnvironment });
  return (selection: readonly string[], resolveEvidence: AttestEvidenceResolver = defaultResolver): ExitCode => {
    const config = json<LaneConfig>(LANES_PATH, repoRoot);
    const docs = documents(repoRoot, isolateGitEnvironment);
    const commit = headCommit(repoRoot, isolateGitEnvironment);
    const known = new Set(docs.map((doc) => doc.path));
    const unstagedDocuments = new Set(selection.filter((path) => known.has(path) && !indexFileMatchesWorkingTree(path, repoRoot, isolateGitEnvironment)));
    const receipts = loadReceipts(config, repoRoot);
    const plan = planAttestation({
      config,
      docs,
      receipts,
      selection,
      headCommit: commit,
      today: today(),
      unstagedDocuments,
      evidenceErrors: resolveEvidence(selection, docs, receipts),
    });
    if (plan.refusals.length > 0) {
      warn(`doc-catalog:attest — NOTHING WRITTEN; ${plan.refusals.length} refusal(s):\n${plan.refusals.map(({ message }) => `  ${message}`).join("\n")}`);
      return plan.refusals.some(({ kind }) => kind === "misuse") ? EXIT.misuse : EXIT.violations;
    }
    for (const write of plan.writes) {
      writeFileSync(join(repoRoot, write.path), stableJson(write.receipt, repoRoot));
    }
    for (const path of plan.attested) {
      print(`doc-catalog:attest — re-attested ${path} at ${(commit ?? "").slice(0, SHA_ECHO_LENGTH)}`);
    }
    // THE CLOSING LINE NAMES THE SCOPED DOOR (#2165). It used to say `pnpm doc-catalog:write`, and an
    // operator who followed it after a ONE-FILE re-attest got 184 insertions across every document that had
    // changed that day. The advice line was as much the defect surface as the verb it pointed at.
    print(
      `doc-catalog:attest — wrote ${String(plan.writes.length)} receipt file(s); stage the documents AND the receipts together, then regenerate JUST these rows:\n  pnpm doc-catalog:write --paths ${plan.attested.join(" ")}`,
    );
    return EXIT.clean;
  };
}

export const runAttest = runAttestAtRoot(root);
