// Artifact and terminal receipt for Snap's React development-renderer arm. Collection stays in
// react-profile.ts; the run arm owns browser lifecycle and passes both evidence streams here.
import { open, readFile, writeFile } from "node:fs/promises";
import { artifactFile } from "../../_shared/artifact-out.ts";
import { aggregateScope } from "../../_shared/artifact-scope.ts";
import { print } from "../../_shared/artifacts.ts";
import type { EvidenceGap } from "../../_shared/evidence.ts";
import type { RankedReactComponent, ReactProfilePageEvidence, ReactProfileSummaryArtifact } from "../contract/react-profile.ts";
import { REACT_PROFILE_SUMMARY_COMPONENT_LIMIT, reactProfileSummaryArtifactSchema } from "../contract/react-profile.ts";
import { REACT_PROFILE_LIMITS, rankReactComponents, summarizeReactActivity } from "./react-profile.ts";

const PRINTED_COMPONENTS = 20;
const DISPLAY_DECIMALS = 3;
const TOTAL_COLUMN_WIDTH = 9;
const DURATION_COLUMN_WIDTH = 8;

export interface TraceCalibration {
  readonly timestampUs: number;
  readonly epochMs: number;
}

export interface ReactTraceEvent {
  readonly name: string;
  readonly category: string;
  readonly phase: string;
  readonly timestampUs: number | null;
  readonly durationUs: number | null;
  readonly epochMs: number | null;
  readonly detail: unknown;
}

export interface ReactProfileReceipt {
  readonly profilePath: string;
  readonly summaryPath: string;
  readonly tracePath: string;
  readonly pages: readonly ReactProfilePageEvidence[];
  readonly ranked: readonly RankedReactComponent[];
  readonly rendererCount: number;
  readonly commitCount: number;
  readonly componentCount: number;
  readonly updateEventCount: number;
  readonly userTimingCount: number;
  readonly traceEventCount: number;
  readonly retainedHiddenCompositeRenderCount: number;
  readonly reactTraceEvents: readonly ReactTraceEvent[];
  readonly traceError: string | null;
  readonly gaps: readonly EvidenceGap[];
}

const PROFILE_LIMITATIONS = {
  selfTime:
    "actualDuration minus direct changed-child actualDuration, matching React 19.2 development instrumentation; it is profiler scheduling time, not CPU attribution",
  hooks: "slot-indexed memoized values; hook names/custom-hook source stacks require the omitted DevTools inspect backend",
  reasons: "shallow alternate comparison plus PerformedWork; rendered-without-shallow-change is explicit when no direct change is attributable",
  source: "React development _debugStack when present; no source-map reconstruction",
  compiler: "the evidence describes the compiler and memoization output React actually mounted, not source components optimized away before the Fiber tree",
  activity:
    "React Activity/Offscreen descendants inherit active or retained-hidden state in raw trees; retained-hidden composite renders are counted separately and excluded from the active hot-component ranking",
  topology:
    "raw fibers use flat id/parentId/childIds/segment topology; expanded path and ownerPath are derived for ranked component rows but omitted per raw fiber to keep the bounded artifact readable",
} as const;

interface WriteReceiptAsk {
  readonly pages: readonly ReactProfilePageEvidence[];
  readonly traceEvents: readonly unknown[];
  readonly reactTraceEvents: readonly ReactTraceEvent[];
  readonly traceError: string | null;
  readonly prepareErrors: readonly string[];
  readonly name: string;
  readonly traceCalibration: TraceCalibration | null;
}

async function writeProfileArtifact(path: string, header: Readonly<Record<string, unknown>>, pages: readonly ReactProfilePageEvidence[]): Promise<void> {
  await using file = await open(path, "w");
  const encodedHeader = JSON.stringify(header);
  await file.write(`${encodedHeader.slice(0, -1)},"pages":[`);
  for (const [pageIndex, page] of pages.entries()) {
    if (pageIndex > 0) {
      await file.write(",");
    }
    const { commits, ...pageHeader } = page;
    const encodedPage = JSON.stringify(pageHeader);
    await file.write(`${encodedPage.slice(0, -1)},"commits":[`);
    for (const [commitIndex, commit] of commits.entries()) {
      if (commitIndex > 0) {
        await file.write(",");
      }
      const { fibers, ...commitHeader } = commit;
      const encodedCommit = JSON.stringify(commitHeader);
      await file.write(`${encodedCommit.slice(0, -1)},"fibers":[`);
      for (const [fiberIndex, fiber] of fibers.entries()) {
        if (fiberIndex > 0) {
          await file.write(",");
        }
        const { ownerPath: _ownerPath, path: _path, ...compactFiber } = fiber;
        await file.write(JSON.stringify(compactFiber));
      }
      await file.write("]}");
    }
    await file.write("]}");
  }
  await file.write("]}\n");
}

