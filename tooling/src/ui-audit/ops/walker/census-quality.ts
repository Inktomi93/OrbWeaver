// ui-audit in-page walker — segment: quality censuses: heading order, text overflow, repeated container
// text, clipped overflow, edge-flush scroller cards.
// THE CLIP CENSUS HAS TWO ARMS, not the "positioned children" this line claimed until 2026-09-06 (#1807
// docs pass): a POSITIONED arm and a deliberately narrower IN-FLOW arm that judges only children which
// ARE or CONTAIN a control — in-flow TEXT spilling a clip is `text-overflow`'s finding, not this one's.
// The paint fence that decides which children either arm may see is hoisted above the split (#1783); the
// reasoning lives beside `clippedOverflows` below.
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { interactiveTagSelector } from "../../lib/checks-interactive.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

/** A "substantive child" needs a real navigation target on an anchor (`a[href]`, not bare `a`), and
 *  widens the role list to container roles a card body legitimately hosts — the TAG portion is still the
 *  one shared tuple (#1074), so textarea/summary cannot drop out of this census either. */
const CHILD_SUBSTANTIVE_ROLES = ["button", "dialog", "link", "listbox", "menu", "menuitem", "option", "tooltip"];
const CHILD_SUBSTANTIVE_SEL_VALUE = [
  ...interactiveTagSelector({ anchorRequiresHref: true }),
  "[tabindex]:not([tabindex='-1'])",
  ...CHILD_SUBSTANTIVE_ROLES.map((role) => `[role='${role}']`),
].join(",");
const CHILD_SUBSTANTIVE_SEL_JS = JSON.stringify(CHILD_SUBSTANTIVE_SEL_VALUE);

