// Per-step responsiveness analyzer over Snap's one argv-ordered tape. The meter is installed before
// navigation; lifecycle callbacks mark the exact shared action index instead of replaying a second tape.
import { writeFile } from "node:fs/promises";
import { splitLastEq } from "../../../_shared/argv.ts";
import { artifactFile } from "../../../_shared/artifact-out.ts";
import { aggregateScope, exactScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { print } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { EvidenceGap } from "../../../_shared/evidence.ts";
import { printEvidenceGaps } from "../../../_shared/evidence.ts";
import { EXIT } from "../../../_shared/exit-contract.ts";
import type { MeterData, StepReport } from "../../../cpu-profile/index.ts";
import { buildReports, METER_INIT_JS, meterApparatusGap, meterEvidenceGaps, parseMeterData, printTable } from "../../../cpu-profile/index.ts";
import type { SnapAnalyzerProblem } from "../../contract/analyzer.ts";
import type { ArmActionDisposition, ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmRunContext, ArmRunInstance } from "../../contract/arms.ts";
import type { Args, SnapAction } from "../../contract/types.ts";
import { ratePostureDisposition } from "../../lib/rate-posture.ts";
import { pushStep } from "../flags-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export const INTERACTION_PERF_CLICK_BREACH_MS = 100;

export function interactionPerfBreachCount(reports: readonly StepReport[]): number {
  return reports.filter((row) => row.longTaskCount > 0 || (row.clickDurMs ?? 0) > INTERACTION_PERF_CLICK_BREACH_MS).length;
}

export function interactionPerfProblems(
  reports: readonly StepReport[],
  gaps: readonly EvidenceGap[] = [],
  withheld: string | null = null,
): readonly SnapAnalyzerProblem[] {
  const problems: SnapAnalyzerProblem[] = gaps.map((gap) => ({
    arm: "interaction-perf",
    kind: "evidence-gap",
    metric: gap.evidence,
    subject: "interaction tape",
    observed: "absent",
    threshold: "required",
    detail: gap.detail,
  }));
  if (withheld !== null) {
    problems.push({
      arm: "interaction-perf",
      kind: "evidence-gap",
      metric: "rate-verdict",
      subject: "interaction tape",
      observed: "withheld",
      threshold: "measured",
      detail: withheld,
    });
  }
  for (const row of reports) {
    if (row.longTaskCount > 0) {
      problems.push({
        arm: "interaction-perf",
        kind: "threshold",
        metric: "long-task-count",
        subject: row.label,
        observed: String(row.longTaskCount),
        threshold: "0",
        detail: `step ${String(row.idx)} recorded ${String(row.longTaskCount)} long task(s); worst=${String(row.longTaskWorstMs)}ms blocking=${String(row.worstBlockingMs ?? "unavailable")}ms`,
      });
    }
    if ((row.clickDurMs ?? 0) > INTERACTION_PERF_CLICK_BREACH_MS) {
      problems.push({
        arm: "interaction-perf",
        kind: "threshold",
        metric: "click-duration-ms",
        subject: row.label,
        observed: `${String(row.clickDurMs)}ms`,
        threshold: `${String(INTERACTION_PERF_CLICK_BREACH_MS)}ms`,
        detail: `step ${String(row.idx)} click duration exceeded the interaction threshold; delay=${String(row.clickInputDelayMs ?? "unavailable")}ms processing=${String(row.clickProcessingMs ?? "unavailable")}ms`,
      });
    }
  }
  return problems;
}

export function interactionPerfExit(code: number, gaps: readonly EvidenceGap[], withheld: string | null, _reports: readonly StepReport[]): number {
  if (gaps.length > 0 || withheld !== null) {
    return EXIT.toolError;
  }
  // This arm preserves perf-meter's meter contract: house thresholds rank and explain evidence, but
  // cannot turn a successfully dispatched tape into a product failure. Action/page failures already
  // arrive in `code`; missing or withheld apparatus remains an instrument refusal above.
  return code;
}

function label(action: SnapAction): string | null {
  if (action.type === "eval") {
    return null;
  }
  if (action.type === "nav") {
    return `${action.action.kind} ${action.action.target}`;
  }
  const step = action.action;
  if (step.kind === "pause") {
    return null;
  }
  if (step.kind === "keyboard") {
    return `keyboard ${step.key}`;
  }
  if (step.kind === "fill") {
    return `fill ${step.selector}=${step.value}`;
  }
  if (step.kind === "key") {
    return `key ${step.selector}=${step.key}`;
  }
  if (step.kind === "upload") {
    return `upload ${step.selector}`;
  }
  if (step.kind === "wheel" || step.kind === "wheelburst") {
    return `${step.kind} ${step.selector} dy=${String(step.dy)}${step.kind === "wheelburst" ? `×${String(step.count)}` : ""}`;
  }
  return `${step.kind} ${step.selector ?? "(entry window)"}`;
}

async function collectPerfEvidence(
  ctx: ArmRunContext,
  data: MeterData[],
  gaps: EvidenceGap[],
): Promise<{ readonly reports: StepReport[]; readonly withheld: string | null; readonly artifact: string }> {
  for (const context of ctx.session.contexts) {
    if (context.owned === false) {
      continue;
    }
    for (const page of context.pages) {
      const rawPageData = await page.evaluate(() => Reflect.get(globalThis, "__perfMeter"));
      const pageData = parseMeterData(rawPageData);
      if (rawPageData === undefined) {
        gaps.push(meterApparatusGap(page.url()));
      } else if (pageData === null) {
        gaps.push({
          evidence: "the in-page meter payload",
          detail: `${page.url()} returned a malformed __perfMeter payload; no rate or step data was trusted`,
        });
      } else {
        data.push(pageData);
        gaps.push(...meterEvidenceGaps(pageData));
      }
    }
  }
  const reports = data.flatMap(buildReports);
  const disposition = ratePostureDisposition(ctx.ratePosture, "Snap --perf per-step timing columns");
  const withheld = disposition.withheld ? disposition.reason : null;
  const artifact = await artifactFile("perf", `${ctx.name}-perf`, ".json", {
    producer: "perf",
    producerArm: "interaction-perf",
    channel: "interaction-perf",
    mediaType: "application/json",
    schema: "snap-interaction-perf-v1",
    role: "primary",
    completeness: "complete",
    completenessDetail: "complete observer records for the finite shared action tape",
    scope: aggregateScope(),
    records: reports.length,
    limits: [],
  });
  await writeFile(
    artifact,
    `${JSON.stringify({ contract: "snap-interaction-perf-v1", cycles: ctx.opts.perfCycles, raw: data, reports, problems: interactionPerfProblems(reports, gaps, withheld), gaps, withheld }, null, 2)}\n`,
  );
  return { reports, withheld, artifact };
}

function perfStatus(gaps: readonly EvidenceGap[], withheld: string | null): string {
  if (gaps.length > 0) {
    return "REFUSED";
  }
  return withheld === null ? "measured" : "withheld";
}

export const INTERACTION_PERF_ARM = {
  flags: [
    {
      flag: "--perf",
      kind: "boolean",
      pageTargetable: false,
      handler: (args): void => {
        args.interactionPerf = true;
      },
    },
    {
      flag: "--pause",
      kind: "required-value",
      pageTargetable: true,
      handler: (args, rest, page): void => pushStep(args, { kind: "pause", ms: Number(rest.shift() ?? "0"), page }),
    },
    {
      flag: "--wheel",
      kind: "required-value",
      pageTargetable: true,
      handler: (args, rest, page): void => {
        const value = splitLastEq(rest.shift() ?? "");
        pushStep(args, { kind: "wheel", selector: value.head, dy: Number(value.tail), page });
      },
    },
    {
      flag: "--wheel-burst",
      kind: "required-value",
      pageTargetable: true,
      handler: (args, rest, page): void => {
        const value = splitLastEq(rest.shift() ?? "");
        const [dy = "", count = ""] = value.tail.split(":");
        pushStep(args, { kind: "wheelburst", selector: value.head, dy: Number(dy), count: Number(count), page });
      },
    },
    {
      flag: "--perf-cycles",
      kind: "required-value",
      pageTargetable: false,
      handler: (args, rest): void => {
        args.perfCycles = Number(rest.shift() ?? "0");
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "interactionPerf" | "perfCycles"> => ({ interactionPerf: false, perfCycles: 1 }),
  help: `  --perf                  collect per-step LoAF/long-task attribution, EventTiming input delay,
                          processing/duration, rAF gaps and CLS over the one shared action tape. This is
                          a meter, not a threshold gate: breaches stay ranked evidence; action/page
                          failures still fail and missing/withheld measurement evidence refuses
  --pause <ms>            ordered tape pause (not a measurement window)
  --wheel <selector=dy>   one ordered wheel input
  --wheel-burst <selector=dy:count>
                          repeated ordered wheel input with a 30ms tick pause
  --perf-cycles <n>       repeat the complete tape N times with stable absolute step indexes`,
  result: {
    schema: "snap-arm-interaction-perf-v1",
    source: "PerformanceObserver EventTiming/LoAF/longtask/layout-shift + rAF",
    lifetime: "one argv-ordered action tape",
    enabled: (opts): boolean => opts.interactionPerf,
  },
  lifecycle: {
    at: "run",
    begin: (session, opts: Args): ArmRunInstance<"interaction-perf"> => {
      const data: MeterData[] = [];
      let reports: StepReport[] = [];
      const gaps: EvidenceGap[] = [];
      let artifact: string | null = null;
      let withheld: string | null = null;
      let nextStep = 0;
      return {
        prepare: async (): Promise<void> => {
          if (!opts.interactionPerf) {
            return;
          }
          for (const context of session.contexts) {
            if (context.owned === false) {
              continue;
            }
            await context.context.addInitScript({ content: METER_INIT_JS });
            for (const page of context.pages) {
              await page.evaluate(METER_INIT_JS);
            }
          }
        },
        afterNavigation: (): Promise<void> => Promise.resolve(),
        beforeAction: async (ctx): Promise<ArmActionDisposition | null> => {
          if (!opts.interactionPerf) {
            return null;
          }
          const stepLabel = label(ctx.action);
          if (stepLabel === null) {
            return null;
          }
          const index = nextStep++;
          await ctx.page.evaluate(
            ([idx, text]) => {
              const meter = Reflect.get(globalThis, "__perfMeter");
              if (typeof meter !== "object" || meter === null) {
                return;
              }
              const markStep = Reflect.get(meter, "markStep");
              if (typeof markStep === "function") {
                Reflect.apply(markStep, meter, [idx, text]);
              }
            },
            [index, stepLabel] as const,
          );
          return null;
        },
        afterAction: (): Promise<void> => Promise.resolve(),
        afterActions: (): Promise<void> => Promise.resolve(),
        afterSettle: (): Promise<void> => Promise.resolve(),
        measure: async (ctx): Promise<void> => {
          if (!opts.interactionPerf) {
            return;
          }
          const collected = await collectPerfEvidence(ctx, data, gaps);
          reports = collected.reports;
          withheld = collected.withheld;
          artifact = collected.artifact;
        },
        report: (): Promise<void> => {
          if (!opts.interactionPerf) {
            return Promise.resolve();
          }
          if (gaps.length > 0) {
            printEvidenceGaps(gaps);
          }
          print(`--- PERFORMANCE  steps=${String(reports.length)} cycles=${String(opts.perfCycles)} ---`);
          if (withheld === null) {
            printTable(reports);
          } else {
            print(`WITHHELD (${withheld})`);
          }
          if (artifact !== null) {
            print(`perf json   ${artifact}`);
          }
          return Promise.resolve();
        },
        failures: (): ArmFailureCounts => ({}),
        denominators: () => (opts.interactionPerf ? { "perf-steps": { value: reports.length, refuseWhen: "zero" as const } } : {}),
        pairs: (): readonly ResultPair[] => {
          if (!opts.interactionPerf) {
            return [["perf", "off"]];
          }
          const breach = interactionPerfBreachCount(reports);
          return [
            ["perf", perfStatus(gaps, withheld)],
            ["perf-artifact", artifact ?? "absent"],
            ["steps", reports.length],
            ["breach-steps", breach],
            ["worst-longtask", `${String(reports.reduce((max, row) => Math.max(max, row.longTaskWorstMs), 0))}ms`],
            ["worst-click", `${String(reports.reduce((max, row) => Math.max(max, row.clickDurMs ?? 0), 0))}ms`],
          ];
        },
        facts: (): readonly ArmFactEmission<"interaction-perf">[] => {
          let state: "off" | "refused" | "withheld" | "passed" = "off";
          let detail: string | null = null;
          if (opts.interactionPerf) {
            if (gaps.length > 0) {
              state = "refused";
              detail = gaps[0]?.detail ?? "interaction performance evidence was unavailable";
            } else if (withheld !== null) {
              state = "withheld";
              detail = withheld;
            } else {
              const breaches = interactionPerfBreachCount(reports);
              state = "passed";
              detail =
                breaches === 0
                  ? "measured; no breach steps observed; interaction thresholds are non-voting"
                  : `measured; ${String(breaches)} breach step(s) observed; interaction thresholds are non-voting`;
            }
          }
          return [
            {
              scope: exactScope(0, 0, "action-tape"),
              data: {
                state,
                detail,
                steps: reports.length,
                breachSteps: interactionPerfBreachCount(reports),
                artifact: null,
              },
            },
          ];
        },
        exit: (code: number): number => {
          if (!opts.interactionPerf) {
            return code;
          }
          return interactionPerfExit(code, gaps, withheld, reports);
        },
      };
    },
  },
} satisfies ArmDef<"interaction-perf">;