function profileGaps(pages: readonly ReactProfilePageEvidence[], prepareErrors: readonly string[], rankedCount: number): readonly EvidenceGap[] {
  const gaps: EvidenceGap[] = prepareErrors.map((detail) => ({ evidence: "the React pre-navigation hook", detail }));
  if (pages.length === 0) {
    gaps.push({ evidence: "an owned browser context", detail: "--react-profile found no context Snap owns, so it could not install a pre-mount hook." });
    return gaps;
  }
  for (const page of pages) {
    if (!page.hookInstalled) {
      gaps.push({
        evidence: `the React hook on context ${page.contextIndex} page ${page.pageIndex}`,
        detail: page.installError ?? "the installed hook was absent at measurement",
      });
    }
    if (page.collectorErrors.length > 0) {
      gaps.push({ evidence: `the React collector on context ${page.contextIndex} page ${page.pageIndex}`, detail: page.collectorErrors.join("; ") });
    }
    if (page.commits.some((commit) => commit.truncated)) {
      gaps.push({
        evidence: `the complete React component tree on context ${page.contextIndex} page ${page.pageIndex}`,
        detail: `a commit exceeded the ${String(page.limits.maxFibersPerCommit)}-fiber safety cap; the artifact marks it truncated.`,
      });
    }
  }
  const renderers = pages.reduce((sum, page) => sum + page.renderers.length, 0);
  const commits = pages.reduce((sum, page) => sum + page.commits.length, 0);
  if (renderers === 0) {
    gaps.push({
      evidence: "a React renderer",
      detail:
        "the pre-mount hook ran, but no development renderer called inject(). This page is not mounting the Vite development React renderer (or it mounted before --react-profile).",
    });
  }
  if (commits === 0) {
    gaps.push({ evidence: "a React commit", detail: "a renderer attached, but onCommitFiberRoot never populated this call window." });
  }
  if (rankedCount === 0) {
    gaps.push({ evidence: "a ranked React component", detail: "no rendered composite Fiber populated the ranked table; an empty profile is not a verdict." });
  }
  return gaps;
}

