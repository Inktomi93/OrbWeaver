// The forced-state pass's FAILURE arm — the one `ops/hover.ts` recorded as having no fixture (#1093).
//
// MIRRORS `ops/hover.ts`, the Node half of the pass. Its header states the divergence it keeps on
// purpose: a group that throws mid-force is demoted to a per-group WITHHOLDING rather than aborting the
// run (#1031), and `forceFailedGroups` publishes the complete count so a glow-only group's failure cannot
// contribute zero (#1087 F2). Both of those are VERDICT behaviour, and neither was pinnable: a group
// fails only when CDP or the page throws mid-pass, which no static `file://` document produces. The
// recorded refusal was a fault hook inside this instrument — "exactly the class of change that makes a
// tool lie about itself" — and the recorded closer was a CDP fault injector at the probe layer.
//
// THAT INJECTOR IS `_shared/browser.ts`'s (`ORB_PROBE_TEST_CDP_FAULT`), and it is protocol-level: it
// wraps the sessions a context hands out, so ops/hover.ts is unchanged and cannot see it. These arms
// drive the REAL cli against a real page with the real protocol; only the named method is refused.
//
// RED-FIRST: on the pre-injector source the environment variable means nothing, so every arm below reads
// `forceFailedGroups=0`, `forceVerdict="complete"` and exit 0 — a clean measurement of a page whose
// forced-state pass was supposed to have failed.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliResult, RunCliOpts } from "../../../support/tool-fixtures.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, auditReport, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../support/ui-audit-relational.ts";

/** The env key `_shared/browser.ts` reads. Spelled here rather than imported so this pin exercises the
 *  PROTOCOL the injector publishes to a spawned process, exactly as an operator would. */
const CDP_FAULT_ENV = "ORB_PROBE_TEST_CDP_FAULT";

interface HoverFailureReport {
  readonly populationAccounting?: Readonly<Record<string, { readonly judged: number; readonly withheld: Readonly<Record<string, number>> }>>;
  readonly hoverPass: { readonly forceFailedGroups: number; readonly forceFailures: readonly string[] } | null;
  readonly forceVerdict: unknown;
}

/** One subject, one painted element: exactly one hover group, so a fault on every `forcePseudoState`
 *  fails the whole (single) group. */
const ONE_SUBJECT_FIXTURE = `<style>
.solo-label { display: inline-block; color: #8a8a8a; }
.solo-label:hover { color: #ffffff; }
</style>
<span class="solo-label">self-driven label</span>`;

/** TWO subjects over one painted element — two groups, so an OCCURRENCE-scoped fault fails one and
 *  leaves the other measured. That is the shape #1031's demotion ruling is about, and a fault injector
 *  without an occurrence selector could only ever produce the whole-run arm. */
const TWO_SUBJECT_FIXTURE = `<style>
.pair-label { color: #8a8a8a; }
.row:hover .pair-label { color: #d2d2d2; }
.card:hover .pair-label { color: #ffffff; }
</style>
<div class="row" style="padding:24px"><div class="card" style="padding:8px"><span class="pair-label">two-subject label</span></div></div>`;

type RunCli = (tool: string, args: readonly string[], opts?: RunCliOpts) => Promise<CliResult>;

interface AuditRun {
  readonly scratch: string;
  readonly runCli: RunCli;
  readonly name: string;
  readonly body: string;
  /** null = the negative control (no injection at all), never an empty spec — the injector REFUSES one. */
  readonly fault: string | null;
}

async function auditFixture({ scratch, runCli, name, body, fault }: AuditRun): Promise<{ readonly res: CliResult; readonly report: HoverFailureReport }> {
  const file = join(scratch, `${name}.html`);
  await writeFile(file, relationalDocument(body));
  const res = await runCli("snap", ["--file", file, ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
    ...(fault === null ? {} : { env: { [CDP_FAULT_ENV]: fault } }),
  });
  return { res, report: JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as HoverFailureReport };
}

test("the NEGATIVE control: the same page with no injected fault forces cleanly and publishes a complete force verdict", async ({ runCli, scratch }) => {
  const { res, report } = await auditFixture({ scratch, runCli, name: "force-clean", body: ONE_SUBJECT_FIXTURE, fault: null });

  // Without this arm a green failure-pin proves nothing: an injector wired to fault UNCONDITIONALLY
  // would satisfy every assertion in the next test.
  expect(report.hoverPass?.forceFailedGroups).toBe(0);
  expect(report.forceVerdict).toBe("complete");
  expect(report.populationAccounting?.["hover-contrast"]?.judged).toBe(1);
  expect(res.stderr).not.toContain("CDP FAULT INJECTION ACTIVE");
  await expect(res).toExitWith(0);
});

test("a refused CSS.forcePseudoState withholds the group instead of publishing a clean measurement", async ({ runCli, scratch }) => {
  const { res, report } = await auditFixture({ scratch, runCli, name: "force-refused", body: ONE_SUBJECT_FIXTURE, fault: "CSS.forcePseudoState" });

  expect(report.hoverPass?.forceFailedGroups).toBe(1);
  expect(report.hoverPass?.forceFailures.join(" ")).toContain("CSS.forcePseudoState");
  // The candidate is WITHHELD by name, never judged from an unforced read, and the run is NO VERDICT.
  expect(report.populationAccounting?.["hover-contrast"]?.withheld["forceFailed"]).toBe(1);
  expect(report.populationAccounting?.["hover-contrast"]?.judged).toBe(0);
  expect(report.forceVerdict).not.toBe("complete");
  // The injector ANNOUNCES itself: a run taken under planted faults must never read as a measurement.
  expect(res.stderr).toContain("CDP FAULT INJECTION ACTIVE");
  await expect(res).toExitWith(2);
});

test("an OCCURRENCE-scoped fault fails one group and leaves the other measured — the per-group demotion, not a whole-run abort", async ({
  runCli,
  scratch,
}) => {
  const { res, report } = await auditFixture({ scratch, runCli, name: "force-partial", body: TWO_SUBJECT_FIXTURE, fault: "DOM.requestNode@1" });

  // The #1031 ruling made visible: one bad node is a bad node, not a broken instrument — the surviving
  // group keeps its measurement while the failed one is withheld.
  expect(report.hoverPass?.forceFailedGroups).toBe(1);
  expect(report.populationAccounting?.["hover-contrast"]?.withheld["forceFailed"]).toBe(1);
  expect(report.populationAccounting?.["hover-contrast"]?.judged).toBe(1);
  expect(report.forceVerdict).not.toBe("complete");
  await expect(res).toExitWith(2);
});

test("a fault spec the injector cannot parse REFUSES the run — it never quietly declines to inject", async ({ runCli, scratch }) => {
  const file = join(scratch, "force-misspec.html");
  await writeFile(file, relationalDocument(ONE_SUBJECT_FIXTURE));
  const res = await runCli("snap", ["--file", file, ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
    env: { [CDP_FAULT_ENV]: "forcePseudoState" },
  });

  // The blind-zero class, one level down: an injector that shrugged at a misspelled method would hand
  // back a CLEAN run for a fixture whose whole purpose was to fail, and the pin would go green forever.
  expect(res.stderr).toContain("CDP FAULT REFUSED");
  await expect(res).toExitWith(2);
});
