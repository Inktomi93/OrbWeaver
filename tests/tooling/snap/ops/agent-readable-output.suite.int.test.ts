// @instrument-proof: snap's TERMINAL OUTPUT is an agent-facing contract (#1344 #1345 #1347). Every one of
// these pins is a call an agent spent re-reading snap's own logs on the 2026-09-04 /chats dogfood: the
// answer buried at line 61 behind 32 lines of boot console, a failed `--wait-for` visible only as one
// token among ~40 on the RESULT line, and ten run slots that could not be mapped back to the ten commands
// that made them. They assert through STDOUT — the surface the reader actually has — never through a
// printer's internals.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { BOX_LOAD_ENV } from "@orb/tooling/_shared/load-budget";
import { installOutputSink } from "@orb/tooling/_shared/log";
import { beforeEach, vi } from "vitest";
import { aggregateScope, factBatchId } from "../../../../tooling/src/_shared/artifact-scope.ts";
import { snapArmFact } from "../../../../tooling/src/snap/contract/run-facts.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { completeSnapRun, registerSnapFactBatch, registerSnapResultPairs } from "../../../../tooling/src/snap/ops/run-bundle.ts";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CLI_TIMEOUT_MS = scaledBudget(180_000);
vi.setConfig({ testTimeout: CLI_TIMEOUT_MS, hookTimeout: CLI_TIMEOUT_MS });

const QUIET = ["--no-shot", "--no-deadcss", "--no-failure-evidence"];

/** A PLANTED QUIET BOX for every CLI child here (#1651's class, surfaced again by this suite). Above
 *  per-core loadavg 1.0 — the fleet's ordinary state while lanes run — every rate arm labels itself
 *  `load-suspect` and the run gains a run-global annotation, which BOTH breaks the 4 KB budget (its reason
 *  paragraph is ~600 bytes) and joins the annotation collapse, so the `annotations` line stops starting
 *  with the console tag these arms assert. Neither is about snap's OUTPUT CONTRACT, which is what this
 *  file pins. A hook, not module scope: the root config sets `unstubEnvs`. */
beforeEach(() => {
  vi.stubEnv(BOX_LOAD_ENV, "0.2/24");
});

/** The stdout budget a single-action run must stay inside. The Bash tool truncates long output, and a
 *  truncated snap run loses its END CARD — the one block that carries the verdict and the findings.
 *  4 KB, not 8 (#1369): at 8 KB the four annotation rows of a real /chats run were 42% of the file,
 *  because each printed the run's absolute index path TWICE. The rows are unchanged; their citations
 *  are now the run id the reader can hand straight back to `--report`.
 *
 *  WHAT THE BUDGET MEASURES (ruled here, #1556 + #1675; recorded in
 *  docs/design/1208-instrument-substrate.md §10.11): the AGENT-READABLE BODY — every line whose length is
 *  a function of THIS run's own arms and findings. The two PROVENANCE lines below are excluded, because
 *  their length is a function of HOW MANY OTHER RUNS happen to be live on this checkout, which is a
 *  property of the box and not of snap's output contract: co-scheduled with another snap-spawning suite, a
 *  run gains a `CONCURRENT` line plus its `concurrency=` twin (~230 bytes measured, #1675) and a budget
 *  that counted them turned a green contract into a red one on load alone. They are not unmeasured — the
 *  arm below pins them against a PLANTED racing slot, and the exclusion is proven to remove exactly those
 *  two lines and nothing else. */
const STDOUT_BUDGET_BYTES = 4096;
/** The two provenance line prefixes the budget excludes. Both are run-identity plumbing addressed to a
 *  reader reconstructing which slot produced what, and both carry the racing census. */
const PROVENANCE_PREFIXES = ["CONCURRENT", "PROVENANCE"] as const;

/** stdout minus the provenance lines — what {@link STDOUT_BUDGET_BYTES} is a budget for. */
function agentReadableBody(stdout: string): string {
  return stdout
    .split("\n")
    .filter((line) => !PROVENANCE_PREFIXES.some((prefix) => line.startsWith(prefix)))
    .join("\n");
}
/** Where the answer to a one-action run has to be. Line 61 (measured, /chats `--eval`) is a scroll. */
const ANSWER_LINE_CEILING = 12;

