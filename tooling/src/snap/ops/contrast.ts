// --contrast: rendered WCAG verdicts with an honest method per line (css-resolve vs pixel-sample),
// the occlusion/off-screen refusals (#211), foreground-opacity compositing, and role-aware thresholds.
// The WCAG math itself is the fleet-shared kernel (_shared/wcag.ts) — one ruler for every instrument.
import { errorMessage } from "@orb/kit/error-message";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import type { Viewport } from "../../_shared/argv.ts";
import { ringBackdrop } from "../../_shared/pixel-backdrop.ts";
import type { Rgb } from "../../_shared/wcag.ts";
import { contrastRatio, isLargeText, LARGE_MIN_RATIO, NORMAL_MIN_RATIO } from "../../_shared/wcag.ts";
import type { ContrastOutcome } from "../contract/types.ts";

const BOLD_WEIGHT = 700;
// WCAG 1.4.11 non-text contrast floor (a graphical/control boundary) — applied to a --contrast target
// that renders NO text (an icon button, a graphical control), so a 4.5:1 text ratio isn't FALSE-flagged
// against it. Numerically 3:1 like large-text, but a distinct concept, hence its own name.
const UI_COMPONENT_MIN_RATIO = 3;
// Roles whose contrast is a two-STATE signal (the track's on/off colors), NOT track-vs-page — measuring
// the latter is meaningless and produced the 1.71:1 Switch false-FAIL. --contrast SKIPS these with a
// stated reason (the WCAG 1.4.11 state boundary is a separate measurement this axis can't make).
const CONTROL_TRACK_ROLES = new Set(["switch", "slider", "progressbar", "scrollbar"]);
// Below this accumulated ancestor opacity, composite the (dimmed) foreground over the backdrop before
// measuring. Just under 1 so sub-pixel float noise (0.999…) never triggers a pointless composite.
const FOREGROUND_OPACITY_EPS = 0.999;

// ── --contrast: WCAG AA text/background contrast of the first selector match ─

// RAW STRING (JSON.stringify-interpolated selector), not a function reference — see
// scanDeadCss's header note: tsx's keepNames __name helper breaks a serialized function in
// the browser context. This IIFE gathers RAW facts only (colors as strings, size, weight) —
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
    var inactive = el.matches(":disabled,[aria-disabled='true']") || el.closest("[inert]") !== null;
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
interface ContrastOffscreen {
  offscreen: true;
  total: number;
}

/** Matches that ARE in the viewport but every one of them is painted over by something else (#211) — a
 *  third distinct outcome, because measuring one samples the OCCLUDER's pixels, and "I can only see the
 *  topbar there" is not "it fails contrast" either. */
interface ContrastOccluded {
  occluded: true;
  total: number;
  inViewport: number;
  occluder: string | null;
}

interface ContrastMeasured {
  color: string;
  fontSizePx: number;
  fontWeight: number;
  // "flat" = a trustworthy opaque ancestor bg (css-resolve path); "transparent"/"indeterminate" = the
  // ancestor walk couldn't see the real backdrop (a fixed sibling layer / a background-image) — Node
  // pixel-samples the composite instead of trusting a fabricated baseline.
  backdrop: { kind: "flat"; color: string } | { kind: "transparent" } | { kind: "indeterminate" };
  hasText: boolean;
  inactive: boolean;
  role: string;
  tag: string;
  /** Product of `opacity` over the element + ancestors — <1 means the foreground is painted dimmed and
   *  must be composited at this alpha over the backdrop before measuring. */
  foregroundOpacity: number;
  box: { x: number; y: number; width: number; height: number };
  /** Which querySelectorAll index actually got measured, and how many matched — a non-zero index means
   *  earlier matches were skipped as off-viewport OR as occluded, which the report states so nobody
   *  assumes "the first one". */
  matchIndex: number;
  total: number;
}

type ContrastFacts = ContrastMeasured | ContrastOffscreen | ContrastOccluded | null;

// buildContrastScript's toRgbString ALWAYS emits this exact "rgb(r, g, b)" shape (it composites
// to a canvas pixel and reads the bytes back itself, sidestepping getComputedStyle's oklch()
// passthrough) — so this is the only shape parseRgbString ever needs to handle.
const RGB_STRING_RE = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/u;

