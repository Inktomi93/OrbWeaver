// --contrast: rendered WCAG verdicts with an honest method per line (css-resolve vs pixel-sample),
// the occlusion/off-screen refusals (#211), foreground-opacity compositing, and role-aware thresholds.
// The WCAG math itself is the fleet-shared kernel (_shared/wcag.ts) — one ruler for every instrument.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import type { Viewport } from "../../../_shared/argv.ts";
import { aggregateScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { compositeForeground, contrastRatio, FOREGROUND_OPACITY_EPS, isLargeText, LARGE_MIN_RATIO, NORMAL_MIN_RATIO } from "../../../_shared/wcag.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds, ArmPairInput } from "../../contract/arms.ts";
import type { ContrastCapture, ContrastFacts, ContrastMeasured, ContrastOutcome } from "../../contract/contrast.ts";
import { buildContrastScript } from "../../lib/contrast-script.ts";
import {
  BOLD_WEIGHT,
  contrastExemption,
  contrastSubjectLabel,
  isContrastMeasured,
  isFillSubject,
  parseRgbString,
  refuseContrastVerdict,
  rendersText,
  terminalEvidence,
  UI_COMPONENT_MIN_RATIO,
} from "../../lib/contrast-verdict.ts";
import { measureEdgeContrast } from "../contrast-edge.ts";
import { measureFillContrast } from "../contrast-fill.ts";
import { resolveContrastBackdrop } from "../contrast-pixels.ts";
import { contrastFacts } from "../page-validate.ts";
import { writeArmEvidenceFile } from "./evidence-file.ts";

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
    await loc.nth(i).evaluate(
      (element, args) => {
        const setAttribute = Reflect.get(element, "setAttribute");
        if (typeof setAttribute !== "function") {
          throw new Error("contrast target has no setAttribute method");
        }
        Reflect.apply(setAttribute, element, [args.mark, String(args.idx)]);
      },
      { idx: i, mark: CONTRAST_MARK },
    );
  }
  return count;
}