/** Two console messages the run must NOT dump inline: one ordinary line, and one shaped exactly like the
 *  client logger's instrumentation grammar so it becomes an `annotation` FINDING on the end card. */
const FIXTURE = `<!doctype html>
<html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>agent readable</title>
<script>
globalThis.__orb={ snap:()=>({fixture:true}), flags:()=>[], resetEvidence:()=>{},
  consoleErrors:()=>({records:[],dropped:0,cap:128}),
  motion:()=>({loafs:[],cls:0,virtualizedCls:0,nonVirtualizedCls:0,observedCls:0,observedVirtualizedCls:0,
    observedNonVirtualizedCls:0,worstBlocking:0,worstShift:0}),
  animations:()=>[], motionFlaggersSettled:()=>true, setMotionAuditDropTrackingPaused:()=>{} };
console.log("ordinary chatter nobody asked for");
console.warn("%c10:02:23.842 [perf]%c slow commit region:content 30ms (mount)","color:#c60","color:#888");
</script></head><body><main><button id="present">present</button></main></body></html>`;

function lineIndexOf(stdout: string, predicate: (line: string) => boolean): number {
  return stdout.split("\n").findIndex(predicate);
}

test("an eval-only run answers inside one screen and points at its console instead of dumping it", async ({ runCli, scratch }) => {
  const file = join(scratch, "agent-readable-eval.html");
  await writeFile(file, FIXTURE);

  const run = await runCli("snap", ["--file", file, "--eval", "document.title", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });

  await expect(run).toExitWith(EXIT.clean);
  const body = agentReadableBody(run.stdout);
  expect(body.length, `the agent-readable body was ${String(body.length)} bytes:\n${run.stdout}`).toBeLessThan(STDOUT_BUDGET_BYTES);
  // THE ANSWER, on the first screen.
  const answer = lineIndexOf(run.stdout, (line) => line.includes('"agent readable"'));
  expect(answer, `the --eval value was at line ${String(answer + 1)}:\n${run.stdout}`).toBeGreaterThan(-1);
  expect(answer).toBeLessThan(ANSWER_LINE_CEILING);
  // ONE console line that names the artifact and the exact reader, never the block.
  expect(run.stdout).toMatch(
    /^console {6}errors=0 warnings=\d+ messages=\d+ → browser-diagnostics\/ in run \S+; read: pnpm snap --report \S+ --all --channel console$/mu,
  );
  expect(run.stdout).not.toContain("--- console ---");
  expect(run.stdout).not.toContain("ordinary chatter nobody asked for");
  // The derived arm line, before the RESULT line's forty tokens.
  expect(run.stdout).toContain("SUMMARY eval values=1 errors=0");
  // The retention promise rides beside the evidence path it qualifies.
  expect(run.stdout).toMatch(/^RETAINED {3}this run slot is kept for at least 24h/mu);
});