function parseRgbString(s: string): Rgb | null {
  const m = RGB_STRING_RE.exec(s);
  if (!(m?.[1] && m[2] && m[3])) {
    return null;
  }
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Alpha-composite a foreground rgb at `opacity` over the backdrop (source-over) — the visible color of a
// glyph painted inside an opacity<1 group. opacity 1 is a no-op; opacity 0 is the pure backdrop.
function compositeForeground(fg: Rgb, bg: Rgb, opacity: number): Rgb {
  const mix = (f: number, b: number): number => Math.round(opacity * f + (1 - opacity) * b);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
}

// Screenshot the element's box (clamped into the viewport — an overflowing clip makes Playwright throw)
// and read the composited backdrop from real pixels. Returns an error (never a fabricated color) when the
// box is empty/off-screen or the shot/decode fails — the caller reports UNRESOLVED loudly.
async function pixelSampleBackdrop(page: Page, box: Box, viewport: Viewport): Promise<{ rgb: Rgb } | { error: string }> {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const width = Math.min(Math.ceil(box.width), viewport.width - x);
  const height = Math.min(Math.ceil(box.height), viewport.height - y);
  if (width < 1 || height < 1) {
    return { error: "element box is empty or fully off-screen" };
  }
  let buf: Buffer;
  try {
    buf = await page.screenshot({ clip: { x, y, width, height }, animations: "disabled" });
  } catch (e) {
    return { error: `screenshot failed: ${errorMessage(e)}` };
  }
  try {
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    return { rgb: ringBackdrop(data, info.width, info.height, info.channels) };
  } catch (e) {
    return { error: `pixel decode failed: ${errorMessage(e)}` };
  }
}

// Resolve the backdrop as an { rgb, method } pair — trusting the cheap css-resolve ONLY for a genuine
// opaque ancestor; every transparent/indeterminate resolve (the false-flat blind spot) pixel-samples.
async function resolveContrastBackdrop(
  page: Page,
  facts: ContrastMeasured,
  forcePixel: boolean,
  viewport: Viewport,
): Promise<{ rgb: Rgb; method: "css-resolve" | "pixel-sample" } | { error: string }> {
  if (!forcePixel && facts.backdrop.kind === "flat") {
    const rgb = parseRgbString(facts.backdrop.color);
    return rgb === null ? { error: `unparseable backdrop (${facts.backdrop.color})` } : { rgb, method: "css-resolve" };
  }
  const sampled = await pixelSampleBackdrop(page, facts.box, viewport);
  if ("error" in sampled) {
    const why = facts.backdrop.kind === "indeterminate" ? "over background-image" : "transparent ancestor chain";
    return {
      error: `UNRESOLVED  ${why}; pixel sample failed (${sampled.error}) — refusing a fabricated flat baseline`,
    };
  }
  return { rgb: sampled.rgb, method: "pixel-sample" };
}

/** The two "there is nothing I may measure" outcomes. A requested measurement that produced NO EVIDENCE is
 *  red — same posture as a failed pixel sample or a --diff with no baseline. What it must never do is emit
 *  PASS/FAIL: the two retracted P0s of 2026-08-16 were verdicts on a node scrolled out of the transcript,
 *  and #211's were verdicts on the topbar painted over the target. */
function refuseContrastVerdict(selector: string, facts: ContrastOffscreen | ContrastOccluded): ContrastOutcome {
  if ("offscreen" in facts) {
    return {
      line: `CONTRAST ${selector}: OFF-SCREEN  ${facts.total} match(es), none rendered in the viewport — NO VERDICT (scroll it into view, or target the visible match)`,
      failed: true,
    };
  }
  const by = facts.occluder === null ? "" : `, behind ${facts.occluder}`;
  return {
    line: `CONTRAST ${selector}: OCCLUDED  ${facts.inViewport} in-viewport match(es) of ${facts.total}, all painted over${by} — NO VERDICT (measuring one samples the occluder's pixels; scroll it clear, dismiss the chrome, or target the visible match)`,
    failed: true,
  };
}

function isContrastMeasured(facts: NonNullable<ContrastFacts>): facts is ContrastMeasured {
  return !("offscreen" in facts || "occluded" in facts);
}

async function checkContrast(page: Page, selector: string, forcePixel: boolean, viewport: Viewport): Promise<ContrastOutcome> {
  let facts: ContrastFacts;
  try {
    facts = (await page.evaluate(buildContrastScript(selector))) as ContrastFacts;
  } catch (e) {
    return { line: `CONTRAST ${selector}: EVAL ERROR: ${errorMessage(e)}`, failed: true };
  }
  if (facts === null) {
    return { line: `CONTRAST ${selector}: NOT FOUND`, failed: true };
  }
  if (!isContrastMeasured(facts)) {
    return refuseContrastVerdict(selector, facts);
  }
  // WCAG contrast criteria exempt inactive controls. Reporting their deliberate dimming as a defect
  // trains reviewers to ignore the instrument, so state the exemption and leave the run green.
  if (facts.inactive) {
    return { line: `CONTRAST ${selector}: SKIPPED  inactive control (WCAG contrast exemption)`, failed: false };
  }
  // (2) Control-track roles: text-vs-page contrast is meaningless here — the two STATES are the signal,
  // and WCAG 1.4.11 governs the state boundary (a separate measurement). Skip with a reason rather than
  // emit the bogus 1.71:1 text-math FAIL reviewers had to learn to ignore.
  if (CONTROL_TRACK_ROLES.has(facts.role)) {
    return {
      line: `CONTRAST ${selector}: SKIPPED  ${facts.role} track — two-state control; text-vs-page contrast N/A (WCAG 1.4.11 boundary unmeasured here)`,
      failed: false,
    };
  }
  const backdrop = await resolveContrastBackdrop(page, facts, forcePixel, viewport);
  if ("error" in backdrop) {
    return { line: `CONTRAST ${selector}: ${backdrop.error}`, failed: true };
  }
  const rawFg = parseRgbString(facts.color);
  if (rawFg === null) {
    return { line: `CONTRAST ${selector}: unparseable color (${facts.color})`, failed: true };
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
  return {
    line: `CONTRAST ${selector}: ${ratio.toFixed(2)}:1  ${pass ? "PASS" : "FAIL"}  ${tail}`,
    failed: !pass,
  };
}

export async function captureContrasts(page: Page, selectors: readonly string[], forcePixel: boolean, viewport: Viewport): Promise<ContrastOutcome[]> {
  const results: ContrastOutcome[] = [];
  for (const selector of selectors) {
    // biome-ignore lint/performance/noAwaitInLoops: argv-ordered, independent checks — same discipline as captureEvals/driveActions.
    results.push(await checkContrast(page, selector, forcePixel, viewport));
  }
  return results;
}
