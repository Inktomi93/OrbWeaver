// `--react-profile`: React development-renderer evidence from the page Snap already owns. The hook is installed
// in prepare() before navigation; the settled pass only reads and files it. This is deliberately not the
// React DevTools UI/backend and never calls the injected renderer's mutation methods. Design/capability
// census: docs/design/1208-instrument-substrate.md §10.5.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import type { EvidenceWindowId } from "../../../_shared/artifact-scope.ts";
import { aggregateScope, evidenceWindowId } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import type { ProbeSession } from "../../../_shared/browser-contract.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { printEvidenceGaps } from "../../../_shared/evidence.ts";
import { EXIT } from "../../../_shared/exit-contract.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmRunInstance } from "../../contract/arms.ts";
import type { ReactCommitEvidence, ReactCommitPayload, ReactFiberEvidence, ReactProfilePageEvidence } from "../../contract/react-profile.ts";
import { reactProfilePagePayloadSchema } from "../../contract/react-profile.ts";
import type { Args } from "../../contract/types.ts";
import { REACT_PROFILE_LIMITS, READ_REACT_PROFILE_SCRIPT, reactProfileInitScript, readReactProfileCommitScript } from "../../lib/react-profile.ts";
import type { ReactProfileReceipt } from "../../lib/react-profile-receipt.ts";
import { reportReactProfile, writeReactProfileReceipt } from "../../lib/react-profile-receipt.ts";
import type { TraceCapture } from "../../lib/react-profile-trace.ts";
import { numberOf, reactTraceEvents, recordOf, startTrace, stopTrace } from "../../lib/react-profile-trace.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --react-profile");

function missingPage(contextIndex: number, pageIndex: number, url: string, detail: string): ReactProfilePageEvidence {
  return {
    contextIndex,
    pageIndex,
    url,
    hookInstalled: false,
    installError: detail,
    collectorErrors: [],
    windowId: evidenceWindowId("missing"),
    timeOriginEpochMs: 0,
    limits: REACT_PROFILE_LIMITS,
    renderers: [],
    commits: [],
    schedules: [],
    unmounts: [],
    postCommits: [],
    measures: [],
  };
}

function pageEvidence(raw: unknown, contextIndex: number, pageIndex: number, url: string): ReactProfilePageEvidence {
  const parsed = reactProfilePagePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return missingPage(contextIndex, pageIndex, url, "snap's React collector returned a malformed payload");
  }
  return { ...parsed.data, commits: parsed.data.commits.map(inflateCommit), contextIndex, pageIndex, url };
}

function inflateCommit(commit: ReactCommitPayload): ReactCommitEvidence {
  const paths = new Map<number, string>();
  const fibers: ReactFiberEvidence[] = commit.fibers.map((payload) => {
    const { segment, ...fiber } = payload;
    const parentPath = fiber.parentId === null ? null : (paths.get(fiber.parentId) ?? null);
    const path = parentPath === null ? segment : `${parentPath} > ${segment}`;
    paths.set(fiber.id, path);
    return { ...fiber, segment, path, ownerPath: null };
  });
  const withOwners = fibers.map(
    (fiber): ReactFiberEvidence => ({
      ...fiber,
      ownerPath: fiber.ownerId === null ? null : (paths.get(fiber.ownerId) ?? null),
    }),
  );
  return {
    ...commit,
    updaters: commit.updaters.map((updater) => ({ id: updater.id, path: paths.get(updater.id) ?? null })),
    fibers: withOwners,
  };
}