test("a FINDING row cites the run by id, not by twice the absolute index path", async ({ runCli, scratch }) => {
  const file = join(scratch, "agent-readable-citation.html");
  await writeFile(file, FIXTURE);

  // `--motion` so an annotation prints as a ROW rather than collapsing (#1372) — the citation claim is
  // about the rows, so the run has to have one.
  const run = await runCli("snap", ["--file", file, "--eval", "1", "--motion", "#present", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  const runId = /^RUN {8}(\S+) /mu.exec(run.stdout)?.[1];
  expect(runId, run.stdout).toBeTypeOf("string");

  const findings = run.stdout.split("\n").filter((line) => line.startsWith("FINDING"));
  expect(findings, run.stdout).not.toHaveLength(0);
  for (const row of findings) {
    // The citation is the id `--report` already resolves, and the artifact is named relative to the slot
    // the RUN line above just printed.
    expect(row).toContain(`next=pnpm snap --report ${String(runId)} --problems`);
    expect(row, "no absolute run.json on a printed row").not.toContain("/run.json");
    expect(row).toMatch(/evidence=\S+@(?!\/)/u);
  }

  // …and the id round-trips through the reader, whose own rows carry the same short form.
  const reader = await runCli("snap", ["--report", String(runId), "--problems"], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(reader).toExitWith(EXIT.clean);
  for (const row of reader.stdout.split("\n").filter((line) => line.startsWith("FINDING"))) {
    expect(row).toContain(`next=pnpm snap --report ${String(runId)} --problems`);
  }
  // The PERSISTED shape is untouched — run.json keeps the absolute path its own validator requires.
  const index = JSON.parse(await readFile(/^INDEX {8}(\S+)$/mu.exec(reader.stdout)?.[1] ?? "", "utf8")) as {
    readonly findings?: readonly { readonly next: string }[];
  };
  for (const finding of index.findings ?? []) {
    expect(finding.next).toMatch(/^pnpm snap --report \/\S+\/run\.json --problems/u);
  }
});

test("the console channel the digest line advertises is the one the reader accepts", async ({ runCli, scratch }) => {
  const file = join(scratch, "agent-readable-channel.html");
  await writeFile(file, FIXTURE);
  const run = await runCli("snap", ["--file", file, "--eval", "1+1", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  const index = /--report (\S+) --all --channel console/u.exec(run.stdout)?.[1];
  expect(index, run.stdout).toBeTypeOf("string");

  const reader = await runCli("snap", ["--report", String(index), "--all", "--channel", "console"], { timeoutMs: CLI_TIMEOUT_MS });

  await expect(reader).toExitWith(EXIT.clean);
  // The planted message is READABLE through the advertised command — the digest line is a real door, not
  // a plausible-looking one (`--channel console` used to match nothing at all).
  expect(reader.stdout).toContain("ordinary chatter nobody asked for");
});

test("#1666/#1659 — a NON-console annotation is named by its disposition, never by the first word of its prose", async ({ repoRoot, runCli }) => {
  // This printer contract begins after a rate producer has classified its evidence. Plant the typed fact,
  // then drive the real index writer and browser-free reader; manufacturing hardware capability merely to
  // reach formatting would make this test depend on the host instead of the receipt it owns.
  const runId = `agent-readable-load-${String(process.pid)}`;
  const dir = join(repoRoot, "reports", "runs", "snap", runId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, ".inflight"), '{"startedAt":"2026-09-03T12:00:00.000Z"}\n');
  try {
    registerSnapFactBatch({
      id: factBatchId("agent-readable-load"),
      core: [],
      arms: [
        snapArmFact({
          arm: "app-snapshot",
          schema: "snap-arm-app-snapshot-v1",
          source: "window.__orb.snap() + Navigation Timing",
          lifetime: "settled page capture",
          scope: aggregateScope(),
          artifacts: [],
          data: { state: "load-suspect", detail: "the app-snapshot arm MEASURED on a loaded box", snapshots: 1, unavailable: 0 },
        }),
      ],
    });
    registerSnapResultPairs([
      ["app-snapshot", "load-suspect"],
      ["load-suspect", "app-snapshot"],
    ]);
    const receipt: string[] = [];
    const release = installOutputSink({ line: (line) => receipt.push(line), warn: () => undefined });
    let path: string;
    try {
      path = await completeSnapRun(
        {
          slot: { instrument: "snap", runId, dir, relDir: join("reports", "runs", "snap", runId), racing: [] },
          root: repoRoot,
          exit: EXIT.clean,
          error: null,
        },
        parseSnapArgs(["--no-shot", "--no-deadcss"]),
        ["snap", "--file", "loaded.html", "--no-shot", "--no-deadcss"],
      );
    } finally {
      release();
    }
    const collapse = receipt.find((line) => line.startsWith("annotations  "));
    expect(collapse, `no collapse line in:\n${receipt.join("\n")}`).toBeTypeOf("string");
    expect(String(collapse)).toContain("load-suspect=1");
    expect(String(collapse), "a tag derived from the first word of a sentence").not.toMatch(/\bthe=\d/u);
    const loaded = await runCli("snap", ["--report", path, "--problems"], { timeoutMs: CLI_TIMEOUT_MS });
    await expect(loaded).toExitWith(EXIT.clean);
    expect(loaded.stdout).toContain("FINDING      annotation | the app-snapshot arm MEASURED on a loaded box");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("console annotations yield to the arm the argv asked for, and stay one call away", async ({ runCli, scratch }) => {
  const file = join(scratch, "agent-readable-annotations.html");
  await writeFile(file, FIXTURE);

  // NO measuring arm was requested, so the app's own [perf]/[frame]/[cls] lines are not this run's
  // subject: they collapse to one line naming the reader that expands them.
  const quiet = await runCli("snap", ["--file", file, "--eval", "1", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  const runId = /^RUN {8}(\S+) /mu.exec(quiet.stdout)?.[1];
  expect(quiet.stdout).toMatch(/^annotations {2}perf=\d+ .*worst=\S+ → pnpm snap --report \S+ --problems --arm \S+$/mu);
  expect(quiet.stdout, "no annotation row survives the collapse").not.toMatch(/^FINDING {4}annotation/mu);
  // The CSS colour codes the app prints for the terminal are stripped from the typed row.
  expect(quiet.stdout).not.toContain("color:#c60");

  // …and the reader still has every row, typed.
  const reader = await runCli("snap", ["--report", String(runId), "--problems", "--arm", "react-profile"], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(reader).toExitWith(EXIT.clean);
  expect(reader.stdout).toMatch(/^FINDING {6}annotation \| perf slow commit .*value=30ms/mu);
  expect(reader.stdout).not.toContain("color:#c60");
});

test("a failed step is its own FINDING row, ranked above every console annotation", async ({ runCli, scratch }) => {
  const file = join(scratch, "agent-readable-wait.html");
  await writeFile(file, FIXTURE);

  // No rate arm is needed to prove terminal ranking. Ambient annotations collapse to their production
  // summary row, while the failed drive step remains a full finding above it; browser acceleration can
  // therefore neither manufacture nor mask the ordering this test owns.
  const run = await runCli("snap", ["--file", file, "--wait-for", "article#never", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });

  await expect(run).toExitWith(EXIT.violations);
  // The row names the argv to correct — the flag, the index and the selector — not just a count.
  expect(run.stdout).toMatch(/^FINDING {4}error \| step 0 --wait-for "article#never" never matched \(/mu);
  const failure = lineIndexOf(run.stdout, (line) => line.startsWith("FINDING") && line.includes("--wait-for"));
  const annotation = lineIndexOf(run.stdout, (line) => line.startsWith("annotations  "));
  expect(annotation, `the fixture's [perf] console line must produce the annotation summary:\n${run.stdout}`).toBeGreaterThan(-1);
  expect(failure).toBeGreaterThan(-1);
  expect(failure, "a failed step outranks the annotations it invalidates").toBeLessThan(annotation);
  // `next=` is the corrected reader for the drive, never a perf drill-down.
  expect(run.stdout).toMatch(/FINDING {4}error \| step 0 --wait-for .*next=pnpm snap --report \S+ --problems --channel drive/u);
});

test("--map prints the surface it mapped; the global atlas is one line until it is asked for", async ({ runCli, scratch }) => {
  const file = join(scratch, "agent-readable-map.html");
  await writeFile(file, FIXTURE);

  const map = await runCli("snap", ["--file", file, "--map", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });

  await expect(map).toExitWith(EXIT.clean);
  expect(map.stdout).toContain("--- SURFACE MAP");
  expect(map.stdout).toContain("--- CURRENT SHELL / REGIONS ---");
  // A file:// mock HAS no atlas, and an UNAVAILABLE atlas is a refusal: it always prints in full. The
  // summary/full decision for an AVAILABLE one is pinned where it lives (tests/tooling/snap/lib/
  // map-report.test.ts) because it depends on session state a one-shot CLI cannot reach.
  expect(map.stdout).toContain("NAV TARGETS unavailable");

  const atlas = await runCli("snap", ["--file", file, "--map", "--atlas", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(atlas).toExitWith(EXIT.clean);
  expect(atlas.stdout).toContain("--- SPA NAV TARGETS ---");
});

test("--reports is navigable: every row says what it was for, and --last windows it", async ({ runCli, scratch }) => {
  const file = join(scratch, "agent-readable-list.html");
  await writeFile(file, FIXTURE);
  for (const expr of ["1", "2", "3"]) {
    await runCli("snap", ["--file", file, "--eval", expr, ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  }

  const list = await runCli("snap", ["--reports", "--last", "3"], { timeoutMs: CLI_TIMEOUT_MS });

  await expect(list).toExitWith(EXIT.clean);
  // `RUN INDEX SKIPPED` is an accounting line, not a row — the window counts runs, live or pruned.
  const rows = list.stdout.split("\n").filter((line) => /^(?:RUN \S+ checkout=|PRUNED )/u.test(line));
  expect(rows, list.stdout).toHaveLength(3);
  for (const row of rows.filter((line) => line.startsWith("RUN "))) {
    expect(row, "a run row maps back to the command that made it").toMatch(/ out=\S+ route=\S+ arms=\S+ /u);
  }
  // A filter it does not understand REFUSES by name: silently printing the full window would read as a
  // filtered one.
  const bogus = await runCli("snap", ["--reports", "--lastest", "3"], { timeoutMs: CLI_TIMEOUT_MS });
  await expect(bogus).toExitWith(EXIT.misuse);
  expect(bogus.stdout).toContain("unknown --reports flag --lastest");
});

test("--out on a cheap-ladder run is not an ARG WARNING, and on a bare --no-shot run it still is", async ({ runCli, scratch }) => {
  const file = join(scratch, "agent-readable-warning.html");
  await writeFile(file, FIXTURE);

  const ladder = await runCli("snap", ["--file", file, "--out", "agent-readable-ladder", "--eval", "1", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  expect(ladder.stdout).not.toContain("NO IMAGE WILL BE WRITTEN");

  // The control: nothing but `--out` and `--no-shot` — the case the warning was written for.
  const bare = await runCli("snap", ["--file", file, "--out", "agent-readable-bare", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });
  expect(bare.stdout).toContain("NO IMAGE WILL BE WRITTEN");
});

test("#1556/#1675 — the 4 KB budget measures the agent-readable body; the racing census is excluded and pinned", async ({ repoRoot, runCli, scratch }) => {
  const file = join(scratch, "agent-readable-concurrency.html");
  await writeFile(file, FIXTURE);

  // PLANTED RACING SLOT. The census in tooling/src/_shared/artifacts.ts calls a sibling slot live when its
  // `.inflight` marker names a pid that answers signal 0 — so a directory naming THIS vitest process is a
  // second live run as far as the next snap child is concerned, and it is deterministic where
  // co-scheduling two suites is not. If that marker name ever changes, the CONCURRENT assertion below goes
  // RED rather than silently measuring an uncontended run.
  const racingId = `planted-racer-${String(process.pid)}`;
  const racingDir = join(repoRoot, "reports", "runs", "snap", racingId);
  await mkdir(racingDir, { recursive: true });
  await writeFile(
    join(racingDir, ".inflight"),
    `${JSON.stringify({ runId: racingId, pid: process.pid, checkout: "planted", startedAt: new Date(FROZEN_AT_MS).toISOString() })}\n`,
  );

  try {
    const run = await runCli("snap", ["--file", file, "--eval", "document.title", ...QUIET], { timeoutMs: CLI_TIMEOUT_MS });

    await expect(run).toExitWith(EXIT.clean);
    // The plant fired: this run really did see a racing sibling, so the two provenance lines really are
    // carrying a census here.
    // The planted racer must be IN the census — never that it is the only one or the first: this file runs
    // beside its own siblings, each of which is a real live snap run, and pinning position made this arm
    // fail under exactly the co-scheduling #1675 is about.
    const concurrent = run.stdout.split("\n").find((line) => line.startsWith("CONCURRENT"));
    expect(concurrent, `the planted racing slot did not reach the run's census:\n${run.stdout}`).toContain(racingId);
    const provenance = run.stdout.split("\n").find((line) => line.startsWith("PROVENANCE"));
    expect(provenance, "the census rides the PROVENANCE line too — that is why it is excluded twice").toContain("concurrency=");
    expect(provenance).toContain(racingId);

    // THE RULING: the body stays inside the budget while the census is live…
    const body = agentReadableBody(run.stdout);
    expect(body.length, `the agent-readable body was ${String(body.length)} bytes:\n${run.stdout}`).toBeLessThan(STDOUT_BUDGET_BYTES);
    // …and the exclusion removes EXACTLY the two provenance lines, never a line of the body: what came off
    // is byte-identical to those lines, so the budget cannot be widened by mislabelling something else as
    // provenance.
    const excluded = run.stdout.split("\n").filter((line) => PROVENANCE_PREFIXES.some((prefix) => line.startsWith(prefix)));
    expect(excluded, "a run always states its provenance; both lines must be present to be excluded").toHaveLength(PROVENANCE_PREFIXES.length);
    expect(run.stdout.length - body.length).toBe(excluded.reduce((total, line) => total + line.length + 1, 0));
  } finally {
    await rm(racingDir, { recursive: true, force: true });
  }
});
