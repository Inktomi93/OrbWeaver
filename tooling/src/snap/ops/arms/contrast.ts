// --contrast: rendered WCAG verdicts with an honest method per line (css-resolve vs pixel-sample),
// the occlusion/off-screen refusals (#211), foreground-opacity compositing, and role-aware thresholds.
// The WCAG math itself is the fleet-shared kernel (_shared/wcag.ts) — one ruler for every instrument.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import type { Viewport } from "../../../_shared/argv.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { compositeForeground, contrastRatio, FOREGROUND_OPACITY_EPS, isLargeText, LARGE_MIN_RATIO, NORMAL_MIN_RATIO } from "../../../_shared/wcag.ts";
import type { ArmArgs, ArmDef, ArmFailureCounts, ArmNeeds, ArmPairInput } from "../../contract/arms.ts";
import type { ContrastCapture, ContrastFacts, ContrastMeasured } from "../../contract/contrast.ts";
import type { ContrastOutcome } from "../../contract/types.ts";
import { buildContrastScript } from "../../lib/contrast-script.ts";
import {
  BOLD_WEIGHT,
  contrastExemption,
  isContrastMeasured,
  isFillSubject,
  parseRgbString,
  refuseContrastVerdict,
  terminalEvidence,
  UI_COMPONENT_MIN_RATIO,
} from "../../lib/contrast-verdict.ts";
import { measureFillContrast } from "../contrast-fill.ts";
import { resolveContrastBackdrop } from "../contrast-pixels.ts";
import { contrastFacts } from "../page-validate.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** No match anywhere in the DOM is `null`; matches that ALL sit outside the viewport are this — a
 *  distinct outcome, because "I can't see it" is not "it fails contrast". */
/** THE SELECTOR-DIALECT FIX (#651). `buildContrastScript` hands its selector straight to in-page
 *  `document.querySelectorAll`, which only ever understood raw CSS — but the parse-time refusal
 *  (`lib/selector-shape.ts`) already waves Playwright engine forms (`text=`, `role=`, `xpath=`, `>>`,
 *  the SAME dialect `--wait-for` requires) through as "not ours to judge". The two disagreed: a probe
 *  that waited on `text=Foo` then measured its contrast had to spell the SAME target two different ways
 *  mid-chain, and the CSS-only spelling threw "not a valid selector" inside the page.
 *
 *  Resolve `selector` through PLAYWRIGHT's own engine (`page.locator`) instead, stamp every match with an
 *  index-ordered marker attribute (a real, tiny arrow ref — the codebase's proven-safe evaluate() shape,
 *  see drive.ts's jsclick), and hand the walk a plain-CSS marker selector it can always read. The walk's
 *  own occlusion/viewport logic is untouched — only WHICH elements it sees changes. */
const CONTRAST_MARK = "data-snap-contrast-idx";

async function markContrastCandidates(page: Page, selector: string): Promise<number> {
  const loc = page.locator(selector);
  const count = await loc.count();
  for (let i = 0; i < count; i += 1) {
    // A real page-side function is serialized by `.toString()` and evaluated as raw text in the
    // browser — it carries NO closure over module scope (measured live: a first draft that referenced
    // CONTRAST_MARK by closure threw "CONTRAST_MARK is not defined" in-page). Both the mark and the
    // index travel through the explicit `arg`, never the closure.
    await loc
      .nth(i)
      .evaluate((el, args) => (el as unknown as { setAttribute: (name: string, value: string) => void }).setAttribute(args.mark, String(args.idx)), {
        idx: i,
        mark: CONTRAST_MARK,
      });
  }
  return count;
}

async function clearContrastCandidates(page: Page): Promise<void> {
  // RAW STRING, the same spelling as `buildContrastScript` above and for the same reason: the
  // body executes in the BROWSER, where tooling's NODE lib makes every DOM name a TS2584, and a
  // cast would only smuggle the name past tsc, not resolve it. A string is never type-checked
  // against the wrong world. (Historical note: these strings were originally also dodging tsx's
  // keepNames function-serialization mangling — tsx was shed 2026-08-03; the lib reason stands alone.)
  // @orb-gate-ignore caught-failure-ownership(promise:evaluate): best-effort cleanup — a torn-down page must never fail the contrast verdict already computed. Ends if the trailing comment's rationale stops holding.
  await page
    .evaluate(`(() => {
      for (const el of document.querySelectorAll(${JSON.stringify(`[${CONTRAST_MARK}]`)})) {
        el.removeAttribute(${JSON.stringify(CONTRAST_MARK)});
      }
    })()`)
    .catch(() => undefined); // best-effort cleanup — a torn-down page must never fail the contrast verdict it already computed
}

