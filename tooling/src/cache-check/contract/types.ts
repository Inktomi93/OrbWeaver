// cache-check shapes: the route and case axes, one measured provider call, one line's verdict, and the run's
// inputs (routes, the parsed env file, the typed orb client).
import type { AppRouter } from "@orb/server/transport/trpc";
import type { TRPCClient } from "@trpc/client";

/** The provider routes a real orb turn can take to a Claude model. */
export const CACHE_ROUTES = ["direct", "openrouter", "agent-sdk"] as const;
export type CacheRoute = (typeof CACHE_ROUTES)[number];

/**
 * The turn shapes whose history breakpoints have regressed.
 *
 * @remarks `solo` is a one-character chat; `deep-note` carries a depth-4 system note that moves with the
 * history; `group` runs per-speaker merged rounds of two speakers on one roster system block; `narrator`
 * runs narrator rounds; `continue` continues the last reply, so the history ends on an assistant row.
 */
export const CACHE_CASES = ["solo", "deep-note", "group", "narrator", "continue"] as const;
export type CacheCase = (typeof CACHE_CASES)[number];

/**
 * One line's outcome.
 *
 * @remarks `SKIPPED` is an optional route with no credential. `ERROR` is a case that could not measure, which
 * is never a claim about the cache in either direction.
 */
export const CASE_VERDICTS = ["PASS", "FAIL", "SKIPPED", "ERROR"] as const;
export type CaseVerdict = (typeof CASE_VERDICTS)[number];

/** One provider call, read off the assistant row it produced. A null count means no usage was recorded. */
export interface CallUsage {
  /** The upstream request or generation id (`msg_…`, `gen-…`), else the orb message id. */
  readonly id: string;
  /** The whole prompt: uncached input plus cache read plus cache write (orb's `tokensIn`). */
  readonly promptTokens: number | null;
  readonly readTokens: number | null;
  readonly writeTokens: number | null;
}

/** A judged pair: `ratio` is `next`'s cache read over `prev`'s whole prompt. */
export interface JudgedPair {
  readonly prev: CallUsage;
  readonly next: CallUsage;
  readonly ratio: number;
}

interface CaseKey {
  readonly route: CacheRoute;
  readonly case: CacheCase;
}

/** A case that measured: every consecutive pair in call order, and the worst of them, which decides. */
export interface MeasuredOutcome extends CaseKey {
  readonly verdict: Extract<CaseVerdict, "PASS" | "FAIL">;
  readonly worst: JudgedPair;
  readonly pairs: readonly JudgedPair[];
  readonly floor: number;
  /** For a FAIL the route lists as known, the work item that owns the cause. */
  readonly knownCause?: string | undefined;
}

/** A case that did not measure, with the reason its line prints. */
export interface UnmeasuredOutcome extends CaseKey {
  readonly verdict: Extract<CaseVerdict, "SKIPPED" | "ERROR">;
  readonly reason: string;
}

export type CaseOutcome = MeasuredOutcome | UnmeasuredOutcome;

/** The parsed command line. */
export interface CacheCheckOptions {
  readonly routes: readonly CacheRoute[];
  readonly cases: readonly CacheCase[];
  /** The git ref the isolated stage serves; unused when `dirty` is set. */
  readonly ref: string;
  /** Stage the working tree instead of a commit, for a planted regression. */
  readonly dirty: boolean;
}

/** One case's measured calls in order, the floor, and the model's minimum cacheable prefix. */
export interface CaseEvidence {
  readonly calls: readonly CallUsage[];
  readonly floor: number;
  readonly cacheMinTokens: number;
}

/** A case's verdict before it is keyed to a route and a case. */
export type CaseJudgement = Omit<MeasuredOutcome, "route" | "case"> | Omit<UnmeasuredOutcome, "route" | "case">;

/** What a case spent and measured: its judged calls, and the provider-reported cost of every reply. */
export interface CaseRun {
  readonly calls: readonly CallUsage[];
  /** One entry per reply, setup turns included; null where the provider reported no cost. */
  readonly replyCosts: readonly (number | null)[];
}

/** One probe connection: the provider, the model, and where its credential comes from. */
export interface RouteSpec {
  readonly providerId: string;
  readonly model: string;
  /** The env variable (process env first, then the main checkout's `.env`) holding the probe key. */
  readonly credentialEnv: string;
  /** A required route with no credential is a tool error. An optional one also takes a credential of its
   *  provider already stored in the stage DB, and is SKIPPED when neither exists. */
  readonly required: boolean;
  /** Whether a run with no `--routes` includes this route. An opt-in route runs only when named. */
  readonly runByDefault: boolean;
  /** Cases known to fail on this route, each with the work item that owns the cause. A known FAIL still fails
   *  the run; its line names the item so a reader does not re-diagnose it. */
  readonly knownFailures: Readonly<Partial<Record<CacheCase, string>>>;
}

/** Why a route did not run, and the verdict every case on it prints. */
export interface RouteRefusal {
  readonly verdict: Extract<CaseVerdict, "SKIPPED" | "ERROR">;
  readonly reason: string;
}

/** A parsed env file; a key the file does not set reads undefined. */
export type EnvFile = Readonly<Record<string, string | undefined>>;

/** The typed client the check drives orb through. */
export type OrbApi = TRPCClient<AppRouter>;
