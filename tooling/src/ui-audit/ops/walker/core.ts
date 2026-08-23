// ui-audit in-page walker — segment: constants + selector vocabulary + the locatable-selector (describe/anchor) machinery + accumulated opacity / visibility / visually-hidden.
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

export const WALKER_CORE = `  var INTERACTIVE_SELECTOR = "a,button,[role=button],input,select,[tabindex]";
  var CARD_CLASS_RE = /\\bcard\\b/i;
  var EXCLUDE_CARD_CONTEXT_RE = /\\b(dropdown|popover|tooltip|menu|modal|dialog)\\b/i;
  var HOVER_TRANSFORM_RE = /transform\\s*:\\s*(scale|rotate|translate|skew|matrix)/i;
  var TAILWIND_HOVER_TRANSFORM_RE = /^hover:(scale|rotate|translate-x|translate-y|skew-x|skew-y)-/;
  var BG_URL_RE = /url\\((['"]?)(.*?)\\1\\)/;
  var RGB_RE = /rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*(?:,\\s*([\\d.]+))?\\)/;
  // Interactive/code contexts for the type-floor checks (impeccable undersized-ui-text).
  var INTERACTIVE_CTX = "a[href],button,summary,label,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],[role=switch],[tabindex]";
  // NO \`[aria-hidden='true']\` here, deliberately (issue #253): this is the GRAPHIC/CODE exemption — text
  // whose glyphs are data (a code span) or geometry (an svg label) and which the type ramp does not govern.
  // aria-hidden is an ACCESSIBILITY-TREE fact and says nothing about pixels; carrying it in this selector
  // silently exempted every decorative-but-RENDERED string from the type floors, and three live findings
  // (wide-tracking, line-length, undersized-ui-text on the facet preview) vanished from the scan the day
  // #230 marked that preview aria-hidden — while it still painted at 10.5px / 0.84px tracking / 1,283 chars.
  var CODE_CTX = "pre,code,kbd,samp,var,svg";
  // Sanctioned radial-glow carriers (owner effect axes — ui/src/styles/globals.css): the
  // empty-state aura, the media-grid pointer spotlight, the brand loader glow.
  var SANCTIONED_GLOW_SEL = "[data-slot='empty-state-decoration'],[data-slot='media-grid-cell'],.orb-weave-glow";
  // Dev-only tooling chrome (TanStack devtools trigger/panel, react-query devtools, the vite
  // error overlay) is NOT product surface — it z-index-escalates and root-clips by design and
  // was the measured FP source on every run. Skip its subtree everywhere.
  var DEV_CHROME_SEL = "#tanstack_devtools,#tsqd-parent-container,vite-error-overlay";
  // The devtools TRIGGER button floats in bare divs outside #tanstack_devtools but carries a
  // goober CSS-in-JS class (go<digits>) — the app itself is Tailwind-only, so goober = devtools.
  var GOOBER_CLASS_RE = /(^|\\s)go\\d+(\\s|$)/;
  function isDevChrome(el) {
    if (el.closest && el.closest(DEV_CHROME_SEL)) return true;
    return typeof el.className === "string" && GOOBER_CLASS_RE.test(el.className);
  }
  // Motion-law sanctioned measured-var height panels (motion guide §3.7).
  var PANEL_EXEMPT_SEL = "[data-slot='accordion-panel'],[data-slot='collapsible-panel']";
  // The owner-RATIFIED ListRow selection accent (2026-08-22, issue #485): a 2px left ember bar on the
  // selected row, which is the app-wide selection idiom. Both slots carry it — \`list-row-body\` is the
  // default \`rowTint\` arm, \`list-row-root\` the arm that paints the whole row — and BOTH halves of each
  // predicate are load-bearing: the slot identity says it is the primitive, \`[data-selected]\` says it is
  // the selection state. Without the state half an unselected row's hardcoded accent would go unjudged.
  var LIST_ROW_SELECTED_SEL = "[data-slot='list-row-root'][data-selected],[data-slot='list-row-body'][data-selected]";
  var HEADING_TAGS = { h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1 };
  var BORDER_SAFE_TAGS = { a: 1, button: 1, input: 1, select: 1, textarea: 1, option: 1, hr: 1, table: 1, thead: 1, tbody: 1, tr: 1, td: 1, th: 1, fieldset: 1 };
  var QUALITY_TEXT_TAGS = { p: 1, li: 1, td: 1, th: 1, dd: 1, blockquote: 1, figcaption: 1 };
  var GENERIC_FONTS = { "sans-serif": 1, serif: 1, monospace: 1, cursive: 1, fantasy: 1, "system-ui": 1, "ui-sans-serif": 1, "ui-serif": 1, "ui-monospace": 1, "ui-rounded": 1, emoji: 1, math: 1, fangsong: 1 };

  // A finding nobody can LOCATE is not a finding. The old describe() emitted a single
  // tag.class:nth-of-type(n) step, and nth-of-type counts only among an element's own siblings — so
  // fifteen buttons under fifteen different parents all reported the identical
  // button.group:nth-of-type(1) in one audit and none of them could be found. Build a PATH up to the
  // nearest stable anchor (id / data-testid / data-slot / body) instead.
  //
  // AN ANCHOR IS ONLY AN ANCHOR IF IT RESOLVES TO ONE NODE (2026-08-17, issue #148 item 5). data-slot
  // names a component KIND, not an element: a live tracker-panel audit returned six findings reading
  // [data-slot=text] and one [data-slot=button], indistinguishable from each other and from the dozens
  // of untouched twins — two real text-overflow defects went unforwardable. Every candidate anchor is now
  // COUNTED in the document (memoized per selector) and only used when it matches exactly once; otherwise
  // the walk keeps climbing and the slot rides along as a qualifier on the local step.
  // (NB: this whole module body is a template LITERAL — no backticks, no dollar-brace, ever.)
  var DESCRIBE_MAX_STEPS = 6;
  // A class/attribute value safe to paste into a selector unescaped. Tailwind mints plenty that are not
  // ("w-1/2", "h-[3px]") — an unescaped one produces a selector that THROWS instead of finding nothing.
  var CSS_IDENT_RE = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;
  // React/Base UI GENERATED ids (useId: "«r6a»", ":r6a:", and Base UI's "base-ui-_r_6a_") are unique but
  // RE-MINTED every mount — a path anchored on one resolves to nothing in the next session, which is a
  // finding a reviewer cannot re-open. Climb past them to something structural.
  var VOLATILE_ID_RE = /(«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_)/i;
  var anchorMatchCounts = {};
  function matchCount(sel) {
    var known = anchorMatchCounts[sel];
    if (known !== undefined) return known;
    var n = 0;
    try { n = document.querySelectorAll(sel).length; } catch (e) { n = 0; }
    anchorMatchCounts[sel] = n;
    return n;
  }
  function attrSel(name, value) {
    return "[" + name + "=" + (CSS_IDENT_RE.test(value) ? value : JSON.stringify(value)) + "]";
  }
  function localStep(el) {
    var tag = el.tagName ? el.tagName.toLowerCase() : "node";
    var cls = el.classList && el.classList.length > 0 && CSS_IDENT_RE.test(el.classList[0]) ? "." + el.classList[0] : "";
    var slotAttr = el.getAttribute ? el.getAttribute("data-slot") : null;
    var slot = slotAttr ? attrSel("data-slot", slotAttr) : "";
    var idx = 0;
    var sib = el;
    while (sib) {
      if (sib.tagName === el.tagName) idx += 1;
      sib = sib.previousElementSibling;
    }
    return tag + cls + slot + ":nth-of-type(" + idx + ")";
  }
  function anchorOf(el) {
    if (!el.getAttribute) return null;
    if (el.id && !VOLATILE_ID_RE.test(el.id)) {
      var idSel = "#" + el.id;
      if (matchCount(idSel) === 1) return idSel;
    }
    var testId = el.getAttribute("data-testid");
    if (testId) {
      var testSel = attrSel("data-testid", testId);
      if (matchCount(testSel) === 1) return testSel;
    }
    var slot = el.getAttribute("data-slot");
    if (slot) {
      var slotSel = attrSel("data-slot", slot);
      if (matchCount(slotSel) === 1) return slotSel;
    }
    return null;
  }
  function describe(el) {
    if (!el) return "unknown";
    var own = anchorOf(el);
    if (own) return own;
    var parts = [];
    var node = el;
    var steps = 0;
    while (node && node.nodeType === 1 && steps < DESCRIBE_MAX_STEPS) {
      if (node !== el) {
        var anchor = anchorOf(node);
        if (anchor) {
          parts.unshift(anchor);
          break;
        }
      }
      parts.unshift(localStep(node));
      if (node.tagName === "BODY") break;
      node = node.parentElement;
      steps += 1;
    }
    return parts.join(" > ");
  }

  // ACCUMULATED OPACITY over the element + its ancestors. CSS opacity GROUPS: a subtree inside
  // opacity:0.6 is rasterized and composited over what is behind it, so every glyph in it is painted
  // as a BLEND — while getComputedStyle(el).color still reports the undimmed rgb. Two consequences the
  // walker owes: text samples carry this product so the Node side can composite before the WCAG ratio
  // (issue #188 — the home surface's "waiting on:" lines measured 3.68:1 under snap's --contrast, which
  // does exactly this, while design-audit reported nothing), and a subtree under an ancestor opacity of
  // 0 paints NO pixels and must count as hidden (the old own-opacity-only test missed that, and a
  // composite of an invisible glyph would come out as a fake 1:1 finding). Memoized per element, so the
  // ancestor walk is O(1) amortized even though isVisible runs over every element.
  var opacityCache = new WeakMap();
  function accumulatedOpacity(el) {
    var known = opacityCache.get(el);
    if (known !== undefined) return known;
    var raw = getComputedStyle(el).opacity;
    var own = raw === "" ? 1 : Number(raw);
    if (Number.isNaN(own)) own = 1;
    var parent = el.parentElement;
    var value = parent === null ? own : own * accumulatedOpacity(parent);
    opacityCache.set(el, value);
    return value;
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    var style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || accumulatedOpacity(el) === 0) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // VISUALLY-HIDDEN IS A STATE, NOT A CLASS NAME (2026-08-18). The app-wide screen-reader-only posture —
  // Tailwind v4's \`sr-only\` (position:absolute; width:1px; height:1px; overflow:hidden;
  // clip-path:inset(50%); white-space:nowrap) — collapses a control to nothing the eye can see while
  // leaving its full unwrapped content width behind as scrollWidth. Measured on the live app-shell skip
  // link (packages/client/src/features/app-shell/surfaces/app-shell.tsx): a 26x32 box, clientWidth 24,
  // scrollWidth 70. So text-overflow read a 46px spill and tap-target read a 26px short side, and BOTH
  // minted P1 — on every surface, since the skip link is in the shell. They were the only P1s a whole
  // home audit produced, which makes \`--fail-on P1\` unusable while the class is live.
  //
  // The test is on the COMPUTED STATE for one load-bearing reason: it is what keeps the REVEALED arm
  // judged. \`focus-visible:not-sr-only\` sets clip-path:none + overflow:visible, so a focused skip link is
  // an ordinary painted button and a real overflow on it is a real finding. A class/selector test would
  // exempt the element forever, in both states.
  //
  // Two canonical spellings, and each is only hidden IN COMBINATION with a clipping overflow — a bare
  // clip-path is a legitimate shape mask, and \`clip\` is inert without one:
  //   modern:  clip-path: inset(50%)          (the insets collapse the box on at least one axis)
  //   legacy:  clip: rect(0px, 0px, 0px, 0px) (a zero-area clip rect)
  // Hidden-ness INHERITS: a child of a clipped box paints no pixels either, so the walk climbs (memoized
  // per element, the accumulatedOpacity precedent).
  //
  // DELIBERATELY NOT APPLIED to the accessible-name census or the heading outline: an sr-only control
  // still owes a name and an sr-only heading is still part of the document outline — the skip belongs to
  // the PAINT and GEOMETRY rules, which is why it is per-sample-family here and not inside isVisible().
  var INSET_RE = /^inset\\(([^)]*)\\)/;
  function insetCollapses(clipPath) {
    var im = INSET_RE.exec(clipPath || "");
    if (!im) return false;
    var raw = im[1].split("round")[0].trim().split(/\\s+/).filter(Boolean);
    var pct = [];
    for (var ii = 0; ii < raw.length && ii < 4; ii += 1) {
      // Percentages only: a px inset can only be judged against a box this helper does not measure.
      if (raw[ii].charAt(raw[ii].length - 1) !== "%") return false;
      var pv = Number.parseFloat(raw[ii]);
      if (Number.isNaN(pv)) return false;
      pct.push(pv);
    }
    if (pct.length === 0) return false;
    var top = pct[0];
    var right = pct.length > 1 ? pct[1] : top;
    var bottom = pct.length > 2 ? pct[2] : top;
    var left = pct.length > 3 ? pct[3] : right;
    return top + bottom >= 100 || left + right >= 100;
  }
  var CLIP_RECT_RE = /^rect\\(([^)]*)\\)/;
  function clipRectCollapses(clip) {
    var cm = CLIP_RECT_RE.exec(clip || "");
    if (!cm) return false;
    var sides = cm[1].split(/[\\s,]+/).filter(Boolean);
    if (sides.length !== 4) return false;
    var edge = [];
    for (var ri = 0; ri < 4; ri += 1) {
      var rv = Number.parseFloat(sides[ri]);
      if (Number.isNaN(rv)) return false; // "auto" — that axis is open, nothing provably collapsed
      edge.push(rv);
    }
    return edge[2] - edge[0] <= 0 || edge[1] - edge[3] <= 0;
  }
  function clipsOverflow(style) {
    var overflows = (style.overflow || "") + " " + (style.overflowX || "") + " " + (style.overflowY || "");
    return /hidden|clip/.test(overflows);
  }
  var hiddenCache = new WeakMap();
  function isVisuallyHidden(el) {
    if (!(el instanceof Element)) return false;
    var known = hiddenCache.get(el);
    if (known !== undefined) return known;
    var hs = getComputedStyle(el);
    var own = clipsOverflow(hs) && (insetCollapses(hs.clipPath) || clipRectCollapses(hs.clip));
    var parent = el.parentElement;
    var value = own || (parent !== null && isVisuallyHidden(parent));
    hiddenCache.set(el, value);
    return value;
  }
`;
