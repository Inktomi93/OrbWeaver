// @instrument-proof: every completed Snap run after slot open creates one immutable versioned run index,
// prints a bounded receipt card, and can be read browser-free by absolute path, exact id, or local latest.
// Corrupt/missing/ambiguous evidence refuses rather than becoming a false-clean summary.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { InstrumentArtifactMetadata } from "@orb/tooling/_shared/artifact-out";
import { beginInstrumentRun, finishInstrumentRun, registerInstrumentArtifact } from "@orb/tooling/_shared/artifact-out";
import type { BrowserDiagnostic } from "@orb/tooling/_shared/browser-diagnostics";
import { summarizeOrbConsoleCompleteness } from "@orb/tooling/_shared/browser-diagnostics";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { BOX_LOAD_ENV } from "@orb/tooling/_shared/load-budget";
import { installOutputSink } from "@orb/tooling/_shared/log";
import { vi } from "vitest";
import type { InstrumentEvidenceScope } from "../../../../tooling/src/_shared/artifact-scope.ts";
import { aggregateScope, artifactRef, exactScope, factBatchId, scopeMatches } from "../../../../tooling/src/_shared/artifact-scope.ts";
import { FILMSTRIP_LIMITS } from "../../../../tooling/src/snap/contract/filmstrip.ts";
import { snapArmFact } from "../../../../tooling/src/snap/contract/run-facts.ts";
import type { SnapRunArtifact } from "../../../../tooling/src/snap/contract/run-index.ts";
import type { Args } from "../../../../tooling/src/snap/contract/types.ts";
import { redactBrowserDiagnostics } from "../../../../tooling/src/snap/lib/browser-evidence-redaction.ts";
import { FilmstripBuffer } from "../../../../tooling/src/snap/lib/filmstrip-buffer.ts";
import { collectSnapRunArtifacts, snapDirtyIdentity, snapGitIdentity } from "../../../../tooling/src/snap/lib/run-bundle-files.ts";
import { readSnapAnalyzerProblems } from "../../../../tooling/src/snap/lib/run-report-problems.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import {
  completeSnapRun,
  readSnapDiagnosticArtifact,
  registerSnapDiagnosticCompleteness,
  registerSnapFactBatch,
  registerSnapResultPairs,
  registerSnapSessionProvenance,
  writeSnapDiagnosticEvidence,
} from "../../../../tooling/src/snap/ops/run-bundle.ts";
import { listSnapRunIndices, printSnapReports, resolveSnapRunIndex } from "../../../../tooling/src/snap/ops/run-report.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(120_000);
const RUN_LANE_ENV = "ORB_RUN_LANE";
const RUN_AGENT_ENV = "ORB_RUN_AGENT";
/** The planted quiet-box reading this file drives the CLI under (#1651). */
const QUIET_BOX = "0.2/24";
const PLANTED_STARTED_AT = "2026-09-03T12:00:00.000Z";
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

interface RunIndex {
  readonly v: number;
  readonly identity: {
    readonly runId: string;
    readonly checkout: string;
    readonly root: string;
    readonly indexPath: string;
    readonly slotPath: string;
    readonly checkouts: {
      readonly primary: { readonly name: string; readonly path: string; readonly rootRelativePath: string };
      readonly subject: { readonly kind: string; readonly name: string; readonly path: string; readonly rootRelativePath: string };
    };
    readonly sha: string;
    readonly dirty: { readonly state: string; readonly digest: string | null };
    readonly gitFailures?: readonly { readonly field: string; readonly detail: string }[];
  };
  readonly process: { readonly argv: readonly string[]; readonly finishedAt: string; readonly lane: string | null; readonly agent: string | null };
  readonly provenance: {
    readonly session: string | null;
    readonly sessionCall: number | null;
    readonly evidenceWindow: number | null;
    readonly sessionBinding: { readonly kind: string; readonly url: string } | null;
    readonly stage:
      | string
      | {
          readonly mode: string;
          readonly state: string;
          readonly ownerCheckout: string | null;
          readonly band: number | null;
          readonly ref: string | null;
          readonly binding: { readonly kind: string; readonly url: string } | null;
          readonly failure: string | null;
        };
    readonly concurrency: readonly string[];
  };
  readonly verdict: {
    readonly exit: number;
    readonly state: string;
    readonly arms: readonly {
      readonly arm: string;
      readonly state: string;
      readonly source: string;
      readonly lifetime: string;
      readonly detail: string | null;
    }[];
  };
  readonly resultPairs: readonly (readonly [string, string])[];
  readonly results?: {
    readonly batches: readonly {
      readonly arms: readonly {
        readonly arm: string;
        readonly artifacts: readonly string[];
        readonly data: { readonly state: string };
      }[];
    }[];
  };
  readonly diagnostics: {
    readonly state: string;
    readonly totals: { readonly dropped: number; readonly complete: boolean } | null;
    readonly records: { readonly total: number; readonly limitEvents: number; readonly complete: boolean };
    readonly recordArtifacts: readonly string[];
    readonly rawChannels?: readonly { readonly channel: string; readonly artifact: string; readonly records: number | null; readonly complete: boolean }[];
  };
  readonly artifacts: readonly {
    readonly path: string;
    readonly relativePath: string;
    readonly bytes: number;
    readonly producer: string;
    readonly producerArm?: string | null;
    readonly channel?: string;
    readonly mediaType?: string;
    readonly role: string;
    readonly completeness: string;
    readonly completenessDetail?: string;
    readonly scope: InstrumentEvidenceScope;
    readonly records?: number | null;
    readonly limits?: readonly { readonly source: string; readonly complete: boolean; readonly events: readonly unknown[] }[];
    readonly declaration?: string;
  }[];
  readonly findings: readonly {
    readonly severity: string;
    readonly arms: readonly string[];
    readonly channels: readonly string[];
    readonly what: string;
    readonly where: string;
    readonly evidence: readonly {
      readonly source: string;
      readonly artifact: string;
      readonly scope: InstrumentEvidenceScope;
    }[];
    readonly confidence: string;
    readonly completeness: string;
    readonly conflicts: readonly string[];
    readonly occurrences: number;
    /** WHETHER THE ROW VOTED (#1385 item 4) — and the field the #1616 load-suspect annotation is read by:
     *  `counted: false` with `reason: "load-suspect"` is a measured number nothing may promote. */
    readonly disposition: { readonly counted: boolean; readonly reason: string };
    readonly next: string;
  }[];
}

const DECLARED_JSON: InstrumentArtifactMetadata = {
  producer: "snap",
  producerArm: null,
  channel: "test-evidence",
  mediaType: "application/json",
  schema: "test-v1",
  role: "primary",
  completeness: "complete",
  completenessDetail: "complete planted test population",
  scope: aggregateScope(),
  records: 1,
  limits: [],
};

async function declareTestArtifact(kind: string, path: string, overrides: Partial<InstrumentArtifactMetadata> = {}): Promise<void> {
  await registerInstrumentArtifact(kind, path, { ...DECLARED_JSON, ...overrides });
}

function indexPath(stdout: string): string {
  const match = /\bindex=(\/\S+\/run\.json)\b/u.exec(stdout)?.[1];
  if (match === undefined) {
    throw new Error(`Snap did not print an immutable run index: ${stdout}`);
  }
  return match;
}

function git(root: string, args: readonly string[]): void {
  execFixtureGit(root, args);
}

/** The checkout identity this suite is RUNNING in, derived independently of the code under test (#1333):
 *  `git worktree list --porcelain` names the PRIMARY checkout first, where run-bundle-files.ts derives the
 *  same fact from `--git-common-dir`. Hard-coding `kind: "primary"` made the round-trip case red inside
 *  every lane worktree — the identity was correct on both sides, only the premise was. */
function runningCheckout(root: string): { readonly primaryPath: string; readonly kind: "primary" | "linked" } {
  const output = execFixtureGit(root, ["worktree", "list", "--porcelain"]);
  const primaryPath = /^worktree (.+)$/mu.exec(output)?.[1];
  if (primaryPath === undefined) {
    throw new Error(`git worktree list named no primary checkout: ${output}`);
  }
  return { primaryPath, kind: resolve(primaryPath) === resolve(root) ? "primary" : "linked" };
}

async function initializeRepository(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  git(root, ["init", "-b", "main"]);
  await writeFile(join(root, ".gitignore"), "reports/\n");
  await writeFile(join(root, "same.txt"), "baseline\n");
  git(root, ["add", ".gitignore", "same.txt"]);
  git(root, ["-c", "user.name=Snap Test", "-c", "user.email=snap@example.invalid", "commit", "-m", "seed"]);
}

function analyzerProblem(index: number): Readonly<Record<string, string>> {
  if (index === 24) {
    return {
      arm: "interaction-perf",
      kind: "evidence-gap",
      metric: "measurement-evidence",
      subject: "late high-severity row",
      observed: "absent",
      threshold: "required",
      detail: "planted highest-severity problem beyond the source-order display cap",
    };
  }
  return {
    arm: "interaction-perf",
    kind: "threshold",
    metric: "click-duration-ms",
    subject: `click #target-${String(index)}`,
    observed: `${String(101 + index)}ms`,
    threshold: "100ms",
    detail: `planted actionable problem ${String(index)}`,
  };
}

async function openSlot(
  root: string,
  runId: string,
  racing: readonly string[] = [],
): Promise<{ readonly dir: string; readonly completion: Parameters<typeof completeSnapRun>[0] }> {
  const dir = join(root, "reports", "runs", "snap", runId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, ".inflight"), `${JSON.stringify({ startedAt: PLANTED_STARTED_AT })}\n`);
  return {
    dir,
    completion: { slot: { instrument: "snap", runId, dir, relDir: join("reports", "runs", "snap", runId), racing }, root, exit: EXIT.clean, error: null },
  };
}

/** The ROW THAT MENTIONS AN ARM (#1566). Every other planted diagnostic is prose the attribution parser
 *  ignores, which is exactly why this suite could not reach the dedup regression: with no arm-attributed
 *  console draft in the fixture, the pre-fix `described` set had nothing to sweep in and the population
 *  never moved. This one carries the client logger's fixed `%c<time> [tag]%c` grammar over `console-api`,
 *  and `[css]` attributes to **dead-css** — an arm this run REFUSES and which no analyzer describes, so
 *  the pre-fix dedup deletes its problem row and the post-fix one does not. `motion` would prove nothing:
 *  it already has its own producer row and is deduped in BOTH versions. */
