// The options of one graph session, parsed once by the `pnpm unwired` graph verbs (tooling/src/unwired/run.ts) and
// threaded whole through the build, the analysis and the report. An ablated run's buckets are not the tree's: every
// report names the ablations it ran under.

/** The recognizers a run can switch off, to measure what each one decides. */
export const ABLATIONS = ["literal-keys", "escape", "zod-twins", "spelling"] as const;
export type Ablation = (typeof ABLATIONS)[number];

/** What `--profile` collects: phase wall times and counts, plus the compiler's CPU or heap profile. */
export const PROFILES = ["wall", "cpu", "heap"] as const;
export type ProfileKind = (typeof PROFILES)[number];

/** The build sites a run can trace to its log. */
const TRACES = ["axis", "tv", "param-key", "verify-chain"] as const;
export type TraceKind = (typeof TRACES)[number];

/** A trace and what it narrows to: `axis` names one prop, `param-key` a file prefix (null for every file). */
export type Trace =
  | { readonly kind: "axis"; readonly prop: string }
  | { readonly kind: "tv" }
  | { readonly kind: "param-key"; readonly file: string | null }
  | { readonly kind: "verify-chain" };

/** A `--why` target: a member by name (`Owner.member` or a bare name), or the declaration at a file's line. */
export type WhyTarget =
  | { readonly kind: "member"; readonly owner: string | null; readonly name: string }
  | { readonly kind: "site"; readonly file: string; readonly line: number };

interface GraphProfileOption {
  readonly kind: ProfileKind;
  /** Where a CPU or heap profile is written. */
  readonly dir: string;
}

export interface GraphOptions {
  readonly profile: GraphProfileOption | null;
  readonly why: readonly WhyTarget[];
  /** A repository-relative prefix: the build walks only the files under it. */
  readonly files: string | null;
  readonly traces: readonly Trace[];
  readonly ablate: ReadonlySet<Ablation>;
  /** Where the built graph is written for a later `from`. */
  readonly dump: string | null;
  /** A dump whose graph the run analyses instead of building one. */
  readonly from: string | null;
}

/** A fresh build of the whole tree with nothing traced, profiled or ablated. */
export const FRESH_BUILD: GraphOptions = { profile: null, why: [], files: null, traces: [], ablate: new Set<Ablation>(), dump: null, from: null };

const SITE_TARGET = /^(.+):([1-9]\d*)$/u;
const MEMBER_TARGET = /^(?:([\w$]+)\.)?([\w$]+)$/u;

/** A `--why` value read as its target, or null when it names neither form. */
export function whyTarget(text: string): WhyTarget | null {
  const site = SITE_TARGET.exec(text);
  if (site?.[1] !== undefined && site[2] !== undefined) {
    return { kind: "site", file: site[1], line: Number(site[2]) };
  }
  const member = MEMBER_TARGET.exec(text);
  return member?.[2] === undefined ? null : { kind: "member", owner: member[1] ?? null, name: member[2] };
}

const TRACE_ARGUMENT = ":";

/** A `--trace` value read as its trace, or null when the kind is unknown or its argument is wrong. */
export function traceOf(text: string): Trace | null {
  const split = text.indexOf(TRACE_ARGUMENT);
  const kind = TRACES.find((candidate) => candidate === (split < 0 ? text : text.slice(0, split)));
  const argument = split < 0 ? null : text.slice(split + 1);
  switch (kind) {
    case undefined:
      return null;
    case "axis":
      return argument === null || argument === "" ? null : { kind, prop: argument };
    case "param-key":
      return { kind, file: argument === "" ? null : argument };
    case "tv":
    case "verify-chain":
      return argument === null ? { kind } : null;
  }
}

/** The trace of `kind` a run asked for, if any. */
export const tracing = <K extends TraceKind>(options: GraphOptions, kind: K): Extract<Trace, { readonly kind: K }> | undefined =>
  options.traces.find((trace): trace is Extract<Trace, { readonly kind: K }> => trace.kind === kind);
