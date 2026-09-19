// Snap's browser-cascade producer. It reads #949's unchanged merge handle and joins official SDK
// declaration-state evidence behind one `cssEvidence` manifest member; there is no second app bridge.

import type { CssMergeConflict, CssMergeReceipt, CssMergeTraceSnapshot } from "@orb/ui/css-merge-contract";
import { splitLastEq } from "../../../_shared/argv.ts";
import { aggregateScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import type { ProbeSession } from "../../../_shared/browser-contract.ts";
import type { DevToolsCascadeRawDeclaration, DevToolsCascadeRuntime } from "../../../_shared/devtools-runtime.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmRunContext, ArmRunInstance } from "../../contract/arms.ts";
import type { CssCascadeDeclaration, CssCascadeQuery, CssCascadeReceipt, CssEvidenceReceipt } from "../../contract/cascade.ts";
import { cssMergeTraceStatusSchema } from "../../contract/cascade.ts";
import type { CaptureOutcome } from "../../contract/types.ts";
import { classifyCascadeSource, REPOSITORY_CASCADE_SOURCES } from "../../lib/cascade-source.ts";
import { writeArmEvidenceFile } from "./evidence-file.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function nonnegativeCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} is not a non-negative integer`);
  }
  return Number(value);
}

function occurrence(value: unknown, label: string): { readonly index: number; readonly className: string } {
  const row = record(value, label);
  if (typeof row["className"] !== "string") {
    throw new Error(`${label}.className is not a string`);
  }
  return { index: nonnegativeCount(row["index"], `${label}.index`), className: row["className"] };
}

function conflict(value: unknown, label: string): CssMergeConflict {
  const row = record(value, label);
  if (typeof row["axis"] !== "string") {
    throw new Error(`${label}.axis is not a string`);
  }
  return {
    axis: row["axis"],
    loser: occurrence(row["loser"], `${label}.loser`),
    winner: occurrence(row["winner"], `${label}.winner`),
  };
}

function mergeReceipt(value: unknown, index: number): CssMergeReceipt {
  const label = `window.__orb.css.read receipts[${String(index)}]`;
  const row = record(value, label);
  if (!(Array.isArray(row["input"]) && Array.isArray(row["conflicts"])) || typeof row["output"] !== "string") {
    throw new Error(`${label} is malformed`);
  }
  return {
    input: row["input"].map((entry, occurrenceIndex) => occurrence(entry, `${label}.input[${String(occurrenceIndex)}]`)),
    conflicts: row["conflicts"].map((entry, conflictIndex) => conflict(entry, `${label}.conflicts[${String(conflictIndex)}]`)),
    output: row["output"],
  };
}

export function cssMergeTraceSnapshot(value: unknown): CssMergeTraceSnapshot {
  const row = record(value, "window.__orb.css.read receipt");
  const status = cssMergeTraceStatusSchema.safeParse(row["status"]);
  if (!status.success || typeof row["enabled"] !== "boolean" || !Array.isArray(row["receipts"])) {
    throw new Error("window.__orb.css.read returned a malformed trace receipt");
  }
  const base = {
    enabled: row["enabled"],
    calls: nonnegativeCount(row["calls"], "window.__orb.css.read calls"),
    conflictCalls: nonnegativeCount(row["conflictCalls"], "window.__orb.css.read conflictCalls"),
    deduplicatedConflictCalls: nonnegativeCount(row["deduplicatedConflictCalls"], "window.__orb.css.read deduplicatedConflictCalls"),
    receipts: row["receipts"].map(mergeReceipt),
  };
  if (status.data === "instrument-error") {
    if (typeof row["error"] !== "string") {
      throw new Error("window.__orb.css.read instrument-error has no error detail");
    }
    return { ...base, status: status.data, error: row["error"] };
  }
  return { ...base, status: status.data };
}

function mapDeclaration(raw: DevToolsCascadeRawDeclaration): CssCascadeDeclaration {
  return {
    property: raw.property,
    value: raw.value,
    state: raw.state,
    important: raw.important,
    inherited: raw.inherited,
    styleType: raw.styleType,
    selector: raw.selector,
    styleSheetId: raw.styleSheetId,
    sourceUrl: raw.sourceUrl,
    source: classifyCascadeSource(raw),
    range: raw.range,
  };
}

/** The first #949 merge instrument-error across this run's CSS sheets, for the arm's own filed fact. */
function firstMergeError(evidence: readonly CssEvidenceReceipt[]): string | null {
  let found: string | null = null;
  for (const sheet of evidence) {
    if (found === null && sheet.merge !== null && sheet.merge.status === "instrument-error") {
      found = sheet.merge.error;
    }
  }
  return found;
}

function errorReceipt(query: CssCascadeQuery, error: string): CssCascadeReceipt {
  return { status: "instrument-error", selector: query.selector, property: query.property, error };
}

