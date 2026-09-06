// ui-audit in-page walker — segment: constants + selector vocabulary + the locatable-selector (describe/anchor) machinery + accumulated opacity / visibility / visually-hidden.
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { INTERACTIVE_SELECTOR_JS } from "../../lib/checks-interactive.ts";
import { SELECTION_RAIL_SEL } from "../../lib/selection-rail-sel.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

/** THE SIDE-EFFECT-FREE HALF of the walker core: the selector vocabulary, the locatable-selector
 *  (describe/anchorOf) machinery, and the opacity/visibility/visually-hidden predicates. Nothing here
 *  touches the document at declaration time, which is what makes it composable OUTSIDE the whole-page
 *  walk — `WALKER_RESOLVE`'s backdrop resolver needs exactly `RGB_RE` + `isVisible` from this segment,
 *  and snap's per-selector `--contrast` arm composes the pair for ONE element (#1325). Running the
 *  census half for a single target would walk every node on the page and install this walk's mutation
 *  observer on a live `--session` page, which is why the split exists rather than a second resolver. */
export const WALKER_PRIMITIVES = `  var INTERACTIVE_SELECTOR = ${INTERACTIVE_SELECTOR_JS};
  // AN OVERLAY SURFACE IS NAMED BY ITS ROLE, NEVER BY A WORD IN ITS CLASS STRING (#1317 item 7, the
  // #552 shape). The old word regex was tested against el.className, so any Tailwind utility CONTAINING
  // one of the six words excluded the element, while a word-boundary test over a role attribute was a
  // needlessly loose spelling of an exact match. Base UI - the app's only interactive-primitive vendor -
  // publishes the real tell: the ARIA role, the native popover attribute, or a dialog element. The role
  // list below is also WIDER than the six words were: alertdialog, menubar and listbox surfaces were
  // previously judged as nested cards. SELF-scoped on purpose, exactly as the regex was - a card nested
  // INSIDE a dialog body is a real nesting defect, and widening this to closest() would trade a false
  // positive for a false clean.
  var OVERLAY_SURFACE_SELECTOR = "dialog,[popover],[role=dialog],[role=alertdialog],[role=menu],[role=menubar],[role=listbox],[role=tooltip]";
  // TAILWIND V4 EMITS STANDALONE scale:/rotate:/translate: PROPERTIES, NOT transform: (#1075, orb-ui
  // audit F3 — the house comment at packages/ui/src/primitives/button/variants.ts:28-29: "Tailwind v4
  // \`scale-*\` sets the standalone \`scale\` CSS property, not the transform matrix"). A \`transform:\`-only
  // test never matched \`group-hover:scale-105\`'s compiled \`scale: 1.05\` declaration.
  var HOVER_TRANSFORM_RE = /\\b(?:transform\\s*:\\s*(scale|rotate|translate|skew|matrix)|(?:scale|rotate|translate)\\s*:\\s*\\S)/i;
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
  // Rendered is an ANCESTOR property. React Activity retains inactive subtrees under display:none;
  // a leaf's own computed style does not name that retained state, so every rendered-only family shares
  // this one walk rather than growing subtly different leaf predicates. Opacity is accumulated because
  // CSS opacity groups: a leaf under an opacity:0 ancestor paints nothing, and partial ancestor opacity
  // must ride the later contrast sample so Node can composite the glyph honestly (#188).
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
    var targetStyle = getComputedStyle(el);
    if (targetStyle.visibility === "hidden" || targetStyle.visibility === "collapse") return false;
    for (var renderAncestor = el; renderAncestor !== null; renderAncestor = renderAncestor.parentElement) {
      var ancestorStyle = getComputedStyle(renderAncestor);
      if (renderAncestor.hidden || ancestorStyle.display === "none") return false;
    }
    if (accumulatedOpacity(el) === 0) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function isOperable(el) {
    return isVisible(el) && el.closest("[inert],[aria-hidden='true']") === null;
  }
  // A REST-HIDDEN REVEAL CLUSTER, NOT A GENUINELY HIDDEN ONE (#1077, orb-ui audit F5). ROW_REVEAL
  // (opacity-0 at rest, group-hover/focus-within/pointer-coarse:opacity-100) and ListRow's
  // subtitleReveal are the house idiom: display stays IN FLOW, the box has real geometry, only PAINT
  // is zeroed. isVisible's opacity gate reads that identically to display:none, so the census-interactive
  // tap-target loop silently drops these candidates with no accounting reason at all. This predicate
  // isolates the SPECIFIC shape — everything isVisible checks EXCEPT opacity passes, and opacity alone
  // is zero — so a genuinely hidden/detached/zero-rect element is never miscounted as a reveal cluster.
  function isOpacityOnlyHidden(el) {
    if (!(el instanceof Element) || isDevChrome(el) || el.closest("[inert],[aria-hidden='true']") !== null) return false;
    var ohSelf = getComputedStyle(el);
    if (ohSelf.visibility === "hidden" || ohSelf.visibility === "collapse") return false;
    for (var ohAnc = el; ohAnc !== null; ohAnc = ohAnc.parentElement) {
      var ohStyle = getComputedStyle(ohAnc);
      if (ohAnc.hidden || ohStyle.display === "none") return false;
    }
    var ohRect = el.getBoundingClientRect();
    return ohRect.width > 0 && ohRect.height > 0 && accumulatedOpacity(el) === 0;
  }
  // Motion-law sanctioned measured-var height panels (motion guide §3.7).
  var PANEL_EXEMPT_SEL = "[data-slot='accordion-panel'],[data-slot='collapsible-panel']";
  // The owner-RATIFIED selection accent (2026-08-22, issue #485): a 2px left ember bar on the selected
  // row, which is the app-wide selection idiom. Both ListRow slots carry it — \`list-row-body\` is the
  // default \`rowTint\` arm, \`list-row-root\` the arm that paints the whole row — and BOTH halves of each
  // predicate are load-bearing: the slot identity says it is the primitive, \`[data-selected]\` says it is
  // the selection state. Without the state half an unselected row's hardcoded accent would go unjudged.
  // THE RULING SURVIVES — ITS INPUT GAINED A CARRIER (#1823): the population is the FRAGMENT's carriers,
  // not one primitive's slots. Why, and why the selector is INTERPOLATED: lib/selection-rail-sel.ts.
  var SELECTION_RAIL_SEL = ${JSON.stringify(SELECTION_RAIL_SEL)};
  // THE ILLUSTRATED PICKER'S ART APERTURE (#1642). @orb/ui's PickerCell is the ONE anatomy every
  // single-choice PICTURE picker wears, and its art slot holds a DIAGRAM OF A DESIGN — the chat-style
  // cell renders mini transcript lines in the real skin's own classes and inherits that skin's accent
  // stripe on purpose, and the density, elevation and theme-LOOKS cells draw their own subject the same
  // way. A decor rule that judges a tell inside this aperture is judging the picture, not the product.
  // Keyed on the SHARED slot so ALL FOUR pickers ride one exemption (ast-grep on the art prop, 787 tsx,
  // 2026-09-05); consumers walk ANCESTORS (the whole aperture is the picture), which is the deliberate
  // inverse of the element-scoped selection predicate above. The aperture renders unconditionally and
  // closest() matches SELF, so the aperture element is inside its own exemption — no over-reach: its
  // recipe declares no border, so it never reaches a border census at all.
  var PICKER_ART_SEL = "[data-slot='picker-cell-art']";
  // ── THE CAP LEDGER (#1038) ────────────────────────────────────────────────
  // A census that stops PUSHING at a representative bound must not stop COUNTING: the pre-#1038 loops
  // were guarded \`for (…; i < allEls.length && list.length < 200; …)\`, so the walk abandoned the scan at
  // the bound and every downstream denominator — \`candidates=\` on the rule's population row, the
  // per-family sample count, the run's clean verdict — described the first 200 carriers as if they were
  // the whole page. A truncated census that reads COMPLETE is the false-clean class #409 exists for.
  //
  // So the bound stays (an unbounded sample payload is a real risk on a pathological surface, and every
  // other census here is bounded for the same reason) and the SCAN no longer stops: \`capPush\` pushes
  // while there is room and TALLIES what it had to drop. Node reads the tally two ways — the rule's own
  // \`withheld.capExceeded\` (lib/population-strategies.ts) and the run-level refusal
  // (lib/evidence.ts \`censusCapGap\`) — so a truncated family is a NO VERDICT with a number, never a
  // quiet clean. A family absent from this ledger was never capped; a family present with dropped 0 was
  // capped and had room, which is the receipt that the bound has headroom on real surfaces.
  var censusCaps = {};
  function capPush(family, list, limit, row) {
    var ledger = censusCaps[family];
    if (ledger === undefined) {
      ledger = { cap: limit, dropped: 0 };
      censusCaps[family] = ledger;
    }
    if (list.length < limit) {
      list.push(row);
      return;
    }
    ledger.dropped += 1;
  }
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
    // THE ARIA-LABEL ANCHOR (#1326) — the anchor snap's surface map has always used and this walk did
    // not (tooling/src/snap/lib/map-browser.ts bestSelector). It obeys the SAME uniqueness rule as the
    // three above, so it is an anchor only where it resolves to one node. Measured 2026-09-04: two
    // identical seven-deep subtrees whose only distinguishing mark was an aria-label produced ONE
    // six-step path matching both, and the finding was unforwardable. A label is authored, stable across
    // mounts (unlike a React id), and CSS-pasteable — which the map's \`role=name\` spelling is not, and
    // is why that one is deliberately NOT adopted here: every selector this walk emits must be a
    // selector a reader can paste into the page.
    var ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) {
      var labelSel = attrSel("aria-label", ariaLabel.trim());
      if (matchCount(labelSel) === 1) return labelSel;
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

  // SCREEN-READER-ONLY TEXT — THE ONE HOME (#1156). Two shapes, exactly as the type-floor family has
  // always spelled them: the CLIPPED posture (isVisuallyHidden above — a full-size box the browser paints
  // nowhere) and the sub-2px plumbing box (a live-region span sized to nothing). This predicate lived
  // INSIDE census-text.ts's sample literal, so every OTHER family that wanted it had to re-spell it — and
  // the grid census (Law 4, off-grid-text) simply never did, which is how a never-painted node ended up
  // indicted for blurring (a node with no pixels cannot land off the device-pixel grid). One function, two
  // readers; a third reader adds a call, never a copy.
  //
  // TRI-STATE, BY THE #1122 RULING: null means the box could not be READ (not an Element, or a non-finite
  // rect), which is a WITHHOLDING for any rule whose population turns on it — never a quiet "not sr-only".
  // A boolean here would fold "measured painted" and "could not measure" into the same clean arm, which is
  // the exact silence the population contract exists to end.
  var SR_ONLY_MAX_BOX_PX = 2;
  function srOnlyText(el, rect) {
    if (!(el instanceof Element)) return null;
    var box = rect || el.getBoundingClientRect();
    if (!box || !Number.isFinite(box.width) || !Number.isFinite(box.height)) return null;
    return isVisuallyHidden(el) || (box.width <= SR_ONLY_MAX_BOX_PX && box.height <= SR_ONLY_MAX_BOX_PX);
  }
`;