const ARM_ATTRIBUTED_INDEX = 21;
const ARM_ATTRIBUTED_TEXT = "%c10:54:43.115 [css]%c 3 dead token(s) on the settled surface color:#c60;font-weight:bold color:#888";

function diagnostic(index: number): BrowserDiagnostic {
  const error = index >= 22;
  const attributed = index === ARM_ATTRIBUTED_INDEX;
  const plainSource = error ? "uncaught" : "console";
  const plainText = error ? `planted-last-error-${String(index)}` : `planted-warning-${String(index)}`;
  return {
    origin: "orb-console-ring",
    source: attributed ? "console-api" : plainSource,
    level: error ? "error" : "warning",
    category: error ? "exception" : "deprecation",
    text: attributed ? ARM_ATTRIBUTED_TEXT : plainText,
    timestamp: index,
    location: null,
    stack: null,
    requestId: null,
    issueCode: null,
    details: null,
    backendNodeId: null,
    contextIndex: 1,
    pageIndex: 2,
    evidenceWindow: 3,
    raw: null,
  };
}

test("a completed run writes a self-consistent index and its receipt READ command round-trips browser-free", async ({ repoRoot, runCli, scratch }) => {
  const file = join(scratch, "bundle.html");
  await writeFile(file, '<!doctype html><html data-app-ready="settled"><body><main><button id="x">x</button></main></body></html>');
  const argv = ["--file", file, "--aria", "--map", "--json", "--no-deadcss", "--no-failure-evidence"];
  // A LANE NAME UNIQUE TO THIS RUN (#1744). The listing below asks the reader to find THIS run, and
  // `--reports` shows the newest 20 across EVERY registered worktree of the repo — measured on this box:
  // 302 slots in one lane's checkout alone, `RUNS OMITTED valid=3761 total=3781` on main. A fixed lane
  // name is not enough either (a sibling worktree running this same file mints one too), so the lane
  // carries the scratch dir's mkdtemp suffix: one run, one lane, `matched=1`.
  const lane = `bundle-lane-${basename(scratch)}`;
  // A PLANTED QUIET BOX (#1651). Every rate arm is labelled `load-suspect` above per-core loadavg 1.0
  // (≥ 24 on this 16c/24t box) and the run then carries a run-global `annotation` finding — correct
  // behaviour, and it made the "no findings" assertion below a reading of the HOST rather than of snap
  // (green quiet, red at loadavg 34: v-K8's receipt). The instrument under test is a CHILD PROCESS, so the
  // in-process `BoxLoadReader` seam cannot reach it; `ORB_BOX_LOAD` is the same injection through the env,
  // and a receipt taken under it stamps `load=…(planted)` so no run can pretend to be quiet silently.
  const run = await runCli("snap", argv, {
    timeoutMs: CLI_TIMEOUT_MS,
    env: { [RUN_LANE_ENV]: lane, [RUN_AGENT_ENV]: "bundle-agent", [BOX_LOAD_ENV]: QUIET_BOX },
  });
  const path = indexPath(run.stdout);
  const index = JSON.parse(await readFile(path, "utf8")) as RunIndex;
  expect(index.v).toBe(1);
  expect(path).toContain(index.identity.runId);
  expect(index.identity.root).toBe(repoRoot);
  const checkout = runningCheckout(repoRoot);
  expect(index.identity).toMatchObject({
    indexPath: path,
    slotPath: path.slice(0, -"/run.json".length),
    checkouts: { primary: { path: checkout.primaryPath }, subject: { kind: checkout.kind, path: repoRoot } },
  });
  expect(index.identity.sha).toMatch(/^[0-9a-f]{40}$/u);
  expect(index.identity.dirty.digest).not.toBe("");
  expect(index.process.argv).toEqual(argv);
  expect(index.artifacts.length).toBeGreaterThan(0);
  expect(index.artifacts.every((artifact) => artifact.path.startsWith(path.slice(0, -"run.json".length)) && artifact.bytes > 0)).toBe(true);
  expect(index.artifacts.some((artifact) => artifact.relativePath.endsWith(".png") && artifact.role === "primary")).toBe(true);
  expect(index.artifacts.every((artifact) => artifact.declaration === "declared" && artifact.channel !== undefined && artifact.mediaType !== undefined)).toBe(
    true,
  );
  const captureManifest = index.artifacts.find((artifact) => artifact.relativePath.startsWith("snaps/") && artifact.relativePath.endsWith(".json"));
  expect(captureManifest).toMatchObject({
    producer: "snap",
    producerArm: null,
    channel: "capture-manifest",
    completeness: "complete",
    completenessDetail: expect.stringContaining("capture manifest"),
  });
  const armFacts = index.results?.batches.flatMap((batch) => batch.arms) ?? [];
  // Since #1342 every page arm FILES what it prints: the aria and map facts bind their own evidence file
  // (evidence/aria.json, evidence/map.json) beside the shared capture manifest — bound by producerArm,
  // never handed in. An arm fact whose artifacts list is only the manifest would mean the writer is gone.
  expect(armFacts.find((fact) => fact.arm === "aria")?.artifacts).toEqual(["evidence/aria.json", captureManifest?.relativePath]);
  expect(armFacts.find((fact) => fact.arm === "map")?.artifacts).toEqual(["evidence/map.json", captureManifest?.relativePath]);
  const coreArtifact = index.artifacts.find((artifact) => artifact.relativePath === "evidence/core-capture.json");
  expect(coreArtifact).toMatchObject({ completeness: "bounded", completenessDetail: expect.stringContaining("latest-per-URL") });
  const core = JSON.parse(await readFile(coreArtifact?.path ?? "missing-core-capture", "utf8")) as {
    readonly populations: {
      readonly pageErrors: Readonly<Record<string, unknown>>;
      readonly failedRequests: Readonly<Record<string, unknown>>;
      readonly captures: Readonly<Record<string, unknown>>;
    };
  };
  expect(core.populations).toEqual({
    pageErrors: { records: 0, dropped: 0, complete: true, basis: "all-observed" },
    failedRequests: { records: 0, dropped: null, complete: false, basis: "latest-per-url" },
    captures: { records: 1, dropped: 0, complete: true, basis: "all-pages" },
  });
  // …and the quiet plant is VISIBLE on the receipt, so this green can never be a run that was quiet only
  // because someone exported the knob.
  expect(index.resultPairs.find(([key]) => key === "load")?.[1]).toContain("(planted)");
  expect(index.resultPairs.some(([key]) => key === "load-suspect")).toBe(false);
  expect(index.findings).toEqual([]);
  expect(index.resultPairs.filter(([key]) => key === "motion-evidence" || key === "motion")).toEqual([
    ["motion-evidence", "live"],
    ["motion", "off"],
  ]);
  expect(index.verdict.arms.some((arm) => arm.arm === "motion")).toBe(false);
  expect(run.stdout).toContain(`EVIDENCE   ${path}`);
  expect(run.stdout).toContain(`READ       pnpm snap --report ${path} --problems`);
  expect(run.stdout.trimEnd().split("\n").at(-1)).toContain(`index=${path}`);
  expect(run.stdout).not.toMatch(/\bdirty=|\bdigest=/u);

  const reader = await runCli("snap", ["--report", path, "--all"]);
  await expect(reader).toExitWith(EXIT.clean);
  expect(reader.stdout).toContain(index.identity.runId);
  expect(reader.stdout).toContain(index.artifacts[0]?.path ?? "missing-artifact");
  expect(reader.stdout).toContain(`source=${index.identity.dirty.state === "dirty" ? "working-tree" : index.identity.dirty.state}`);
  expect(reader.stdout).toContain(`digest=${index.identity.dirty.digest}`);
  expect(reader.stdout).not.toContain("dirty=");
  expect(reader.stdout).not.toContain("run slot");

  const problems = await runCli("snap", ["--report", path, "--problems"]);
  await expect(problems).toExitWith(EXIT.clean);
  expect(problems.stdout).not.toMatch(/\bsource=(?:clean|working-tree|unknown)\b|\bdigest=/u);

  for (const arm of ["aria", "map"] as const) {
    const armReport = await runCli("snap", ["--report", path, "--problems", "--arm", arm]);
    await expect(armReport).toExitWith(EXIT.clean);
    expect(armReport.stdout).toContain(`arm=${arm}`);
    expect(armReport.stdout).toContain(`ARTIFACT     ${captureManifest?.path}`);
    expect(armReport.stdout).toContain("channel=capture-manifest");
    expect(armReport.stdout).toContain(
      `DIAGNOSTICS  unrelated-to-arm=${arm} rows=${String(index.diagnostics.records.total)}; inspect pnpm snap --report ${path} --problems --channel browser-diagnostics`,
    );
    expect(armReport.stdout).not.toMatch(/^DIAGNOSTIC\s+\[/gmu);
  }

  // NARROWED BY LANE, NEVER BY "THE NEWEST N" (#1744): an unfiltered `--reports` shows the newest 20 runs
  // of every registered worktree, so this row's presence was really a claim about how many snap children
  // the rest of the battery happened to finish in between — green alone, red under co-scheduling. The
  // filter is the product's own answer (the omission line advertises it), and `matched=1 of N` proves the
  // window contains exactly this run rather than a lucky ordering.
  const listing = await runCli("snap", ["--reports", "--lane", lane]);
  await expect(listing).toExitWith(EXIT.clean);
  expect(listing.stdout).toContain(`RUN ${index.identity.runId} checkout=${index.identity.checkout}`);
  expect(listing.stdout).toMatch(new RegExp(`^RUNS FILTERED lane=${lane} matched=1 of \\d+ valid run\\(s\\)$`, "mu"));
  expect(listing.stdout).not.toContain("RUNS OMITTED");
  expect(listing.stdout).not.toMatch(/\bdirty=|\bdigest=|\bsource=(?:clean|working-tree|unknown)\b/u);
  expect(listing.stdout).not.toContain("RUN INDEX REFUSED");
  expect(listing.stdout).not.toContain("run slot");
});

test("a MIS-SPELLED planted box knob is MISUSE (exit 3), one line, no stack trace (#1666)", async ({ runCli, scratch }) => {
  // The knob is read lazily by whichever module first needs a budget — for several instruments that is the
  // IMPORT GRAPH, before `runTool` installs its handlers — so the first cut's throw surfaced as node's own
  // crash: a raw stack trace and exit 1, which under the house contract (0 clean · 1 violations · 2 tool
  // error · 3 misuse) reads as "violations found". A mis-spelled dev knob is argv-class MISUSE.
  const file = join(scratch, "knob.html");
  await writeFile(file, '<!doctype html><html data-app-ready="settled"><body><main>x</main></body></html>');
  const run = await runCli("snap", ["--file", file, "--json", "--no-deadcss", "--no-failure-evidence"], {
    timeoutMs: CLI_TIMEOUT_MS,
    env: { [BOX_LOAD_ENV]: "not-a-reading" },
  });

  await expect(run).toExitWith(EXIT.misuse);
  expect(run.stderr).toContain(`ARG ERROR    ${BOX_LOAD_ENV}="not-a-reading" is not a planted box reading`);
  expect(run.stderr).toContain('spell it "<loadavg1>/<cpuCount>"');
  // ONE LINE: no stack frames, and no TOOL ERROR banner (that banner is the exit-2 crash path).
  expect(run.stderr.trimEnd().split("\n")).toHaveLength(1);
  expect(run.stderr).not.toContain("TOOL ERROR");
  expect(run.stderr).not.toMatch(/\bat .*load-budget\.ts:\d+/u);
});

test("THE INVERSE: a load-suspect arm annotates the same clean run — one uncounted row, and still exit 0 (#1651)", async ({ runCli, scratch }) => {
  // This is the STRUCTURAL half of the rate contract: a producer that measured under load has already
  // decided `load-suspect`; the bundle must retain that fact without promoting it. Hardware capability is
  // judged separately by rate-posture and must not be fabricated merely to reach this index/reader path.
  const root = join(scratch, "loaded-fact-repo");
  await initializeRepository(root);
  const slot = await openSlot(root, "loaded-fact");
  registerSnapFactBatch({
    id: factBatchId("loaded-fact"),
    core: [],
    arms: [
      snapArmFact({
        arm: "app-snapshot",
        schema: "snap-arm-app-snapshot-v1",
        source: "window.__orb.snap() + Navigation Timing",
        lifetime: "settled page capture",
        scope: aggregateScope(),
        artifacts: [],
        data: { state: "load-suspect", detail: "load-suspect: planted loaded-box reading", snapshots: 1, unavailable: 0 },
      }),
    ],
  });
  registerSnapResultPairs([
    ["app-snapshot", "load-suspect"],
    ["load-suspect", "app-snapshot"],
    ["load", "96.0/24(planted)"],
  ]);
  const path = await completeSnapRun(slot.completion, parseSnapArgs(["--no-shot", "--no-deadcss"]), [
    "snap",
    "--file",
    "loaded.html",
    "--no-shot",
    "--no-deadcss",
  ]);
  const index = JSON.parse(await readFile(path, "utf8")) as RunIndex;

  const annotations = index.findings.filter((finding) => finding.severity === "annotation");
  expect(annotations).toHaveLength(1);
  expect(annotations[0]).toMatchObject({
    arms: ["app-snapshot"],
    completeness: "incomplete",
    disposition: { counted: false, reason: "load-suspect" },
  });
  expect(annotations[0]?.what).toContain("load-suspect");
  // …and the run LINE says the same thing, so a reader who never opens run.json still knows.
  expect(index.resultPairs).toContainEqual(["load-suspect", "app-snapshot"]);
  expect(index.resultPairs.find(([key]) => key === "load")?.[1]).toBe("96.0/24(planted)");
  expect(index.resultPairs.find(([key]) => key === "app-snapshot")?.[1]).toBe("load-suspect");
  // The label is the ONLY difference: nothing failed, nothing refused.
  expect(index.findings.filter((finding) => finding.severity !== "annotation")).toEqual([]);
  const report = await runCli("snap", ["--report", path, "--problems"]);
  await expect(report).toExitWith(EXIT.clean);
  expect(report.stdout).toContain("FINDING      annotation | load-suspect: planted loaded-box reading");
});

test("same-SHA worktrees retain checkout and byte-sensitive dirty identity; exact-id ambiguity and local latest refuse guessing", async ({
  runCli,
  scratch,
}) => {
  const root = join(scratch, "repo");
  const linked = join(scratch, "linked");
  await initializeRepository(root);
  git(root, ["worktree", "add", "-b", "linked", linked]);
  await writeFile(join(root, "same.txt"), "dirty-main\n");
  await writeFile(join(linked, "same.txt"), "dirty-linked\n");

  const mainSlot = await openSlot(root, "collision", ["sibling-live"]);
  registerSnapResultPairs([["app-snapshot", "measured"]]);
  const mainPath = await completeSnapRun(mainSlot.completion, parseSnapArgs([]), ["snap"]);
  const linkedSlot = await openSlot(linked, "collision");
  registerSnapResultPairs([["app-snapshot", "measured"]]);
  const linkedPath = await completeSnapRun(linkedSlot.completion, parseSnapArgs([]), ["snap"]);
  const main = JSON.parse(await readFile(mainPath, "utf8")) as RunIndex;
  const sibling = JSON.parse(await readFile(linkedPath, "utf8")) as RunIndex;

  expect(main.identity.sha).toBe(sibling.identity.sha);
  expect(main.identity.root).toBe(root);
  expect(sibling.identity.root).toBe(linked);
  expect(main.identity.checkouts).toMatchObject({ primary: { path: root }, subject: { kind: "primary", path: root } });
  expect(sibling.identity.checkouts).toMatchObject({ primary: { path: root }, subject: { kind: "linked", path: linked } });
  expect(main.identity.dirty.digest).not.toBe(sibling.identity.dirty.digest);
  expect(main.provenance.concurrency).toEqual(["sibling-live"]);
  await expect(resolveSnapRunIndex(root, "collision")).rejects.toThrow("ambiguous across worktrees");
  expect(await resolveSnapRunIndex(root, "latest")).toBe(mainPath);
  await expect(resolveSnapRunIndex(root, "missing-id")).rejects.toThrow("was not found in any registered worktree");

  const decoy = join(root, "reports", "archive", "snap", "decoy", "run.json");
  await mkdir(join(root, "reports", "archive", "snap", "decoy"), { recursive: true });
  await writeFile(decoy, await readFile(mainPath));
  await expect(resolveSnapRunIndex(root, "decoy")).rejects.toThrow("was not found in any registered worktree");

  const uniqueSlot = await openSlot(root, "unique-main");
  registerSnapResultPairs([["app-snapshot", "measured"]]);
  const uniquePath = await completeSnapRun(uniqueSlot.completion, parseSnapArgs([]), ["snap"]);
  expect(await resolveSnapRunIndex(root, "unique-main")).toBe(uniquePath);
  expect(await resolveSnapRunIndex(root, "latest")).toBe(uniquePath);
  const activeSlot = await openSlot(root, "active-inflight");
  expect(await resolveSnapRunIndex(root, "latest")).toBe(uniquePath);
  const activeRead = await runCli("snap", ["--report", join(activeSlot.dir, "run.json"), "--problems"]);
  await expect(activeRead).toExitWith(EXIT.toolError);
  expect(activeRead.stdout).toContain("RUN INDEX REFUSED");
  expect(activeRead.stdout).toContain("missing or corrupt");
  const absentSlot = await openSlot(root, "static-absent");
  registerSnapResultPairs([["app-snapshot", "absent"]]);
  const absentPath = await completeSnapRun(absentSlot.completion, parseSnapArgs([]), ["snap", "--file", "static.html"]);
  const absent = JSON.parse(await readFile(absentPath, "utf8")) as RunIndex;
  expect(absent.verdict.arms.find((arm) => arm.arm === "app-snapshot")).toMatchObject({
    state: "refused",
    detail: "enabled arm emitted no typed fact",
  });
  const listed = await listSnapRunIndices(root);
  expect(
    listed
      .filter((row) => row.identity.runId === "collision")
      .map((row) => row.identity.checkout)
      .toSorted(),
  ).toEqual(["linked", "main"]);
  expect(listed.find((row) => row.identity.runId === "unique-main")).toMatchObject({ identity: { root }, verdict: { state: "passed" } });

  for (let index = 0; index < 23; index += 1) {
    const runId = `history-${String(index).padStart(2, "0")}`;
    const runDir = join(root, "reports", "runs", "snap", runId);
    await mkdir(runDir, { recursive: true });
    await writeFile(
      join(runDir, "run.json"),
      `${JSON.stringify({
        ...main,
        identity: { ...main.identity, runId, indexPath: join(runDir, "run.json"), slotPath: runDir },
        process: {
          ...main.process,
          finishedAt: new Date(Date.parse("2099-01-01T00:00:00.000Z") + index * 1000).toISOString(),
        },
      })}\n`,
    );
  }

  for (let index = 0; index < 5; index += 1) {
    const invalidDir = join(root, "reports", "runs", "snap", `invalid-${String(index)}`);
    await mkdir(invalidDir, { recursive: true });
    await writeFile(join(invalidDir, "run.json"), "{not-json");
  }
  const lines: string[] = [];
  const release = installOutputSink({ line: (line) => lines.push(line), warn: () => undefined });
  try {
    expect(await printSnapReports(root)).toBe(EXIT.clean);
  } finally {
    release();
  }
  const runLines = lines.filter((line) => /^RUN \S+ checkout=/u.test(line));
  expect(runLines).toHaveLength(20);
  expect(runLines[0]).toContain("RUN history-22 ");
  expect(runLines.at(-1)).toContain("RUN history-03 ");
  expect(runLines.some((line) => line.includes("history-02"))).toBe(false);
  expect(lines.filter((line) => line.startsWith("RUNS OMITTED"))).toEqual([
    // #1345 — the omission line now names the two filters that widen/narrow the window.
    "RUNS OMITTED valid=7 total=27 showing-newest=20; widen with --last N, narrow with --lane <name>, or inspect a known run with pnpm snap --report <exact-run-id> --problems",
  ]);
  expect(lines.filter((line) => line.startsWith("RUN INDEX SKIPPED"))).toEqual([
    expect.stringMatching(/invalid=5 scanned=\d+ examples=3 omitted=2 .*pnpm snap --report/u),
  ]);
  expect(lines.some((line) => line.startsWith("RUN INDEX REFUSED"))).toBe(false);
});

test("failed Git identity reads are unknown with field-level failures rather than a fabricated dirty tree", async ({ runCli, scratch }) => {
  const detached = join(scratch, "detached-repository");
  await initializeRepository(detached);
  git(detached, ["checkout", "--detach"]);
  expect(snapGitIdentity(detached)).toMatchObject({ sha: expect.stringMatching(/^[0-9a-f]{40}$/u), ref: "detached", failures: [] });
  expect(snapDirtyIdentity(detached)).toMatchObject({ state: "clean", digest: expect.stringMatching(/^[0-9a-f]{64}$/u), failures: [] });

  const root = join(scratch, "not-a-repository");
  await mkdir(root, { recursive: true });
  const gitIdentity = snapGitIdentity(root);
  const dirtyIdentity = snapDirtyIdentity(root);
  expect(gitIdentity).toMatchObject({
    sha: "unavailable",
    ref: "unavailable",
    failures: [expect.objectContaining({ field: "sha" }), expect.objectContaining({ field: "ref" })],
  });
  expect(dirtyIdentity).toMatchObject({
    state: "unknown",
    digest: null,
    failures: [
      expect.objectContaining({ field: "status" }),
      expect.objectContaining({ field: "tracked-delta" }),
      expect.objectContaining({ field: "untracked-list" }),
    ],
  });
  expect([...gitIdentity.failures, ...dirtyIdentity.failures].every((failure) => failure.detail !== "")).toBe(true);

  const slot = await openSlot(root, "unknown-source");
  registerSnapResultPairs([["app-snapshot", "measured"]]);
  const path = await completeSnapRun(slot.completion, parseSnapArgs([]), ["snap"]);
  const index = JSON.parse(await readFile(path, "utf8")) as RunIndex;
  expect(index.identity).toMatchObject({
    sha: "unavailable",
    ref: "unavailable",
    dirty: { state: "unknown", digest: null },
    gitFailures: expect.arrayContaining([
      expect.objectContaining({ field: "sha" }),
      expect.objectContaining({ field: "ref" }),
      expect.objectContaining({ field: "status" }),
      expect.objectContaining({ field: "tracked-delta" }),
      expect.objectContaining({ field: "untracked-list" }),
    ]),
  });
  const problems = await runCli("snap", ["--report", path, "--problems"]);
  await expect(problems).toExitWith(EXIT.clean);
  expect(problems.stdout).not.toContain("source=unknown");
  const all = await runCli("snap", ["--report", path, "--all"]);
  await expect(all).toExitWith(EXIT.clean);
  expect(all.stdout).toContain("source=unknown digest=unavailable git-failures=");
  expect(all.stdout).toContain('"field":"status"');
});

test("browser-free reader preserves explicit early-v1 compatibility while current writers emit the full contract", async ({ runCli, scratch }) => {
  const root = join(scratch, "legacy-v1-repo");
  await initializeRepository(root);
  const slot = await openSlot(root, "legacy-v1");
  registerSnapResultPairs([["app-snapshot", "absent"]]);
  const path = await completeSnapRun(slot.completion, parseSnapArgs([]), ["snap"]);
  const current = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  const identity = current["identity"] as Record<string, unknown>;
  identity["indexPath"] = undefined;
  identity["slotPath"] = undefined;
  identity["checkouts"] = undefined;
  const provenance = current["provenance"] as Record<string, unknown>;
  provenance["stage"] = "live";
  const diagnostics = current["diagnostics"] as Record<string, unknown>;
  diagnostics["counts"] = undefined;
  diagnostics["rawChannels"] = undefined;
  await writeFile(path, `${JSON.stringify(current, null, 2)}\n`);

  const report = await runCli("snap", ["--report", path, "--all"]);
  await expect(report).toExitWith(EXIT.clean);
  expect(report.stdout).toContain("stage=live:legacy");
  expect(report.stdout).toContain("RUN REPORT   legacy-v1");
});

test("multi-arm diagnostics round-trip preserves severity/caps and keeps trace.zip out of primary evidence", async ({ runCli, scratch }) => {
  const root = join(scratch, "rich-repo");
  await initializeRepository(root);
  const slot = await openSlot(root, "rich-bundle");
  const shots: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    await mkdir(join(slot.dir, "snaps"), { recursive: true });
    const shot = join(slot.dir, "snaps", `page-${String(index)}.png`);
    await writeFile(shot, `png-${String(index)}`);
    shots.push(shot);
  }
  await mkdir(join(slot.dir, "motion"), { recursive: true });
  await mkdir(join(slot.dir, "perf"), { recursive: true });
  await mkdir(join(slot.dir, "traces"), { recursive: true });
  await mkdir(join(slot.dir, "sessions", "p-rich"), { recursive: true });
  const motionPath = join(slot.dir, "motion", "motion.json");
  const perfPath = join(slot.dir, "perf", "perf.json");
  const tracePath = join(slot.dir, "traces", "trace.zip");
  const chromiumTracePath = join(slot.dir, "boot-trace", "snap-boot.trace.json");
  const sessionTracePath = join(slot.dir, "sessions", "p-rich", "trace-000.zip");
  await writeFile(
    motionPath,
    `${JSON.stringify({
      motion: "raw",
      problems: [
        {
          arm: "motion",
          kind: "failure",
          metric: "motion-evidence",
          subject: "planted motion window",
          observed: "incomplete",
          threshold: "complete",
          detail: "planted current-schema motion problem",
        },
      ],
    })}\n`,
  );
  await writeFile(
    perfPath,
    `${JSON.stringify({ contract: "snap-interaction-perf-v1", problems: Array.from({ length: 25 }, (_, rowIndex) => analyzerProblem(rowIndex)) })}\n`,
  );
  await writeFile(tracePath, "playwright-raw-fallback");
  await mkdir(join(slot.dir, "boot-trace"), { recursive: true });
  await writeFile(chromiumTracePath, '{"traceEvents":[]}\n');
  await writeFile(sessionTracePath, "session-playwright-raw-fallback");

  beginInstrumentRun("snap", root, { slotDir: slot.dir });
  try {
    await Promise.all(
      shots.map(
        async (shot, page) =>
          await declareTestArtifact("snaps", shot, {
            producer: "snap",
            producerArm: "shot",
            channel: "screenshot",
            mediaType: "image/png",
            schema: null,
            scope: exactScope(0, page, "settled-capture"),
          }),
      ),
    );
    await declareTestArtifact("motion", motionPath, {
      producer: "motion",
      producerArm: "motion",
      channel: "motion-window",
      schema: "snap-motion-v1",
      completeness: "bounded",
      completenessDetail: "finite planted motion ring",
      limits: [
        {
          source: "planted-ring",
          complete: false,
          policy: { capacity: 1 },
          events: [{ kind: "ring", path: "$.motion", original: 2, retained: 1, omitted: 1 }],
        },
      ],
    });
    await declareTestArtifact("perf", perfPath, {
      producer: "perf",
      producerArm: "interaction-perf",
      channel: "interaction-perf",
      schema: "snap-interaction-perf-v1",
      records: 25,
      completenessDetail: "complete observer records for the finite action tape",
    });
    await declareTestArtifact("traces", tracePath, {
      producer: "snap",
      channel: "playwright-trace",
      mediaType: "application/zip",
      schema: "playwright-trace",
      role: "raw-fallback",
    });
    await declareTestArtifact("boot-trace", chromiumTracePath, {
      producer: "boot-trace",
      producerArm: "boot-trace",
      channel: "chromium-trace",
      mediaType: "application/json",
      schema: "chromium-trace-events",
      role: "raw-fallback",
    });
    await declareTestArtifact("sessions", sessionTracePath, {
      producer: "sessions",
      channel: "playwright-trace",
      mediaType: "application/zip",
      schema: "playwright-trace",
      role: "raw-fallback",
    });
    await writeSnapDiagnosticEvidence(
      "page-controlled-capture-name",
      Array.from({ length: 25 }, (_, rowIndex) => diagnostic(rowIndex)),
    );
  } finally {
    finishInstrumentRun();
  }
  registerSnapDiagnosticCompleteness(
    summarizeOrbConsoleCompleteness([{ contextIndex: 1, pageIndex: 2, evidenceWindow: 3, records: 25, dropped: 4, cap: 128, complete: false }]),
  );
  registerSnapResultPairs([
    ["app-snapshot", "measured"],
    ["motion", "PASS"],
    ["perf", "withheld"],
    ["cpu-profile", "REFUSED"],
  ]);
  const opts = { ...parseSnapArgs([]), motion: true, interactionPerf: true, cpuProfile: true } satisfies Args;
  const receiptLines: string[] = [];
  const releaseReceipt = installOutputSink({ line: (line) => receiptLines.push(line), warn: () => undefined });
  let path = "";
  try {
    path = await completeSnapRun({ ...slot.completion, exit: EXIT.toolError }, opts, ["snap", "--react-profile"]);
  } finally {
    releaseReceipt();
  }
  const index = JSON.parse(await readFile(path, "utf8")) as RunIndex;

  expect(index.diagnostics).toMatchObject({ state: "incomplete", totals: { dropped: 4, complete: false }, records: { total: 25 } });
  expect(index.artifacts.filter((artifact) => artifact.role === "primary").length).toBeGreaterThan(6);
  expect(index.artifacts.find((artifact) => artifact.relativePath === "traces/trace.zip")).toMatchObject({
    role: "raw-fallback",
    completeness: "complete",
  });
  expect(index.artifacts.find((artifact) => artifact.relativePath === "sessions/p-rich/trace-000.zip")).toMatchObject({
    role: "raw-fallback",
    completeness: "complete",
  });
  expect(index.artifacts.find((artifact) => artifact.relativePath === "motion/motion.json")).toMatchObject({
    completeness: "bounded",
    completenessDetail: expect.stringContaining("finite"),
  });
  expect(index.artifacts.find((artifact) => artifact.relativePath === "perf/perf.json")).toMatchObject({
    completeness: "complete",
    completenessDetail: expect.stringContaining("finite action tape"),
  });
  // Deliberately planted transcript-only states do not become structured facts. The writer refuses the
  // enabled arms rather than parsing the RESULT pairs registered above.
  expect(index.verdict.arms.find((arm) => arm.arm === "motion")).toMatchObject({ state: "refused", detail: "enabled arm emitted no typed fact" });
  expect(index.verdict.arms.find((arm) => arm.arm === "interaction-perf")).toMatchObject({
    state: "refused",
    detail: "enabled arm emitted no typed fact",
  });
  expect(index.verdict.arms.find((arm) => arm.arm === "cpu-profile")).toMatchObject({ state: "refused" });
  expect(index.verdict.arms.every((arm) => arm.source !== "" && arm.lifetime !== "")).toBe(true);
  expect(receiptLines.filter((line) => line.startsWith("FINDING    "))).toHaveLength(5);
  expect(receiptLines.filter((line) => line.startsWith("FINDING    ")).every((line) => line.startsWith("FINDING    error"))).toBe(true);
  // THE PRINTED DENOMINATOR IS THE INDEXED POPULATION — derived from the run's own index rather than
  // written down, because a LITERAL here is only ever right until the fixture changes size. That is not a
  // hypothetical: the previous literal (`51`) was stale and this suite was RED on main before #1566
  // touched it, while the run itself printed `50 of 55`. The population was 55 both before and after the
  // dedup fix, so no count could ever have fenced that regression; the assertion that CAN is the one
  // below, which names the row by its arm.
  const expectedFindings = index.findings.length;
  expect(receiptLines).toContain(
    `FINDINGS   omitted=${String(expectedFindings - 5)} of ${String(expectedFindings)}; full population in run.json and READ below`,
  );

  // THE #1566 FENCE. `dead-css` is REFUSED here and no analyzer wrote a problem row for it, so it owns a
  // per-arm row — unless a console line that merely MENTIONS it (the `[css]`-tagged draft this fixture
  // now plants, `ARM_ATTRIBUTED_TEXT`) is allowed to count as "a producer already described this arm".
  // Pre-fix that annotation deleted this row; the count did not move, which is exactly why a bare
  // `omitted=N of M` could not see it.
  const deadCssRow = index.findings.find((row) => row.severity === "error" && row.arms.includes("dead-css"));
  expect(
    deadCssRow?.what,
    `no dead-css problem row in:\n${index.findings.map((row) => `${row.severity} ${row.arms.join(",")} ${row.what}`).join("\n")}`,
  ).toContain("enabled arm emitted no typed fact");
  // …and the annotation it must NOT be suppressed by is really in the population, so the fence above is
  // asserting over the fixture we think it is.
  expect(index.findings.some((row) => row.severity === "annotation" && row.arms.includes("dead-css"))).toBe(true);
  // THE OTHER DIRECTION. `motion` IS described by its own analyzer problem row, so it gets exactly one
  // error row — the producer's. Without this the suite would pass with the dedup disabled entirely (a
  // derived denominator moves with the population, so no count can catch that), and a fence that only
  // bites one way is half an instrument.
  const motionRows = index.findings.filter((row) => row.severity === "error" && row.arms.includes("motion"));
  expect(motionRows).toHaveLength(1);
  expect(motionRows[0]?.what).toContain("motion-evidence");
  expect(receiptLines).toContain(`FORENSICS  open the raw chromium-trace at ${chromiumTracePath}`);
  expect(receiptLines).not.toContain(`VIEW       pnpm exec playwright show-trace ${chromiumTracePath}`);

  const report = await runCli("snap", ["--report", path, "--all"]);
  await expect(report).toExitWith(EXIT.clean);
  expect(report.stdout).toContain("DIAGNOSTICS  omitted=5 highest-severity rows shown");
  expect(report.stdout.match(/^PROBLEM\s+/gmu)).toHaveLength(20);
  expect(report.stdout).toContain("PROBLEMS     omitted=6 of 26 analyzer-owned rows");
  // Same derived population as the receipt above (#1566) — the reader's row cap differs, the DENOMINATOR
  // does not, so both surfaces must move together when the arm rows do.
  expect(report.stdout).toContain(`FINDINGS     omitted=${String(expectedFindings - 20)} of ${String(expectedFindings)} indexed rows`);
  expect(report.stdout).toContain("planted highest-severity problem beyond the source-order display cap");
  expect(report.stdout).toContain("planted-last-error-24");
  expect(report.stdout).toContain(`RAW FALLBACK ${join(slot.dir, "traces", "trace.zip")}`);
  expect(report.stdout).toContain(`RAW FALLBACK ${join(slot.dir, "sessions", "p-rich", "trace-000.zip")}`);
  expect(report.stdout).toContain(`pnpm exec playwright show-trace ${join(slot.dir, "traces", "trace.zip")}`);
  expect(report.stdout).toContain(`FORENSICS    open the raw chromium-trace at ${chromiumTracePath}`);
  expect(report.stdout).not.toContain(`pnpm exec playwright show-trace ${chromiumTracePath}`);
  expect(report.stdout).not.toMatch(/^ARTIFACT\s+.*trace\.zip/mu);
  expect(report.stdout).not.toContain("run slot");

  const filtered = await runCli("snap", [
    "--report",
    path,
    "--all",
    "--level",
    "error",
    "--source",
    "uncaught",
    "--context",
    "1",
    "--page",
    "2",
    "--window",
    "3",
    "--text",
    "error-24",
  ]);
  await expect(filtered).toExitWith(EXIT.clean);
  expect(filtered.stdout).toContain("planted-last-error-24");
  expect(filtered.stdout).not.toContain("planted-warning");

  const perfAlias = await runCli("snap", ["--report", path, "--all", "--arm", "perf"]);
  await expect(perfAlias).toExitWith(EXIT.clean);
  expect(perfAlias.stdout).toContain("arm=interaction-perf");
  expect(perfAlias.stdout).toContain("ARM          interaction-perf state=refused");
});