function receiptError(repositoryDeclarations: number, merge: CssEvidenceReceipt["merge"], requireMerge: boolean): string | null {
  if (repositoryDeclarations === 0) {
    return "repository declaration population is zero; pair the query with a planted repository declaration";
  }
  if (requireMerge && merge?.status === "instrument-error") {
    return `#949 merge transport reported instrument-error: ${merge.error}`;
  }
  return null;
}

async function readMergeReceipt(session: ProbeSession, pageIndex: number): Promise<CssMergeTraceSnapshot> {
  const page = session.pages[pageIndex];
  if (page === undefined) {
    throw new Error(`cascade page @${pageIndex} does not exist`);
  }
  const receipt = await page.evaluate(`(() => {
    const handle = globalThis.__orb?.css;
    if (!handle || typeof handle.read !== "function") throw new Error("window.__orb.css.read is unavailable");
    return handle.read();
  })()`);
  return cssMergeTraceSnapshot(receipt);
}

/** The cascade read's ask. `runtime` is PASSED IN rather than looked up off the session: an arm takes what
 *  it needs from its context (contract/arms.ts `ArmProvisions`), which is what keeps `ops/session.ts` —
 *  the launcher that decides whether to bring the SDK profile up at all — free of an import back into the
 *  arm it launched for. */
export interface CssEvidenceAsk {
  readonly runtime: DevToolsCascadeRuntime | null;
  readonly session: ProbeSession;
  readonly queries: readonly CssCascadeQuery[];
  readonly pageIndex: number;
  /** #949's in-app merge handle must agree; the appearance-invariant pass reads the cascade alone. */
  readonly requireMerge?: boolean;
}

export async function capturePageCssEvidence(ask: CssEvidenceAsk): Promise<CssEvidenceReceipt> {
  const { runtime, session, queries, pageIndex, requireMerge = true } = ask;
  const page = session.pages[pageIndex];
  if (runtime === null || page === undefined) {
    const error = runtime === null ? "DevTools cascade runtime is not attached" : `page @${pageIndex} does not exist`;
    return { status: "instrument-error", merge: null, cascade: queries.map((query) => errorReceipt(query, error)), repositoryDeclarations: 0, error };
  }
  let merge: CssEvidenceReceipt["merge"] = null;
  // @orb-waive caught-failure-ownership(error): the catch returns a terminal instrument-error receipt consumed by Snap's verdict and artifact, including one error row per requested query. Ends if this result stops driving the verdict.
  try {
    merge = await readMergeReceipt(session, pageIndex);
    const raw = await runtime.query(
      page,
      queries.map(({ selector, property, matchIndex }) => ({ selector, property, ...(matchIndex === undefined ? {} : { matchIndex }) })),
    );
    const cascade: CssCascadeReceipt[] = raw.map((receipt) => ({
      status: "ok",
      selector: receipt.selector,
      property: receipt.property,
      matchIndex: receipt.matchIndex,
      computedValue: receipt.computedValue,
      targetId: receipt.targetId,
      computedDefault: receipt.computedDefault,
      declarations: receipt.declarations.map(mapDeclaration),
    }));
    const repositoryDeclarations = cascade.reduce(
      (count, receipt) =>
        receipt.status === "ok" ? count + receipt.declarations.filter((declaration) => REPOSITORY_CASCADE_SOURCES.has(declaration.source)).length : count,
      0,
    );
    const error = receiptError(repositoryDeclarations, merge, requireMerge);
    return { status: error === null ? "ok" : "instrument-error", merge, cascade, repositoryDeclarations, error };
  } catch (error) {
    const detail = errorMessage(error);
    return { status: "instrument-error", merge, cascade: queries.map((query) => errorReceipt(query, detail)), repositoryDeclarations: 0, error: detail };
  }
}

async function captureCssEvidence(ctx: ArmRunContext): Promise<void> {
  const { session, opts, outcomes, provisions } = ctx;
  const pages = new Set(opts.cascade.map((query) => query.page));
  for (const pageIndex of pages) {
    const queries = opts.cascade.filter((query) => query.page === pageIndex);
    const outcome = outcomes.find((candidate) => candidate.pageIndex === pageIndex);
    if (outcome === undefined) {
      throw new Error(`cascade outcome @${pageIndex} is unavailable`);
    }
    outcome.cssEvidence = await capturePageCssEvidence({ runtime: provisions.cascadeRuntime, session, queries, pageIndex });
  }
  await fileCssEvidence(outcomes);
}

/** #1342: the CASCADE RECEIPT, filed. This arm is a RUN arm, so it has no page-lifecycle `evidence` hook —
 *  it files from its own measure step, which is the same contract: an artifact declared under `cascade`
 *  becomes this arm's fact reference in `ops/run-bundle.ts`. Before this, `--cascade`'s winning
 *  declarations and merge trace printed and then existed nowhere a cited run.json could reach. */
