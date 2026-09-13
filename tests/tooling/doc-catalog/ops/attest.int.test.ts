// THE DRIVER HALF of re-attestation (#2238) — `runAttest`'s own wiring, which the pure spec beside this
// file structurally cannot reach. `ops/attest.test.ts` drives `planAttestation` with hand-built data, so
// it pins the PLAN: it is HANDED the evidence-error map it asserts on. Measured 2026-09-12 on the
// unmodified tree: neutering the driver's resolution of that map left the whole `tests/tooling/doc-catalog`
// directory green — 8 files, 68 tests, exit 0 — so the grammar half of #1996 was enforced by nothing and
// the next refactor to drop the argument would have shipped in silence.
//
// The arms below CUT THE CALL rather than the branch: the resolver is injected, so a driver that stops
// consulting it (an empty map inlined at the call site, the argument dropped) reds here. Read-only by
// construction — the first arm drives a REFUSAL, and a refusal cancels every write.
//
// "OR THE DEFAULT SWAPPED" USED TO BE IN THAT LIST AND WAS NOT TRUE (v-wave-9a, 2026-09-13): cutting the
// default at `attest.ts:226` left this whole directory green, and the default is what `cli.ts:62` calls.
// The third arm below is that half, and the sentence is corrected rather than deleted because the false
// claim is the reason nobody looked.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../../../../tooling/src/_shared/artifacts.ts";
import { EXIT } from "../../../../tooling/src/_shared/exit-contract.ts";
import { installOutputSink } from "../../../../tooling/src/_shared/log.ts";
import type { AttestEvidenceResolver, Doc, LaneConfig, Receipt } from "../../../../tooling/src/doc-catalog/index.ts";
import { documents, loadReceipts, resolveEvidenceErrors, runAttest } from "../../../../tooling/src/doc-catalog/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// The receipt corpus's home, spelled here because the tool publishes no reader for it. A move makes
// `receiptBytes` return an EMPTY map, which the first arm asserts against — the miss is loud, never clean.
const RECEIPTS_DIR = "docs/catalog/receipts";
const LANES_PATH = "docs/catalog/lanes.json";
const MOVED_EVIDENCE = "code packages/gone/never-existed.ts does not resolve";

/** Every receipt file's bytes, so "NOTHING WAS WRITTEN" is a disk fact rather than a plan fact. */
function receiptBytes(): ReadonlyMap<string, string> {
  const dir = join(REPO_ROOT, RECEIPTS_DIR);
  return new Map(readdirSync(dir).map((name) => [name, readFileSync(join(dir, name), "utf8")] as const));
}

function laneConfig(): LaneConfig {
  return JSON.parse(readFileSync(join(REPO_ROOT, LANES_PATH), "utf8")) as LaneConfig;
}

/** The first catalogued document that HAS a receipt row, chosen by sort so the subject is deterministic
 *  and never a hand-pinned path that rots when the corpus moves. */
function subjectDocument(): string {
  const catalogued = new Set(documents().map((doc) => doc.path));
  const rows = loadReceipts(laneConfig())
    .flatMap((receipt) => receipt.entries.map((entry) => entry.path))
    .filter((path) => catalogued.has(path));
  const first = rows.toSorted((left, right) => left.localeCompare(right))[0];
  if (first === undefined) {
    throw new Error("attest.int: the receipt corpus produced no catalogued row — the subject could not be chosen, so nothing below is a measurement");
  }
  return first;
}

test("the driver CONSULTS the evidence resolver — a moved-evidence row refuses and nothing is written", () => {
  const subject = subjectDocument();
  const before = receiptBytes();
  expect(before.size).toBeGreaterThan(0);
  const seen: string[][] = [];
  const resolver: AttestEvidenceResolver = (selection) => {
    seen.push([...selection]);
    return new Map([[subject, [MOVED_EVIDENCE]]]);
  };

  const warnings: string[] = [];
  const release = installOutputSink({ line: () => undefined, warn: (message) => warnings.push(message) });
  let code: number;
  try {
    code = runAttest([subject], resolver);
  } finally {
    release();
  }

  // The driver handed the resolver the caller's literal selection, and the map it returned reached the
  // plan: this exact refusal text exists only on the evidence path.
  expect(seen).toEqual([[subject]]);
  expect(code).toBe(EXIT.violations);
  expect(warnings.join("\n")).toContain(MOVED_EVIDENCE);
  expect(warnings.join("\n")).toContain("NOTHING WRITTEN");
  expect(receiptBytes()).toEqual(before);
});

test("the DEFAULT resolver is the tree reader, and it judges the real row rather than answering empty", () => {
  const subject = subjectDocument();
  const docs = documents();
  const receipts = loadReceipts(laneConfig());

  // The reader ANSWERED for the selected row (the key is present), which is what makes an empty error list
  // a verdict of "this row's evidence still resolves" instead of "nobody looked".
  const resolved = resolveEvidenceErrors([subject], docs, receipts);
  expect([...resolved.keys()]).toEqual([subject]);
  expect(resolved.get(subject)).toEqual([]);

  // …and an unselected corpus is not judged at all — the reader is keyed by the SELECTION, so a driver
  // that passed it the wrong list would be visible here rather than as a silent no-op.
  expect(resolveEvidenceErrors([], docs, receipts).size).toBe(0);
});