test("named session on an isolated stage preserves multi-context diagnostic identity through writer, index, and filters", async ({ runCli, scratch }) => {
  const root = join(scratch, "session-stage-repo");
  await initializeRepository(root);
  const slot = await openSlot(root, "session-stage-multi-context");
  const rows = [
    { ...diagnostic(0), origin: "page-console", source: "console-api", contextIndex: 0, pageIndex: 0, evidenceWindow: 8, text: "context-zero-warning" },
    { ...diagnostic(1), origin: "page-console", source: "console-api", contextIndex: 1, pageIndex: 2, evidenceWindow: 9, text: "context-one-warning" },
  ] satisfies readonly BrowserDiagnostic[];
  beginInstrumentRun("snap", root, { slotDir: slot.dir });
  try {
    await writeSnapDiagnosticEvidence("multi-context", rows);
  } finally {
    finishInstrumentRun();
  }
  registerSnapDiagnosticCompleteness(
    summarizeOrbConsoleCompleteness([
      { contextIndex: 0, pageIndex: 0, evidenceWindow: 8, records: 1, dropped: 0, cap: 128, complete: true },
      { contextIndex: 1, pageIndex: 2, evidenceWindow: 9, records: 1, dropped: 0, cap: 128, complete: true },
    ]),
  );
  registerSnapSessionProvenance({
    name: "p-isolated",
    call: 2,
    evidenceWindow: 9,
    binding: { kind: "base", url: "http://127.0.0.1:4173" },
    stage: {
      state: "bound",
      ownerCheckout: root,
      band: 6,
      ref: "stage/p-isolated-b6",
      binding: { kind: "base", url: "http://127.0.0.1:4173" },
      failure: null,
    },
  });
  registerSnapResultPairs([["app-snapshot", "measured"]]);
  const path = await completeSnapRun(slot.completion, parseSnapArgs(["--session", "p-isolated"]), ["snap", "--session", "p-isolated"]);
  const index = JSON.parse(await readFile(path, "utf8")) as RunIndex;

  expect(index.identity).toMatchObject({
    indexPath: path,
    slotPath: slot.dir,
    checkouts: { primary: { path: root }, subject: { kind: "primary", path: root } },
  });
  expect(index.provenance.stage).toEqual({
    mode: "session",
    state: "bound",
    ownerCheckout: root,
    band: 6,
    ref: "stage/p-isolated-b6",
    binding: { kind: "base", url: "http://127.0.0.1:4173" },
    failure: null,
  });
  expect(index.diagnostics).toMatchObject({
    state: "complete",
    records: { total: 2, complete: true },
    counts: expect.arrayContaining([
      expect.objectContaining({ channel: "console", context: 0, page: 0, window: "8", records: 1 }),
      expect.objectContaining({ channel: "console", context: 1, page: 2, window: "9", records: 1 }),
    ]),
    rawChannels: expect.arrayContaining([
      expect.objectContaining({ channel: "console", scope: exactScope(0, 0, "8"), records: 1, complete: true }),
      expect.objectContaining({ channel: "console", scope: exactScope(1, 2, "9"), records: 1, complete: true }),
    ]),
  });
  const filtered = await runCli("snap", ["--report", path, "--all", "--channel", "browser-diagnostics", "--context", "1", "--page", "2", "--window", "9"]);
  await expect(filtered).toExitWith(EXIT.clean);
  expect(filtered.stdout).toContain("context-one-warning");
  expect(filtered.stdout).not.toContain("context-zero-warning");
});