async function fileCssEvidence(outcomes: readonly CaptureOutcome[]): Promise<void> {
  const rows = outcomes.filter((outcome) => outcome.cssEvidence !== null).map((outcome) => ({ page: outcome.pageIndex, cssEvidence: outcome.cssEvidence }));
  await writeArmEvidenceFile({
    arm: "cascade",
    name: "cascade",
    slug: "",
    schema: "snap-cascade-receipts-v1",
    records: rows.length,
    completeness: "complete",
    completenessDetail: "every --cascade query's receipt for this run: the winning declaration chain, the merge trace and any instrument error",
    body: { v: 1, pages: rows },
  });
}

/** THE CASCADE ARM. A RUN arm rather than a page arm because one query set spans the tabs it named and the
 *  read needs the SDK runtime the whole browser carries, not a single page's handle.
 *
 *  It contributes no RESULT pair and no failure count of its own: a cascade instrument-error lands in the
 *  `css` summary member, which counts OUTCOMES whose CSS evidence is untrustworthy for either reason (a
 *  cascade error here, an unreadable stylesheet in the dead-css arm) and so is folded once, in
 *  ops/verdict.ts, where both sheets for one page are visible. Two arms each adding their own count would
 *  double-count a page that failed both ways. */
export const CASCADE_ARM = {
  flags: [
    {
      flag: "--cascade",
      kind: "required-value",
      pageTargetable: true,
      group: "Look",
      summary: "selector=property — Chromium's computed value plus the Active/Overloaded declarations (not with --lighthouse)",
      handler: (a, rest, page): void => {
        const value = splitLastEq(rest.shift() ?? "");
        a.cascade.push({ selector: value.head, property: value.tail, page });
      },
    },
  ],
  // The ONE session-level arm: the SDK runtime is a persistent-profile LAUNCH fact, so `--cascade` belongs
  // to a stateful session's boot call and is refused on a later one (lib/session-plan.ts SESSION_ONLY_FLAGS
  // derives that set from this field).
  level: "session",
  needs: (opts): ArmNeeds => (opts.cascade.length === 0 ? {} : { devtoolsSdk: true }),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "cascade"> => ({ cascade: [] }),
  help: "  --cascade <selector=property>  Chromium's computed value + official Active/Overloaded declarations",
  result: {
    schema: "snap-arm-cascade-v1",
    source: "CDP CSS + CSSOverview",
    lifetime: "settled page capture",
    enabled: (opts): boolean => opts.cascade.length > 0,
  },
  lifecycle: {
    at: "run",
    begin: (_session, opts): ArmRunInstance<"cascade"> => {
      let context: ArmRunContext | null = null;
      return {
        prepare: (): Promise<void> => Promise.resolve(),
        afterNavigation: (): Promise<void> => Promise.resolve(),
        beforeAction: (): Promise<null> => Promise.resolve(null),
        afterAction: (): Promise<void> => Promise.resolve(),
        afterActions: (): Promise<void> => Promise.resolve(),
        afterSettle: (): Promise<void> => Promise.resolve(),
        measure: async (ctx): Promise<void> => {
          context = ctx;
          await captureCssEvidence(ctx);
        },
        report: (): Promise<void> => Promise.resolve(),
        failures: (): ArmFailureCounts => ({}),
        denominators: () => ({}),
        pairs: (): readonly ResultPair[] => [],
        facts: (): readonly ArmFactEmission<"cascade">[] => {
          const evidence = context?.outcomes.flatMap((outcome) => (outcome.cssEvidence === null ? [] : [outcome.cssEvidence])) ?? [];
          const receipts = evidence.flatMap((sheet) => sheet.cascade);
          const failures = receipts.filter((receipt) => receipt.status === "instrument-error").length;
          // THE MERGE HALF OF THE VERDICT, IN THE FACT TOO (#2460). `failures` counts QUERY receipts, and a
          // #949 merge instrument-error — a cross-group eviction, say — leaves every query receipt `ok`
          // while making the whole sheet untrustworthy. ops/verdict.ts already folds that outcome into the
          // `css` summary member, so the RUN reds; before this, the arm's own filed fact still read
          // `state: passed` beside it, which is an instrument lying in its own artifact. The count stays out
          // of `failures` deliberately — see this arm's header on why the `css` member is folded once.
          const detail = firstMergeError(evidence);
          let state: "off" | "refused" | "passed" = "off";
          if (opts.cascade.length > 0) {
            state = failures > 0 || detail !== null ? "refused" : "passed";
          }
          return [
            {
              scope: aggregateScope(),
              data: { state, detail, queries: receipts.length, failures },
            },
          ];
        },
        exit: (code: number): number => code,
      };
    },
  },
} satisfies ArmDef<"cascade">;