export async function writeReactProfileReceipt(ask: WriteReceiptAsk): Promise<ReactProfileReceipt> {
  const { pages, traceEvents, reactTraceEvents, traceError, prepareErrors, name, traceCalibration } = ask;
  const ranked = rankReactComponents(pages);
  const activity = summarizeReactActivity(pages);
  const gaps = profileGaps(pages, prepareErrors, ranked.length);
  const rendererCount = pages.reduce((sum, page) => sum + page.renderers.length, 0);
  const commitCount = pages.reduce((sum, page) => sum + page.commits.length, 0);
  const updateEventCount = pages.reduce(
    (sum, page) => sum + page.schedules.length + page.commits.reduce((commitSum, commit) => commitSum + commit.updaters.length, 0),
    0,
  );
  const userTimingCount = pages.reduce((sum, page) => sum + page.measures.length, 0);
  const truncatedCommits = pages.flatMap((page) => page.commits.filter((commit) => commit.truncated));
  const profilePath = await artifactFile("react-profile", `${name}-react-profile`, ".json", {
    producer: "react-profile",
    producerArm: "react-profile",
    channel: "react-fiber-profile",
    mediaType: "application/json",
    schema: "snap-react-profile-v1",
    role: "primary",
    completeness: truncatedCommits.length === 0 ? "complete" : "bounded",
    completenessDetail:
      truncatedCommits.length === 0
        ? "complete captured React Fiber commit populations"
        : `bounded flat React Fiber topology with explicit ${String(REACT_PROFILE_LIMITS.maxFibersPerCommit)}-node truncation receipts`,
    scope: aggregateScope(),
    records: ranked.length,
    limits: [
      {
        source: "react-fiber-tree-cap",
        complete: truncatedCommits.length === 0,
        policy: REACT_PROFILE_LIMITS,
        events: truncatedCommits.map((commit) => ({
          kind: "fiber-cap",
          path: `$.pages[].commits[${String(commit.id)}]`,
          original: null,
          retained: REACT_PROFILE_LIMITS.maxFibersPerCommit,
          omitted: null,
        })),
      },
    ],
  });
  const tracePath = await artifactFile("react-profile", `${name}-react-profile`, ".trace.json", {
    producer: "react-profile",
    producerArm: "react-profile",
    channel: "react-performance-tracks",
    mediaType: "application/json",
    schema: "chromium-trace-events",
    role: "primary",
    completeness: traceError === null ? "complete" : "bounded",
    completenessDetail:
      traceError === null ? "complete captured Chromium/User Timing trace" : "partial Chromium/User Timing trace with an explicit collection failure",
    scope: aggregateScope(),
    records: traceEvents.length,
    limits: [
      {
        source: "react-performance-trace",
        complete: traceError === null,
        policy: null,
        events: traceError === null ? [] : [{ kind: "collection-error", path: "$.traceEvents", original: null, retained: traceEvents.length, omitted: null }],
      },
    ],
  });
  const summaryPath = await artifactFile("react-profile", `${name}-react-profile`, ".summary.json", {
    producer: "react-profile",
    producerArm: "react-profile",
    channel: "react-profile-summary",
    mediaType: "application/json",
    schema: "snap-react-profile-summary-v1",
    role: "primary",
    completeness: truncatedCommits.length === 0 ? "complete" : "bounded",
    completenessDetail: "bounded browser-free React profile summary; raw Fiber and trace evidence remain separate immutable artifacts",
    scope: aggregateScope(),
    records: Math.min(ranked.length, REACT_PROFILE_SUMMARY_COMPONENT_LIMIT),
    limits: [],
  });
  await writeFile(tracePath, `${JSON.stringify({ traceEvents })}\n`);
  await writeProfileArtifact(
    profilePath,
    {
      version: 1,
      contract: "snap-react-development-renderer-profile",
      generatedAt: new Date().toISOString(),
      summary: {
        rendererCount,
        commitCount,
        componentCount: ranked.length,
        updateEventCount,
        userTimingCount,
        reactTraceEventCount: reactTraceEvents.length,
        retainedHiddenCompositeRenderCount: activity.retainedHiddenCompositeRenderCount,
      },
      limitations: PROFILE_LIMITATIONS,
      trace: { path: tracePath, eventCount: traceEvents.length, calibration: traceCalibration, reactEvents: reactTraceEvents, error: traceError },
      gaps,
      ranked,
    },
    pages,
  );
  const summaryArtifact: ReactProfileSummaryArtifact = {
    version: 1,
    contract: "snap-react-development-renderer-profile-summary",
    generatedAt: new Date().toISOString(),
    summary: {
      rendererCount,
      commitCount,
      componentCount: ranked.length,
      updateEventCount,
      userTimingCount,
      reactTraceEventCount: reactTraceEvents.length,
      retainedHiddenCompositeRenderCount: activity.retainedHiddenCompositeRenderCount,
    },
    limits: REACT_PROFILE_LIMITS,
    limitations: PROFILE_LIMITATIONS,
    gaps,
    hottest: ranked.slice(0, REACT_PROFILE_SUMMARY_COMPONENT_LIMIT),
    artifacts: { rawFiber: profilePath, trace: tracePath },
  };
  await writeFile(summaryPath, `${JSON.stringify(summaryArtifact)}\n`);
  return {
    profilePath,
    summaryPath,
    tracePath,
    pages,
    ranked,
    rendererCount,
    commitCount,
    componentCount: ranked.length,
    updateEventCount,
    userTimingCount,
    traceEventCount: traceEvents.length,
    retainedHiddenCompositeRenderCount: activity.retainedHiddenCompositeRenderCount,
    reactTraceEvents,
    traceError,
    gaps,
  };
}

export function reportReactProfile(receipt: ReactProfileReceipt): void {
  print(
    `--- REACT PROFILE (${String(receipt.commitCount)} commits, ${String(receipt.componentCount)} component paths, ${String(receipt.rendererCount)} renderers) ---`,
  );
  print(
    `  retained-hidden=${String(receipt.retainedHiddenCompositeRenderCount)} composite render(s) (Activity/Offscreen raw evidence; excluded from active ranking)`,
  );
  for (const row of receipt.ranked.slice(0, PRINTED_COMPONENTS)) {
    print(
      `  ${row.totalActualDurationMs.toFixed(DISPLAY_DECIMALS).padStart(TOTAL_COLUMN_WIDTH)}ms total  ${row.averageActualDurationMs.toFixed(DISPLAY_DECIMALS).padStart(DURATION_COLUMN_WIDTH)}ms avg  ${row.maxActualDurationMs.toFixed(DISPLAY_DECIMALS).padStart(DURATION_COLUMN_WIDTH)}ms max  ${row.selfTimeMs.toFixed(DISPLAY_DECIMALS).padStart(DURATION_COLUMN_WIDTH)}ms self  c${String(row.contextIndex)}p${String(row.pageIndex)} ${row.path}`,
    );
  }
  print(`  profile     ${receipt.profilePath}`);
  print(`  summary     ${receipt.summaryPath}`);
  print(`  trace       ${receipt.tracePath} (${String(receipt.traceEventCount)} events, ${String(receipt.reactTraceEvents.length)} React track events)`);
  if (receipt.traceError !== null) {
    print(`  track limit ${receipt.traceError}`);
  }
}

export async function readReactProfileSummary(path: string): Promise<ReactProfileSummaryArtifact> {
  return reactProfileSummaryArtifactSchema.parse(JSON.parse(await readFile(path, "utf8")));
}