async function clearContrastCandidates(page: Page): Promise<void> {
  // RAW STRING, the same spelling as `buildContrastScript` above and for the same reason: the
  // body executes in the BROWSER, where tooling's NODE lib makes every DOM name a TS2584, and a
  // cast would only smuggle the name past tsc, not resolve it. A string is never type-checked
  // against the wrong world. (Historical note: these strings were originally also dodging tsx's
  // keepNames function-serialization mangling — tsx was shed 2026-08-03; the lib reason stands alone.)
  // @orb-waive caught-failure-ownership(evaluate): best-effort cleanup — a torn-down page must never fail the contrast verdict already computed. Ends if the trailing comment's rationale stops holding.
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
  // text keeps 4.5:1 (3:1 where the size/weight qualifies it as large). An empty field's PLACEHOLDER is
  // rendered text (#2429 item 2) — the only ink an empty composer paints — so it takes the text threshold
  // and says so in the label, rather than being judged as a box at 3:1.
  const isComponent = !rendersText(facts);
  const large = isLargeText(facts.fontSizePx, facts.fontWeight);
  const textRatio = large ? LARGE_MIN_RATIO : NORMAL_MIN_RATIO;
  const needRatio = isComponent ? UI_COMPONENT_MIN_RATIO : textRatio;
  const kindLabel = contrastSubjectLabel(facts);
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

/** How many failing lines the fact quotes verbatim before it summarizes the rest. A fact `detail` is read
 *  in a terminal end card, so it is bounded — but the bound is DECLARED in the text it produces. */
const CONTRAST_DETAIL_LINES = 3;

/** The failing `CONTRAST …` lines, as the arm printed them, for the fact's `detail` (#1385 item 5). */
function contrastFailureDetail({ outcomes }: ArmPairInput): string {
  const failed = outcomes.flatMap((outcome) => outcome.contrastResults.filter((entry) => entry.failed).map((entry) => entry.line));
  const shown = failed.slice(0, CONTRAST_DETAIL_LINES);
  const omitted = failed.length - shown.length;
  return `${String(failed.length)} contrast check(s) failed: ${shown.join(" · ")}${omitted > 0 ? ` · +${String(omitted)} more in the arm's evidence file` : ""}`;
}

export const CONTRAST_ARM = {
  flags: [
    {
      flag: "--contrast",
      kind: "required-value",
      pageTargetable: true,
      group: "Look",
      summary: "rendered WCAG contrast of that element's text vs its effective backdrop (in-viewport only)",
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
      group: "Look",
      summary: "force the framebuffer sample instead of the CSS resolve (requires --contrast)",
      handler: (a): void => {
        a.contrastPixel = true;
      },
    },
    {
      flag: "--contrast-edge",
      kind: "required-value",
      pageTargetable: true,
      group: "Look",
      summary: "WCAG 1.4.11 border check: each painted side's ink vs the surface just outside it, at 3:1",
      handler: (a, rest, page): void => {
        const selector = rest.shift();
        if (selector !== undefined && selector !== "") {
          a.contrastEdge.push({ selector, page });
        }
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "contrast" | "contrastPixel" | "contrastEdge"> => ({ contrast: [], contrastPixel: false, contrastEdge: [] }),
  help: `  --contrast <selector>   rendered WCAG contrast check (repeatable)
  --contrast-pixel        force the framebuffer sample instead of the CSS resolve (requires --contrast)
  --contrast-edge <selector>
                          WCAG 1.4.11 BORDER check (repeatable): each painted side's border ink against
                          the surface immediately outside it, at 3:1. This is the arm --contrast's
                          fill-only refusal points at — use it on fields, cards and inputs whose
                          affordance IS their outline`,
  result: {
    schema: "snap-arm-contrast-v1",
    source: "computed style + framebuffer contrast",
    lifetime: "settled page capture",
    enabled: (opts): boolean => opts.contrast.length + opts.contrastEdge.length > 0,
  },
  lifecycle: {
    at: "page",
    enabled: ({ opts, pageIndex }): boolean => [...opts.contrast, ...opts.contrastEdge].some((entry) => entry.page === pageIndex),
    run: async ({ page, opts, pageIndex, outcome }): Promise<void> => {
      const viewport = page.viewportSize() ?? opts.viewport;
      // The edge readings join the SAME outcome list: one `contrast-fails` count, one evidence file, one
      // fact. `--contrast-edge` is a second QUESTION about contrast, not a second instrument.
      const edges: ContrastCapture[] = [];
      for (const entry of opts.contrastEdge.filter((row) => row.page === pageIndex)) {
        edges.push(await measureEdgeContrast(page, entry.selector, viewport));
      }
      const captures = [
        ...(await captureContrastEvidence(
          page,
          opts.contrast.filter((entry) => entry.page === pageIndex).map((entry) => entry.selector),
          opts.contrastPixel,
          viewport,
        )),
        ...edges,
      ];
      outcome.contrastResults = captures.map((capture) => capture.outcome);
      // Both halves are kept: the LINES are what prints, the READINGS are what a later reader can measure
      // against (#1342 — a ratio quoted from a run had no copy in the run's own slot).
      outcome.contrastEvidence = captures.map((capture) => capture.evidence);
    },
    pairs: (input): readonly ResultPair[] => [["contrast-fails", contrastFailures(input)]],
    evidence: async ({ outcomes }, slug): Promise<void> => {
      const rows = outcomes.flatMap((outcome) =>
        outcome.contrastEvidence.map((entry, index) => ({ page: outcome.pageIndex, line: outcome.contrastResults[index]?.line ?? null, reading: entry })),
      );
      await writeArmEvidenceFile({
        arm: "contrast",
        name: "contrast",
        slug,
        schema: "snap-contrast-readings-v1",
        records: rows.length,
        completeness: "complete",
        completenessDetail: "every --contrast subject this run measured or refused, with its printed line and the structured reading behind it",
        body: { v: 1, contrast: rows },
      });
    },
    facts: (input): readonly ArmFactEmission<"contrast">[] => {
      const checks = input.outcomes.reduce((count, outcome) => count + outcome.contrastResults.length, 0);
      const failures = contrastFailures(input);
      let state: "off" | "failed" | "passed" = "off";
      if (input.opts.contrast.length + input.opts.contrastEdge.length > 0) {
        state = failures > 0 ? "failed" : "passed";
      }
      return [
        {
          scope: aggregateScope(),
          // #1385 item 5: the FAILING LINES, not `null`. A red contrast run printed two `CONTRAST … FAIL`
          // lines and then a composite finding reading "run failed with no structured problem row" —
          // because this detail was empty, nothing carried the failure into the findings layer, and the
          // unstructured fallback fired over evidence that plainly existed. The arm's own lines ARE the
          // actionable evidence; a voting arm owes them to its fact.
          data: { state, detail: state === "failed" ? contrastFailureDetail(input) : null, checks, failures },
        },
      ];
    },
    failures: (input): ArmFailureCounts => ({ contrast: contrastFailures(input) }),
    exit: (_input, code): number => code,
  },
} satisfies ArmDef<"contrast">;