export const WALKER_CENSUS_QUALITY = `  // ── heading order (impeccable skipped-heading; visible headings only so a
  //    hidden warm pane's outline can't fake a skip) ────────────────────────
  var headings = [];
  for (var ho = 0; ho < headingEls.length; ho += 1) {
    var hoel = headingEls[ho];
    if (!isVisible(hoel) || hoel.closest("[aria-hidden='true']") || isDevChrome(hoel)) continue;
    headings.push({ selector: describe(hoel), level: Number(hoel.tagName[1]), text: (hoel.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 60) });
  }

  // ── text overflow (impeccable text-overflow — block + inline arms) ───────
  // Every bound below is a REPRESENTATIVE bound the scan runs past (#1038): \`capPush\` (core.ts) keeps
  // scanning and tallies what it dropped, so a surface with more spills than the bound is a NO VERDICT
  // naming the family (lib/evidence.ts \`censusCapGap\`) rather than a clean read of its first N. These
  // four families are rung-1 WALKER-PROVEN (lib/collect.ts's rung table): every returned sample IS a
  // finding, so a silent bound did not merely shrink a denominator — it DELETED findings.
  var overflows = [];
  var OVERFLOW_CAP = 100;
  // ── the TRUNCATION AFFORDANCE test (#825) ────────────────────────────────
  // The rule is "truncated with NO ellipsis AND no full-value affordance" — never the raw
  // scrollWidth > clientWidth, which is what every CORRECTLY truncating label in the app looks like.
  // Measured cost of the raw form: a P1 against the topbar chat title (overflow:hidden;
  // text-overflow:ellipsis; white-space:nowrap; scrollWidth 201 / clientWidth 116), i.e. the house
  // idiom (docs/reviews/side-eye/2026-08-30-this-chat-cls.md §6 retraction 6 / §9-I1).
  // text-overflow only paints where the box CLIPS, and the clipping box is often an ancestor (the
  // <div class="truncate"><span>…</span></div> shape puts the ellipsis on the div and leaves the
  // inline child with clientWidth 0 — the inline arm below), so the ellipsis is read off the nearest
  // clipping ancestor-or-self. Where nothing ellipses, a title/aria-label carrying the FULL string is
  // the other honest affordance: the value is one hover or one screen reader away.
  // DECLARED LIMIT: a hover-only tooltip that renders no attribute until it opens is unreachable from
  // a static walk and is NOT credited — such a label still reports, and the fix is the ellipsis.
  // DISJOINT from truncated-to-nothing (#816, census-collision): that family is clientWidth ~ 0 — the
  // string is GONE, and an ellipsis on a zero-width box paints nothing either, so it is never silenced
  // here.
  var clipOwnerStyleOf = function (el) {
    for (var cp = el; cp; cp = cp.parentElement) {
      var cs = getComputedStyle(cp);
      if (clipsOverflow(cs)) return cs;
    }
    return null;
  };
  var fullValueAffordance = function (el) {
    var full = (el.textContent || "").trim().replace(/\\s+/g, " ");
    if (full === "") return false;
    var levels = 0;
    for (var ap = el; ap && levels < 4; ap = ap.parentElement) {
      var carried = ((ap.getAttribute("title") || "") + " " + (ap.getAttribute("aria-label") || "")).replace(/\\s+/g, " ");
      if (carried.indexOf(full) !== -1) return true;
      levels += 1;
    }
    return false;
  };
  var truncationAffordance = function (el) {
    var owner = clipOwnerStyleOf(el);
    if (owner !== null && /ellipsis/.test(owner.textOverflow || "")) return true;
    return fullValueAffordance(el);
  };
  var OVERFLOW_SKIP_TAGS = { pre: 1, code: 1, textarea: 1, svg: 1, canvas: 1, select: 1, option: 1 };
  var isScrollRegion = function (s) {
    return /(auto|scroll)/.test(s.overflowX || "") || /(auto|scroll)/.test(s.overflow || "") || /(auto|scroll)/.test(s.overflowY || "");
  };
  for (var ov = 0; ov < allEls.length; ov += 1) {
    var ovel = allEls[ov];
    var ovTag = ovel.tagName.toLowerCase();
    if (OVERFLOW_SKIP_TAGS[ovTag] === 1) continue;
    if (ovel.namespaceURI === "http://www.w3.org/2000/svg") continue;
    if (!isVisible(ovel) || ovel.closest("[aria-hidden='true']")) continue;
    var hasDirect = false;
    for (var oc = 0; oc < ovel.childNodes.length; oc += 1) {
      var on = ovel.childNodes[oc];
      if (on.nodeType === 3 && on.textContent.trim().length > 0) { hasDirect = true; break; }
    }
    if (!hasDirect) continue;
    var ovStyle = getComputedStyle(ovel);
    var ovRect = ovel.getBoundingClientRect();
    if (ovRect.width <= 2 && ovRect.height <= 2) continue; // sub-2px plumbing boxes
    // The CLIPPED screen-reader-only state is the other sr-only shape, and it keeps a full-size box:
    // clientWidth 24 against a nowrap scrollWidth 70 on the shell skip link read as a 46px spill. Nothing
    // spills — nothing is painted. The revealed (not-sr-only) arm has no clip and is still judged.
    if (isVisuallyHidden(ovel)) continue;
    if (isScrollRegion(ovStyle)) continue;
    var scrollAnc = false;
    for (var oap = ovel.parentElement; oap; oap = oap.parentElement) {
      if (isScrollRegion(getComputedStyle(oap))) { scrollAnc = true; break; }
    }
    if (scrollAnc) continue;
    var delta = ovel.scrollWidth - ovel.clientWidth;
    if (ovel.clientWidth > 0 && delta >= 16) {
      if (!truncationAffordance(ovel)) {
        capPush("overflows", overflows, OVERFLOW_CAP, { selector: describe(ovel), spillPx: Math.round(delta), mode: "block" });
      }
      continue;
    }
    if (ovel.clientWidth === 0 && ovRect.width > 0) {
      var container = ovel.parentElement;
      while (container && container.clientWidth === 0) container = container.parentElement;
      if (!container) continue;
      var transformed = false;
      for (var tpp = ovel; tpp && tpp !== container.parentElement; tpp = tpp.parentElement) {
        var tv = getComputedStyle(tpp).transform;
        if (tv && tv !== "none") { transformed = true; break; }
      }
      if (transformed) continue;
      var cRect = container.getBoundingClientRect();
      var spill = ovRect.right - (cRect.left + container.clientLeft + container.clientWidth);
      if (spill >= 16 && !truncationAffordance(ovel)) {
        capPush("overflows", overflows, OVERFLOW_CAP, { selector: describe(ovel), spillPx: Math.round(spill), mode: "inline" });
      }
    }
  }

  // ── repeated literal text inside one decorated container (impeccable
  //    repeated-container-text; structural-signature grouping in-page) ──────
  var repeatedTexts = [];
  var REPEAT_SKIP_SEL = "table,select,datalist,nav,menu,[role='navigation'],[role='menu'],[role='menubar'],[role='listbox'],[role='grid'],[role='tablist'],[role='radiogroup'],[aria-hidden='true']";
  var REPEAT_CONTAINER_TAGS = { div: 1, section: 1, article: 1, aside: 1, main: 1, figure: 1, form: 1, fieldset: 1, details: 1, li: 1 };
  var repeatContainers = [];
  var repeatContainerSet = new Set();
  for (var rc = 0; rc < allEls.length; rc += 1) {
    var rcel = allEls[rc];
    if (REPEAT_CONTAINER_TAGS[rcel.tagName.toLowerCase()] !== 1) continue;
    if (rcel.closest(REPEAT_SKIP_SEL)) continue;
    var rcStyle = getComputedStyle(rcel);
    var rcShadow = rcStyle.boxShadow !== "none" && rcStyle.boxShadow.trim() !== "";
    var rcBorderSides = 0;
    if ((Number.parseFloat(rcStyle.borderTopWidth) || 0) >= 1) rcBorderSides += 1;
    if ((Number.parseFloat(rcStyle.borderRightWidth) || 0) >= 1) rcBorderSides += 1;
    if ((Number.parseFloat(rcStyle.borderBottomWidth) || 0) >= 1) rcBorderSides += 1;
    if ((Number.parseFloat(rcStyle.borderLeftWidth) || 0) >= 1) rcBorderSides += 1;
    var rcRadius = (Number.parseFloat(rcStyle.borderRadius) || 0) > 0;
    var rcBg = parseRgb(rcStyle.backgroundColor);
    var rcHasBg = !!(rcBg && rcBg.a > 0.1);
    if (!((rcShadow || rcBorderSides >= 3) && (rcRadius || rcHasBg))) continue;
    repeatContainers.push(rcel);
    repeatContainerSet.add(rcel);
  }
  var REPEATED_TEXT_CAP = 40;
  for (var rci = 0; rci < repeatContainers.length; rci += 1) {
    var rcont = repeatContainers[rci];
    if (!isVisible(rcont)) continue;
    var rdesc = rcont.querySelectorAll("*");
    if (rdesc.length > 250) continue;
    var groups = {};
    for (var rd = 0; rd < rdesc.length; rd += 1) {
      var del = rdesc[rd];
      var owned = false;
      for (var ranc = del.parentElement; ranc && ranc !== rcont; ranc = ranc.parentElement) {
        if (repeatContainerSet.has(ranc)) { owned = true; break; }
      }
      if (owned) continue;
      if (del.closest(REPEAT_SKIP_SEL)) continue;
      if (/icon|material-symbols|(?:^|\\s)fa[srlbd]?(?:\\s|-|$)/i.test(String(del.getAttribute("class") || ""))) continue;
      if (!isVisible(del)) continue;
      var dtext = directTextOf(del);
      if (dtext.length < 4 || dtext.length > 48) continue;
      if (!/[a-zA-Z]/.test(dtext)) continue;
      var sig = [];
      for (var scur = del; scur && scur !== rcont; scur = scur.parentElement) {
        var scls = String(scur.getAttribute("class") || "").trim().split(/\\s+/).filter(Boolean).sort().join(".");
        sig.push(scur.tagName.toLowerCase() + (scls ? "." + scls : ""));
      }
      if (!groups[dtext]) groups[dtext] = [];
      groups[dtext].push(sig.join(">"));
    }
    for (var gt in groups) {
      var sigs = groups[gt];
      if (sigs.length < 3) continue;
      var distinct = new Set(sigs).size;
      if (distinct < 3) continue;
      capPush("repeatedTexts", repeatedTexts, REPEATED_TEXT_CAP, { containerSelector: describe(rcont), text: gt.slice(0, 40), count: sigs.length, distinctSigs: distinct });
    }
  }

  // ── clipping container vs cut child (impeccable clipped-overflow-container) ──
  // #439 WAS TWO BLIND SPOTS, AND BOTH ARE FIXED HERE (#444). A \`nowrap justify-end\` footer whose
  // buttons were wider than the dialog pushed "Blank chat" 35px past the dialog's LEFT edge, where it
  // was cut — and this rule stayed silent because (1) it judged POSITIONED children only, and the
  // button was ordinary in-flow content, and (2) it skipped SCROLL containers wholesale, and the live
  // dialog is \`overflow: auto\` (measured on :5173 — auto on both axes, scroll delta 0).
  // \`snap --expect-no-overflow\` printed PASS on the same frame for a third reason: negative overflow
  // does not grow \`scrollWidth\`.
  //
  // PER-SIDE, NEVER PER-AXIS — do not "simplify" this back. Scrolling sanctions only the POSITIVE side:
  // content past the right/bottom edge is reachable by scrolling and belongs to the scroll delta. There
  // is NO negative scroll offset, so content before the content origin is unreachable and cut whatever
  // the overflow value says. Judging per axis re-blinds every \`overflow: auto\` surface, which is the
  // exact surface #439 lived on.
  //
  // The IN-FLOW arm is deliberately narrower than the POSITIONED one: it judges only children that ARE
  // or CONTAIN a control. In-flow TEXT spilling out of a clip is the text-overflow rule's finding, and
  // widening this one to text would re-report every deliberate truncation.
  var clippedOverflows = [];
  var CLIPPED_OVERFLOW_CAP = 40;
  var clipsVal = function (v) { return v === "hidden" || v === "clip"; };
  var scrollsVal = function (v) { return v === "auto" || v === "scroll"; };
  // The clip boundary is the PADDING box — that is exactly where overflow:hidden cuts, so a full-bleed
  // child sitting in the container's own padding is not a cut. On a SCROLLED container the left/top
  // boundary is the content ORIGIN (children have already moved by scrollLeft/scrollTop); the document
  // element is the exception, since its own box moves with the page scroll.
  var clipBoxOf = function (el) {
    var r = el.getBoundingClientRect();
    var rootScroller = el === document.documentElement;
    var l = r.left + el.clientLeft;
    var t = r.top + el.clientTop;
    return {
      left: l - (rootScroller ? 0 : el.scrollLeft),
      top: t - (rootScroller ? 0 : el.scrollTop),
      right: l + el.clientWidth,
      bottom: t + el.clientHeight,
    };
  };
  var CLIP_SPILL_TOLERANCE = 2;
  // THE VIEWPORT IDENT TEST READS THE SLOT, NEVER THE CLASS STRING (#1317 item 7 - the #552 shape).
  // A word-boundary test over the class attribute matches any Tailwind utility that CONTAINS the word,
  // and - measured on this tree, 2026-09-04 - it was also BLIND to the real expression mechanism:
  // packages/ui names an intentional clipping viewport with data-slot (scroll-area-viewport,
  // dialog-viewport, menu-viewport, virtual-list-viewport, media-grid-viewport, drawer-viewport,
  // toast-viewport, popover-viewport, tooltip-viewport, message-list-viewport), while ZERO className
  // strings in packages/{ui,client} carry any word in this list. RULE-AUTHORING.md row 8's class, in
  // both directions at once. data-slot + id + aria-roledescription are the authored positions.
  var VIEWPORT_IDENT_RE = /\\b(carousel|comparison|compare|fisheye|marquee|preview|scroller|slider|slideshow|split|viewport|demo-area|demo-stage|demo-viewport)\\b/i;
  var CHILD_SUBSTANTIVE_SEL = ${CHILD_SUBSTANTIVE_SEL_JS};
  for (var co = 0; co < allEls.length; co += 1) {
    var coel = allEls[co];
    var coStyle = getComputedStyle(coel);
    var clipX = clipsVal(coStyle.overflowX) || clipsVal(coStyle.overflow);
    var clipY = clipsVal(coStyle.overflowY) || clipsVal(coStyle.overflow);
    var scrollX = scrollsVal(coStyle.overflowX) || scrollsVal(coStyle.overflow);
    var scrollY = scrollsVal(coStyle.overflowY) || scrollsVal(coStyle.overflow);
    // Judged sides: left/top wherever the axis is bounded AT ALL (clip or scroll — see the per-side
    // note above), right/bottom only where it clips.
    var judgeLeft = clipX || scrollX;
    var judgeTop = clipY || scrollY;
    if (!judgeLeft && !judgeTop) continue;
    if (!isVisible(coel)) continue;
    // Every screen-reader-only box is an overflow:hidden clip by construction, so this rule would call
    // each one a UI-cutting container. Cut UI is a claim about pixels; a clipped stub paints none.
    if (isVisuallyHidden(coel)) continue;
    var coIdent = ((coel.getAttribute("data-slot") || "") + " " + (coel.getAttribute("id") || "")).toLowerCase();
    var coRoleDesc = (coel.getAttribute("aria-roledescription") || "").toLowerCase();
    if (VIEWPORT_IDENT_RE.test(coIdent) || /\\b(carousel|slider)\\b/.test(coRoleDesc)) continue;
    var coBox = clipBoxOf(coel);
    var coChildren = coel.querySelectorAll("*");
    var coTag = coel.tagName.toLowerCase();
    for (var cc = 0; cc < coChildren.length; cc += 1) {
      var cchild = coChildren[cc];
      if (isDevChrome(cchild)) continue;
      var ccStyle = getComputedStyle(cchild);
      var ccPos = ccStyle.position || "";
      var ccPositioned = ccPos === "absolute" || ccPos === "fixed";
      // A fixed child of the ROOT clip (html/body overflow gutters) is viewport-anchored — root
      // overflow does not clip it unless the root establishes a containing block. Toasts/portals
      // live exactly there; only a NON-root clipping ancestor is a real cut risk.
      if (ccPos === "fixed" && (coTag === "html" || coTag === "body")) continue;
      // A SCROLL REGION between the child and this clip container means the child is
      // scroll-managed content (virtualizer overscan rows, long panes), not cut UI — geometry
      // "escapes" the outer rect only because the content scrolls. An inner CLIP between them owns
      // its own cut and is judged on its own turn as a container, so it ends the walk too.
      var managedBetween = false;
      for (var sb = cchild.parentElement; sb && sb !== coel; sb = sb.parentElement) {
        var sbStyle = getComputedStyle(sb);
        if (isScrollRegion(sbStyle) || clipsVal(sbStyle.overflowX) || clipsVal(sbStyle.overflowY) || clipsVal(sbStyle.overflow)) { managedBetween = true; break; }
      }
      if (managedBetween) continue;
      // decorative child?
      if (cchild.closest("[aria-hidden='true']")) continue;
      var ccRole = (cchild.getAttribute("role") || "").toLowerCase();
      if (ccRole === "none" || ccRole === "presentation") continue;
      var ccTag = cchild.tagName.toLowerCase();
      if (ccTag === "img" || ccTag === "svg" || ccTag === "canvas" || ccTag === "video") continue;
      var ccText = (cchild.textContent || "").replace(/\\s+/g, " ").trim();
      var ccControl = (cchild.matches && cchild.matches(CHILD_SUBSTANTIVE_SEL)) || !!cchild.querySelector(CHILD_SUBSTANTIVE_SEL);
      var ccSubstantive = ccText.length > 0 || ccControl;
      // The DECORATIVE-IDENT arm that used to sit here was DEAD CODE (#1317 item 7): it read
      // DECOR_IDENT_RE.test(class + id) AND !ccSubstantive, and the very next line continues for EVERY
      // !ccSubstantive child regardless - so the regex could not change one verdict either way. Removed
      // rather than repaired: a child that carries neither text nor a control is already excluded by the
      // MEASURED test below, which needs no name vocabulary at all.
      if (!ccSubstantive) continue;
      // THE VISUALLY-HIDDEN FENCE IS SHARED BY BOTH ARMS (#1783). Cut UI is a claim about pixels, and a
      // visually-hidden box paints none whatever its rect says — the same argument the CONTAINER fence
      // above makes, one level down. It sat inside the in-flow condition, so the POSITIONED arm judged
      // sr-only stubs: Base UI's SliderThumb renders its real \`<input type=range>\` with the vendor's
      // \`visuallyHidden\` posture (position:fixed, top/left 0, clip-path:inset(50%), overflow:hidden)
      // sized 100%/100%, i.e. a VIEWPORT-sized rect, so every Slider inside a clipping container minted
      // "clipped Nnnpx" = viewportRight - containerRight (measured 383px on Presets, #1770).
      // \`isVisible\` is deliberately NOT hoisted with it: it requires a non-zero rect, and the
      // zero-size positioned arm below (declared insets as the only evidence) exists precisely for
      // children it would reject.
      if (isVisuallyHidden(cchild)) continue;
      // The IN-FLOW arm's extra fences: it must paint (an unpainted box cuts nothing), and it must be or
      // carry a CONTROL — in-flow text spill is text-overflow's.
      if (!ccPositioned && !(ccControl && isVisible(cchild))) continue;
      var ccRect = cchild.getBoundingClientRect();
      var ccSide = null;
      var ccSpill = CLIP_SPILL_TOLERANCE;
      var escapes = null;
      if (ccRect.width > 0 || ccRect.height > 0) {
        var sides = [];
        if (judgeLeft) sides.push(["left", coBox.left - ccRect.left]);
        if (judgeTop) sides.push(["top", coBox.top - ccRect.top]);
        if (clipX) sides.push(["right", ccRect.right - coBox.right]);
        if (clipY) sides.push(["bottom", ccRect.bottom - coBox.bottom]);
        for (var si = 0; si < sides.length; si += 1) {
          if (sides[si][1] > ccSpill) { ccSpill = sides[si][1]; ccSide = sides[si][0]; }
        }
        escapes = ccSide !== null;
      }
      if (escapes === false) continue;
      if (escapes === null) {
        // A zero-size positioned child measures nothing; its declared insets are the only evidence.
        var insets = [ccStyle.top, ccStyle.right, ccStyle.bottom, ccStyle.left].join(" ").toLowerCase();
        if (!(/(^|[\\s(])-+(?:\\d|\\.)/.test(insets) || /(^|[\\s(])100(?:\\.0+)?%/.test(insets))) continue;
      }
      capPush("clippedOverflows", clippedOverflows, CLIPPED_OVERFLOW_CAP, {
        selector: describe(coel),
        childSelector: describe(cchild),
        flow: ccPositioned ? "positioned" : "in-flow",
        side: ccSide,
        spillPx: ccSide === null ? 0 : Math.round(ccSpill),
      });
      break;
    }
  }

  // ── cards flush against a scroller edge at rest (impeccable edge-flush-cards) ──
  var edgeFlushCards = [];
  var EDGE_FLUSH_CAP = 20;
  for (var ef = 0; ef < allEls.length; ef += 1) {
    var scroller = allEls[ef];
    var efStyle = getComputedStyle(scroller);
    if (!(/(auto|scroll)/.test(efStyle.overflowX || "") || /(auto|scroll)/.test(efStyle.overflow || ""))) continue;
    if (scroller.scrollWidth <= scroller.clientWidth + 8) continue;
    if (scroller.scrollLeft > 4) continue;
    var scRect = scroller.getBoundingClientRect();
    if (scRect.width < 120 || scRect.height < 60) continue;
    var contentLeft = scRect.left + scroller.clientLeft;
    var contentRight = contentLeft + scroller.clientWidth;
    var flushCount = 0;
    var worst = null;
    var cards = scroller.querySelectorAll("*");
    for (var cf = 0; cf < cards.length; cf += 1) {
      var card = cards[cf];
      if (!isVisible(card)) continue;
      var owner = card.parentElement;
      while (owner && owner !== scroller && !(/(auto|scroll)/.test(getComputedStyle(owner).overflowX || ""))) owner = owner.parentElement;
      if (owner !== scroller) continue;
      var cfStyle = getComputedStyle(card);
      var cfRect = card.getBoundingClientRect();
      if (cfRect.width < 80 || cfRect.height < 40) continue;
      var cfBg = parseRgb(cfStyle.backgroundColor);
      var cfHasBg = !!(cfBg && cfBg.a > 0.5);
      var cfBorders = 0;
      if ((Number.parseFloat(cfStyle.borderTopWidth) || 0) > 0) cfBorders += 1;
      if ((Number.parseFloat(cfStyle.borderRightWidth) || 0) > 0) cfBorders += 1;
      if ((Number.parseFloat(cfStyle.borderBottomWidth) || 0) > 0) cfBorders += 1;
      if ((Number.parseFloat(cfStyle.borderLeftWidth) || 0) > 0) cfBorders += 1;
      if (!cfHasBg && cfBorders < 2) continue;
      var leftGutter = cfRect.left - contentLeft;
      var rightGap = contentRight - cfRect.right;
      var flushRight = leftGutter >= 6 && rightGap < 8 && rightGap > -24;
      var flushLeft = rightGap >= 6 && leftGutter < 8 && leftGutter > -24;
      if (!flushRight && !flushLeft) continue;
      flushCount += 1;
      var gap = Math.round(flushRight ? rightGap : leftGutter);
      if (worst === null || gap < worst.gapPx) {
        worst = { cardSelector: describe(card), edge: flushRight ? "right" : "left", gapPx: gap };
      }
    }
    if (worst !== null) {
      capPush("edgeFlushCards", edgeFlushCards, EDGE_FLUSH_CAP, { scrollerSelector: describe(scroller), cardSelector: worst.cardSelector, edge: worst.edge, gapPx: worst.gapPx, count: flushCount });
    }
  }

`;
