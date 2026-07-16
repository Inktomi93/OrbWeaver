#!/usr/bin/env tsx
/**
 * pnpm design-audit <route> [flags]        (tsx scripts/probes/design-audit.ts)
 *
 * Loads a route in its own headless Playwright chromium (read-only, never touches app
 * settings), waits for `data-app-ready`, optionally clicks to reveal a surface, then flags
 * high-value usability/design/a11y defects — contrast, text-over-image legibility, distorted
 * images, tiny tap targets, missing accessible names/landmarks, z-index escalation, nested
 * cards, gradient text, animated-on-hover images. Objective + fixture-tested — see
 * scripts/probes/design-audit-checks.ts (unit-tested at tests/tooling/design-audit.test.ts).
 *
 * The in-page walker below only gathers raw facts; all severity/threshold decisions happen
 * back in Node via `collectFindings` — the browser never decides pass/fail.
 *
 * USAGE
 *   pnpm stack start                                   # once; design-audit is then a fast loop
 *   pnpm design-audit /                                # audit the home route
 *   pnpm design-audit /chats/abc --click "[data-testid=drawer-toggle]"
 *                                                       # reveal a surface before auditing
 *   pnpm design-audit / --wait 800                     # settle ms after the click (default 500)
 *   pnpm design-audit / --out home                     # reports/design-audit/home.json
 *   pnpm design-audit / --viewport 1920x1080           # default 1280x800
 *   pnpm design-audit / --fail-on P2                   # exit non-zero at P2+ (default P1)
 *
 * Exit 0 if clean (no finding at/above --fail-on); non-zero otherwise (or on a nav error — an audit
 * that never loaded the page has nothing to say).
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import { artifactDir, routeSlug } from "./_kit/artifacts.ts";
import { buildUrl, DEFAULT_BASE, launchProbeSession, settle } from "./_kit/browser.ts";
import type { Viewport } from "./_kit/flags.ts";
import { parseViewport } from "./_kit/flags.ts";
import { print, printResult } from "./_kit/result.ts";
import type { Finding, RawSamples, Severity } from "./design-audit-checks.ts";
import { collectFindings, isAtOrAboveSeverity, isValidSeverity } from "./design-audit-checks.ts";

const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
const DEFAULT_WAIT_MS = 500;
const DEFAULT_FAIL_ON: Severity = "P1";
const NAV_TIMEOUT_MS = 15_000;
const WAIT_SELECTOR_TIMEOUT_MS = 10_000;
const CLICK_TIMEOUT_MS = 5000;
const MESSAGE_COL_WIDTH = 88;

type Args = {
  route: string;
  base: string;
  click: string | null;
  waitMs: number;
  out: string | null;
  viewport: Viewport;
  failOn: Severity;
};

type FlagHandler = (args: Args, rest: string[]) => void;

const FLAG_HANDLERS: Record<string, FlagHandler> = {
  "--click": (a, rest) => {
    a.click = rest.shift() ?? null;
  },
  "--wait": (a, rest) => {
    a.waitMs = Number(rest.shift() ?? String(DEFAULT_WAIT_MS));
  },
  "--out": (a, rest) => {
    a.out = rest.shift() ?? null;
  },
  "--base": (a, rest) => {
    a.base = rest.shift() ?? DEFAULT_BASE;
  },
  "--viewport": (a, rest) => {
    a.viewport = parseViewport(rest.shift() ?? "") ?? a.viewport;
  },
  "--fail-on": (a, rest) => {
    const raw = (rest.shift() ?? "").toUpperCase();
    if (isValidSeverity(raw)) {
      a.failOn = raw;
    } else {
      print(`UNKNOWN --fail-on VALUE ${raw} (keeping ${a.failOn})`);
    }
  },
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    route: "/",
    base: DEFAULT_BASE,
    click: null,
    waitMs: DEFAULT_WAIT_MS,
    out: null,
    viewport: DEFAULT_VIEWPORT,
    failOn: DEFAULT_FAIL_ON,
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const tok = rest.shift() as string;
    const handler = FLAG_HANDLERS[tok];
    if (handler !== undefined) {
      handler(args, rest);
    } else if (tok.startsWith("--")) {
      print(`UNKNOWN FLAG ${tok} (ignored)`);
    } else {
      args.route = tok;
    }
  }
  return args;
}

// ── In-page fact walker (raw string, not a function reference — see _kit/browser.ts) ──
const COLLECT_SAMPLES_JS = `(async () => {
  var INTERACTIVE_SELECTOR = "a,button,[role=button],input,select,[tabindex]";
  var CARD_CLASS_RE = /\\bcard\\b/i;
  var EXCLUDE_CARD_CONTEXT_RE = /\\b(dropdown|popover|tooltip|menu|modal|dialog)\\b/i;
  var HOVER_TRANSFORM_RE = /transform\\s*:\\s*(scale|rotate|translate|skew|matrix)/i;
  var TAILWIND_HOVER_TRANSFORM_RE = /^hover:(scale|rotate|translate-x|translate-y|skew-x|skew-y)-/;
  var BG_URL_RE = /url\\((['"]?)(.*?)\\1\\)/;
  var RGB_RE = /rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*(?:,\\s*([\\d.]+))?\\)/;
  var COLOR_STOP_RE = /rgba?\\([^)]+\\)|#[0-9a-fA-F]{3,8}/g;

  function describe(el) {
    if (!el) return "unknown";
    if (el.id) return "#" + el.id;
    var testId = el.getAttribute && el.getAttribute("data-testid");
    if (testId) return "[data-testid=" + testId + "]";
    var tag = el.tagName ? el.tagName.toLowerCase() : "node";
    var cls = el.classList && el.classList.length > 0 ? "." + el.classList[0] : "";
    var idx = 0;
    var sib = el;
    while (sib) {
      if (sib.tagName === el.tagName) idx += 1;
      sib = sib.previousElementSibling;
    }
    return tag + cls + ":nth-of-type(" + idx + ")";
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    var style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function parseRgb(str) {
    var m = RGB_RE.exec(str || "");
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
  }

  function hexToRgb(hex) {
    var h = hex.replace("#", "");
    var full = h.length === 3 ? h.split("").map(function (c) { return c + c; }).join("") : h.slice(0, 6);
    var num = Number.parseInt(full, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function parseGradientStops(bgImage) {
    var stops = [];
    var m;
    COLOR_STOP_RE.lastIndex = 0;
    while ((m = COLOR_STOP_RE.exec(bgImage)) !== null) {
      var rgb = m[0][0] === "#" ? hexToRgb(m[0]) : parseRgb(m[0]);
      if (rgb) stops.push({ r: rgb.r, g: rgb.g, b: rgb.b });
    }
    return stops;
  }

  // Walk el then its ancestors for the effective backdrop: first solid (alpha>0.1) background-color
  // wins; a gradient background-image reports its parsed color stops; a real background-image url()
  // is indeterminate (no cheap DOM-only way to sample its pixels under the text).
  function resolveBackdrop(el) {
    var node = el;
    while (node) {
      var style = getComputedStyle(node);
      var bgImage = style.backgroundImage;
      if (bgImage && bgImage !== "none") {
        if (bgImage.indexOf("gradient") !== -1) {
          var stops = parseGradientStops(bgImage);
          if (stops.length > 0) return { kind: "gradient", stops: stops };
        }
        return { kind: "image-indeterminate" };
      }
      var bg = parseRgb(style.backgroundColor);
      if (bg && bg.a > 0.1) {
        return { kind: "flat", color: { r: bg.r, g: bg.g, b: bg.b } };
      }
      node = node.parentElement;
    }
    return { kind: "flat", color: { r: 255, g: 255, b: 255 } };
  }

  function loadNaturalSize(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      var done = false;
      var finish = function (result) {
        if (done) return;
        done = true;
        resolve(result);
      };
      img.onload = function () { finish({ w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = function () { finish(null); };
      img.src = url;
      setTimeout(function () { finish(null); }, 2000);
    });
  }

  // ── text / contrast ──────────────────────────────────────────────────────
  var texts = [];
  var textEls = [];
  var seenTextEls = new Set();
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var node;
  while ((node = walker.nextNode())) {
    if (!node.textContent || node.textContent.trim().length === 0) continue;
    var el = node.parentElement;
    if (!el || seenTextEls.has(el)) continue;
    if (el.closest("[aria-hidden='true']")) continue;
    if (!isVisible(el)) continue;
    seenTextEls.add(el);
    textEls.push(el);
    var style = getComputedStyle(el);
    var color = parseRgb(style.color);
    if (!color) continue;
    var fontSizePx = Number.parseFloat(style.fontSize) || 16;
    var fwRaw = style.fontWeight;
    var fontWeight = fwRaw === "bold" ? 700 : fwRaw === "normal" ? 400 : Number(fwRaw) || 400;
    texts.push({
      selector: describe(el),
      color: { r: color.r, g: color.g, b: color.b },
      backdrop: resolveBackdrop(el),
      fontSizePx: fontSizePx,
      fontWeight: fontWeight,
    });
  }

  // ── images (<img> + non-cover/contain background-image) ─────────────────
  var images = [];
  var imgEls = document.querySelectorAll("img");
  for (var i = 0; i < imgEls.length; i += 1) {
    var img = imgEls[i];
    if (!isVisible(img) || !img.complete || img.naturalWidth === 0) continue;
    var rect = img.getBoundingClientRect();
    images.push({
      selector: describe(img),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      renderedWidth: rect.width,
      renderedHeight: rect.height,
      objectFit: getComputedStyle(img).objectFit || "fill",
    });
  }
  var bgCandidates = [];
  var allEls = document.querySelectorAll("*");
  for (var j = 0; j < allEls.length; j += 1) {
    var bel = allEls[j];
    var bstyle = getComputedStyle(bel);
    var bgImg = bstyle.backgroundImage;
    if (!bgImg || bgImg === "none" || bgImg.indexOf("gradient") !== -1) continue;
    var sizeVal = bstyle.backgroundSize;
    if (sizeVal === "cover" || sizeVal === "contain") continue;
    var urlMatch = BG_URL_RE.exec(bgImg);
    if (!urlMatch || !isVisible(bel)) continue;
    bgCandidates.push({ el: bel, url: urlMatch[2], rect: bel.getBoundingClientRect() });
  }
  for (var k = 0; k < bgCandidates.length; k += 1) {
    var cand = bgCandidates[k];
    var natural = await loadNaturalSize(cand.url);
    if (!natural) continue;
    images.push({
      selector: describe(cand.el),
      naturalWidth: natural.w,
      naturalHeight: natural.h,
      renderedWidth: cand.rect.width,
      renderedHeight: cand.rect.height,
      // background-size cover/contain already excluded candidate collection above (non-stretching by
      // definition); "fill" here is a neutral placeholder so the shared distortion check still applies.
      objectFit: "fill",
    });
  }

  // ── interactive elements: tap targets + accessible names ────────────────
  var tapTargets = [];
  var accessibleNames = [];
  var interactiveEls = document.querySelectorAll(INTERACTIVE_SELECTOR);
  var labelledbyText = function (el) {
    var attr = el.getAttribute("aria-labelledby") || "";
    var ids = attr.split(/\\s+/).filter(Boolean);
    if (ids.length === 0) return null;
    var text = ids
      .map(function (id) {
        var ref = document.getElementById(id);
        return ref ? ref.textContent || "" : "";
      })
      .join(" ")
      .trim();
    return text.length > 0 ? text : null;
  };
  var altTextOf = function (el) {
    if (el.tagName === "IMG") return el.getAttribute("alt");
    var inner = el.querySelector("img[alt]");
    return inner ? inner.getAttribute("alt") : null;
  };
  for (var m2 = 0; m2 < interactiveEls.length; m2 += 1) {
    var iel = interactiveEls[m2];
    if (!isVisible(iel)) continue;
    var irect = iel.getBoundingClientRect();
    tapTargets.push({ selector: describe(iel), width: irect.width, height: irect.height });
    accessibleNames.push({
      selector: describe(iel),
      tag: iel.tagName.toLowerCase(),
      hasVisibleText: (iel.textContent || "").trim().length > 0,
      ariaLabel: iel.getAttribute("aria-label"),
      ariaLabelledbyText: labelledbyText(iel),
      title: iel.getAttribute("title"),
      altText: altTextOf(iel),
    });
  }

  var mainLandmarkPresent = document.querySelector("main, [role='main']") !== null;

  // Which target-size floor applies is pointer-conditional (see design-audit-checks.ts checkTapTarget):
  // sample the REAL pointer type this render is under so the tap-target check judges it against the
  // right WCAG floor instead of holding a fine-pointer desktop scale to the 44px touch number.
  var pointerCoarse = window.matchMedia("(pointer: coarse)").matches;

  // ── tabindex smell ────────────────────────────────────────────────────────
  var tabIndexes = [];
  var tabIndexEls = document.querySelectorAll("[tabindex]");
  for (var t = 0; t < tabIndexEls.length; t += 1) {
    var tel = tabIndexEls[t];
    var raw = tel.getAttribute("tabindex");
    var val = Number(raw);
    if (!Number.isNaN(val)) tabIndexes.push({ selector: describe(tel), tabIndex: val });
  }

  // ── z-index escalation (positioned elements only — z-index is inert on static) ──
  var zIndexes = [];
  for (var z = 0; z < allEls.length; z += 1) {
    var zel = allEls[z];
    var zstyle = getComputedStyle(zel);
    if (zstyle.position === "static") continue;
    var zval = Number(zstyle.zIndex);
    if (!Number.isNaN(zval) && zval > 0) zIndexes.push({ selector: describe(zel), zIndex: zval });
  }

  // ── nested cards (card-like = (shadow||border) && (radius||bg)) ─────────
  function isCardLike(el) {
    var s = getComputedStyle(el);
    var hasShadow = s.boxShadow !== "none" && s.boxShadow.trim() !== "";
    var hasBorder =
      Number.parseFloat(s.borderTopWidth) > 0 ||
      Number.parseFloat(s.borderRightWidth) > 0 ||
      Number.parseFloat(s.borderBottomWidth) > 0 ||
      Number.parseFloat(s.borderLeftWidth) > 0 ||
      CARD_CLASS_RE.test(el.className || "");
    var radius = Number.parseFloat(s.borderTopLeftRadius) || 0;
    var bg = parseRgb(s.backgroundColor);
    var hasBg = bg !== null && bg.a > 0.05;
    return (hasShadow || hasBorder) && (radius > 0 || hasBg);
  }
  function isExcludedCardContext(el) {
    var s = getComputedStyle(el);
    if (s.position === "absolute" || s.position === "fixed") return true;
    var role = el.getAttribute("role") || "";
    if (EXCLUDE_CARD_CONTEXT_RE.test(el.className || "") || EXCLUDE_CARD_CONTEXT_RE.test(role)) return true;
    var text = (el.textContent || "").trim();
    var rect = el.getBoundingClientRect();
    if (text.length < 10 && rect.width < 50 && rect.height < 30) return true;
    return false;
  }
  var cardEls = [];
  for (var c = 0; c < allEls.length; c += 1) {
    var cel = allEls[c];
    if (!isVisible(cel) || !isCardLike(cel) || isExcludedCardContext(cel)) continue;
    cardEls.push(cel);
  }
  var nestedSet = [];
  for (var n = 0; n < cardEls.length; n += 1) {
    var cand2 = cardEls[n];
    var p = cand2.parentElement;
    while (p) {
      if (cardEls.indexOf(p) !== -1) {
        nestedSet.push(cand2);
        break;
      }
      p = p.parentElement;
    }
  }
  var innermost = nestedSet.filter(function (el1) {
    return !nestedSet.some(function (el2) {
      return el2 !== el1 && el1.contains(el2);
    });
  });
  var nestedCards = innermost.map(function (el) {
    return { selector: describe(el), isNested: true };
  });

  // ── gradient text (background-clip:text + transparent color) ────────────
  var gradientTexts = [];
  for (var g = 0; g < textEls.length; g += 1) {
    var gel = textEls[g];
    var gs = getComputedStyle(gel);
    var clip = gs.webkitBackgroundClip || gs.backgroundClip;
    var gbg = gs.backgroundImage;
    var gcolorParsed = parseRgb(gs.color);
    var isTransparentColor = gs.color === "transparent" || (gcolorParsed !== null && gcolorParsed.a === 0);
    if (clip === "text" && gbg && gbg.indexOf("gradient") !== -1 && isTransparentColor) {
      gradientTexts.push({ selector: describe(gel), hasGradientText: true });
    }
  }

  // ── animated <img> on hover (statically detectable) ──────────────────────
  var animatedImgHovers = [];
  for (var h = 0; h < imgEls.length; h += 1) {
    var himg = imgEls[h];
    var hcls = typeof himg.className === "string" ? himg.className.split(/\\s+/) : [];
    if (hcls.some(function (c) { return TAILWIND_HOVER_TRANSFORM_RE.test(c); })) {
      animatedImgHovers.push({ selector: describe(himg), hasHoverAnimation: true });
    }
  }
  try {
    for (var s2 = 0; s2 < document.styleSheets.length; s2 += 1) {
      var rules;
      try {
        rules = document.styleSheets[s2].cssRules;
      } catch (e) {
        continue;
      }
      for (var r = 0; r < rules.length; r += 1) {
        var rule = rules[r];
        if (!rule.selectorText) continue;
        if (
          /:hover/i.test(rule.selectorText) &&
          /img/i.test(rule.selectorText) &&
          HOVER_TRANSFORM_RE.test(rule.cssText)
        ) {
          animatedImgHovers.push({ selector: rule.selectorText, hasHoverAnimation: true });
        }
      }
    }
  } catch (e) {
    /* cross-origin stylesheet — skip */
  }

  return {
    texts: texts,
    images: images,
    tapTargets: tapTargets,
    accessibleNames: accessibleNames,
    mainLandmarkPresent: mainLandmarkPresent,
    tabIndexes: tabIndexes,
    zIndexes: zIndexes,
    nestedCards: nestedCards,
    gradientTexts: gradientTexts,
    animatedImgHovers: animatedImgHovers,
    pointerCoarse: pointerCoarse,
  };
})()`;

// ── Orchestration ────────────────────────────────────────────────────────────

type CaptureOutcome = { navError: string | null; clickFailed: boolean; samples: RawSamples | null };

async function navigateAndReveal(page: Awaited<ReturnType<typeof launchProbeSession>>["page"], opts: Args, url: string): Promise<CaptureOutcome> {
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  let navError: string | null = null;
  if (!resp) {
    navError = "no response";
  } else if (!resp.ok()) {
    navError = `HTTP ${resp.status()}`;
  }
  await page
    .locator("html[data-app-ready]")
    .waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS })
    .catch(() => undefined);

  let clickFailed = false;
  if (opts.click !== null) {
    try {
      const loc = page.locator(opts.click).first();
      await loc.waitFor({ state: "visible", timeout: CLICK_TIMEOUT_MS });
      await loc.click({ timeout: CLICK_TIMEOUT_MS });
    } catch (e) {
      clickFailed = true;
      print(`CLICK FAILED  ${opts.click}: ${errorMessage(e)}`);
    }
  }
  await settle(page, opts.waitMs);

  if (navError !== null) {
    return { navError, clickFailed, samples: null };
  }
  try {
    const samples = (await page.evaluate(COLLECT_SAMPLES_JS)) as RawSamples;
    return { navError, clickFailed, samples };
  } catch (e) {
    return { navError: `sample collection threw: ${errorMessage(e)}`, clickFailed, samples: null };
  }
}

// ── Reporting ─────────────────────────────────────────────────────────────────

function countBySeverity(findings: readonly Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  return counts;
}

const SEVERITY_COL = 9;
const RULE_COL = 21;
const SELECTOR_MAX_LEN = 38;
const SELECTOR_COL = 39;

function printFindingsTable(findings: readonly Finding[]): void {
  if (findings.length === 0) {
    print("no findings — clean");
    return;
  }
  const sorted = [...findings].sort((a, b) => a.severity.localeCompare(b.severity));
  print("severity  rule                  selector                                message");
  for (const f of sorted) {
    const truncated = f.message.length > MESSAGE_COL_WIDTH ? `${f.message.slice(0, MESSAGE_COL_WIDTH)}…` : f.message;
    const severityCol = f.severity.padEnd(SEVERITY_COL);
    const ruleCol = f.rule.padEnd(RULE_COL);
    const selectorCol = f.selector.slice(0, SELECTOR_MAX_LEN).padEnd(SELECTOR_COL);
    print(`${severityCol} ${ruleCol} ${selectorCol} ${truncated} (${f.value})`);
  }
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const url = buildUrl(opts.base, opts.route);
  const name = opts.out ?? routeSlug(opts.route);
  const outPath = join(await artifactDir("design-audit"), `${name}.json`);

  const session = await launchProbeSession({
    headless: true,
    viewport: opts.viewport,
    colorScheme: null,
    reducedMotion: false,
    localStorage: [],
  });

  const { navError, clickFailed, samples } = await navigateAndReveal(session.page, opts, url);
  await session.browser.close();

  const findings = samples === null ? [] : collectFindings(samples);
  const counts = countBySeverity(findings);
  const failed = navError !== null || findings.some((f) => isAtOrAboveSeverity(f.severity, opts.failOn));

  await writeFile(
    outPath,
    JSON.stringify(
      {
        route: opts.route,
        url,
        viewport: opts.viewport,
        failOn: opts.failOn,
        navError,
        findings,
        counts,
      },
      null,
      2,
    ),
  );

  print(`URL          ${url}`);
  if (navError !== null) {
    print(`NAV ERROR    ${navError} — no samples collected`);
  }
  print(`report       ${outPath}`);
  print("");
  printFindingsTable(findings);

  printResult("design-audit", [
    ["findings", findings.length],
    ["p0", counts.P0],
    ["p1", counts.P1],
    ["p2", counts.P2],
    ["p3", counts.P3],
    ["fail-on", opts.failOn],
    ["click-failed", clickFailed ? "yes" : "no"],
    ["nav", navError === null ? "OK" : "ERROR"],
    ["out", outPath],
  ]);
  return failed ? 1 : 0;
}

void main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    print(`design-audit failed: ${errorMessage(err)}`);
    process.exit(1);
  },
);