/** THE WHOLE-PAGE CENSUS half: the settled identity snapshot, the walk observer, the rendered/retained
 *  split and the theme-provenance census. Top-level statements, so composing it IS running it — only
 *  the full design-audit walk (and the forced-state pass that mirrors it) may. */
const WALKER_CORE_CENSUS = `  // ONE settled identity snapshot is the denominator for every family below (#976). The generic
  // getComputedStyle read is the common "walk attempted" operation: visibility changes which specialised
  // facts apply, never whether a rendered document subject silently disappears from accounting.
  var settledSubjects = [].slice.call(document.querySelectorAll("*"));
  var allEls = [];
  var documentHeadSkips = 0;
  var devChromeSkips = 0;
  var inaccessibleSubjects = 0;
  var walkMutationCount = 0;
  // THE OBSERVER OUTLIVES A THROW (#1317 item 10). Both disconnect sites are on the walk's happy path
  // (ops/walker/returns.ts and ops/hover-walker-read.ts), so a segment that throws mid-walk leaves a live
  // subtree MutationObserver on the page forever. Harmless on a launched browser we are about to close;
  // on an attached --session it accumulates on the OWNER's page, one per failed run, each firing on every
  // DOM change for the rest of that session. The walk cannot wrap itself in try/finally without changing
  // the segment concatenation contract, so the install is made SELF-HEALING instead: the previous run's
  // observer is disconnected here before this one is armed, which bounds the leak at one.
  if (window.__orbWalkObserver) window.__orbWalkObserver.disconnect();
  var walkObserver = new MutationObserver(function (records) {
    for (var wm = 0; wm < records.length; wm += 1) {
      if (mutationCarriesElement(records[wm])) walkMutationCount += 1;
    }
  });
  window.__orbWalkObserver = walkObserver;
  walkObserver.observe(document.documentElement, { childList: true, subtree: true });
  for (var subjectIndex = 0; subjectIndex < settledSubjects.length; subjectIndex += 1) {
    var subject = settledSubjects[subjectIndex];
    if (document.head && document.head.contains(subject)) {
      documentHeadSkips += 1;
      continue;
    }
    if (isDevChrome(subject)) {
      devChromeSkips += 1;
      continue;
    }
    try {
      getComputedStyle(subject);
      allEls.push(subject);
    } catch (subjectError) {
      inaccessibleSubjects += 1;
    }
  }
  var renderedSubjects = 0;
  var retainedHiddenSubjects = 0;
  for (var renderIndex = 0; renderIndex < allEls.length; renderIndex += 1) {
    if (isVisible(allEls[renderIndex])) renderedSubjects += 1;
    else retainedHiddenSubjects += 1;
  }
  // Render provenance and WHOLE computed color-scheme values over the exact walked population. The source
  // is structural: seed block on <html>, an inline ThemeScope custom-property carrier, or the base default.
  var rootDataTheme = document.documentElement.getAttribute("data-theme");
  var shellThemeScope = null;
  var shellThemeScopes = document.querySelectorAll("[data-slot='theme-scope']");
  for (var scopeIndex = 0; scopeIndex < shellThemeScopes.length; scopeIndex += 1) {
    if (isVisible(shellThemeScopes[scopeIndex])) { shellThemeScope = shellThemeScopes[scopeIndex]; break; }
  }
  var shellInlineBackground = shellThemeScope ? shellThemeScope.style.getPropertyValue("--color-background").trim() || null : null;
  var shellColorScheme = shellThemeScope ? getComputedStyle(shellThemeScope).colorScheme || null : null;
  var themeSubjectSources = { default: 0, seed: 0, custom: 0, unknown: 0 };
  var themeSubjectPolarities = { light: 0, dark: 0, mixed: 0, unknown: 0 };
  for (var themeIndex = 0; themeIndex < allEls.length; themeIndex += 1) {
    var themeSubject = allEls[themeIndex];
    if (!isVisible(themeSubject)) continue;
    var carryingScope = themeSubject.closest ? themeSubject.closest("[data-slot='theme-scope']") : null;
    var carriedBackground = carryingScope ? carryingScope.style.getPropertyValue("--color-background").trim() : "";
    if (carriedBackground !== "") themeSubjectSources.custom += 1;
    else if (rootDataTheme !== null && rootDataTheme !== "") themeSubjectSources.seed += 1;
    else themeSubjectSources.default += 1;
    var schemeWords = (getComputedStyle(themeSubject).colorScheme || "").toLowerCase().split(/\\s+/).filter(Boolean);
    var schemeHasLight = schemeWords.indexOf("light") !== -1;
    var schemeHasDark = schemeWords.indexOf("dark") !== -1;
    if (schemeHasLight && schemeHasDark) themeSubjectPolarities.mixed += 1;
    else if (schemeHasLight) themeSubjectPolarities.light += 1;
    else if (schemeHasDark) themeSubjectPolarities.dark += 1;
    else themeSubjectPolarities.unknown += 1;
  }
  var themeRender = {
    rootDataTheme: rootDataTheme,
    shellScope: { present: shellThemeScope !== null, inlineBackground: shellInlineBackground, colorScheme: shellColorScheme },
    subjectSources: themeSubjectSources,
    subjectPolarities: themeSubjectPolarities,
  };
`;

/** The composition the design-audit walk evaluates: declarations first, then the censuses that read
 *  them. Byte-for-byte the same program the pre-split single literal produced — only the ORDER of the
 *  two halves is fixed, and no census ever read a declaration that follows it. */
export const WALKER_CORE = `${WALKER_PRIMITIVES}${WALKER_CORE_CENSUS}`;
