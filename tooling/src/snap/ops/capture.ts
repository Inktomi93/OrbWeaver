// One page's full capture pass: drive the argv queue, then EVERY PAGE ARM in registry order — the
// settled-surface evidence (dead CSS, aria, trailing evals, contrast, map, assertions, perf) and then the
// pixels. Failures never abort (the PNG still lands).
//
// THERE IS NO PER-ARM BRANCH HERE ANY MORE (docs/design/1208-instrument-substrate.md §6). This file used
// to carry one `if` per capability, which is what made adding an arm a four-file edit and what let the
// pass order drift away from the roster. Now it walks `pageArms()`: each row answers `enabled(ctx)` for
// itself and writes its own slice of the outcome, and `ARMS` IS the pass order, so a new arm runs where
// the tuple says without touching this function.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import type { ProbeSession } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ArmPageContext } from "../contract/arms.ts";
import type { CaptureEvidence, PagePlan } from "../contract/plan.ts";
import type { Args, CaptureOutcome, ShotPlan } from "../contract/types.ts";
import { planOut } from "../lib/out-names.ts";
import { pageArms } from "./arms/registry.ts";
import { SHOT_ARM } from "./arms/shot.ts";
import { driveActions, navigate, settlePage, splitTrailingEvals } from "./drive.ts";
import { awaitThemeStamp } from "./theme-stamp.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

async function runPageArms(ctx: ArmPageContext): Promise<void> {
  for (const [, lifecycle] of pageArms()) {
    if (lifecycle.enabled(ctx)) {
      await lifecycle.run(ctx);
    }
  }
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
  const armPlan: ShotPlan = { url: plan.url, out, produceShot: plan.produceShot };
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
    await runPageArms({ page, opts, pageIndex, plan: armPlan, outcome, trailingEvals: split.trailingEvals });
  } catch (e) {
    outcome.navError = `nav/wait threw: ${errorMessage(e)}`;
    // Try to screenshot whatever we got anyway. THE ONE ARM NAMED BY HAND, and only here: the fallback
    // is about the NAV FAILURE, not about the pixel arm — the run has to hand back an image of whatever
    // state it reached even though the pass above never got as far as the shutter.
    if (plan.produceShot) {
      // @orb-gate-ignore caught-failure-ownership(empty:catch): best-effort fallback shot after the nav already failed — the RESULT line's navError still reports the real failure. Ends if the comment's "still lands" claim stops holding.
      try {
        await SHOT_ARM.lifecycle.run({ page, opts, pageIndex, plan: armPlan, outcome, trailingEvals: [] });
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