/** Either the resolved in-page facts, or the terminal outcome to return as-is — pulled out of
 *  `checkContrast` purely to keep its own cognitive complexity under the gate's ceiling. `facts` is
 *  narrowed NON-NULL here: a `null` result means the marker attribute vanished between marking and
 *  evaluating (a re-render raced the walk) — treated as NOT FOUND rather than trusted silently. */
type NonNullContrastFacts = Exclude<ContrastFacts, null>;
type FactsResolution = { readonly ok: true; readonly facts: NonNullContrastFacts } | { readonly ok: false; readonly outcome: ContrastOutcome };

async function resolveContrastFacts(page: Page, selector: string): Promise<FactsResolution> {
  let matchCount: number;
  try {
    matchCount = await markContrastCandidates(page, selector);
  } catch (e) {
    return { ok: false, outcome: { line: `CONTRAST ${selector}: EVAL ERROR: ${errorMessage(e)}`, failed: true } };
  }
  if (matchCount === 0) {
    return { ok: false, outcome: { line: `CONTRAST ${selector}: NOT FOUND`, failed: true } };
  }
  try {
    // #1004 — settled at the seam: the three non-null arms are told apart by KEY PRESENCE, so a
    // malformed object used to fall through to the measured arm and mint a verdict from undefined.
    const facts = contrastFacts(await page.evaluate(buildContrastScript(`[${CONTRAST_MARK}]`)));
    if (facts === null) {
      return { ok: false, outcome: { line: `CONTRAST ${selector}: NOT FOUND`, failed: true } };
    }
    return { ok: true, facts };
  } catch (e) {
    return { ok: false, outcome: { line: `CONTRAST ${selector}: EVAL ERROR: ${errorMessage(e)}`, failed: true } };
  } finally {
    await clearContrastCandidates(page);
  }
}

async function checkContrast(page: Page, selector: string, forcePixel: boolean, viewport: Viewport): Promise<ContrastCapture> {
  const resolved = await resolveContrastFacts(page, selector);
  if (!resolved.ok) {
    return { outcome: resolved.outcome, evidence: terminalEvidence(selector, "instrument-error", resolved.outcome.line) };
  }
  const facts = resolved.facts;
  if (!isContrastMeasured(facts)) {
    const outcome = refuseContrastVerdict(selector, facts);
    const inViewport = "occluded" in facts ? facts.inViewport : 0;
    return { outcome, evidence: terminalEvidence(selector, "refused", outcome.line, { total: facts.total, inViewport }) };
  }
  const exempt = contrastExemption(selector, facts);
  if (exempt !== null) {
    return {
      outcome: exempt,
      evidence: terminalEvidence(selector, "refused", exempt.line, { total: facts.total, inViewport: 1, matchIndex: facts.matchIndex }),
    };
  }
  if (isFillSubject(facts)) {
    // #1111: this subject paints no ink of its own, so its `color` is an inherited value nothing on
    // screen uses. Measure the PIXELS of its box against the band around it (ops/contrast-fill.ts), or
    // print NO VERDICT — never the coincidental ink ratio the arm below would compute. The exemptions
    // above are decided FIRST and unchanged: this re-answers WHICH foreground, never WHETHER to measure.
    return await measureFillContrast(page, selector, facts, viewport);
  }
  return await measureInkContrast(page, selector, facts, { forcePixel, viewport });
}

/** The INK arm: the subject's own `color` (dimmed by ancestor opacity when a group paints it that way)
 *  against the resolved backdrop. Split out of `checkContrast` when the fill arm (#1111) joined it —
 *  `checkContrast` is now the ROUTER (facts → refusals → exemptions → which foreground), and each arm
 *  owns its own measurement. */