// #2419: EVERY CAPTURE IN A SLOT FILES ITS OWN DIAGNOSTIC ARTIFACT. The writer used to ignore its `name`
// and write one slot-global `browser-diagnostics/diagnostics.json` with `flag:"wx"`, so the SECOND capture
// in a run — which is every `--matrix` cell after v01, and every repeat call into a session daemon — threw
// EEXIST and aborted the run. The fix names the file after the capture and disambiguates a REPEATED name
// with an ordinal; `wx` stays, because an overwrite would silently destroy the earlier cell's evidence.
// The completion path already read the plural (`producer === "browser-diagnostics"` is a FILTER), so the
// index must carry every capture's path and the union of their records.
test("a slot holds one diagnostic artifact per capture — distinct names, a repeated name, and never an overwrite", async ({ scratch }) => {
  const root = join(scratch, "per-capture-diagnostics-repo");
  await initializeRepository(root);
  const slot = await openSlot(root, "per-capture-diagnostics");
  const cell = (id: string, text: string): BrowserDiagnostic => ({ ...diagnostic(0), text, evidenceWindow: 1, raw: null, location: null, issueCode: id });
  beginInstrumentRun("snap", root, { slotDir: slot.dir });
  let paths: readonly string[] = [];
  try {
    paths = [
      await writeSnapDiagnosticEvidence("v01-4f2a9c", [cell("v01", "first-cell-warning")]),
      await writeSnapDiagnosticEvidence("v02-7b1d03", [cell("v02", "second-cell-warning")]),
      // The daemon keys a call by its ROUTE, so two calls to one route repeat the name. That is a second
      // capture, not a rewrite of the first.
      await writeSnapDiagnosticEvidence("v01-4f2a9c", [cell("v01", "first-cell-second-call-warning")]),
    ];
  } finally {
    finishInstrumentRun();
  }
  expect(new Set(paths).size, `each capture owns a distinct artifact: ${paths.join(", ")}`).toBe(3);
  expect(paths.map((each) => basename(each))).toEqual(["v01-4f2a9c.json", "v02-7b1d03.json", "v01-4f2a9c-2.json"]);
  for (const [index, each] of paths.entries()) {
    const read = await readSnapDiagnosticArtifact(each);
    expect(read.records, each).toHaveLength(1);
    expect(read.records[0]?.text, each).toBe(["first-cell-warning", "second-cell-warning", "first-cell-second-call-warning"][index]);
  }

  registerSnapResultPairs([["app-snapshot", "measured"]]);
  const runIndexPath = await completeSnapRun(slot.completion, parseSnapArgs([]), ["snap", "--matrix"]);
  const index = JSON.parse(await readFile(runIndexPath, "utf8")) as RunIndex;
  expect(index.diagnostics.recordArtifacts).toEqual(expect.arrayContaining([...paths]));
  expect(index.diagnostics.records.total).toBe(3);
  // Attribution is per ARTIFACT: a raw channel row that named only the first file would credit cell v02's
  // records to cell v01's evidence.
  expect(index.diagnostics.rawChannels?.map((row) => row.artifact).sort()).toEqual([...paths].sort());
});

