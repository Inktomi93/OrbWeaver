// V8 sampling profiler over Snap's existing post-navigation action/capture window. It shares the page
// and tape; only the CDP profiler lifecycle is analyzer-specific.
import { writeFile } from "node:fs/promises";
import type { CDPSession } from "@playwright/test";
import { artifactFile } from "../../../_shared/artifact-out.ts";
import { exactScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { print } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { EXIT } from "../../../_shared/exit-contract.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmRunInstance } from "../../contract/arms.ts";
import type { Args } from "../../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const CPU_SAMPLING_INTERVAL_US = 100;

interface CpuProfileEvidence {
  readonly nodes: readonly unknown[];
  readonly samples: readonly unknown[];
}

function cpuProfileEvidence(value: unknown): CpuProfileEvidence {
  if (typeof value !== "object" || value === null) {
    throw new Error("Profiler.stop returned no profile object");
  }
  const nodes = Reflect.get(value, "nodes");
  const samples = Reflect.get(value, "samples");
  if (!(Array.isArray(nodes) && Array.isArray(samples))) {
    throw new Error("Profiler.stop returned a malformed nodes/samples population");
  }
  return { nodes, samples };
}

async function detachProfiler(cdp: CDPSession): Promise<string | null> {
  try {
    await cdp.detach();
    return null;
  } catch (error) {
    return `Profiler detach failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export const CPU_PROFILE_ARM = {
  flags: [
    {
      flag: "--cpu-profile",
      kind: "boolean",
      pageTargetable: false,
      group: "Measure",
      summary: "V8 sampling profile across the post-navigation tape; run it separately from --perf/--motion",
      handler: (args): void => {
        args.cpuProfile = true;
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "cpuProfile"> => ({ cpuProfile: false }),
  help: `  --cpu-profile           record a V8 sampling profile across the shared post-navigation tape;
                          written as a Chrome DevTools/speedscope artifact. Run separately from
                          --perf/--motion because sampling overhead contaminates rate verdicts`,
  result: { schema: "snap-arm-cpu-profile-v1", source: "CDP Profiler", lifetime: "post-navigation action tape", enabled: (opts): boolean => opts.cpuProfile },
  lifecycle: {
    at: "run",
    begin: (_session, opts: Args): ArmRunInstance<"cpu-profile"> => {
      let cdp: CDPSession | null = null;
      let profile: CpuProfileEvidence | null = null;
      let path: string | null = null;
      let failure: string | null = null;
      return {
        prepare: (): Promise<void> => Promise.resolve(),
        afterNavigation: (): Promise<void> => Promise.resolve(),
        beforeAction: async (ctx): Promise<null> => {
          const pause = ctx.action.type === "step" && ctx.action.action.kind === "pause";
          if (!opts.cpuProfile || ctx.pageIndex !== 0 || pause || cdp !== null || profile !== null || failure !== null) {
            return null;
          }
          // @orb-waive caught-failure-ownership(error): failure is printed by report(), publishes cpu-profile=REFUSED, and forces exit 2 below. Ends if any of those three owners stop reading failure.
          try {
            cdp = await ctx.page.context().newCDPSession(ctx.page);
            await cdp.send("Profiler.enable");
            await cdp.send("Profiler.setSamplingInterval", { interval: CPU_SAMPLING_INTERVAL_US });
            await cdp.send("Profiler.start");
          } catch (error) {
            failure = error instanceof Error ? error.message : String(error);
          }
          return null;
        },
        afterAction: (): Promise<void> => Promise.resolve(),
        afterActions: async (ctx): Promise<void> => {
          if (!opts.cpuProfile || ctx.pageIndex !== 0) {
            return;
          }
          if (cdp === null) {
            failure ??= "no non-pause action entered the CPU profile window";
            return;
          }
          // @orb-waive caught-failure-ownership(error): failure is printed by report(), publishes cpu-profile=REFUSED, and forces exit 2 below. Ends if any of those three owners stop reading failure.
          try {
            const stopped = await cdp.send("Profiler.stop");
            profile = cpuProfileEvidence(Reflect.get(stopped, "profile"));
          } catch (error) {
            failure = error instanceof Error ? error.message : String(error);
          } finally {
            failure ??= await detachProfiler(cdp);
            cdp = null;
          }
        },
        afterSettle: (): Promise<void> => Promise.resolve(),
        measure: async (ctx): Promise<void> => {
          if (!opts.cpuProfile || profile === null) {
            return;
          }
          // @orb-waive caught-failure-ownership(error): failure is printed by report(), publishes cpu-profile=REFUSED, and forces exit 2 below. Ends if any of those three owners stop reading failure.
          try {
            path = await artifactFile("cpu-profile", `${ctx.name}-cpu`, ".cpuprofile", {
              producer: "cpu-profile",
              producerArm: "cpu-profile",
              channel: "v8-cpu-profile",
              mediaType: "application/json",
              schema: "v8-cpu-profile",
              role: "primary",
              completeness: "complete",
              completenessDetail: "complete V8 sampling profile for the declared shared action window",
              scope: exactScope(0, 0, "action-tape"),
              records: profile.samples.length,
              limits: [],
            });
            await writeFile(path, JSON.stringify(profile));
          } catch (error) {
            failure = error instanceof Error ? error.message : String(error);
          }
        },
        report: (): Promise<void> => {
          if (failure !== null) {
            print(`CPU PROFILE REFUSED  ${failure}`);
          } else if (path !== null) {
            print(`cpu profile ${path}`);
          }
          return Promise.resolve();
        },
        failures: (): ArmFailureCounts => ({}),
        denominators: () =>
          profile === null
            ? {}
            : {
                "cpu-profile-nodes": { value: profile.nodes.length, refuseWhen: "zero" as const },
                "cpu-profile-samples": { value: profile.samples.length, refuseWhen: "zero" as const },
              },
        pairs: (): readonly ResultPair[] =>
          !opts.cpuProfile ? [["cpu-profile", "off"]] : [["cpu-profile", failure === null && path !== null ? path : "REFUSED"]],
        facts: (): readonly ArmFactEmission<"cpu-profile">[] => {
          let state: "off" | "passed" | "refused" = "off";
          if (opts.cpuProfile) {
            state = failure === null && path !== null ? "passed" : "refused";
          }
          return [
            {
              scope: exactScope(0, 0, "action-tape"),
              data: {
                state,
                detail: failure,
                nodes: profile?.nodes.length ?? 0,
                samples: profile?.samples.length ?? 0,
                artifact: null,
              },
            },
          ];
        },
        exit: (code: number): number => (!opts.cpuProfile || (failure === null && path !== null) ? code : EXIT.toolError),
      };
    },
  },
} satisfies ArmDef<"cpu-profile">;
