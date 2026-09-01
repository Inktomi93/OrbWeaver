// --contrast: rendered WCAG verdicts with an honest method per line (css-resolve vs pixel-sample),
// the occlusion/off-screen refusals (#211), foreground-opacity compositing, and role-aware thresholds.
// The WCAG math itself is the fleet-shared kernel (_shared/wcag.ts) — one ruler for every instrument.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import type { Viewport } from "../../_shared/argv.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import {
  compositeForeground,
  contrastRatio,
  FOREGROUND_OPACITY_EPS,
  INACTIVE_KIND_EXPR,
  isLargeText,
  LARGE_MIN_RATIO,
  NORMAL_MIN_RATIO,
} from "../../_shared/wcag.ts";
import type { ContrastCapture, ContrastEvidence, ContrastFacts } from "../contract/contrast.ts";
import type { ContrastOutcome } from "../contract/types.ts";
import { BOLD_WEIGHT, contrastExemption, isContrastMeasured, parseRgbString, refuseContrastVerdict, UI_COMPONENT_MIN_RATIO } from "../lib/contrast-verdict.ts";
import { resolveContrastBackdrop } from "./contrast-pixels.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// ── --contrast: WCAG AA text/background contrast of the first selector match ─

// RAW STRING (JSON.stringify-interpolated selector), not a function reference. The surviving
// reason (the original was tsx keepNames — tsx was SHED 2026-08-03, node runs the .ts source):
// the body executes in the BROWSER, and tsc checks a function body against tooling's NODE lib,
// where every DOM name is TS2584. This IIFE gathers RAW facts only (colors as strings, size, weight) —
// ALL classification (large-text/ratio/pass-fail) happens back in Node, reusing
// design-audit-checks.ts's WCAG math, same split as design-audit.ts's walker.
function buildContrastScript(selector: string): string {
  return `(() => {
    // THE FIRST DOM MATCH IS NOT THE ONE THE USER SEES (2026-08-16). In a virtualized transcript the
    // first match is routinely a recycled, off-viewport, mid-fade node — measuring it produced two
    // retracted contrast P0s (it even printed "dimmed α0.50" while emitting FAIL). Walk to the first
    // match that is actually RENDERED IN THE VIEWPORT; if none is, return the off-screen refusal and let
    // Node decline a verdict rather than measure a node nobody can look at.
    var all = document.querySelectorAll(${JSON.stringify(selector)});
    if (all.length === 0) return null;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    function inViewport(node) {
      var s = getComputedStyle(node);
      if (s.display === "none" || s.visibility === "hidden") return false;
      var r = node.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    }
    // IN THE VIEWPORT IS NOT VISIBLE (2026-08-18, #211). An element whose box is in the viewport but sits
    // BEHIND fixed chrome — text at y=38 under a 48px topbar — passed the rect test, and the sample ring
    // was then drawn over the CHROME's pixels: the reported ratio measured the topbar. Ask the compositor
    // who owns the box's visible centre, the same ownership test design-audit-walker's ownsPoint uses:
    // the hit must BE the candidate, be inside it, or be an ancestor of it (an ancestor answers when the
    // candidate takes no pointer of its own, and it is still what is painted there).
    function describeNode(n) {
      var slot = n.getAttribute("data-slot");
      var label = n.getAttribute("aria-label");
      var cls = typeof n.className === "string" && n.className ? "." + n.className.trim().split(/\\s+/).slice(0, 2).join(".") : "";
      return n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + (slot ? "[data-slot=" + slot + "]" : "") + cls + (label ? " (" + label + ")" : "");
    }
    // elementFromPoint is BLIND to a pointer-events:none subtree, so its silence there means "I cannot
    // tell", not "occluded" — a tooltip/overlay label would otherwise be refused a verdict it deserves.
    // Inconclusive keeps the OLD behaviour (measure it); only a KNOWN foreign owner rejects.
    function pointerTransparent(node) {
      var n = node;
      while (n) { if (getComputedStyle(n).pointerEvents === "none") return true; n = n.parentElement; }
      return false;
    }
    function occluderOf(node) {
      if (pointerTransparent(node)) return null;
      var r = node.getBoundingClientRect();
      var x = (Math.max(0, r.left) + Math.min(vw, r.right)) / 2;
      var y = (Math.max(0, r.top) + Math.min(vh, r.bottom)) / 2; // the VISIBLE box's centre — a half-scrolled
      if (x < 0 || y < 0 || x >= vw || y >= vh) return null;     // element must not be judged by an off-screen point
      var hit = document.elementFromPoint(x, y);
      if (hit === null) return null;
      if (hit === node || node.contains(hit) || hit.contains(node)) return null;
      return describeNode(hit);
    }
    var el = null;
    var matchIndex = -1;
    var inViewportCount = 0;
    var firstOccluder = null;
    for (var mi = 0; mi < all.length; mi += 1) {
      if (!inViewport(all[mi])) continue;
      inViewportCount += 1;
      var blocker = occluderOf(all[mi]);
      // An occluded candidate is SKIPPED, not fatal — the next match may be the one on screen.
      if (blocker !== null) { if (firstOccluder === null) firstOccluder = blocker; continue; }
      el = all[mi];
      matchIndex = mi;
      break;
    }
    if (!el && inViewportCount > 0) return { occluded: true, total: all.length, inViewport: inViewportCount, occluder: firstOccluder };
    if (!el) return { offscreen: true, total: all.length };
    // Tailwind v4 tokens are oklch(); Chromium's getComputedStyle SERIALIZES CSS Color 4
    // functions (oklch/oklab/lab/lch/color()) back verbatim rather than converting to rgb() —
    // so style.color can read "oklch(0.7 0.1 200)". Round-tripping through fillStyle does NOT
    // fix this (Chromium 149 preserves oklch() there too, verified empirically) — but actually
    // COMPOSITING to a canvas pixel and reading the byte values back DOES force real sRGB
    // conversion (canvas is an 8-bit raster surface; un-premultiply cancels any source alpha,
    // so this is accurate even for translucent colors). One shared 1x1 probe canvas, reused
    // across every color this script converts.
    var probeCanvas = document.createElement("canvas");
    probeCanvas.width = 1;
    probeCanvas.height = 1;
    var probeCtx = probeCanvas.getContext("2d", { willReadFrequently: true });
    function toRgbString(cssColor) {
      probeCtx.clearRect(0, 0, 1, 1);
      probeCtx.fillStyle = cssColor;
      probeCtx.fillRect(0, 0, 1, 1);
      var d = probeCtx.getImageData(0, 0, 1, 1).data;
      return "rgb(" + d[0] + ", " + d[1] + ", " + d[2] + ")";
    }
    function isTransparent(c) { return c === "rgba(0, 0, 0, 0)" || c === "transparent"; }
    // TRUE opacity test: composite the color over pure black AND pure white; identical bytes ⇒ alpha 1.
    // (Avoids parsing oklch()/oklab() alpha in-page.)
    function compositeOver(cssColor, baseRgb) {
      probeCtx.clearRect(0, 0, 1, 1);
      probeCtx.fillStyle = baseRgb;
      probeCtx.fillRect(0, 0, 1, 1);
      probeCtx.fillStyle = cssColor; // source-over IS alpha compositing
      probeCtx.fillRect(0, 0, 1, 1);
      var d = probeCtx.getImageData(0, 0, 1, 1).data;
      return "rgb(" + d[0] + ", " + d[1] + ", " + d[2] + ")";
    }
    function isOpaque(cssColor) {
      return compositeOver(cssColor, "rgb(0,0,0)") === compositeOver(cssColor, "rgb(255,255,255)");
    }
    // Walk ancestors collecting every non-transparent background from the element DOWN to the first
    // OPAQUE one (the real base), then composite the translucent layers over it bottom-to-top. A glass
    // panel (color-mix at 0.7 alpha) over a dark base now yields the VISUAL backdrop the eye sees — the
    // old code took a translucent layer's own rgb as if opaque (the 1.11-vs-2.6 false-FAIL side-eye hit).
    //
    // THE FALSE-FLAT BLIND SPOT: this ancestor walk sees only the DOM chain — a FIXED-position sibling
    // layer (the app's ThemeBackgroundLayer photo, or a scrim painting under .shell-grid) is invisible
    // to it. If the chain resolves with NO opaque background found, the old code fabricated a white base
    // and passed text that was actually ~1.8:1 over a bright photo. We now REFUSE that: a walk that
    // never hits an opaque bg returns "transparent" (Node pixel-samples the real composite), and a
    // background-image ancestor returns "indeterminate" (Node pixel-samples too) — never a fake baseline.
    //
    // FIXED SIBLING OVER AN OPAQUE ROOT (blind-spot round 2): ThemeBackgroundLayer paints its photo as a
    // fixed z-base sibling OVER the opaque <body>/<html>. So an "opaque base" found only at the root is
    // NOT what's visually behind the element — the photo occludes it. When the app's bg-image is active
    // (its own [data-has-bg-image] shell signal), a root-level base is untrustworthy → pixel-sample.
    // (GENERIC GAP not covered: any app that paints a fixed sibling over the body without this signal
    // would still fool the root-base trust — a generic "root base + a fixed painted layer exists" →
    // indeterminate rule could catch it, but is left out here as it can't be verified app-agnostically.)
    var bgImageActive = document.querySelector("[data-has-bg-image]") !== null;
    function resolveBackdrop(node) {
      var layers = []; // element-first (topmost) → base-last (bottommost non-transparent)
      var base = null;
      while (node) {
        var s = getComputedStyle(node);
        if (s.backgroundImage && s.backgroundImage !== "none") return { kind: "indeterminate" };
        var bc = s.backgroundColor;
        if (!isTransparent(bc)) {
          if (isOpaque(bc)) {
            if (bgImageActive && (node === document.body || node === document.documentElement)) {
              return { kind: "transparent" };
            }
            base = toRgbString(bc);
            break;
          }
          layers.push(bc);
        }
        node = node.parentElement;
      }
      // No opaque base anywhere in the chain — a fixed/sibling layer may be painting behind, unseen.
      // Don't invent white; tell Node to pixel-sample the actual rendered pixels.
      if (base === null) return { kind: "transparent" };
      // Paint the opaque base, then the translucent layers bottom-up (reverse of the element-first array).
      var acc = base;
      for (var i = layers.length - 1; i >= 0; i--) acc = compositeOver(layers[i], acc);
      return { kind: "flat", color: acc };
    }
    var style = getComputedStyle(el);
    var fw = style.fontWeight;
    var fontWeight = fw === "bold" ? 700 : fw === "normal" ? 400 : Number(fw) || 400;
    // ::placeholder blind spot: an EMPTY input/textarea paints its PLACEHOLDER, not its text color —
    // reading style.color measures the (invisible) text color and reports a false PASS. When the field
    // is empty, measure the pseudo-element's color instead (the pixels the eye actually sees).
    var tag = el.tagName;
    var colorSource = style.color;
    if ((tag === "INPUT" || tag === "TEXTAREA") && !el.value) {
      var phColor = getComputedStyle(el, "::placeholder").color;
      if (phColor && !isTransparent(phColor)) colorSource = phColor;
    }
    // Role/content awareness (Node applies the threshold): a target that renders NO text is a UI
    // COMPONENT (WCAG 1.4.11, 3:1), not a 4.5:1 text target; a control-track role is skipped entirely.
    var role = el.getAttribute("role") || "";
    if (!role) {
      if (tag === "INPUT") {
        var inputType = (el.getAttribute("type") || "text").toLowerCase();
        if (inputType === "range") role = "slider";
        else if (inputType === "checkbox") role = "checkbox";
      } else if (tag === "PROGRESS") role = "progressbar";
    }
    var hasText = (el.textContent || "").replace(/\\s+/g, " ").trim().length > 0;
    // ONE classifier, shared with design-audit via _shared/wcag.ts (#624 — two homes for this rule is
    // exactly how the two instruments came to disagree about the SAME element). \`inactiveKind\` carries the
    // spelling (native/aria/inert) so the SKIPPED line can name it; \`inactive\` stays a boolean for the
    // verdict, which exempts all three kinds exactly as it always has.
    var inactiveKind = ${INACTIVE_KIND_EXPR};
    var inactive = inactiveKind !== "none";
    // ANCESTOR opacity dims the FOREGROUND (blind-spot round 2): a message-actions row at opacity-40
    // paints the whole subtree — the icon's glyph included — at 0.4 over its backdrop, but style.color
    // still reads the UN-dimmed rgb (a ~11:1 false PASS where the eye sees ~2.6:1). CSS opacity groups
    // multiply down the chain, so accumulate the product over the element + every ancestor. Node then
    // composites the foreground rgb at this alpha over the resolved backdrop before the ratio (the
    // BACKGROUND half is already handled — css-resolve/pixel-sample sees the true bg; the FOREGROUND
    // dimming is the half only this multiply can fix). Note: a background INSIDE the dimmed group is an
    // unhandled edge (rare) — the common case is a transparent-bg row over an opaque backdrop.
    var foregroundOpacity = 1;
    var opNode = el;
    while (opNode) {
      var opRaw = getComputedStyle(opNode).opacity;
      var opVal = opRaw === "" ? 1 : Number(opRaw);
      if (!Number.isNaN(opVal)) foregroundOpacity *= opVal;
      opNode = opNode.parentElement;
    }
    var rect = el.getBoundingClientRect();
    return {
      color: toRgbString(colorSource),
      fontSizePx: Number.parseFloat(style.fontSize) || 16,
      fontWeight: fontWeight,
      backdrop: resolveBackdrop(el),
      hasText: hasText,
      inactive: inactive,
      role: role,
      tag: tag,
      foregroundOpacity: foregroundOpacity,
      box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      matchIndex: matchIndex,
      total: all.length,
    };
  })()`;
}

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
    const facts = (await page.evaluate(buildContrastScript(`[${CONTRAST_MARK}]`))) as ContrastFacts;
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

function terminalEvidence(
  selector: string,
  status: ContrastEvidence["status"],
  reason: string,
  facts?: { readonly total: number; readonly inViewport?: number; readonly matchIndex?: number },
): ContrastEvidence {
  return {
    selector,
    status,
    candidates: facts === undefined ? 0 : facts.total,
    inViewport: facts === undefined ? 0 : (facts.inViewport ?? 0),
    sampled: 0,
    matchIndex: facts?.matchIndex ?? null,
    method: null,
    ratio: null,
    requiredRatio: null,
    passed: null,
    foreground: null,
    backdrop: null,
    reason,
  };
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
  const backdrop = await resolveContrastBackdrop(page, facts, forcePixel, viewport);
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
      reason: null,
    },
  };
}

export async function captureContrasts(page: Page, selectors: readonly string[], forcePixel: boolean, viewport: Viewport): Promise<ContrastOutcome[]> {
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
