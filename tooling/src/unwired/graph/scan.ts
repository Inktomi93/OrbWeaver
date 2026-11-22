// One graph session: the roots, the merged program and the build, then the analysis, the find-references check of a
// member bucket, the delete trial of named buckets, or the custom-property pass over it.

import type { NativeWorld } from "../native.ts";
import type { Analysis, MemberBucket } from "./analyse.ts";
import { analyse } from "./analyse.ts";
import type { Graph } from "./build.ts";
import { buildGraph, openGraphWorld } from "./build.ts";
import type { CssReport } from "./css.ts";
import { cssPass } from "./css.ts";
import { loadRoots } from "./roots.ts";
import type { TrialBucket, TrialReport } from "./trial.ts";
import { runTrials } from "./trial.ts";
import type { Verified } from "./verify.ts";
import { evenSample, verifyFindings } from "./verify.ts";

/** A graph scan's buckets and what the build counted on the way. */
export interface GraphScan {
  readonly files: number;
  readonly analysis: Analysis;
  readonly counts: readonly { readonly name: string; readonly count: number }[];
  /** Property reads no origin walk, declaration or by-design reason placed, as `file:pos .name`. */
  readonly lostReads: readonly string[];
}

/** A member bucket's sampled findings, each with its find-references verdict. */
export interface GraphVerification {
  readonly bucket: MemberBucket;
  readonly total: number;
  readonly entries: readonly Verified[];
}

/** Where a graph session reports its progress. */
export type GraphLog = (line: string) => void;

async function session<T>(root: string, log: GraphLog, use: (graph: Graph, world: NativeWorld) => T | Promise<T>): Promise<T> {
  const roots = await loadRoots(root);
  using world = openGraphWorld(root);
  return await use(buildGraph(root, world, roots, log), world);
}

const scanOf = (graph: Graph): GraphScan => ({
  files: graph.files.length,
  analysis: analyse(graph),
  counts: [...graph.state.counts].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count })),
  lostReads: graph.state.lostReads,
});

/** Build and analyse the graph of the tree at `root`. */
export function scanGraph(root: string, log: GraphLog): Promise<GraphScan> {
  return session(root, log, scanOf);
}

/** Build and analyse the graph, then check an even sample of one member bucket against find-references. */
export function verifyGraph(
  root: string,
  check: { readonly bucket: MemberBucket; readonly sample: number | null },
  log: GraphLog,
): Promise<{ readonly scan: GraphScan; readonly verification: GraphVerification }> {
  const { bucket, sample } = check;
  return session(root, log, (graph, world) => {
    const scan = scanOf(graph);
    const findings = scan.analysis[bucket];
    return { scan, verification: { bucket, total: findings.length, entries: verifyFindings(world, evenSample(findings, sample)) } };
  });
}

/** Build the graph, then report the custom properties nothing reads. */
export function cssGraph(root: string, log: GraphLog): Promise<CssReport> {
  return session(root, log, (graph) => cssPass(root, graph));
}

/** Build and analyse the graph, then delete each finding of the named buckets in a throwaway snapshot and run the
 *  unused-diagnostics control (./trial.ts). */
export function trialGraph(root: string, buckets: readonly TrialBucket[], log: GraphLog): Promise<TrialReport> {
  return session(root, log, (graph) => runTrials(graph, analyse(graph), buckets, log));
}
