// One page's full capture pass: drive the argv queue, then the settled-surface evidence (aria/eval/
// contrast/map/assertions/perf/dead-css), then the shot — failures never abort (the PNG still lands).
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import type { ProbeSession } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { CaptureEvidence, PagePlan } from "../contract/plan.ts";
import type { Args, CaptureOutcome, EvidencePass, ShotPlan } from "../contract/types.ts";
import { planOut } from "../lib/out-names.ts";
import { captureContrasts } from "./contrast.ts";
import { scanDeadCss } from "./dead-css.ts";
import { driveActions, navigate, settlePage, splitTrailingEvals } from "./drive.ts";
import { captureAria, captureEvals, capturePerfEvidence, runAssertions } from "./evidence.ts";
import { captureMap } from "./map.ts";
import { captureShot } from "./shot.ts";
import { awaitThemeStamp } from "./theme-stamp.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

async function captureEvidence(page: Page, opts: Args, outcome: CaptureOutcome, pass: EvidencePass): Promise<void> {
  const { pageIndex, trailingEvals } = pass;
  if (opts.deadCss) {
    const scan = await scanDeadCss(page, opts.includeHidden);
    outcome.deadCss = [...scan.dead];
    outcome.emptyCss = [...scan.empty];
    outcome.deadCssEvidence = scan;
  }
  if (opts.aria && opts.ariaPage === pageIndex) {
    const aria = await captureAria(page, opts);
    outcome.ariaText = aria.text;
    outcome.ariaError = aria.error;
  }
  // Evals that come AFTER the last drive action run here — post-settle, exactly as they always did.
  // The ones written mid-chain already ran at their argv position inside driveActions, and their
  // outcomes are already in `outcome.evalResults`; appending keeps the report in argv order.
  if (trailingEvals.length > 0) {
    outcome.evalResults = [...outcome.evalResults, ...(await captureEvals(page, trailingEvals))];
  }
  const pageContrasts = opts.contrast.filter((entry) => entry.page === pageIndex).map((entry) => entry.selector);
  if (pageContrasts.length > 0) {
    outcome.contrastResults = await captureContrasts(page, pageContrasts, opts.contrastPixel, page.viewportSize() ?? opts.viewport);
  }
  if (opts.map && opts.mapPage === pageIndex) {
    const mapped = await captureMap(page, opts.mapSelector, opts.includeHidden);
    outcome.mapResult = mapped.entries;
    outcome.mapError = mapped.error;
  }
  const pageAssertions = opts.assertions.filter((entry) => entry.page === pageIndex);
  outcome.assertions = pageAssertions.length > 0 ? await runAssertions(page, pageAssertions, opts.includeHidden) : [];
  outcome.perf = await capturePerfEvidence(page);
}

export async function capture(page: Page, opts: Args, plan: PagePlan, evidence: CaptureEvidence): Promise<CaptureOutcome> {
  const { pageIndex, totalPages } = plan;
  const outcome: CaptureOutcome = {
    pageIndex,
    navError: null,
    stepFailures: 0,
    navFailures: 0,
    deadCss: [],
    emptyCss: [],
    deadCssEvidence: null,
    ariaText: null,
    ariaError: null,
    evalResults: [],
    contrastResults: [],
    mapResult: null,
    mapError: null,
    assertions: [],
    perf: null,
    cssEvidence: null,
    evidenceRange: null,
    themeStampGap: null,
  };
  const out = planOut(plan, pageIndex, totalPages);
  // Volatile-region masks (pink overlay) shared by the main shot, --shot-of, and crop.
  const mask = opts.mask.map((s) => page.locator(s));
  // @orb-gate-ignore caught-failure-ownership(empty:e): captured into outcome.navError, which the caller counts into the verdict's navigation total and prints as NAV ERROR. Ends if navError stops being read.
  try {
    outcome.navError = plan.navigatePage === false ? null : await navigate(page, opts, plan.url);
    // #1227: `data-app-ready` is not the whole readiness contract when a THEME was requested — the stamp
    // lands one settings hop later, and everything below (the drive queue, every capture, the shot) would
    // otherwise sample the default palette under a themed label.
    outcome.themeStampGap = (await awaitThemeStamp(page, evidence.settingsEvidence)).gap;
    if (opts.checkpoint) {
      // Raw string, not a function — the tooling program is DOM-less and carries no __orb ambient.
      await page.evaluate("window.__orb && window.__orb.resetEvidence()");
      outcome.evidenceRange = {
        consoleStart: evidence.consoleMessages.length,
        consoleEnd: evidence.consoleMessages.length,
        pageErrorStart: evidence.pageErrors.length,
        pageErrorEnd: evidence.pageErrors.length,
      };
    }
    // ONE argv-ordered drive queue: bridge navs, interaction steps and --eval expressions interleaved
    // exactly as written. TRAILING evals (everything after the last step/nav) are split back out and
    // handed to the capture phase, so the long-standing "an --eval observes the SETTLED surface"
    // guarantee survives for the common `--goto x --eval y` shape while a mid-chain eval runs mid-chain.
    const pageActions = opts.actions.filter((entry) => entry.action.page === pageIndex);
    const split = splitTrailingEvals(pageActions);
    const driven = await driveActions(page, split.drive);
    outcome.navFailures = driven.navFailures;
    outcome.stepFailures = driven.stepFailures;
    outcome.evalResults = driven.evalResults;
    await settlePage(page, opts);
    await captureEvidence(page, opts, outcome, { pageIndex, trailingEvals: split.trailingEvals });
    if (plan.produceShot) {
      await captureShot(page, opts, out, mask);
    }
  } catch (e) {
    outcome.navError = `nav/wait threw: ${errorMessage(e)}`;
    // Try to screenshot whatever we got anyway.
    if (plan.produceShot) {
      // @orb-gate-ignore caught-failure-ownership(empty:catch): best-effort fallback shot after the nav already failed — the RESULT line's navError still reports the real failure. Ends if the comment's "still lands" claim stops holding.
      try {
        await captureShot(page, opts, out, mask);
      } catch {
        /* best effort — the report + RESULT line still land */
      }
    }
  } finally {
    const range = outcome.evidenceRange;
    if (range !== null) {
      outcome.evidenceRange = {
        ...range,
        consoleEnd: evidence.consoleMessages.length,
        pageErrorEnd: evidence.pageErrors.length,
      };
    }
  }
  return outcome;
}

/** `navigate: false` is a session call driving the LIVE page (the scenario's `keepLivePage` shape) — every
 *  tab keeps its URL and the pass starts at the drive queue. */
export async function capturePages(session: ProbeSession, opts: Args, plan: ShotPlan, navigatePage = true): Promise<CaptureOutcome[]> {
  const outcomes: CaptureOutcome[] = [];
  for (let index = 0; index < opts.pages; index += 1) {
    const page = session.pages[index] as Page;
    // `--pages` tabs all live in context 0, so its settings-shim evidence is theirs (#1227).
    outcomes.push(
      await capture(
        page,
        opts,
        { ...plan, pageIndex: index, totalPages: opts.pages, navigatePage },
        { ...session, settingsEvidence: session.contexts[0]?.settingsEvidence },
      ),
    );
  }
  return outcomes;
}
