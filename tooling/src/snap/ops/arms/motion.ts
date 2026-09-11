// Selective motion analyzer over Snap's one ordered tape. Reach actions have already run when the tagged
// motion-click arrives; this arm resolves geometry, resets in-page evidence, then owns exactly that click
// and its observation window inside one CDP PipelineReporter trace.

import { writeFile } from "node:fs/promises";
import { readRuntimeAppearanceContract } from "../../../_shared/appearance-matrix.ts";
import { artifactFile } from "../../../_shared/artifact-out.ts";
import { exactScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { print } from "../../../_shared/artifacts.ts";
import type { ProbeSession } from "../../../_shared/browser-contract.ts";
import { pageErrorText } from "../../../_shared/browser-contract.ts";
import { readBrowserEnvironment } from "../../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { EvidenceGap, VerdictDenominator } from "../../../_shared/evidence.ts";
import { printEvidenceGaps } from "../../../_shared/evidence.ts";
import { EXIT } from "../../../_shared/exit-contract.ts";
import type { AuditData } from "../../../motion-audit/index.ts";
import {
  animationTotals,
  apparatusGap,
  clsBudgetBasis,
  clsBudgeted,
  clsTotals,
  evaluateMotionAudit,
  framePopulationBasis,
  hasOrbBridge,
  loafTotals,
  observedClsTotals,
  prepareMeasuredClick,
  runAudit,
} from "../../../motion-audit/index.ts";
import type {
  ArmActionContext,
  ArmActionDisposition,
  ArmArgs,
  ArmDef,
  ArmFactEmission,
  ArmFailureCounts,
  ArmNeeds,
  ArmRunInstance,
  ArmSharedContext,
} from "../../contract/arms.ts";
import type { Args } from "../../contract/types.ts";
import { motionLoadSuspect, motionQueueHint, rateEvidenceGaps } from "../../lib/motion-gaps.ts";
import { motionProblems } from "../../lib/motion-problems.ts";
import type { SnapRatePosture } from "../../lib/rate-posture.ts";
import { consumeOptionalSelector, pushStep } from "../flags-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const DEFAULT_MOTION_WINDOW_MS = 2500;
const MOTION_THROTTLE_RATE = 4;
const RESET_AFTER_GEOMETRY = `new Promise((resolve, reject) => requestAnimationFrame(() => requestAnimationFrame(() => {
  try {
    if (typeof globalThis.__orb?.resetEvidence !== "function") throw new Error("__orb.resetEvidence is unavailable");
    globalThis.__orb.resetEvidence(); resolve();
  } catch (error) { reject(error); }
})))`;

interface MotionMeasurement {
  readonly data: AuditData | null;
  readonly gaps: readonly EvidenceGap[];
  readonly pass: boolean;
  readonly artifact: string | null;
  /** Non-null when the numbers were measured on a LOADED box (#1616): they are reported in full, the
   *  budget verdict reads `unjudged`, and the arm's own member is `LOAD-SUSPECT` — never PASS or FAIL. */
  readonly loadSuspect: string | null;
}

const MOTION_RECEIPTS = new WeakMap<object, AuditData | null>();

/** Matrix-only in-memory handoff. The Snap matrix consumes the exact data the arm judged; it never
 *  reopens the just-written JSON artifact or runs the retired motion browser path. */
export function motionReceiptFor(session: object): AuditData | null {
  return MOTION_RECEIPTS.get(session) ?? null;
}

function frameToken(dropped: number, total: number): string {
  return `${String(dropped)}/${String(total)}`;
}

async function applicationMotionEvidence(session: ProbeSession, opts: Args): Promise<AuditData["applicationMotion"]> {
  // @orb-waive caught-failure-ownership(catch): this optional appearance cross-check is null in ordinary non-app fixtures; rated matrix cells consume the same contract through their mandatory matrix receipt. Ends if applicationMotion becomes a verdict input outside that matrix receipt.
  try {
    const contract = await readRuntimeAppearanceContract(session.page);
    const row = contract.rows.find((candidate) => candidate.key === "reducedMotion");
    const requested = opts.appearance !== null && Object.hasOwn(opts.appearance, "reducedMotion") ? opts.appearance["reducedMotion"] : null;
    return {
      requested: typeof requested === "boolean" ? requested : null,
      applied: session.contexts[0]?.settingsEvidence.appearanceApplied ?? null,
      reached: row?.reached ?? 0,
      samples: row?.samples ?? [],
    };
  } catch {
    return null;
  }
}

async function settleAndReset(page: ArmActionContext["page"], selector: string | null, actionIndex: number): Promise<void> {
  try {
    await page.evaluate(`(() => {
      if (typeof globalThis.__orb?.motionFlaggersSettled !== "function") throw new Error("__orb.motionFlaggersSettled is unavailable");
      return globalThis.__orb.motionFlaggersSettled();
    })()`);
  } catch (error) {
    throw new Error(`motion flagger settle barrier: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  const resetPhase = selector === null && actionIndex > 0 ? "post-reach evidence reset" : "pre-measurement evidence reset";
  try {
    await page.evaluate(RESET_AFTER_GEOMETRY);
  } catch (error) {
    throw new Error(`${resetPhase}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

async function measureMotionAction(
  input: Readonly<{
    session: ProbeSession;
    opts: Args;
    ctx: ArmActionContext;
    selector: string | null;
    ratePosture: SnapRatePosture;
  }>,
): Promise<MotionMeasurement> {
  const { session, opts, ctx, selector, ratePosture } = input;
  const page = ctx.page;
  const queueHint = motionQueueHint(opts, ctx.actionIndex);
  const gap = apparatusGap({ url: page.url(), ready: true, bridge: await hasOrbBridge(page), readyTimeoutMs: 0 });
  if (gap !== null) {
    return { data: null, gaps: queueHint === null ? [gap] : [gap, queueHint], pass: false, artifact: null, loadSuspect: null };
  }
  const cdp = await page.context().newCDPSession(page);
  // @orb-waive caught-failure-ownership(error): the caught measurement failure becomes a named evidence gap, printed as REFUSED and forced to exit 2 by the arm. Ends if the returned gaps stop feeding report/pairs/exit.
  try {
    if (opts.motionThrottle) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: MOTION_THROTTLE_RATE });
    }
    const environment = await readBrowserEnvironment(page, session.environmentContract);
    const measuredClick = await prepareMeasuredClick(page, selector);
    await settleAndReset(page, selector, ctx.actionIndex);
    const raw = await runAudit(page, cdp, { selector, windowMs: opts.motionWindowMs }, measuredClick);
    const data: AuditData = {
      ...raw,
      environment,
      applicationMotion: await applicationMotionEvidence(session, opts),
      pageErrors: session.pageErrors.map(pageErrorText),
      reachFailures: ctx.navFailuresBefore + ctx.stepFailuresBefore,
    };
    const evaluated = evaluateMotionAudit(data, opts.motionWindowMs);
    const gaps: EvidenceGap[] = [...evaluated.gaps, ...rateEvidenceGaps(ratePosture)];
    // Only a run that ALREADY could not measure gets the hint — on a clean window, measure-then-navigate
    // is an ordinary chain and a lecture about argv order would be noise.
    if (gaps.length > 0 && queueHint !== null) {
      gaps.push(queueHint);
    }
    return { data, gaps, pass: evaluated.budgetsPass, artifact: null, loadSuspect: motionLoadSuspect(ratePosture) };
  } catch (error) {
    return {
      data: null,
      gaps: [
        { evidence: "the motion measurement window", detail: error instanceof Error ? error.message : String(error) },
        ...(queueHint === null ? [] : [queueHint]),
      ],
      pass: false,
      artifact: null,
      loadSuspect: null,
    };
  } finally {
    try {
      if (opts.motionThrottle) {
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      }
    } finally {
      await cdp.detach();
    }
  }
}

function motionDenominators(measurement: MotionMeasurement | null, measuredCount: number): Readonly<Record<string, VerdictDenominator>> {
  const frames = measurement?.data?.frames;
  if (frames === undefined) {
    return {};
  }
  return {
    "motion-windows": { value: measuredCount, refuseWhen: "zero" },
    "motion-raw-frames": { value: frames.raw.total, refuseWhen: "zero" },
  };
}

/** The FACT's member — the terminal's twin, so a run-index reader reaches the same verdict (#1616). A
 *  load-suspect window read as `passed` would be exactly the promotion the ruling forbids. */
function motionFactState(requested: boolean, measurement: MotionMeasurement | null): "off" | "refused" | "load-suspect" | "passed" | "failed" {
  if (!requested) {
    return "off";
  }
  if (measurement === null || measurement.gaps.length > 0) {
    return "refused";
  }
  if (measurement.loadSuspect !== null) {
    return "load-suspect";
  }
  return measurement.pass ? "passed" : "failed";
}

/** The arm's own member. `LOAD-SUSPECT` sits between REFUSED and PASS/FAIL (#1616): the window MEASURED,
 *  so it is not a refusal, and nothing may promote the numbers, so it is neither PASS nor FAIL. */
function motionStatus(snapshot: MotionMeasurement, budgetsPass: boolean): string {
  if (snapshot.gaps.length > 0) {
    return "REFUSED";
  }
  if (snapshot.loadSuspect !== null) {
    return "LOAD-SUSPECT";
  }
  return budgetsPass ? "PASS" : "FAIL";
}

function motionPairs(opts: Args, snapshot: MotionMeasurement | null): readonly ResultPair[] {
  if (!opts.motion) {
    return [["motion", "off"]];
  }
  if (snapshot === null || snapshot.data === null) {
    return [["motion", "REFUSED"]];
  }
  const data = snapshot.data;
  const evaluation = evaluateMotionAudit(data, opts.motionWindowMs);
  const cls = clsTotals(data.motion);
  const observed = observedClsTotals(data.motion);
  const loaf = loafTotals(data.motion);
  const animations = animationTotals(data.animations, data.flags);
  const status = motionStatus(snapshot, evaluation.budgetsPass);
  return [
    ["motion", status],
    ["motion-artifact", snapshot.artifact ?? "absent"],
    ["motion-window-ms", opts.motionWindowMs],
    ["measured-input", data.measuredInput ? 1 : 0],
    ["frames-raw", frameToken(data.frames.raw.dropped, data.frames.raw.total)],
    ["frames-budgeted", frameToken(data.frames.budgeted.dropped, data.frames.budgeted.total)],
    ["frames-population-raw", framePopulationBasis(data.frames.raw.total)],
    ["frames-population-budgeted", framePopulationBasis(data.frames.budgeted.total)],
    // UNJUDGED under load (#1616): the budget arithmetic still ran and every number above is printed, but
    // a threshold verdict on a loaded box is precisely the promotion the label exists to prevent.
    ["frames-budget", snapshot.loadSuspect !== null || !evaluation.framesBudgetJudged ? "unjudged" : "judged"],
    ["worst-blocking-raw", `${String(loaf.rawWorstBlocking)}ms`],
    ["worst-blocking-budgeted", `${String(loaf.budgetedWorstBlocking)}ms`],
    ["cls-raw", cls.raw],
    ["cls-virtualized", cls.virtualized],
    ["cls-non-virtualized", cls.budgeted],
    ["cls-budget-basis", clsBudgetBasis(data.measuredInput)],
    ["cls-budgeted", clsBudgeted(data.motion, data.measuredInput) ?? "absent"],
    ["cls-observed-raw", observed === null ? "absent" : observed.raw],
    ["cls-observed-virtualized", observed === null ? "absent" : observed.virtualized],
    ["cls-observed-non-virtualized", observed === null ? "absent" : observed.budgeted],
    ["loaf-style-in-frame-raw", data.motion?.loafs.filter((entry) => entry.styleAndLayoutStart > 0).length ?? 0],
    ["loaf-style-in-frame-budgeted", loaf.budgetedStyleLayout],
    ["dirty-animations", animations.rawDirty],
    ["transient-dirty-animations", animations.transientDirty],
    ["anim-flags", data.flags === null ? "absent" : data.flags.filter((flag) => flag.tag === "anim").length],
    ["library-height-animations", animations.sanctionedLibrary],
    ["dirty-animations-budgeted", animations.budgetedDirty],
  ];
}

export const MOTION_ARM = {
  flags: [
    {
      flag: "--motion",
      kind: "optional-selector",
      pageTargetable: false,
      group: "Measure",
      summary: "one motion window: LoAF, CLS, compositor-dirty animations, dropped frames",
      handler: (args, rest): void => {
        args.motion = true;
        pushStep(args, { kind: "motion-click", selector: consumeOptionalSelector(rest), page: 0 });
      },
    },
    {
      flag: "--motion-window",
      kind: "required-value",
      pageTargetable: false,
      group: "Measure",
      summary: "--motion window length in ms (default 2500)",
      handler: (args, rest): void => {
        args.motionWindowMs = Number(rest.shift() ?? "0");
      },
    },
    {
      flag: "--motion-no-throttle",
      kind: "boolean",
      pageTargetable: false,
      group: "Measure",
      summary: "disable the --motion CPU throttle (headless drop rates stay advisory)",
      handler: (args): void => {
        args.motionThrottle = false;
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "motion" | "motionWindowMs" | "motionThrottle"> => ({
    motion: false,
    motionWindowMs: DEFAULT_MOTION_WINDOW_MS,
    motionThrottle: true,
  }),
  help: `  --motion [selector]     measure one motion window after preceding reach actions. With a selector,
                          Snap resolves geometry before the reset and dispatches one trusted native click
                          inside the trace. Without one, measure the post-navigation entry window.
  --motion-window <ms>    measured observation window (default 2500)
  --motion-no-throttle    disable motion's default 4x CPU throttle; headless dropped-frame rates remain
                          advisory because headless Chromium has no real display-vsync deadline`,
  result: {
    schema: "snap-arm-motion-v1",
    source: "__orb motion rings + CDP PipelineReporter",
    lifetime: "one tagged motion action/window",
    enabled: (opts): boolean => opts.motion,
  },
  lifecycle: {
    at: "run",
    begin: (session, opts: Args, shared: ArmSharedContext): ArmRunInstance<"motion"> => {
      let measurement: MotionMeasurement | null = null;
      let measuredCount = 0;
      return {
        prepare: (): Promise<void> => Promise.resolve(),
        afterNavigation: (): Promise<void> => Promise.resolve(),
        beforeAction: async (ctx): Promise<ArmActionDisposition | null> => {
          if (ctx.action.type !== "step" || ctx.action.action.kind !== "motion-click") {
            return null;
          }
          measuredCount += 1;
          measurement = await measureMotionAction({ session, opts, ctx, selector: ctx.action.action.selector, ratePosture: await shared.ratePosture });
          return { handled: true, failures: measurement.data?.stepFailed === true ? 1 : 0 };
        },
        afterAction: (): Promise<void> => Promise.resolve(),
        afterActions: (): Promise<void> => Promise.resolve(),
        afterSettle: (): Promise<void> => Promise.resolve(),
        measure: async (ctx): Promise<void> => {
          if (!opts.motion || measurement === null) {
            return;
          }
          MOTION_RECEIPTS.set(session, measurement.data);
          const motion = measurement.data?.motion;
          const retained = (motion?.loafs.length ?? 0) + (motion?.shifts?.length ?? 0) + (measurement.data?.flags?.length ?? 0);
          const path = await artifactFile("motion", `${ctx.name}-motion`, ".json", {
            producer: "motion",
            producerArm: "motion",
            channel: "motion-window",
            mediaType: "application/json",
            schema: "snap-motion-v1",
            role: "primary",
            completeness: "bounded",
            completenessDetail: "finite app-side LoAF, layout-shift, and flag rings with explicit retained populations",
            scope: exactScope(0, 0, `motion:${String(opts.motionWindowMs)}ms`),
            records: retained,
            limits: [
              {
                source: "orb-motion-finite-rings",
                complete: false,
                policy: null,
                events: [
                  { kind: "finite-ring", path: "$.data.motion.loafs", original: null, retained: motion?.loafs.length ?? 0, omitted: null },
                  { kind: "finite-ring", path: "$.data.motion.shifts", original: null, retained: motion?.shifts?.length ?? 0, omitted: null },
                  { kind: "finite-ring", path: "$.data.flags", original: null, retained: measurement.data?.flags?.length ?? 0, omitted: null },
                ],
              },
            ],
          });
          await writeFile(
            path,
            `${JSON.stringify({ contract: "snap-motion-v1", selector: ctx.opts.actions.find((entry) => entry.type === "step" && entry.action.kind === "motion-click"), windowMs: opts.motionWindowMs, throttle: opts.motionThrottle ? MOTION_THROTTLE_RATE : 1, gaps: measurement.gaps, problems: motionProblems(measurement.data, measurement.gaps), data: measurement.data }, null, 2)}\n`,
          );
          measurement = { ...measurement, artifact: path };
        },
        report: (): Promise<void> => {
          if (!opts.motion || measurement === null) {
            return Promise.resolve();
          }
          if (measurement.gaps.length > 0) {
            printEvidenceGaps(measurement.gaps);
          }
          const data = measurement.data;
          if (data !== null) {
            const loaf = loafTotals(data.motion);
            print(`--- MOTION  window=${String(opts.motionWindowMs)}ms measured-input=${data.measuredInput ? "1" : "0"} ---`);
            print(
              `frames      raw ${frameToken(data.frames.raw.dropped, data.frames.raw.total)} · budgeted ${frameToken(data.frames.budgeted.dropped, data.frames.budgeted.total)}`,
            );
            print(`LoAF        raw worst ${String(loaf.rawWorstBlocking)}ms · budgeted worst ${String(loaf.budgetedWorstBlocking)}ms`);
          }
          if (measurement.artifact !== null) {
            print(`motion json ${measurement.artifact}`);
          }
          return Promise.resolve();
        },
        failures: (): ArmFailureCounts => ({}),
        denominators: (): Readonly<Record<string, VerdictDenominator>> => motionDenominators(measurement, measuredCount),
        pairs: (): readonly ResultPair[] => motionPairs(opts, measurement),
        facts: (): readonly ArmFactEmission<"motion">[] => {
          const state = motionFactState(opts.motion, measurement);
          return [
            {
              scope: exactScope(0, 0, `motion:${String(opts.motionWindowMs)}ms`),
              data: {
                state,
                detail: measurement?.gaps[0]?.detail ?? null,
                measurements: measuredCount,
                problems: measurement === null ? 0 : measurement.gaps.length + (measurement.pass ? 0 : 1),
                artifact: null,
              },
            },
          ];
        },
        exit: (code: number): number => {
          if (!opts.motion) {
            return code;
          }
          if (measurement === null || measurement.gaps.length > 0) {
            return EXIT.toolError;
          }
          // NO PROMOTION IN EITHER DIRECTION (#1616): a load-suspect window neither passes nor fails the
          // run — the exit stays whatever the other arms decided.
          if (measurement.loadSuspect !== null || measurement.pass || code === EXIT.toolError) {
            return code;
          }
          return EXIT.violations;
        },
      };
    },
  },
} satisfies ArmDef<"motion">;