// ── THE DEFAULT PARAMETER IS THE PATH PRODUCTION TAKES, and the two arms above both miss it ──────────
//
// `cli.ts:62` is `return runAttest(paths);` — ONE argument. Arm 1 injects its own resolver, so it proves
// the driver CONSULTS whatever it was handed; arm 2 calls `resolveEvidenceErrors` directly, so it proves
// the reader BEHAVES. Neither touches the binding between them, and measured 2026-09-13 that gap is real:
// cutting the default at `attest.ts:226` to `() => new Map()` left the whole `tests/tooling/doc-catalog`
// directory green while `pnpm doc-catalog:attest` silently stopped refusing moved evidence — the same
// hole one layer down from the one this file was written to close (#2238, refuted by v-wave-9a).
//
// SO THIS ARM CALLS `runAttest` WITH ONE ARGUMENT. Its subject is a real catalogued row that the DEFAULT
// reader reports an evidence error for TODAY, taken from the reader itself rather than hand-pinned, and
// the assertion is the refusal sentence that exists ONLY on the evidence path (`attest.ts:90`) plus the
// reader's own message. Under an empty-map default the row still refuses for its ROW reasons and that
// sentence disappears, which is exactly the discrimination the two arms above cannot make.
//
// READ-ONLY, AND THAT IS A LIMIT, NOT A CHOICE. `tree.ts:26` is `export const root = REPO_ROOT`, derived
// from `import.meta.dirname` (`_shared/artifacts.ts:17`), so `runAttest` has no isolated corpus: every
// read AND the write at `attest.ts:248` are bound to this checkout. The success/write half of the driver
// is therefore owed to a lane that threads a root through `ops/tree.ts`; a suite must not mint it by
// mutating the tracked receipts. What IS provable here is the refusal path — and a refusal writes
// nothing, which the byte-identical corpus below asserts as a disk fact.

/** The rows the reader is asked about per pass. It is a COST fence, not a semantic one: the reader's
 *  sources are selection-independent and its answer is per row, so a batched scan and a whole-corpus call
 *  agree — measured 2026-09-13 at ~550ms of sources plus ~30ms per row, which is 28s over the whole
 *  corpus and ~9s to the first refusing row. */
const SUBJECT_SCAN_BATCH = 64;

/** A catalogued row the DEFAULT reader objects to, WITH the objection it made — the subject is taken from
 *  the production reader rather than hand-pinned, so it cannot rot into a path that stopped refusing. */
function refusedByTheDefaultReader(
  rows: readonly string[],
  docs: readonly Doc[],
  receipts: readonly Receipt[],
): { readonly subject: string; readonly reason: string } {
  for (let start = 0; start < rows.length; start += SUBJECT_SCAN_BATCH) {
    const batch = rows.slice(start, start + SUBJECT_SCAN_BATCH);
    const errors = resolveEvidenceErrors(batch, docs, receipts);
    const subject = batch.find((path) => (errors.get(path) ?? []).length > 0);
    if (subject !== undefined) {
      return { subject, reason: errors.get(subject)?.[0] ?? "" };
    }
  }
  // A corpus with no such row cannot host this arm — a loud refusal, never a silent pass: the arm would
  // otherwise assert a difference it can no longer produce and go green for the wrong reason.
  throw new Error(
    "attest.int: no catalogued row's evidence is refused by the default reader today, so the DEFAULT cannot be told from an empty map through behaviour — re-point this arm at a row the reader objects to (or at the write half, once ops/tree.ts takes a root)",
  );
}

test("the DEFAULT resolver is the one production uses: runAttest with ONE argument refuses on the reader's own evidence error, and writes nothing", {
  timeout: scaledBudget(180_000),
}, () => {
  const docs = documents();
  const receipts = loadReceipts(laneConfig());
  const catalogued = new Set(docs.map((doc) => doc.path));
  const rows = receipts
    .flatMap((receipt) => receipt.entries.map((entry) => entry.path))
    .filter((path) => catalogued.has(path))
    .toSorted((left, right) => left.localeCompare(right));
  const { subject, reason } = refusedByTheDefaultReader(rows, docs, receipts);
  const before = receiptBytes();
  expect(before.size).toBeGreaterThan(0);

  const warnings: string[] = [];
  const release = installOutputSink({ line: () => undefined, warn: (message) => warnings.push(message) });
  let code: number;
  try {
    // ONE ARGUMENT. The default parameter IS the subject of this arm.
    code = runAttest([subject]);
  } finally {
    release();
  }

  expect(code).toBe(EXIT.violations);
  // The evidence sentence exists on no other refusal path in the verb, and the reader's own message rides
  // inside it — an empty-map default keeps the row's OTHER refusals and drops exactly these two strings.
  expect(warnings.join("\n"), `the default reader's verdict on ${subject} must reach the plan`).toContain(
    "the row's evidence no longer resolves, so re-attesting would land a receipt that reds at check:doc-catalog",
  );
  expect(warnings.join("\n")).toContain(reason);
  expect(warnings.join("\n")).toContain("NOTHING WRITTEN");
  // …and NOTHING WRITTEN is a disk fact, not a plan fact.
  expect(receiptBytes()).toEqual(before);
});
