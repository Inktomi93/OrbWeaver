// Pre-navigation Chromium trace + DevTools/Lighthouse insight analyzer. The trace starts in prepare,
// before capture calls page.goto, and stops at a bounded post-load presentation boundary in afterNavigation.
import { writeFile } from "node:fs/promises";
import type { InstrumentArtifactMetadata } from "../../../_shared/artifact-out.ts";
import { artifactFile, registerInstrumentArtifact } from "../../../_shared/artifact-out.ts";
import { exactScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { print } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { printEvidenceGaps } from "../../../_shared/evidence.ts";
import { EXIT } from "../../../_shared/exit-contract.ts";
import type { ActiveBootTrace, BootTraceReceipt } from "../../../cpu-profile/index.ts";
import { BOOT_TRACE_INSIGHTS, beginBootTrace } from "../../../cpu-profile/index.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmRunInstance } from "../../contract/arms.ts";
import type { Args } from "../../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export const BOOT_TRACE_ARM = {
  flags: [
    {
      flag: "--boot-trace",
      kind: "boolean",
      pageTargetable: false,
      group: "Measure",
      summary: "Chromium tracing from before navigation; requires positive LCP and all six DevTools insight families",
      handler: (args): void => {
        args.bootTrace = true;
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "bootTrace"> => ({ bootTrace: false }),
  help: `  --boot-trace            start Chromium tracing before navigation, retain the raw trace, and
                          require positive LCP plus all six DevTools insight families; independent of --perf`,
  result: {
    schema: "snap-arm-boot-trace-v1",
    source: "CDP Tracing + DevTools trace processor",
    lifetime: "pre-navigation through boot-ready presentation before interaction",
    enabled: (opts): boolean => opts.bootTrace,
  },
  lifecycle: {
    at: "run",
    begin: (session, opts: Args): ArmRunInstance<"boot-trace"> => {
      let active: ActiveBootTrace | null = null;
      let receipt: BootTraceReceipt | null = null;
      let receiptPath: string | null = null;
      let rawTracePath: string | null = null;
      let failure: string | null = null;
      const rawMetadata: InstrumentArtifactMetadata = {
        producer: "boot-trace",
        producerArm: "boot-trace",
        channel: "chromium-trace",
        mediaType: "application/json",
        schema: "chromium-trace-events",
        role: "raw-fallback",
        completeness: "unknown",
        completenessDetail: "capture has not yet established raw trace completeness",
        scope: exactScope(0, 0, "boot-navigation"),
        records: null,
        limits: [],
      };
      return {
        prepare: async (): Promise<void> => {
          if (!opts.bootTrace) {
            return;
          }
          const page = session.pages[0];
          if (page === undefined) {
            failure = "no owned page exists for the pre-navigation trace";
            return;
          }
          // @orb-waive caught-failure-ownership(error): failure is printed by report(), publishes boot-trace=REFUSED, and forces exit 2 below. Ends if any of those three owners stop reading failure.
          try {
            rawTracePath = await artifactFile("boot-trace", "snap-boot", ".trace.json", rawMetadata);
            active = await beginBootTrace(page);
          } catch (error) {
            failure = error instanceof Error ? error.message : String(error);
          }
        },
        afterNavigation: async (ctx): Promise<void> => {
          if (!opts.bootTrace || ctx.pageIndex !== 0 || active === null || rawTracePath === null) {
            return;
          }
          // @orb-waive caught-failure-ownership(error): failure is printed by report(), publishes boot-trace=REFUSED, and forces exit 2 below. Ends if any of those three owners stop reading failure.
          try {
            const path = rawTracePath;
            receipt = await active.finish(path, async ({ complete, eventCount }) => {
              await registerInstrumentArtifact("boot-trace", path, {
                ...rawMetadata,
                completeness: complete ? "complete" : "unknown",
                completenessDetail: complete
                  ? "complete raw Chromium trace; CDP stop and completion confirmed"
                  : "partial raw Chromium trace retained after the CDP stop protocol failed",
                records: eventCount,
              });
            });
          } catch (error) {
            failure = error instanceof Error ? error.message : String(error);
          } finally {
            active = null;
          }
        },
        beforeAction: (): Promise<null> => Promise.resolve(null),
        afterAction: (): Promise<void> => Promise.resolve(),
        afterActions: (): Promise<void> => Promise.resolve(),
        afterSettle: (): Promise<void> => Promise.resolve(),
        measure: async (ctx): Promise<void> => {
          if (active !== null) {
            await active.abort();
            active = null;
            failure ??= "trace never reached the post-navigation readiness boundary";
          }
          if (receipt !== null && receiptPath === null) {
            // @orb-waive caught-failure-ownership(error): failure is printed by report(), publishes boot-trace=REFUSED, and forces exit 2 below. Ends if any of those three owners stop reading failure.
            try {
              receiptPath = await artifactFile("boot-trace", `${ctx.name}-boot`, ".json", {
                producer: "boot-trace",
                producerArm: "boot-trace",
                channel: "boot-insights",
                mediaType: "application/json",
                schema: "snap-boot-trace-v1",
                role: "primary",
                completeness: "complete",
                completenessDetail: "complete validated LCP and six-family DevTools insight receipt",
                scope: exactScope(0, 0, "boot-navigation"),
                records: receipt.eventCount,
                limits: [],
              });
              await writeFile(receiptPath, `${JSON.stringify({ contract: "snap-boot-trace-v1", receipt }, null, 2)}\n`);
            } catch (error) {
              failure = error instanceof Error ? error.message : String(error);
            }
          }
        },
        report: (): Promise<void> => {
          if (!opts.bootTrace) {
            return Promise.resolve();
          }
          if (failure !== null) {
            printEvidenceGaps([{ evidence: "the boot navigation trace", detail: failure }]);
          } else if (receipt !== null && receiptPath !== null) {
            print(
              `boot trace  ${receiptPath} · raw fallback ${receipt.rawTracePath} · LCP ${String(Math.round(receipt.lcpMs))}ms · insights ${String(BOOT_TRACE_INSIGHTS.length)}`,
            );
          }
          return Promise.resolve();
        },
        failures: (): ArmFailureCounts => ({}),
        denominators: () =>
          receipt === null
            ? {}
            : {
                "boot-trace-events": { value: receipt.eventCount, refuseWhen: "zero" as const },
                "boot-trace-insights": { value: Object.keys(receipt.insights).length, refuseWhen: "zero" as const },
              },
        pairs: (): readonly ResultPair[] => {
          if (!opts.bootTrace) {
            return [["boot-trace", "off"]];
          }
          if (receipt === null || receiptPath === null) {
            return [["boot-trace", "REFUSED"]];
          }
          return [
            ["boot-trace", "observed"],
            ["boot-trace-artifact", receiptPath],
            ["boot-trace-raw", receipt.rawTracePath],
            ["boot-lcp", `${String(Math.round(receipt.lcpMs))}ms`],
            ["boot-insights", Object.keys(receipt.insights).length],
            ["boot-trace-events", receipt.eventCount],
          ];
        },
        facts: (): readonly ArmFactEmission<"boot-trace">[] => {
          let state: "off" | "passed" | "refused" = "off";
          if (opts.bootTrace) {
            state = failure === null && receipt !== null && receiptPath !== null ? "passed" : "refused";
          }
          return [
            {
              scope: exactScope(0, 0, "boot-navigation"),
              data: {
                state,
                detail: failure,
                events: receipt?.eventCount ?? 0,
                insights: receipt === null ? 0 : Object.keys(receipt.insights).length,
                artifact: null,
              },
            },
          ];
        },
        exit: (code: number): number => (!opts.bootTrace || (failure === null && receipt !== null && receiptPath !== null) ? code : EXIT.toolError),
      };
    },
  },
} satisfies ArmDef<"boot-trace">;
