// THE `--design-audit` ARM: the deterministic UI defect scan, as one of Snap's arms (#1315).
//
// THE RETIRED `pnpm design-audit` HAS NO EXECUTION PATH. The scan is `pnpm snap <route> --design-audit`,
// and everything a caller used to get from the sibling CLI it now gets from Snap for free: the isolated
// stage, the session, the appearance/theme shims, the `--pages`/`--contexts` fan-out, the run slot, the
// typed facts, `--report --problems`, the matrix. The 14k-line detector engine stayed exactly where it
// was and is entered through `ui-audit/index.ts` (the motion-audit precedent, 1208 §10.6/§12.3).
//
// WHY THIS IS A `run` ARM AND NOT A `page` ARM (a deliberate deviation from the census's §4.1 sketch,
// stated here rather than in a report nobody re-reads). The walk needs three things `ArmPageContext` does
// not carry and cannot be given without widening every page arm's context: the SESSION (its page-error
// rings, for the `script-error` findings and the instrument-page-error gap), the CONTEXT's settings-shim
// evidence (theme provenance), and the environment CONTRACT (the hover capability the forced-state pass
// is gated on). A run arm receives the session at `begin()` — the shape `ops/arms/motion.ts` already uses
// for exactly the same reason — and its `afterSettle` hook runs on the SETTLED page, after the drive
// queue, BEFORE the settled-surface page arms and therefore before the shutter. So the pass order is the
// one the census asked for; only the lifecycle union member differs.
//
// EXIT SEMANTICS, both halves (census §2.6/§2.8):
//   • a NO-VERDICT run — a nav error, a reveal action that did not land, a declared failure surface, an
//     empty/thin census, an unreached control population, or any EvidenceGap — is `EXIT.toolError`,
//     whatever else the run found. ui-audit's "a failed reveal action is NO VERDICT" semantic survives
//     the fold, which is why the arm reads its own nav/step failure counters off the tape rather than
//     inheriting Snap's `steps-failed=1` exit-1 shape.
//   • otherwise `--fail-on <P0..P3>` decides: exit 1 at that severity or worse, else clean.
import { writeFile } from "node:fs/promises";
import { artifactFile } from "../../../_shared/artifact-out.ts";
import { aggregateScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import type { ProbeSession } from "../../../_shared/browser-contract.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { EvidenceGap, VerdictDenominator } from "../../../_shared/evidence.ts";
import { EXIT } from "../../../_shared/exit-contract.ts";
import type { DesignAuditSeverity } from "../../../ui-audit/index.ts";
import { isAtOrAboveSeverity, isValidSeverity } from "../../../ui-audit/index.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmRunInstance, ArmSharedContext } from "../../contract/arms.ts";
import type { Args } from "../../contract/types.ts";
import { DESIGN_AUDIT_SESSION_CALL_BASE_MS } from "../../lib/budgets.ts";
import { designAuditProblems } from "../../lib/design-audit-problems.ts";
import { designAuditDenominators, designAuditPairs, printDesignAudit } from "../../lib/design-audit-report.ts";
import type { DesignAuditMeasurement } from "../design-audit-walk.ts";
import { walkDesignAudit } from "../design-audit-walk.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

const DEFAULT_FAIL_ON: DesignAuditSeverity = "P1";
/** The arm walks PAGE 0. A `--pages` fan-out captures N tabs; the scan's whole vocabulary (the shell
 *  declare, the surface-state axes, the reach denominator) is about ONE surface, and publishing N of them
 *  under one RESULT line would be a population nobody declared. */
const AUDITED_PAGE_INDEX = 0;

interface DesignAuditState {
  navError: string | null;
  failures: number;
  measurement: DesignAuditMeasurement | null;
  artifact: string | null;
}

function failOnHandler(args: Args, rest: string[]): void {
  const value = rest.shift() ?? "";
  if (!isValidSeverity(value)) {
    args.errors.push(`--fail-on takes a severity (P0|P1|P2|P3), got ${JSON.stringify(value)}`);
    return;
  }
  args.failOn = value;
}

/** The artifact — the whole report, registered under this arm so `ops/run-bundle.ts` binds it to the
 *  arm's fact and `--report … --problems` can read it without the source (#1342). `completeness` is
 *  BOUNDED exactly when the walker truncated a census: a `censusCaps` row with `dropped > 0` means the
 *  scan completed but only `cap` carriers left the page, which makes the verdict partial (#1038). */
/** `complete`, or the gap with a `verdict` discriminator in front of it — the exact shape the retired
 *  CLI's artifact carried, so every downstream reader of a design-audit report survives the fold. */
function verdictField(gap: EvidenceGap | null): "complete" | { readonly verdict: "NO VERDICT"; readonly evidence: string; readonly detail: string } {
  return gap === null ? "complete" : { verdict: "NO VERDICT", ...gap };
}

/** The same channel, as the typed run FACT spells it (#1538): a flat enum, and `no-verdict` when there is
 *  no measurement at all — an absent walk reached no channel, so none of them may read `complete`. */
function factVerdict(measurement: DesignAuditMeasurement | null, channel: keyof DesignAuditMeasurement["verdicts"]): "complete" | "no-verdict" {
  return measurement !== null && measurement.verdicts[channel] === null ? "complete" : "no-verdict";
}

async function writeAuditArtifact(name: string, opts: Args, measurement: DesignAuditMeasurement): Promise<string> {
  const caps = measurement.samples === null ? null : measurement.samples.censusCaps;
  const truncated = Object.values(caps ?? {}).some((row) => row.dropped > 0);
  const path = await artifactFile("design-audit", `${name}-design-audit`, ".json", {
    producer: "design-audit",
    producerArm: "design-audit",
    channel: "design-audit-report",
    mediaType: "application/json",
    schema: "snap-design-audit-v1",
    role: "primary",
    completeness: truncated ? "bounded" : "complete",
    completenessDetail: truncated
      ? "one or more walker censuses hit their representative bound — the per-family cap ledger states what was dropped"
      : "every censused subject reached its rule dispatch; the per-rule population rows settle candidates = judged + withheld + excluded",
    scope: aggregateScope(),
    records: measurement.findings.length,
    limits: [],
  });
  await writeFile(
    path,
    `${JSON.stringify(
      {
        contract: "snap-design-audit-v1",
        route: opts.route,
        url: measurement.url,
        viewport: opts.viewport,
        device: opts.device,
        browserEnvironment: measurement.environment,
        actions: opts.actions,
        actionsFailed: measurement.actionsFailed,
        navError: measurement.navError,
        failOn: opts.failOn,
        findings: measurement.findings,
        counts: measurement.counts,
        pixelSampledBackdrops: measurement.pixelSampled,
        backdropRefusals: measurement.backdropRefusals,
        censusReach: measurement.reach ?? null,
        obscuredRecentred: measurement.samples?.obscuredScan?.recentred ?? 0,
        obscuredUnaskable: measurement.samples?.obscuredScan?.subjects ?? [],
        hoverPass: measurement.hover,
        populationAccounting: measurement.populationAccounting,
        censusCaps: caps,
        // The page's own frame against the viewport it was judged at — carried whether or not it
        // refused, because a JSON consumer reading a CLEAN geometry verdict is entitled to the numbers
        // that made it clean (ui-audit/contract/samples-evidence.ts `DocumentFrameInput`).
        documentFrame: measurement.samples === null ? null : measurement.samples.documentFrame,
        // THE SIX NAMED CHANNELS (#1087 F1; the sixth by lane cb-audit-viewport). One field per channel,
        // because "NO VERDICT" without WHICH-half is not actionable: a truncated census is repaired by
        // raising a bound, a broken forced-state pass by fixing the harness, a crushed frame by auditing
        // at a wider viewport. `complete` is only ever written over a channel the walk actually reached —
        // a terminal run stamps its own gap into all six.
        viewportFrameVerdict: verdictField(measurement.verdicts.viewportFrame),
        censusCapVerdict: verdictField(measurement.verdicts.censusCap),
        populationVerdict: verdictField(measurement.verdicts.population),
        hoverVerdict: verdictField(measurement.verdicts.hover),
        forceVerdict: verdictField(measurement.verdicts.force),
        instrumentPageErrorVerdict: verdictField(measurement.verdicts.instrumentPageError),
        evidenceGaps: measurement.gaps,
        terminalGap: measurement.terminalGap,
        themeEvidence: measurement.themeEvidence,
        domPopulation: measurement.population,
        shellState: measurement.shellState,
        surfaceStateAccounting: measurement.surfaceState,
        drive: measurement.drive,
        // #1326: every emitted selector, and how many elements it actually resolves to. #1538: plus the
        // remainder the proof cap never asked about, so a truncated list cannot read as a complete one.
        selectorProof: measurement.selectorProof,
        selectorsUnproven: measurement.selectorsUnproven,
        problems: designAuditProblems({
          findings: measurement.findings,
          gaps: measurement.terminalGap === null ? measurement.gaps : [measurement.terminalGap],
          failOn: opts.failOn,
          selectorProof: measurement.selectorProof,
          selectorsUnproven: measurement.selectorsUnproven,
        }),
      },
      null,
      2,
    )}\n`,
  );
  return path;
}

function auditState(measurement: DesignAuditMeasurement | null, failOn: DesignAuditSeverity): "off" | "withheld" | "failed" | "passed" {
  if (measurement === null) {
    return "withheld";
  }
  if (measurement.terminalGap !== null || measurement.gaps.length > 0) {
    return "withheld";
  }
  return measurement.findings.some((finding) => isAtOrAboveSeverity(finding.severity, failOn)) ? "failed" : "passed";
}

export const DESIGN_AUDIT_ARM = {
  flags: [
    {
      flag: "--design-audit",
      kind: "boolean",
      pageTargetable: false,
      group: "Judge",
      summary: "the deterministic UI defect scan — the whole ui-audit rule engine over the settled surface",
      handler: (args): void => {
        args.designAudit = true;
      },
    },
    {
      flag: "--fail-on",
      kind: "required-value",
      pageTargetable: false,
      group: "Judge",
      summary: "--design-audit exits 1 at this severity or worse (P0\\|P1\\|P2\\|P3, default P1)",
      handler: failOnHandler,
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (opts): number | null => (opts.designAudit ? DESIGN_AUDIT_SESSION_CALL_BASE_MS : null),
  defaults: (): Pick<ArmArgs, "designAudit" | "failOn"> => ({ designAudit: false, failOn: DEFAULT_FAIL_ON }),
  help: `  --design-audit          the deterministic UI defect scan over the settled surface: ~60 objective
                          usability/design/a11y rules, each with a selector proven against the live DOM
                          and a complete population row. A selector that does not resolve to exactly one
                          element, or that the proof cap never reached, rides on its own SELECTOR line
                          and in selectors-ambiguous / selectors-unproven — that is an instrument limit,
                          not the app's verdict, so it does not change the exit code. Exit 2 (NO VERDICT)
                          rather than a clean report whenever the page never loaded, a reveal action did
                          not land, the app declared a failure surface, or a rule population was not
                          completely judged. POSITIVE CONTROL: --eval is the channel — a trailing --eval
                          runs on the settled surface BEFORE this walk (#1659), so an expression that
                          appends a defective element is counted by the census in the SAME invocation. On
                          a COLD --dirty stage pass --idle: two consecutive audits answered NO VERDICT
                          (data-app-ready DEGRADED) without it.
  --fail-on <P0..P3>      the severity --design-audit exits 1 at (default P1)`,
  result: {
    schema: "snap-arm-design-audit-v1",
    source: "ui-audit in-page walker + rule engine",
    lifetime: "one settled-surface walk",
    enabled: (opts): boolean => opts.designAudit,
  },
  lifecycle: {
    at: "run",
    begin: (session: ProbeSession, opts: Args, _shared: ArmSharedContext): ArmRunInstance<"design-audit"> => {
      const state: DesignAuditState = { navError: null, failures: 0, measurement: null, artifact: null };
      return {
        prepare: (): Promise<void> => Promise.resolve(),
        afterNavigation: (ctx): Promise<void> => {
          if (ctx.pageIndex === AUDITED_PAGE_INDEX) {
            // Snap's four-state readiness ladder already folded `absent`/`degraded`/`dataless` in here,
            // so this ONE value is the whole "did the surface this run is about actually arrive" question.
            state.navError = ctx.navError;
          }
          return Promise.resolve();
        },
        beforeAction: (): Promise<null> => Promise.resolve(null),
        afterAction: (ctx): Promise<void> => {
          if (ctx.pageIndex === AUDITED_PAGE_INDEX && ctx.failed) {
            state.failures += 1;
          }
          return Promise.resolve();
        },
        afterActions: (): Promise<void> => Promise.resolve(),
        afterSettle: async (ctx): Promise<void> => {
          if (!opts.designAudit || ctx.pageIndex !== AUDITED_PAGE_INDEX) {
            return;
          }
          state.measurement = await walkDesignAudit({
            session,
            page: ctx.page,
            opts,
            navError: state.navError,
            actionsFailed: state.failures,
          });
        },
        measure: async (ctx): Promise<void> => {
          if (state.measurement !== null) {
            state.artifact = await writeAuditArtifact(ctx.name, opts, state.measurement);
          }
        },
        report: (): Promise<void> => {
          if (opts.designAudit && state.measurement !== null) {
            printDesignAudit(state.measurement, state.artifact);
          }
          return Promise.resolve();
        },
        failures: (): ArmFailureCounts => ({}),
        denominators: (): Readonly<Record<string, VerdictDenominator>> => (opts.designAudit ? designAuditDenominators(state.measurement) : {}),
        pairs: (): readonly ResultPair[] => designAuditPairs(opts.designAudit, state.measurement, opts.failOn),
        facts: (): readonly ArmFactEmission<"design-audit">[] => {
          const measurement = state.measurement;
          const gap = measurement?.terminalGap ?? measurement?.gaps[0] ?? null;
          return [
            {
              scope: aggregateScope(),
              data: {
                state: opts.designAudit ? auditState(measurement, opts.failOn) : "off",
                detail: gap === null ? null : `${gap.evidence}: ${gap.detail}`,
                findings: measurement?.findings.length ?? 0,
                p0: measurement?.counts.P0 ?? 0,
                p1: measurement?.counts.P1 ?? 0,
                p2: measurement?.counts.P2 ?? 0,
                p3: measurement?.counts.P3 ?? 0,
                census: measurement?.census ?? 0,
                failOn: opts.failOn,
                // ALL SIX CHANNELS (#1538) — a fact-only consumer must be able to tell a truncated
                // census from a broken forced-state pass from a crushed frame, which one boolean cannot
                // say. A measurement that does not exist is `no-verdict` on every channel, not silently
                // complete.
                viewportFrameVerdict: factVerdict(measurement, "viewportFrame"),
                censusCapVerdict: factVerdict(measurement, "censusCap"),
                populationVerdict: factVerdict(measurement, "population"),
                hoverVerdict: factVerdict(measurement, "hover"),
                forceVerdict: factVerdict(measurement, "force"),
                instrumentPageErrorVerdict: factVerdict(measurement, "instrumentPageError"),
                ambiguousSelectors: measurement?.selectorProof.filter((proof) => proof.matches !== 1).length ?? 0,
                unprovenSelectors: measurement?.selectorsUnproven ?? 0,
                artifact: null,
              },
            },
          ];
        },
        exit: (code: number): number => {
          if (!opts.designAudit) {
            return code;
          }
          const measurement = state.measurement;
          // A REFUSAL IS NOT A VERDICT ABOUT THE APP and outranks everything else the run found.
          if (measurement === null || measurement.terminalGap !== null || measurement.gaps.length > 0) {
            return EXIT.toolError;
          }
          if (code === EXIT.toolError) {
            return code;
          }
          return measurement.findings.some((finding) => isAtOrAboveSeverity(finding.severity, opts.failOn)) ? EXIT.violations : code;
        },
      };
    },
  },
} satisfies ArmDef<"design-audit">;