async function readProfileCommit(page: Page, commitIndex: number): Promise<unknown> {
  let offset = 0;
  let componentCount = Number.POSITIVE_INFINITY;
  let header: Readonly<Record<string, unknown>> | null = null;
  const fibers: unknown[] = [];
  while (offset < componentCount) {
    const chunk = recordOf(await page.evaluate(readReactProfileCommitScript(commitIndex, offset)));
    const chunkFibers = chunk?.["fibers"];
    const nextComponentCount = numberOf(chunk?.["componentCount"]);
    if (chunk === null || !Array.isArray(chunkFibers) || nextComponentCount === null || !Number.isInteger(nextComponentCount)) {
      return null;
    }
    if (chunkFibers.length === 0 && offset < nextComponentCount) {
      return null;
    }
    header = chunk;
    componentCount = nextComponentCount;
    fibers.push(...chunkFibers);
    offset += chunkFibers.length;
  }
  return header === null ? null : { ...header, fibers };
}
async function readProfilePayload(page: Page): Promise<unknown> {
  const meta = await page.evaluate(READ_REACT_PROFILE_SCRIPT);
  const metaRecord = recordOf(meta);
  const commitCount = numberOf(metaRecord?.["commitCount"]);
  if (metaRecord === null || commitCount === null || !Number.isInteger(commitCount) || commitCount < 0) {
    return meta;
  }
  const commits: unknown[] = [];
  for (let commitIndex = 0; commitIndex < commitCount; commitIndex += 1) {
    commits.push(await readProfileCommit(page, commitIndex));
  }
  return { ...metaRecord, commits };
}

async function readProfilePages(session: ProbeSession): Promise<ReactProfilePageEvidence[]> {
  const pages: ReactProfilePageEvidence[] = [];
  for (const [contextIndex, context] of session.contexts.entries()) {
    if (context.owned === false) {
      continue;
    }
    for (const [pageIndex, page] of context.pages.entries()) {
      // @orb-waive caught-failure-ownership(error): the caught page read becomes a hookInstalled:false evidence row; profileGaps prints it and forces exit 2. Ends if missingPage stops carrying the caught detail or profileGaps stops refusing it.
      try {
        pages.push(pageEvidence(await readProfilePayload(page), contextIndex, pageIndex, page.url()));
      } catch (error) {
        pages.push(missingPage(contextIndex, pageIndex, page.url(), `collector read failed: ${errorMessage(error)}`));
      }
    }
  }
  return pages;
}

async function prepareProfile(
  session: ProbeSession,
  windowId: EvidenceWindowId,
): Promise<{ readonly trace: TraceCapture | null; readonly traceError: string | null; readonly errors: string[] }> {
  const errors: string[] = [];
  const owned = session.contexts.filter((context) => context.owned !== false);
  for (const [contextIndex, context] of session.contexts.entries()) {
    if (context.owned === false) {
      continue;
    }
    // @orb-waive caught-failure-ownership(error): the caught install failure is returned in errors; profileGaps prints it and forces exit 2. Ends if the error stops entering this return or gaps stop voting.
    try {
      await context.context.addInitScript({ content: reactProfileInitScript(windowId) });
    } catch (error) {
      errors.push(`context ${String(contextIndex)} addInitScript failed: ${errorMessage(error)}`);
    }
    for (const [pageIndex, page] of context.pages.entries()) {
      // @orb-waive caught-failure-ownership(error): the caught call-window mark failure is returned in errors; profileGaps prints it and forces exit 2 rather than mixing prior commits into this call. Ends if the detail stops entering this return or gaps stop voting.
      try {
        await page.evaluate(`globalThis.__ORB_SNAP_REACT_PROFILE__?.beginWindow(${JSON.stringify(windowId)})`);
      } catch (error) {
        errors.push(`context ${String(contextIndex)} page ${String(pageIndex)} call-window mark failed: ${errorMessage(error)}`);
      }
    }
  }
  const firstPage = owned[0]?.pages[0];
  if (firstPage === undefined) {
    return { trace: null, traceError: null, errors };
  }
  const started = await startTrace(firstPage);
  return { trace: started.capture, traceError: started.error, errors };
}

let nextWindowId = 1;

