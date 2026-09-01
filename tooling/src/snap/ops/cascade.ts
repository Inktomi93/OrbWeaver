// Snap's browser-cascade producer. It reads #949's unchanged merge handle and joins official SDK
// declaration-state evidence behind one `cssEvidence` manifest member; there is no second app bridge.
import type { ProbeSession } from "../../_shared/browser.ts";
import type { DevToolsCascadeRawDeclaration } from "../../_shared/devtools-runtime.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { CssCascadeDeclaration, CssCascadeQuery, CssCascadeReceipt, CssEvidenceReceipt } from "../contract/cascade.ts";
import type { Args, CaptureOutcome } from "../contract/types.ts";
import { classifyCascadeSource, REPOSITORY_CASCADE_SOURCES } from "../lib/cascade-source.ts";
import { cascadeRuntimeFor } from "./session.ts";

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

export async function capturePageCssEvidence(
  session: ProbeSession,
  queries: readonly CssCascadeQuery[],
  pageIndex: number,
  requireMerge = true,
): Promise<CssEvidenceReceipt> {
  const runtime = cascadeRuntimeFor(session);
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

export async function captureCssEvidence(session: ProbeSession, opts: Args, outcomes: readonly CaptureOutcome[]): Promise<void> {
  const pages = new Set(opts.cascade.map((query) => query.page));
  for (const pageIndex of pages) {
    const queries = opts.cascade.filter((query) => query.page === pageIndex);
    const outcome = outcomes.find((candidate) => candidate.pageIndex === pageIndex);
    if (outcome === undefined) {
      throw new Error(`cascade outcome @${pageIndex} is unavailable`);
    }
    outcome.cssEvidence = await capturePageCssEvidence(session, queries, pageIndex);
  }
}
