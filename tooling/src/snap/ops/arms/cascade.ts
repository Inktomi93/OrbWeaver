// Snap's browser-cascade producer. It reads #949's unchanged merge handle and joins official SDK
// declaration-state evidence behind one `cssEvidence` manifest member; there is no second app bridge.
import { splitLastEq } from "../../../_shared/argv.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import type { ProbeSession } from "../../../_shared/browser.ts";
import type { DevToolsCascadeRawDeclaration, DevToolsCascadeRuntime } from "../../../_shared/devtools-runtime.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { ArmArgs, ArmDef, ArmFailureCounts, ArmNeeds, ArmRunContext, ArmRunInstance } from "../../contract/arms.ts";
import type { CssCascadeDeclaration, CssCascadeQuery, CssCascadeReceipt, CssEvidenceReceipt } from "../../contract/cascade.ts";
import { classifyCascadeSource, REPOSITORY_CASCADE_SOURCES } from "../../lib/cascade-source.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function errorReceipt(query: CssCascadeQuery, error: string): CssCascadeReceipt {
  return { status: "instrument-error", selector: query.selector, property: query.property, error };
}

function receiptError(repositoryDeclarations: number, merge: unknown, requireMerge: boolean): string | null {
  if (repositoryDeclarations === 0) {
    return "repository declaration population is zero; pair the query with a planted repository declaration";
  }
  if (requireMerge && (merge as { status?: unknown }).status === "instrument-error") {
    return `#949 merge transport reported instrument-error: ${String((merge as { error?: unknown }).error ?? "unknown")}`;
  }
  return null;
}

async function readMergeReceipt(session: ProbeSession, pageIndex: number): Promise<unknown> {
  const page = session.pages[pageIndex];
  if (page === undefined) {
    throw new Error(`cascade page @${pageIndex} does not exist`);
  }
  const receipt = await page.evaluate(`(() => {
    const handle = globalThis.__orb?.css;
    if (!handle || typeof handle.read !== "function") throw new Error("window.__orb.css.read is unavailable");
    return handle.read();
  })()`);
  if (typeof receipt !== "object" || receipt === null) {
    throw new Error("window.__orb.css.read returned a non-object");
  }
  return receipt;
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
  let merge: unknown = null;
  // @orb-gate-ignore caught-failure-ownership(empty:error): the catch returns a terminal instrument-error receipt consumed by Snap's verdict and artifact, including one error row per requested query. Ends if this result stops driving the verdict.
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
}

/** THE CASCADE ARM. A RUN arm rather than a page arm because one query set spans the tabs it named and the
 *  read needs the SDK runtime the whole browser carries, not a single page's handle.
 *
 *  It contributes no RESULT pair and no failure count of its own: a cascade instrument-error lands in the
 *  `css` summary member, which counts OUTCOMES whose CSS evidence is untrustworthy for either reason (a
 *  cascade error here, an unreadable stylesheet in the dead-css arm) and so is folded once, in
 *  ops/verdict.ts, where both sheets for one page are visible. Two arms each adding their own count would
 *  double-count a page that failed both ways. */
const CASCADE_INSTANCE: ArmRunInstance = {
  measure: captureCssEvidence,
  report: (): Promise<void> => Promise.resolve(),
  failures: (): ArmFailureCounts => ({}),
  denominators: () => ({}),
  pairs: (): readonly ResultPair[] => [],
  exit: (code: number): number => code,
};

export const CASCADE_ARM = {
  flags: [
    {
      flag: "--cascade",
      kind: "required-value",
      pageTargetable: true,
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
  defaults: (): Pick<ArmArgs, "cascade"> => ({ cascade: [] }),
  help: "  --cascade <selector=property>  Chromium's computed value + official Active/Overloaded declarations",
  lifecycle: { at: "run", begin: (): ArmRunInstance => CASCADE_INSTANCE },
} satisfies ArmDef;