test("composite findings correlate the same unsafe-port failure across diagnostics, core capture, and session HAR without inventing tag ownership", async ({
  runCli,
  scratch,
}) => {
  const root = join(scratch, "correlated-repo");
  await initializeRepository(root);
  const slot = await openSlot(root, "correlated-bundle");
  await mkdir(join(slot.dir, "evidence"), { recursive: true });
  await mkdir(join(slot.dir, "perf"), { recursive: true });
  await mkdir(join(slot.dir, "sessions", "p-correlated"), { recursive: true });
  const perfPath = join(slot.dir, "perf", "p0-perf.json");
  const corePath = join(slot.dir, "evidence", "core-capture.json");
  const harPath = join(slot.dir, "sessions", "p-correlated", "network.har");
  await writeFile(
    perfPath,
    `${JSON.stringify({
      contract: "snap-interaction-perf-v1",
      problems: [
        {
          arm: "interaction-perf",
          kind: "threshold",
          metric: "click-duration-ms",
          subject: "click #other-target",
          observed: "101ms",
          threshold: "100ms",
          detail: "informational meter breach",
        },
      ],
    })}\n`,
  );
  await writeFile(
    corePath,
    `${JSON.stringify({
      v: 1,
      populations: {
        pageErrors: { records: 0, dropped: 0, complete: true, basis: "all-observed" },
        failedRequests: { records: 1, dropped: null, complete: false, basis: "latest-per-url" },
        captures: { records: 1, dropped: 0, complete: true, basis: "all-pages" },
      },
      failures: {},
      pageErrors: [],
      failedRequests: [{ method: "GET", url: "http://127.0.0.1:1/api", status: null, failed: "net::ERR_UNSAFE_PORT", type: "fetch" }],
      captures: [{ pageIndex: 0, navError: null, stepFailures: 0, navFailures: 0, mapError: null, mapAtlasError: null, mapShellError: null }],
    })}\n`,
  );
  await writeFile(
    harPath,
    `${JSON.stringify({
      log: {
        entries: [
          {
            request: { method: "GET", url: "http://127.0.0.1:1/api" },
            response: { status: 0 },
            _orb: {
              contextIndex: 0,
              pageIndex: 0,
              evidenceWindow: 7,
              requestId: "unsafe-1",
              failure: { errorText: "net::ERR_UNSAFE_PORT" },
            },
          },
        ],
      },
    })}\n`,
  );
  const rows: BrowserDiagnostic[] = [
    {
      ...diagnostic(0),
      source: "console-api",
      level: "error",
      category: "network",
      text: "Failed to load resource: net::ERR_UNSAFE_PORT",
      requestId: null,
      contextIndex: 0,
      pageIndex: 0,
      evidenceWindow: 7,
    },
    {
      ...diagnostic(1),
      source: "network",
      level: "error",
      category: "network",
      text: "GET http://127.0.0.1:1/api net::ERR_UNSAFE_PORT",
      requestId: "unsafe-1",
      contextIndex: 0,
      pageIndex: 0,
      evidenceWindow: 7,
    },
    {
      ...diagnostic(2),
      source: "console-api",
      level: "warning",
      text: "%c12:34:56.789 [perf]%c slow commit Region 31ms color:red color:gray",
      contextIndex: 0,
      pageIndex: 0,
      evidenceWindow: 7,
    },
    {
      ...diagnostic(3),
      source: "console-api",
      level: "warning",
      text: "%c12:34:56.790 [input]%c click #save took 101ms color:red color:gray",
      contextIndex: 0,
      pageIndex: 0,
      evidenceWindow: 7,
    },
    {
      ...diagnostic(4),
      source: "console-api",
      level: "warning",
      text: "User preference: [perf] is a literal label, not an instrument record",
      contextIndex: 0,
      pageIndex: 0,
      evidenceWindow: 7,
    },
    {
      ...diagnostic(5),
      source: "orb-console-ring",
      level: "warning",
      text: "%c12:34:56.791 [perf]%c ring copy is not the console-api source color:red color:gray",
      contextIndex: 0,
      pageIndex: 0,
      evidenceWindow: 7,
    },
  ];
  beginInstrumentRun("snap", root, { slotDir: slot.dir });
  try {
    await declareTestArtifact("perf", perfPath, {
      producer: "perf",
      producerArm: "interaction-perf",
      channel: "interaction-perf",
      schema: "snap-interaction-perf-v1",
    });
    await declareTestArtifact("evidence", corePath, {
      producer: "snap",
      producerArm: "app-snapshot",
      channel: "core-capture",
      schema: "snap-core-capture-v1",
      completeness: "bounded",
      completenessDetail: "latest-per-URL planted projection",
      limits: [
        {
          source: "latest-per-url",
          complete: false,
          policy: null,
          events: [{ kind: "projection", path: "$.failedRequests", original: null, retained: 1, omitted: null }],
        },
      ],
    });
    await declareTestArtifact("sessions", harPath, {
      producer: "sessions",
      channel: "har",
      schema: "har-1.2",
      completeness: "bounded",
      completenessDetail: "bounded planted HAR body evidence",
      scope: exactScope(0, 0, "7"),
      limits: [
        {
          source: "har-body",
          complete: false,
          policy: null,
          events: [{ kind: "omission", path: "$.log.entries[0].response.content", original: null, retained: null, omitted: null }],
        },
      ],
    });
    await writeSnapDiagnosticEvidence("correlated", rows);
  } finally {
    finishInstrumentRun();
  }
  registerSnapDiagnosticCompleteness(
    summarizeOrbConsoleCompleteness([{ contextIndex: 0, pageIndex: 0, evidenceWindow: 7, records: rows.length, dropped: 0, cap: 128, complete: true }]),
  );
  registerSnapResultPairs([
    ["app-snapshot", "measured"],
    ["requests", "FAIL"],
    ["perf", "measured"],
  ]);
  const opts = { ...parseSnapArgs(["--requests"]), interactionPerf: true } satisfies Args;
  const path = await completeSnapRun({ ...slot.completion, exit: EXIT.violations }, opts, ["snap", "--requests", "--perf"]);
  const index = JSON.parse(await readFile(path, "utf8")) as RunIndex;

  const unsafe = index.findings.find((finding) => finding.what.includes("ERR_UNSAFE_PORT"));
  expect(unsafe).toMatchObject({
    severity: "error",
    arms: ["requests"],
    // Channel order follows the DRAFT order, and #1344 moved the core-capture producer to the head of it
    // so a run's own drive failures cannot lose a severity tie to a console row. Same finding, same
    // channels, same correlation — only the union's insertion order moved.
    channels: ["requests", "browser-diagnostics", "har"],
    confidence: "correlated",
    completeness: "bounded",
    occurrences: 4,
  });
  expect(unsafe?.evidence.map((evidence) => evidence.source).toSorted()).toEqual(["console-api", "core-capture", "har", "network"]);
  expect(unsafe?.evidence.every((evidence) => scopeMatches(evidence.scope, { context: 0, page: 0, window: "7" }))).toBe(true);
  // #1372 — an instrumentation line is TYPED at the producer: the `%c` timestamp prefix and the trailing
  // colour arguments are terminal configuration, not evidence, and carrying them cost ~250 bytes a row.
  // The attribution (arm + channel) is unchanged; what the row SAYS is now the reading.
  const perfRow = index.findings.find((finding) => finding.what.startsWith("perf slow commit Region"));
  expect(perfRow).toMatchObject({ severity: "annotation", arms: ["react-profile"], channels: ["orb-attribution"] });
  expect(perfRow?.what).toBe("perf slow commit Region value=31ms");
  expect(index.findings.find((finding) => finding.what.startsWith("input click #save"))).toMatchObject({
    severity: "annotation",
    arms: ["interaction-perf"],
    channels: ["orb-attribution"],
  });
  // Narrow on purpose: only an ATTRIBUTED instrumentation line is re-typed. Ordinary console prose that
  // happens to carry the same words keeps its own text verbatim (the negative control two rows below).
  expect(index.findings.filter((finding) => finding.channels.includes("orb-attribution")).some((finding) => finding.what.includes("color:red"))).toBe(false);
  expect(index.findings.find((finding) => finding.what.startsWith("User preference: [perf]"))).toMatchObject({
    severity: "warning",
    arms: [],
    channels: ["browser-diagnostics"],
  });
  expect(index.findings.find((finding) => finding.what.includes("ring copy is not"))).toMatchObject({
    severity: "warning",
    arms: [],
    channels: ["browser-diagnostics"],
  });
  expect(index.findings.find((finding) => finding.what.startsWith("click-duration-ms"))).toMatchObject({
    severity: "annotation",
    arms: ["interaction-perf"],
    channels: ["interaction-perf"],
    evidence: [expect.objectContaining({ source: "interaction-perf" })],
  });
  expect(index.verdict.exit).toBe(EXIT.violations);

  const report = await runCli("snap", ["--report", path, "--problems", "--channel", "har"]);
  await expect(report).toExitWith(EXIT.clean);
  expect(report.stdout).toContain("ERR_UNSAFE_PORT");
  expect(report.stdout).toContain("confidence=correlated");
  expect(report.stdout).toContain("core-capture@");
  expect(report.stdout).toContain("har@");
  expect(report.stdout).toContain("occurrences=4");
});