async function measureInkContrast(
  page: Page,
  selector: string,
  facts: ContrastMeasured,
  sampling: { readonly forcePixel: boolean; readonly viewport: Viewport },
): Promise<ContrastCapture> {
  const backdrop = await resolveContrastBackdrop(page, facts, sampling.forcePixel, sampling.viewport);
  if ("error" in backdrop) {
    const outcome = { line: `CONTRAST ${selector}: ${backdrop.error}`, failed: true };
    return {
      outcome,
      evidence: terminalEvidence(selector, "instrument-error", backdrop.error, { total: facts.total, inViewport: 1, matchIndex: facts.matchIndex }),
    };
  }
  const rawFg = parseRgbString(facts.color);
  if (rawFg === null) {
    const reason = `unparseable color (${facts.color})`;
    const outcome = { line: `CONTRAST ${selector}: ${reason}`, failed: true };
    return {
      outcome,
      evidence: terminalEvidence(selector, "instrument-error", reason, { total: facts.total, inViewport: 1, matchIndex: facts.matchIndex }),
    };
  }
  // Ancestor opacity dims the foreground — composite it at the accumulated alpha over the resolved
  // backdrop before measuring (a 40%-opacity actions row's icon reads ~11:1 raw, ~2.6:1 as seen).
  const dimmed = facts.foregroundOpacity < FOREGROUND_OPACITY_EPS;
  const fg = dimmed ? compositeForeground(rawFg, backdrop.rgb, facts.foregroundOpacity) : rawFg;
  const dimNote = dimmed ? ` · dimmed α${facts.foregroundOpacity.toFixed(2)}` : "";
  // (2) Role/content-aware threshold: NO rendered text ⇒ a UI-COMPONENT boundary (WCAG 1.4.11, 3:1);
  // text keeps 4.5:1 (3:1 where the size/weight qualifies it as large).
  const isComponent = !facts.hasText;
  const large = isLargeText(facts.fontSizePx, facts.fontWeight);
  const textRatio = large ? LARGE_MIN_RATIO : NORMAL_MIN_RATIO;
  const needRatio = isComponent ? UI_COMPONENT_MIN_RATIO : textRatio;
  const kindLabel = isComponent ? "ui-component" : "text";
  const fontDisplay = `${Math.round(facts.fontSizePx)}px${facts.fontWeight >= BOLD_WEIGHT ? "b" : ""}`;
  const ratio = contrastRatio(fg, backdrop.rgb);
  const pass = ratio >= needRatio;
  // Say WHICH match was measured whenever it wasn't the first — silence there is how "the first DOM
  // match" got mistaken for "the one on screen".
  const matchNote = facts.matchIndex > 0 ? ` · match ${facts.matchIndex + 1}/${facts.total}, first visible in-viewport` : "";
  const tail = `(${kindLabel} · font ${fontDisplay} · need ${needRatio.toFixed(1)} · ${backdrop.method}${dimNote}${matchNote})`;
  const outcome = { line: `CONTRAST ${selector}: ${ratio.toFixed(2)}:1  ${pass ? "PASS" : "FAIL"}  ${tail}`, failed: !pass };
  return {
    outcome,
    evidence: {
      selector,
      status: "ok",
      candidates: facts.total,
      inViewport: 1,
      sampled: 1,
      matchIndex: facts.matchIndex,
      method: backdrop.method,
      ratio,
      requiredRatio: needRatio,
      passed: pass,
      foreground: fg,
      backdrop: backdrop.rgb,
      // The ink arm never has a fill channel — that receipt belongs to ops/contrast-fill.ts (#1111).
      fillChannel: null,
      reason: null,
    },
  };
}

async function captureContrasts(page: Page, selectors: readonly string[], forcePixel: boolean, viewport: Viewport): Promise<ContrastOutcome[]> {
  return (await captureContrastEvidence(page, selectors, forcePixel, viewport)).map((capture) => capture.outcome);
}

export async function captureContrastEvidence(
  page: Page,
  selectors: readonly string[],
  forcePixel: boolean,
  viewport: Viewport,
): Promise<readonly ContrastCapture[]> {
  const results: ContrastCapture[] = [];
  for (const selector of selectors) {
    results.push(await checkContrast(page, selector, forcePixel, viewport));
  }
  return results;
}

function contrastFailures({ outcomes }: ArmPairInput): number {
  return outcomes.reduce((count, outcome) => count + outcome.contrastResults.filter((entry) => entry.failed).length, 0);
}

export const CONTRAST_ARM = {
  flags: [
    {
      flag: "--contrast",
      kind: "required-value",
      pageTargetable: true,
      handler: (a, rest, page): void => {
        const selector = rest.shift();
        if (selector !== undefined && selector !== "") {
          a.contrast.push({ selector, page });
        }
      },
    },
    {
      flag: "--contrast-pixel",
      kind: "boolean",
      pageTargetable: false,
      handler: (a): void => {
        a.contrastPixel = true;
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  defaults: (): Pick<ArmArgs, "contrast" | "contrastPixel"> => ({ contrast: [], contrastPixel: false }),
  help: `  --contrast <selector>   rendered WCAG contrast check (repeatable)
  --contrast-pixel        force the framebuffer sample instead of the CSS resolve (requires --contrast)`,
  lifecycle: {
    at: "page",
    enabled: ({ opts, pageIndex }): boolean => opts.contrast.some((entry) => entry.page === pageIndex),
    run: async ({ page, opts, pageIndex, outcome }): Promise<void> => {
      outcome.contrastResults = await captureContrasts(
        page,
        opts.contrast.filter((entry) => entry.page === pageIndex).map((entry) => entry.selector),
        opts.contrastPixel,
        page.viewportSize() ?? opts.viewport,
      );
    },
    pairs: (input): readonly ResultPair[] => [["contrast-fails", contrastFailures(input)]],
    failures: (input): ArmFailureCounts => ({ contrast: contrastFailures(input) }),
  },
} satisfies ArmDef;
