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

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../../../../tooling/src/_shared/artifacts.ts";
import { EXIT } from "../../../../tooling/src/_shared/exit-contract.ts";
import { installOutputSink } from "../../../../tooling/src/_shared/log.ts";
import type { AttestEvidenceResolver, LaneConfig, Receipt } from "../../../../tooling/src/doc-catalog/index.ts";
import { documents, loadReceipts, resolveEvidenceErrors, runAttest, runAttestAtRoot } from "../../../../tooling/src/doc-catalog/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

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
// `cli.ts` calls `runAttest(paths)` with ONE argument. The isolated-root factory below is also the exact
// lexical owner of production's exported `runAttest`; only its root differs. That makes a controlled Git
// tree prove both sides of the default reader binding without depending on a defect in the live corpus.

const FIXTURE_DOC = "docs/design/subject.md";
const FIXTURE_RECEIPT = "docs/catalog/receipts/design.json";
const FIXTURE_CODE = "packages/example/src/value.ts";
const FIXTURE_REGISTRY = "docs/architecture/core/Core-Path-Registry.md";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function isolatedAttestationRoot(scratch: string, brokenEvidence: boolean): { readonly root: string; readonly originalReceipt: string } {
  const fixtureRoot = join(scratch, brokenEvidence ? "broken" : "healthy");
  for (const path of ["docs/design", "docs/catalog/receipts", "docs/architecture/core", "packages/example/src"]) {
    mkdirSync(join(fixtureRoot, path), { recursive: true });
  }
  writeFileSync(
    join(fixtureRoot, "docs/catalog/lanes.json"),
    `${JSON.stringify({ schemaVersion: 1, lanes: [{ id: "design", issue: 5, patterns: ["docs/design/**/*.md"] }] }, null, 2)}\n`,
  );
  writeFileSync(join(fixtureRoot, FIXTURE_REGISTRY), "---\nkind: law\nstatus: active\nupdated: 2026-09-13\n---\n\n# Decisions\n");
  writeFileSync(join(fixtureRoot, FIXTURE_CODE), "export const value = 1;\n");
  const oldDocument = "---\nkind: design\nstatus: active\nupdated: 2026-09-13\n---\n\n# Subject\n\nBefore.\n";
  writeFileSync(join(fixtureRoot, FIXTURE_DOC), oldDocument);
  git(fixtureRoot, ["init", "-q"]);
  git(fixtureRoot, ["config", "user.email", "fixture@example.invalid"]);
  git(fixtureRoot, ["config", "user.name", "Fixture"]);
  git(fixtureRoot, ["add", "."]);
  git(fixtureRoot, ["commit", "-qm", "fixture base"]);
  const oldCommit = git(fixtureRoot, ["rev-parse", "HEAD"]);
  const originalReceipt = `${JSON.stringify(
    {
      schemaVersion: 1,
      lane: "design",
      issue: 5,
      entries: [
        {
          path: FIXTURE_DOC,
          assignedSha256: sha256(oldDocument),
          disposition: "current",
          authority: "design",
          fullRead: true,
          verifiedSha256: sha256(oldDocument),
          verifiedCommit: oldCommit,
          verifiedAt: "2026-09-12",
          evidence: ["fixture review"],
          claims: [{ claim: "the example exists", evidence: [{ kind: "code", target: `${FIXTURE_CODE}:1` }] }],
          summary: "controlled attestation fixture",
        },
      ],
    },
    null,
    2,
  )}\n`;
  writeFileSync(join(fixtureRoot, FIXTURE_RECEIPT), originalReceipt);
  git(fixtureRoot, ["add", FIXTURE_RECEIPT]);
  git(fixtureRoot, ["commit", "-qm", "add receipt"]);
  writeFileSync(join(fixtureRoot, FIXTURE_DOC), `${oldDocument}\nAfter.\n`);
  git(fixtureRoot, ["add", FIXTURE_DOC]);
  if (brokenEvidence) {
    rmSync(join(fixtureRoot, FIXTURE_CODE));
  }
  return { root: fixtureRoot, originalReceipt };
}

test("production's DEFAULT resolver binding refuses invalid evidence without writing and writes the healthy twin", ({ scratch }) => {
  const broken = isolatedAttestationRoot(scratch, true);
  const healthy = isolatedAttestationRoot(scratch, false);
  const warnings: string[] = [];
  const lines: string[] = [];
  const release = installOutputSink({ line: (message) => lines.push(message), warn: (message) => warnings.push(message) });
  try {
    expect(runAttestAtRoot(broken.root)([FIXTURE_DOC])).toBe(EXIT.violations);
    expect(warnings.join("\n")).toContain("the row's evidence no longer resolves");
    expect(warnings.join("\n")).toContain(`code evidence target does not resolve: ${FIXTURE_CODE}:1`);
    expect(readFileSync(join(broken.root, FIXTURE_RECEIPT), "utf8")).toBe(broken.originalReceipt);

    expect(runAttestAtRoot(healthy.root)([FIXTURE_DOC])).toBe(EXIT.clean);
    const written = JSON.parse(readFileSync(join(healthy.root, FIXTURE_RECEIPT), "utf8")) as Receipt;
    expect(written.entries[0]?.verifiedSha256).toBe(sha256(readFileSync(join(healthy.root, FIXTURE_DOC), "utf8")));
    expect(written.entries[0]?.verifiedCommit).toBe(git(healthy.root, ["rev-parse", "HEAD"]));
    expect(lines.join("\n")).toContain(`re-attested ${FIXTURE_DOC}`);
  } finally {
    release();
  }
});