test("a malformed core completeness receipt is an explicit indexed problem rather than a false-clean omission", async ({ runCli, scratch }) => {
  const root = join(scratch, "bad-core-repo");
  await initializeRepository(root);
  const slot = await openSlot(root, "bad-core");
  await mkdir(join(slot.dir, "evidence"), { recursive: true });
  const corePath = join(slot.dir, "evidence", "core-capture.json");
  await writeFile(
    corePath,
    `${JSON.stringify({
      v: 1,
      populations: {
        pageErrors: { records: 0, dropped: 0, complete: true, basis: "all-observed" },
        failedRequests: { records: 0, dropped: 0, complete: true },
        captures: { records: 0, dropped: 0, complete: true, basis: "all-pages" },
      },
      failures: {},
      pageErrors: [],
      failedRequests: [],
      captures: [],
    })}\n`,
  );
  beginInstrumentRun("snap", root, { slotDir: slot.dir });
  try {
    await declareTestArtifact("evidence", corePath, {
      producer: "snap",
      producerArm: "app-snapshot",
      channel: "core-capture",
      schema: "snap-core-capture-v1",
      completeness: "bounded",
      limits: [
        {
          source: "latest-per-url",
          complete: false,
          policy: null,
          events: [{ kind: "projection", path: "$.failedRequests", original: null, retained: 0, omitted: null }],
        },
      ],
    });
  } finally {
    finishInstrumentRun();
  }
  registerSnapResultPairs([["app-snapshot", "measured"]]);
  const path = await completeSnapRun(slot.completion, parseSnapArgs([]), ["snap"]);
  const index = JSON.parse(await readFile(path, "utf8")) as RunIndex;
  expect(index.verdict).toMatchObject({ exit: EXIT.clean, state: "passed" });
  expect(index.findings).toEqual([
    expect.objectContaining({
      severity: "error",
      what: "structured evidence is malformed",
      completeness: "incomplete",
      conflicts: [expect.stringContaining("failedRequests completeness receipt")],
    }),
  ]);

  const report = await runCli("snap", ["--report", path, "--problems"]);
  await expect(report).toExitWith(EXIT.clean);
  expect(report.stdout).toContain("FINDING      error | structured evidence is malformed");
  expect(report.stdout).toContain("failedRequests completeness receipt");
});

