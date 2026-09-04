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
import type { EvidenceWindowId } from "../../_shared/artifact-scope.ts";
import { evidenceWindowId, exactScope } from "../../_shared/artifact-scope.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { collectOrbConsoleDiagnostics } from "../../_shared/browser-diagnostics.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ArmPageContext } from "../contract/arms.ts";
import type { CaptureEvidence, PagePlan } from "../contract/plan.ts";
import type { Args, CaptureOutcome, ShotPlan } from "../contract/types.ts";
import { planOut } from "../lib/out-names.ts";
import type { SnapRatePosture } from "../lib/rate-posture.ts";
import type { RunArms } from "./arms/registry.ts";
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

interface CaptureArgs {
  readonly page: Page;
  readonly opts: Args;
  readonly plan: PagePlan;
  readonly evidence: CaptureEvidence;
  readonly ratePosture: SnapRatePosture;
  readonly armEvidenceWindow: EvidenceWindowId;
  readonly runArms?: RunArms | null;
}

export async function capture(args: CaptureArgs): Promise<CaptureOutcome> {
  const { page, opts, plan, evidence, ratePosture, armEvidenceWindow, runArms = null } = args;
  const { pageIndex, totalPages } = plan;
  const outcome: CaptureOutcome = {
    pageIndex,
    navError: null,
    stepFailures: 0,
    navFailures: 0,
    fileActions: [],
    heap: null,
    deadCss: [],
    emptyCss: [],
    deadCssEvidence: null,
    ariaText: null,
    ariaError: null,
    evalResults: [],
    contrastResults: [],
    contrastEvidence: [],
    mapResult: null,
    mapError: null,
    mapAtlas: null,
    mapAtlasError: null,
    mapShell: null,
    mapShellError: null,
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
    await runArms?.afterNavigation({ page, opts, pageIndex, url: plan.url, navError: outcome.navError, evidenceWindow: armEvidenceWindow });
    if (opts.checkpoint) {
      // Raw string, not a function — the tooling program is DOM-less and carries no __orb ambient.
      await page.evaluate("window.__orb && window.__orb.resetEvidence()");
      if (evidence.diagnosticWindow.value === 0) {
        evidence.diagnosticWindow.value = 1;
      }
      outcome.evidenceRange = {
        consoleStart: evidence.evidence.console.cursor(),
        consoleEnd: evidence.evidence.console.cursor(),
        pageErrorStart: evidence.evidence.pageErrors.cursor(),
        pageErrorEnd: evidence.evidence.pageErrors.cursor(),
        diagnosticWindow: evidence.diagnosticWindow.value,
      };
    }
    // ONE argv-ordered drive queue: bridge navs, interaction steps and --eval expressions interleaved
    // exactly as written. TRAILING evals (everything after the last step/nav) are split back out and
    // handed to the capture phase, so the long-standing "an --eval observes the SETTLED surface"
    // guarantee survives for the common `--goto x --eval y` shape while a mid-chain eval runs mid-chain.
    const pageActions = opts.actions.filter((entry) => entry.action.page === pageIndex);
    const split = splitTrailingEvals(pageActions);
    const driven = await driveActions({ page, actions: split.drive, opts, pageIndex, ...(runArms === null ? {} : { lifecycle: runArms }) });
    outcome.navFailures = driven.navFailures;
    outcome.stepFailures = driven.stepFailures;
    outcome.evalResults = driven.evalResults;
    outcome.fileActions = driven.fileActions;
    await settlePage(page, opts);
    await runArms?.afterSettle({ page, opts, pageIndex });
    await runPageArms({ page, opts, pageIndex, plan: armPlan, outcome, trailingEvals: split.trailingEvals, ratePosture });
    const consoleGap = await collectOrbConsoleDiagnostics(page, evidence.evidence.diagnostics, evidence.evidence.diagnosticCompleteness, opts.file !== null);
    if (consoleGap !== null) {
      evidence.evidence.pageErrors.push(consoleGap, exactScope(evidence.evidence.contextIndex, pageIndex, evidence.diagnosticWindow.value));
    }
  } catch (e) {
    outcome.navError = `nav/wait threw: ${errorMessage(e)}`;
    // Try to screenshot whatever we got anyway. THE ONE ARM NAMED BY HAND, and only here: the fallback
    // is about the NAV FAILURE, not about the pixel arm — the run has to hand back an image of whatever
    // state it reached even though the pass above never got as far as the shutter.
    if (plan.produceShot) {
      // @orb-gate-ignore caught-failure-ownership(empty:catch): best-effort fallback shot after the nav already failed — the RESULT line's navError still reports the real failure. Ends if the comment's "still lands" claim stops holding.
      try {
        await SHOT_ARM.lifecycle.run({ page, opts, pageIndex, plan: armPlan, outcome, trailingEvals: [], ratePosture });
      } catch {
        /* best effort — the report + RESULT line still land */
      }
    }
  } finally {
    const range = outcome.evidenceRange;
    if (range !== null) {
      outcome.evidenceRange = {
        ...range,
        consoleEnd: evidence.evidence.console.cursor(),
        pageErrorEnd: evidence.evidence.pageErrors.cursor(),
      };
    }
  }
  return outcome;
}

/** `navigate: false` is a session call driving the LIVE page (the scenario's `keepLivePage` shape) — every
 *  tab keeps its URL and the pass starts at the drive queue. */
interface CapturePagesArgs {
  readonly session: ProbeSession;
  readonly opts: Args;
  readonly plan: ShotPlan;
  readonly navigatePage?: boolean;
  readonly runArms: RunArms;
}

export async function capturePages(args: CapturePagesArgs): Promise<CaptureOutcome[]> {
  const { session, opts, plan, navigatePage = true, runArms } = args;
  const ratePosture = await runArms.ratePosture();
  const outcomes: CaptureOutcome[] = [];
  for (let index = 0; index < opts.pages; index += 1) {
    const page = session.pages[index];
    if (page === undefined) {
      throw new Error(`INSTRUMENT ERROR: page ${String(index)} is missing from the launched session`);
    }
    // `--pages` tabs all live in context 0, so its settings-shim evidence is theirs (#1227).
    outcomes.push(
      await capture({
        page,
        opts,
        plan: { ...plan, pageIndex: index, totalPages: opts.pages, navigatePage },
        evidence: { ...session, settingsEvidence: session.contexts[0]?.settingsEvidence },
        ratePosture,
        armEvidenceWindow: evidenceWindowId("action-tape-through-settle"),
        runArms,
      }),
    );
  }
  return outcomes;
}