export const PROFILE_ARM = {
  flags: [
    {
      flag: "--react-profile",
      kind: "boolean",
      pageTargetable: false,
      group: "Measure",
      summary: "read-only React dev-renderer hook installed before mount (session-level: put it on the boot call)",
      handler: (args): void => {
        args.reactProfile = true;
      },
    },
  ],
  level: "session",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "reactProfile"> => ({ reactProfile: false }),
  help: `  --react-profile         install Snap's read-only React development-renderer hook BEFORE mount,
                          then print the hottest component paths and file complete flat commit topology,
                          owner/source identity, bounded props/state/context/hook slots, conservative
                          render reasons, boundary/update evidence and React timing-track correlation.
                          Retained hidden Activity/Offscreen work stays in raw trees and a separate count,
                          but is excluded from the active hot-component ranking.
                          Session-level: put it on the boot call. Evidence describes the compiler/memoization
                          output React actually mounted. No DevTools UI or mutation controls.`,
  result: {
    schema: "snap-arm-react-profile-v1",
    source: "React DevTools global hook + React Fiber",
    lifetime: "browser pre-mount through settled capture",
    enabled: (opts): boolean => opts.reactProfile,
  },
  lifecycle: {
    at: "run",
    begin: (session, opts: Args): ArmRunInstance<"react-profile"> => {
      const enabled = opts.reactProfile;
      const windowId = evidenceWindowId(`snap-react-${String(Date.now())}-${String(nextWindowId++)}`);
      const prepareErrors: string[] = [];
      let trace: TraceCapture | null = null;
      let traceError: string | null = null;
      let receipt: ReactProfileReceipt | null = null;
      return {
        prepare: async (): Promise<void> => {
          if (!enabled) {
            return;
          }
          const prepared = await prepareProfile(session, windowId);
          prepareErrors.push(...prepared.errors);
          trace = prepared.trace;
          traceError = prepared.traceError;
        },
        afterNavigation: (): Promise<void> => Promise.resolve(),
        beforeAction: (): Promise<null> => Promise.resolve(null),
        afterAction: (): Promise<void> => Promise.resolve(),
        afterActions: (): Promise<void> => Promise.resolve(),
        afterSettle: (): Promise<void> => Promise.resolve(),
        measure: async (ctx): Promise<void> => {
          if (!enabled) {
            return;
          }
          if (trace !== null) {
            traceError = (await stopTrace(trace)) ?? traceError;
          }
          const pages = await readProfilePages(ctx.session);
          const reactTrace = reactTraceEvents(trace?.events ?? [], trace?.calibration ?? null);
          receipt = await writeReactProfileReceipt({
            pages,
            traceEvents: trace?.events ?? [],
            reactTraceEvents: reactTrace,
            traceError,
            prepareErrors,
            name: ctx.name,
            traceCalibration: trace?.calibration ?? null,
          });
          if (receipt.gaps.length > 0) {
            printEvidenceGaps(receipt.gaps);
          }
        },
        report: (): Promise<void> => {
          if (receipt !== null) {
            reportReactProfile(receipt);
          }
          return Promise.resolve();
        },
        failures: (): ArmFailureCounts => ({}),
        denominators: () =>
          receipt === null
            ? {}
            : {
                "react-renderers": { value: receipt.rendererCount, refuseWhen: "zero" as const },
                "react-commits": { value: receipt.commitCount, refuseWhen: "zero" as const },
                "react-components": { value: receipt.componentCount, refuseWhen: "zero" as const },
              },
        pairs: (): readonly ResultPair[] => {
          if (!enabled) {
            return [["react-profile", "off"]];
          }
          if (receipt === null) {
            return [["react-profile", "REFUSED"]];
          }
          return [
            ["react-profile", receipt.gaps.length === 0 ? receipt.profilePath : "REFUSED"],
            ["react-profile-artifact", receipt.profilePath],
            ["react-profile-summary", receipt.summaryPath],
            ["react-profile-trace", receipt.tracePath],
            ["react-updates", receipt.updateEventCount],
            ["react-user-timing", receipt.userTimingCount],
            ["react-track-events", receipt.reactTraceEvents.length],
          ];
        },
        facts: (): readonly ArmFactEmission<"react-profile">[] => {
          let state: "off" | "refused" | "passed" = "off";
          if (enabled) {
            state = receipt === null || receipt.gaps.length > 0 ? "refused" : "passed";
          }
          return [
            {
              scope: aggregateScope(),
              data: {
                state,
                detail: receipt?.gaps[0]?.detail ?? null,
                renderers: receipt?.rendererCount ?? 0,
                commits: receipt?.commitCount ?? 0,
                components: receipt?.componentCount ?? 0,
                artifact: null,
              },
            },
          ];
        },
        exit: (code: number): number => {
          if (!enabled || (receipt !== null && receipt.gaps.length === 0)) {
            return code;
          }
          return EXIT.toolError;
        },
      };
    },
  },
} satisfies ArmDef<"react-profile">;