test("interrupted session runs synthesize terminal evidence, indices are immutable, and stale/incomplete copies refuse", async ({ runCli, scratch }) => {
  const root = join(scratch, "interrupt-repo");
  await initializeRepository(root);
  const slot = await openSlot(root, "interrupted", ["parallel-run"]);
  await mkdir(join(slot.dir, "evidence"), { recursive: true });
  const artifact = join(slot.dir, "evidence", "partial.json");
  await writeFile(artifact, '{"partial":true}\n');
  const opts = parseSnapArgs(["--session", "p-interrupted"]);
  const interrupted = { ...slot.completion, exit: null, error: new Error("planted child interruption") };
  registerSnapSessionProvenance({
    name: "p-interrupted",
    call: 3,
    evidenceWindow: 4,
    binding: { kind: "base", url: "http://127.0.0.1:5173" },
    stage: {
      state: "bound",
      ownerCheckout: root,
      band: 4,
      ref: "stage/p-interrupted-b4",
      binding: { kind: "base", url: "http://127.0.0.1:5173" },
      failure: null,
    },
  });
  const path = await completeSnapRun(interrupted, opts, ["snap", "--react-profile"]);
  const index = JSON.parse(await readFile(path, "utf8")) as RunIndex;

  expect(index.verdict).toMatchObject({ exit: EXIT.toolError, state: "refused" });
  expect(index.resultPairs).toEqual([
    ["snap", "REFUSED"],
    ["exit", String(EXIT.toolError)],
    ["reason", "run threw before returning an exit code"],
  ]);
  expect(index.provenance).toEqual({
    session: "p-interrupted",
    sessionCall: 3,
    evidenceWindow: 4,
    sessionBinding: { kind: "base", url: "http://127.0.0.1:5173" },
    stage: {
      mode: "session",
      state: "bound",
      ownerCheckout: root,
      band: 4,
      ref: "stage/p-interrupted-b4",
      binding: { kind: "base", url: "http://127.0.0.1:5173" },
      failure: null,
    },
    concurrency: ["parallel-run"],
  });
  const provenanceReport = await runCli("snap", ["--report", path, "--all"]);
  await expect(provenanceReport).toExitWith(EXIT.clean);
  expect(provenanceReport.stdout).toContain(
    `PROVENANCE   session=p-interrupted call=3 window=4 binding=base:http://127.0.0.1:5173 stage=session:bound:owner=${root}:band=4:ref=stage/p-interrupted-b4:binding=base:http://127.0.0.1:5173 concurrency=parallel-run`,
  );
  await expect(completeSnapRun(interrupted, opts, ["snap", "--react-profile"])).rejects.toThrow(/EEXIST|exist/u);

  const incompleteDir = join(root, "reports", "runs", "snap", "incomplete");
  await mkdir(incompleteDir, { recursive: true });
  const incompletePath = join(incompleteDir, "run.json");
  const incomplete = { ...index, identity: { ...index.identity, runId: "incomplete", indexPath: incompletePath, slotPath: incompleteDir }, resultPairs: [] };
  await writeFile(incompletePath, `${JSON.stringify(incomplete)}\n`);
  const incompleteRead = await runCli("snap", ["--report", incompletePath, "--all"]);
  await expect(incompleteRead).toExitWith(EXIT.toolError);
  expect(incompleteRead.stdout).toContain("malformed RESULT evidence");

  const referenceGapDir = join(root, "reports", "runs", "snap", "reference-gap");
  await mkdir(referenceGapDir, { recursive: true });
  const referenceGapPath = join(referenceGapDir, "run.json");
  const arm = index.verdict.arms[0];
  expect(arm).toBeDefined();
  const referenceGap = {
    ...index,
    identity: { ...index.identity, runId: "reference-gap", indexPath: referenceGapPath, slotPath: referenceGapDir },
    findings: [],
    artifacts: [],
    verdict: { ...index.verdict, arms: [{ ...arm, artifacts: [join(referenceGapDir, "unlisted.json")] }] },
    diagnostics: { ...index.diagnostics, recordArtifacts: [], records: { ...index.diagnostics.records, total: 0 } },
  };
  await writeFile(referenceGapPath, `${JSON.stringify(referenceGap)}\n`);
  const referenceGapRead = await runCli("snap", ["--report", referenceGapPath, "--all"]);
  await expect(referenceGapRead).toExitWith(EXIT.toolError);
  expect(referenceGapRead.stdout).toContain("un-inventoried artifact");

  const falseCompleteDir = join(root, "reports", "runs", "snap", "false-complete");
  await mkdir(falseCompleteDir, { recursive: true });
  const falseCompletePath = join(falseCompleteDir, "run.json");
  const falseComplete = {
    ...index,
    identity: { ...index.identity, runId: "false-complete", indexPath: falseCompletePath, slotPath: falseCompleteDir },
    findings: [],
    artifacts: [],
    verdict: { ...index.verdict, arms: index.verdict.arms.map((row) => ({ ...row, artifacts: [] })) },
    diagnostics: {
      ...index.diagnostics,
      state: "complete",
      artifact: null,
      reads: [],
      totals: null,
      recordArtifacts: [],
      records: { ...index.diagnostics.records, total: 0, limitEvents: 0, complete: true },
    },
  };
  await writeFile(falseCompletePath, `${JSON.stringify(falseComplete)}\n`);
  const falseCompleteRead = await runCli("snap", ["--report", falseCompletePath, "--all"]);
  await expect(falseCompleteRead).toExitWith(EXIT.toolError);
  expect(falseCompleteRead.stdout).toContain("completeness state disagrees with its measured populations");

  await writeFile(artifact, '{"partial":false,"changed":true}\n');
  const stale = await runCli("snap", ["--report", path, "--problems"]);
  await expect(stale).toExitWith(EXIT.toolError);
  expect(stale.stdout).toContain("references stale artifact");
  expect(stale.stdout).not.toContain("run slot");
});

test("refusal after slot is indexed with a truthful terminal verdict", async ({ runCli, scratch }) => {
  const missing = join(scratch, "missing.html");
  const run = await runCli("snap", ["--file", missing, "--text"], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(run).toExitWith(EXIT.violations);
  const path = indexPath(run.stdout);
  const index = JSON.parse(await readFile(path, "utf8")) as RunIndex;
  expect(index.verdict.exit).not.toBe(EXIT.clean);
  expect(index.verdict.arms.some((arm) => arm.state === "refused" || arm.state === "failed")).toBe(true);
  expect(run.stdout.trimEnd().split("\n").at(-1)).toContain(`index=${path}`);
});

test("missing and corrupt indices refuse browser-free and never mint a slot", async ({ runCli, scratch }) => {
  const missing = await runCli("snap", ["--report", join(scratch, "absent", "run.json"), "--problems"]);
  await expect(missing).toExitWith(EXIT.toolError);
  expect(missing.stdout).toContain("RUN INDEX REFUSED");
  expect(missing.stdout).not.toContain("run slot");

  const corruptPath = join(scratch, "corrupt", "run.json");
  await mkdir(join(scratch, "corrupt"), { recursive: true });
  await writeFile(corruptPath, "{not-json");
  const corrupt = await runCli("snap", ["--report", corruptPath, "--all"]);
  await expect(corrupt).toExitWith(EXIT.toolError);
  expect(corrupt.stdout).toContain("RUN INDEX REFUSED");
  expect(corrupt.stdout).not.toContain("run slot");
});

test("cross-process artifact declarations reject every malformed allocation field before inventory", async ({ scratch }) => {
  const malformedFields: readonly (readonly [string, Readonly<Record<string, unknown>>])[] = [
    ["publishedPath", { publishedPath: 7 }],
    ["schema", { schema: 7 }],
    ["role", { role: "sidecar" }],
    ["completeness", { completeness: "partial" }],
    ["completenessDetail", { completenessDetail: 7 }],
    ["scope", { scope: { kind: "scope-v1" } }],
    ["records", { records: -1 }],
    ["receipt", { limits: [{ complete: true, policy: null, events: [] }] }],
    [
      "receipt counts",
      {
        limits: [
          {
            source: "retention",
            complete: false,
            policy: { capacity: -1 },
            events: [{ kind: "ring", path: "$.records", original: 2, retained: 1, omitted: -1 }],
          },
        ],
      },
    ],
  ];
  for (const [field, patch] of malformedFields) {
    const slot = join(scratch, field.replaceAll(" ", "-"));
    const artifact = join(slot, "perf", "evidence.json");
    await mkdir(join(slot, ".artifacts"), { recursive: true });
    await mkdir(join(slot, "perf"), { recursive: true });
    await writeFile(artifact, "{}\n");
    const declaration: Record<string, unknown> = {
      v: 1,
      kind: "perf",
      path: artifact,
      relativePath: "perf/evidence.json",
      publishedPath: join(scratch, "published", "evidence.json"),
      producer: "perf",
      producerArm: "interaction-perf",
      channel: "interaction-perf",
      mediaType: "application/json",
      schema: "snap-interaction-perf-v1",
      role: "primary",
      completeness: "complete",
      completenessDetail: "complete finite action tape",
      scope: aggregateScope(),
      records: 1,
      limits: [],
    };
    Object.assign(declaration, patch);
    await writeFile(join(slot, ".artifacts", "declaration.json"), `${JSON.stringify(declaration)}\n`);
    await expect(collectSnapRunArtifacts(slot), field).rejects.toThrow("malformed artifact declaration");
  }
});

test("a real over-cap filmstrip receipt survives the declaration reader — a duration cap is measured in ms, not counted (#1643)", async ({ scratch }) => {
  // THE PRODUCER, never a hand-typed literal: the duration-cap event's `original` is `now - startedAt` off
  // a real clock, so it is fractional on every run that outlives the 15s cap. `artifactLimitEventSchema`
  // required an INTEGER there, so `readArtifactDeclarations` rejected the whole declaration and a CORRECT
  // `snap --filmstrip` run died with `INSTRUMENT ERROR: malformed artifact declaration` (exit 2).
  const overCapMs = 15_837.811_772_000_005;
  expect(Number.isInteger(overCapMs), "the reproducing clock reading is fractional").toBe(false);
  const buffer = new FilmstripBuffer(FILMSTRIP_LIMITS, 0);
  buffer.push(Buffer.from("over-cap frame"), overCapMs);
  const receipt = buffer.receipt(overCapMs);
  expect(receipt.limits[0]?.events).toContainEqual(
    expect.objectContaining({ kind: "duration-cap", path: "$.durationMs", original: overCapMs, retained: FILMSTRIP_LIMITS.durationMs }),
  );

  const root = join(scratch, "filmstrip-duration-cap-repo");
  await initializeRepository(root);
  const slot = await openSlot(root, "filmstrip-duration-cap");
  await mkdir(join(slot.dir, "filmstrip"), { recursive: true });
  const artifact = join(slot.dir, "filmstrip", "filmstrip.json");
  await writeFile(artifact, "{}\n");
  beginInstrumentRun("snap", root, { slotDir: slot.dir });
  try {
    await declareTestArtifact("filmstrip", artifact, { channel: "filmstrip", schema: "snap-filmstrip-v1", limits: receipt.limits });
  } finally {
    finishInstrumentRun();
  }
  const artifacts = await collectSnapRunArtifacts(slot.dir);
  const declared = artifacts.find((entry) => entry.relativePath.endsWith("filmstrip.json"));
  expect(declared?.declaration).toBe("declared");
  // The measurement reaches the reader UNROUNDED — the receipt is evidence about a real clock.
  expect(declared?.limits?.[0]?.events).toContainEqual(expect.objectContaining({ kind: "duration-cap", original: overCapMs }));
});

function firstDiagnosticRecord(artifact: Record<string, unknown>): Record<string, unknown> {
  const records = artifact["records"];
  const first = Array.isArray(records) ? records[0] : undefined;
  if (typeof first !== "object" || first === null) {
    throw new Error("planted diagnostic artifact has no first record");
  }
  return first as Record<string, unknown>;
}

test("diagnostic disk evidence rejects noncanonical identity and incomplete measured-limit receipts", async ({ scratch }) => {
  const safe = redactBrowserDiagnostics([diagnostic(0)]);
  const malformedRows: readonly (readonly [string, (artifact: Record<string, unknown>) => void])[] = [
    [
      "origin",
      (artifact): void => {
        firstDiagnosticRecord(artifact)["origin"] = "console-ish";
      },
    ],
    [
      "level",
      (artifact): void => {
        firstDiagnosticRecord(artifact)["level"] = "fatal";
      },
    ],
    [
      "timestamp",
      (artifact): void => {
        firstDiagnosticRecord(artifact)["timestamp"] = -1;
      },
    ],
    [
      "context",
      (artifact): void => {
        firstDiagnosticRecord(artifact)["contextIndex"] = -1;
      },
    ],
    [
      "policy",
      (artifact): void => {
        const receipt = firstDiagnosticRecord(artifact)["_orbMeasuredLimit"] as Record<string, unknown>;
        receipt["policy"] = { maxDepth: 1 };
      },
    ],
    [
      "event",
      (artifact): void => {
        const receipt = firstDiagnosticRecord(artifact)["_orbMeasuredLimit"] as Record<string, unknown>;
        receipt["events"] = [{ kind: "unknown", path: "$.text", original: 1, retained: 1, omitted: -1 }];
      },
    ],
    [
      "batch-policy",
      (artifact): void => {
        const receipt = artifact["_orbMeasuredLimit"] as Record<string, unknown>;
        receipt["policy"] = { maxDepth: 1 };
      },
    ],
  ];
  for (const [name, mutate] of malformedRows) {
    const artifact = structuredClone({ v: 1, records: safe.records, _orbMeasuredLimit: safe._orbMeasuredLimit }) as Record<string, unknown>;
    mutate(artifact);
    const path = join(scratch, `diagnostic-${name}.json`);
    await writeFile(path, `${JSON.stringify(artifact)}\n`);
    await expect(readSnapDiagnosticArtifact(path), name).rejects.toThrow("not browser-diagnostics artifact v1");
  }
});

test("a passed current-schema analyzer artifact missing problems refuses instead of reading legacy-clean", async ({ runCli, scratch }) => {
  const root = join(scratch, "missing-current-problems-repo");
  await initializeRepository(root);
  const slot = await openSlot(root, "missing-current-problems");
  const artifact = join(slot.dir, "perf", "perf.json");
  await mkdir(join(slot.dir, "perf"), { recursive: true });
  await writeFile(artifact, '{"contract":"snap-interaction-perf-v1"}\n');
  beginInstrumentRun("snap", root, { slotDir: slot.dir });
  try {
    await declareTestArtifact("perf", artifact, {
      producer: "perf",
      producerArm: "interaction-perf",
      channel: "interaction-perf",
      schema: "snap-interaction-perf-v1",
    });
  } finally {
    finishInstrumentRun();
  }
  registerSnapFactBatch({
    id: factBatchId("passed-analyzer"),
    core: [],
    arms: [
      snapArmFact({
        arm: "interaction-perf",
        schema: "snap-arm-interaction-perf-v1",
        source: "PerformanceObserver EventTiming/LoAF/longtask/layout-shift + rAF",
        lifetime: "one argv-ordered action tape",
        scope: aggregateScope(),
        artifacts: [],
        data: { state: "passed", detail: null, steps: 1, breachSteps: 0, artifact: null },
      }),
    ],
  });
  registerSnapResultPairs([["perf", "PASS"]]);
  const path = await completeSnapRun(slot.completion, { ...parseSnapArgs([]), interactionPerf: true }, ["snap", "--perf"]);
  const report = await runCli("snap", ["--report", path, "--problems"]);
  await expect(report).toExitWith(EXIT.toolError);
  expect(report.stdout).toContain("RUN INDEX REFUSED");
  expect(report.stdout).toContain("missing current analyzer problem evidence");
  expect(report.stdout).not.toContain("older artifact predates");
});

test("only a genuinely legacy analyzer schema may omit the problems population", async ({ scratch }) => {
  const path = join(scratch, "legacy-analyzer.json");
  await writeFile(path, '{"contract":"legacy"}\n');
  const artifact = {
    path,
    relativePath: artifactRef("perf/legacy-analyzer.json"),
    publishedPath: null,
    bytes: (await readFile(path)).byteLength,
    producer: "perf",
    producerArm: "interaction-perf",
    channel: "interaction-perf",
    mediaType: "application/json",
    schema: "json",
    role: "primary",
    completeness: "unknown",
    completenessDetail: "legacy analyzer evidence",
    scope: aggregateScope(),
    records: null,
    limits: [],
    declaration: "legacy",
  } satisfies SnapRunArtifact;
  await expect(readSnapAnalyzerProblems(artifact)).resolves.toMatchObject({ problems: [], legacyMissing: true });
});

test("malformed analyzer problem evidence refuses instead of printing a content-free failure", async ({ runCli, scratch }) => {
  const root = join(scratch, "malformed-analyzer-repo");
  await initializeRepository(root);
  const slot = await openSlot(root, "malformed-analyzer");
  await mkdir(join(slot.dir, "perf"), { recursive: true });
  const artifact = join(slot.dir, "perf", "bad.json");
  await writeFile(artifact, '{"contract":"snap-interaction-perf-v1","problems":[{"arm":"interaction-perf"}]}\n');
  beginInstrumentRun("snap", root, { slotDir: slot.dir });
  try {
    await declareTestArtifact("perf", artifact, {
      producer: "perf",
      producerArm: "interaction-perf",
      channel: "interaction-perf",
      schema: "snap-interaction-perf-v1",
    });
  } finally {
    finishInstrumentRun();
  }
  registerSnapResultPairs([
    ["app-snapshot", "measured"],
    ["perf", "measured"],
    ["breach-steps", "1"],
  ]);
  const path = await completeSnapRun({ ...slot.completion, exit: EXIT.violations }, { ...parseSnapArgs([]), interactionPerf: true }, ["snap", "--perf"]);
  const report = await runCli("snap", ["--report", path, "--arm", "perf", "--all"]);
  await expect(report).toExitWith(EXIT.toolError);
  expect(report.stdout).toContain("RUN INDEX REFUSED");
  expect(report.stdout).toContain("malformed analyzer problem row");
});

test("report query validation is strict and browser-free", async ({ runCli }) => {
  const help = await runCli("snap", ["--help"]);
  await expect(help).toExitWith(EXIT.clean);
  expect(help.stdout).toContain("--report <index|run-id|latest>");
  expect(help.stdout).toContain("--reports");
  expect(help.stdout).toContain("--arm perf is the public spelling for the typed interaction-perf arm");
  expect(help.stdout).toContain("Report readers never start a browser, stage, session, or run slot");
  expect(help.stdout).toContain("display-only: producer-owned arms/thresholds still own the exit vote");
  expect(help.stdout).toContain("declared latest-per-URL projection");
  expect(help.stdout.toLowerCase()).toContain("plain/static pages have no __orb overview");
  for (const argv of [
    ["--report", "latest", "--level", "panic"],
    ["--report", "latest", "--page", "NaN"],
    ["--report", "latest", "--problems", "--all"],
  ]) {
    const run = await runCli("snap", argv);
    await expect(run).toExitWith(EXIT.misuse);
    expect(run.stdout).not.toContain("run slot");
  }
});
