// ui-audit in-page walker — segment: REGION-SCOPED relational facts.
//
// Sibling cohorts (census-cohort.ts) answer "do these things agree with each other". This segment answers
// three questions about a REGION and about the surface as a whole, none of which any element can answer
// alone:
//
//   pane ink      — does this region earn the height the shell gave it?
//   quiet state   — is the OFF state louder than the ON state?
//   empty states  — how many panes of one surface are simultaneously empty?
//
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string,
// not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

export const WALKER_CENSUS_REGION = `  // ── pane ink: a region that does not earn its height ──────────────────────
  // "The panes are 60-90% empty and nothing designed lives in the void. Personas: content ends y=347 of
  // 1400. The teacher: 4 lines in a 700px column. Not 'clean' — UNFINISHED-LOOKING." A thin pane is not
  // a defect in any element; it is the region failing to earn the width the shell gave it.
  //
  // MEASURED ON AUTHORED PAINT, never the tallest descendant. A full-height flex container spans the pane,
  // so a max-descendant measure reports 100% ink on an evacuated region. Text ranges, media, controls,
  // and an element's own background/border/shadow count; transparent layout wrappers do not.
  //
  // ONLY THE LOW SIDE, and only on a region that is NOT scrolled: content past the fold is a scroll, not
  // a void, and the region legitimately continues below the measured box.
  var paneInks = [];
  var INK_MIN_HEIGHT_PX = 400;
  var INK_MIN_LEAVES = 3;
  var INK_SCROLL_TOLERANCE_PX = 4;
  var INK_RATIO_SCALE = 100;

  function hasDesignedOwnPaint(el) {
    var tag = el.tagName;
    if (tag === "IMG" || tag === "SVG" || tag === "CANVAS" || tag === "VIDEO" || tag === "PICTURE") return true;
    if (el.matches(INTERACTIVE_SELECTOR)) return true;
    var style = getComputedStyle(el);
    var bg = parseRgb(style.backgroundColor);
    if (bg !== null && bg.a > 0) return true;
    if (style.boxShadow && style.boxShadow !== "none") return true;
    var paintedSides = ["Top", "Right", "Bottom", "Left"];
    for (var psi = 0; psi < paintedSides.length; psi += 1) {
      var side = paintedSides[psi];
      if (parseFloat(style["border" + side + "Width"]) > 0 && style["border" + side + "Style"] !== "none") return true;
    }
    return false;
  }

  for (var pi = 0; pi < allEls.length; pi += 1) {
    var pane = allEls[pi];
    if (!isVisible(pane)) continue;
    var prole = pane.getAttribute("role");
    if (!(pane.tagName === "MAIN" || prole === "region" || prole === "tabpanel")) continue;
    if (pane.tagName === "MAIN" && pane.querySelector("[role=region],[role=tabpanel]") !== null) continue;
    var prect = pane.getBoundingClientRect();
    if (prect.height < INK_MIN_HEIGHT_PX) continue;
    relationalAccounting["pane-ink"].candidates += 1;
    if (pane.scrollHeight - pane.clientHeight > INK_SCROLL_TOLERANCE_PX) {
      excludeRelational(relationalAccounting["pane-ink"], "scrolling");
      continue;
    }
    var lowest = prect.top;
    var textLeaves = 0;
    var designedSubjects = 0;
    var textWalker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
    var textNode = textWalker.nextNode();
    while (textNode !== null) {
      var textParent = textNode.parentElement;
      if ((textNode.textContent || "").trim() !== "" && textParent !== null && isVisible(textParent)) {
        var textRange = document.createRange();
        textRange.selectNodeContents(textNode);
        var textRect = textRange.getBoundingClientRect();
        if (textRect.width > 0 && textRect.height > 0) {
          textLeaves += 1;
          designedSubjects += 1;
          if (textRect.bottom > lowest) lowest = textRect.bottom;
        }
      }
      textNode = textWalker.nextNode();
    }
    var painted = pane.querySelectorAll("*");
    for (var li2 = 0; li2 < painted.length; li2 += 1) {
      var leaf = painted[li2];
      if (!isVisible(leaf) || !hasDesignedOwnPaint(leaf)) continue;
      var lrect = leaf.getBoundingClientRect();
      if (lrect.width <= 0 || lrect.height <= 0) continue;
      designedSubjects += 1;
      if (lrect.bottom > lowest) lowest = lrect.bottom;
    }
    if (textLeaves < INK_MIN_LEAVES) {
      excludeRelational(relationalAccounting["pane-ink"], "insufficientText");
      continue;
    }
    paneInks.push({
      selector: describe(pane),
      paneHeightPx: Math.round(prect.height),
      lastInkPx: Math.round(lowest - prect.top),
      inkRatio: Math.round(((lowest - prect.top) / prect.height) * INK_RATIO_SCALE) / INK_RATIO_SCALE,
      textLeaves: textLeaves,
      designedSubjects: designedSubjects,
    });
    relationalAccounting["pane-ink"].judged += 1;
  }

  // ── quiet state: the OFF state must not outshout the ON state ─────────────
  // "17.61:1 OFF vs 7.65:1 ON is backwards" — the loudest object on the surface was a switch that was
  // turned OFF. This is an ORDERING question, not a threshold: no single contrast value here is wrong,
  // the RANK is. Base UI emits data-checked and data-unchecked on the same component, so the pair is the
  // author's own claim and this needs no semantics from us.
  var quietStates = [];
  relationalAccounting["quiet-state"] = { candidates: 0, judged: 0, withheld: {}, excluded: {} };
  var LUM_R = 0.2126;
  var LUM_G = 0.7152;
  var LUM_B = 0.0722;
  var SRGB_KNEE = 0.03928;
  var SRGB_LINEAR_DIV = 12.92;
  var SRGB_OFFSET = 0.055;
  var SRGB_SCALE = 1.055;
  var SRGB_EXP = 2.4;
  var WCAG_OFFSET = 0.05;
  var CHANNEL_MAX = 255;
  var QUIET_SCALE = 100;

  // NEVER A NUMBER REGEX OVER A COLOR STRING. This is a tokens-only tree, so computed style hands back
  // the AUTHORED space: a live switch reads back "oklch(0.99 0.005 60 / 0.12)". Scraping the first three
  // numbers and dividing by 255 computes the luminance of a near-black from a near-WHITE, and the whole
  // rule then ranks on noise. resolve.ts's parseRgb already normalizes any browser-understood color
  // through a memoized canvas probe and carries alpha — the same lesson its own gradient scanner records
  // for issue #189, one family over. Reuse it; do not re-derive a parser here.
  function relLum(rgb) {
    var chan = [rgb.r, rgb.g, rgb.b];
    var lin = [];
    for (var qi = 0; qi < 3; qi += 1) {
      var c = chan[qi] / CHANNEL_MAX;
      lin.push(c <= SRGB_KNEE ? c / SRGB_LINEAR_DIV : Math.pow((c + SRGB_OFFSET) / SRGB_SCALE, SRGB_EXP));
    }
    return LUM_R * lin[0] + LUM_G * lin[1] + LUM_B * lin[2];
  }

  // An element's own FILL against the nearest OPAQUE ancestor fill — "how loud is this object",
  // deliberately not the text-contrast family's question.
  //
  // ALPHA IS COMPOSITED, NOT IGNORED. The live off-state track is 12% alpha; comparing its raw color to
  // an opaque one measures a fill that is not on the screen. A translucent layer is composited over the
  // resolved backdrop first (resolve.ts's compositeOver), so the ratio describes the pixels a user sees.
  function fillContrast(el) {
    var own = parseRgb(getComputedStyle(el).backgroundColor);
    if (own === null || own.a <= 0) return null;
    // resolveBackdrop keeps every translucent ancestor in the stack before producing the flat color
    // actually beneath this state. Skipping those layers would compare against a color nobody sees.
    var backdrop = resolveBackdrop(el.parentElement || el);
    if (backdrop.kind !== "flat") return null;
    var visibleOwn = compositeOver(own, backdrop.color);
    var ownLum = relLum(visibleOwn);
    var baseLum = relLum(backdrop.color);
    var hi = Math.max(ownLum, baseLum);
    var lo = Math.min(ownLum, baseLum);
    return {
      contrast: Math.round(((hi + WCAG_OFFSET) / (lo + WCAG_OFFSET)) * QUIET_SCALE) / QUIET_SCALE,
      backdrop: [backdrop.color.r, backdrop.color.g, backdrop.color.b, backdrop.color.a].join(","),
    };
  }

  var onEls = document.querySelectorAll("[data-checked]");
  var offEls = document.querySelectorAll("[data-unchecked]");
  var quietAuthoredCohorts = new Map();
  function addQuietState(el, state) {
    if (!isVisible(el)) return;
    var contrast = fillContrast(el);
    var key = authoredTargetClaim(el) + "|home=" + authoredTargetHome(el);
    var cohort = quietAuthoredCohorts.get(key);
    if (cohort === undefined) {
      cohort = [];
      quietAuthoredCohorts.set(key, cohort);
    }
    cohort.push({ state: state, contrast: contrast, selector: describe(el) });
  }
  for (var oi2 = 0; oi2 < onEls.length; oi2 += 1) {
    addQuietState(onEls[oi2], "on");
  }
  for (var fi = 0; fi < offEls.length; fi += 1) {
    addQuietState(offEls[fi], "off");
  }
  // One unresolvable state voids its authored cohort. Resolved states partition by backdrop so the
  // comparison never crosses paint contexts; every one-sided partition is explicit withholding.
  quietAuthoredCohorts.forEach(function (authoredCohort) {
    if (authoredCohort.some(function (entry) { return entry.contrast === null; })) {
      relationalAccounting["quiet-state"].candidates += 1;
      withholdRelational(relationalAccounting["quiet-state"], "unresolved");
      return;
    }
    var byBackdrop = new Map();
    for (var quietIndex = 0; quietIndex < authoredCohort.length; quietIndex += 1) {
      var quietEntry = authoredCohort[quietIndex];
      var backdropKey = quietEntry.contrast.backdrop;
      var backdropCohort = byBackdrop.get(backdropKey);
      if (backdropCohort === undefined) {
        backdropCohort = [];
        byBackdrop.set(backdropKey, backdropCohort);
      }
      backdropCohort.push(quietEntry);
    }
    byBackdrop.forEach(function (cohort) {
      relationalAccounting["quiet-state"].candidates += 1;
      var on = 0;
      var off = 0;
      var offSelector = null;
      for (var quietMember = 0; quietMember < cohort.length; quietMember += 1) {
        var member = cohort[quietMember];
        if (member.state === "on" && member.contrast.contrast > on) on = member.contrast.contrast;
        if (member.state === "off" && member.contrast.contrast > off) {
          off = member.contrast.contrast;
          offSelector = member.selector;
        }
      }
      if (on === 0) {
        withholdRelational(relationalAccounting["quiet-state"], "unmatchedOff");
        return;
      }
      if (off === 0 || offSelector === null) {
        withholdRelational(relationalAccounting["quiet-state"], "unmatchedOn");
        return;
      }
      relationalAccounting["quiet-state"].judged += 1;
      quietStates.push({ selector: offSelector, offContrast: off, onContrast: on });
    });
  });

  // ── simultaneous empty states ─────────────────────────────────────────────
  // "The LIST pane says 'No extension pages yet / install a plugin' while the CONTENT pane says 'Pick an
  // extension page / choose one on the left' — but there is nothing on the left to choose." Two panes of
  // one surface, both empty, giving contradictory guidance. STRUCTURAL, because the app has exactly one
  // empty-state primitive: the count of simultaneously-rendered empty-state roots IS the shape, and
  // whether each offers an action is its own slot.
  var emptyStates = [];
  relationalAccounting["double-empty-state"] = { candidates: 0, judged: 0, withheld: {}, excluded: {} };
  var emptyRoots = document.querySelectorAll("[data-slot=empty-state-root]");
  var emptyBySurface = new Map();
  function emptySurface(root) {
    for (var surface = root.parentElement; surface !== null; surface = surface.parentElement) {
      var role = String(surface.getAttribute("role") || "").toLowerCase();
      if (surface.tagName === "MAIN" || surface.tagName === "ASIDE" || surface.tagName === "NAV") return surface;
      if (role === "region" || role === "tabpanel" || role === "dialog" || role === "main") return surface;
    }
    return document.body;
  }

  function hasOperableEmptyAction(root) {
    var actionSlots = root.querySelectorAll("[data-slot=empty-state-action]");
    for (var actionIndex = 0; actionIndex < actionSlots.length; actionIndex += 1) {
      var actionSlot = actionSlots[actionIndex];
      if (!isVisible(actionSlot) || actionSlot.closest("[inert]") !== null) continue;
      var doors = actionSlot.matches(INTERACTIVE_SELECTOR) ? [actionSlot] : actionSlot.querySelectorAll(INTERACTIVE_SELECTOR);
      for (var doorIndex = 0; doorIndex < doors.length; doorIndex += 1) {
        var door = doors[doorIndex];
        if (!isVisible(door) || door.closest("[inert]") !== null) continue;
        if (door.hasAttribute("disabled") || door.getAttribute("aria-disabled") === "true") continue;
        return true;
      }
    }
    return false;
  }

  for (var ei = 0; ei < emptyRoots.length; ei += 1) {
    if (!isVisible(emptyRoots[ei])) continue;
    var surface = emptySurface(emptyRoots[ei]);
    var emptyGroup = emptyBySurface.get(surface);
    if (emptyGroup === undefined) {
      emptyGroup = { roots: [], actionless: 0 };
      emptyBySurface.set(surface, emptyGroup);
    }
    emptyGroup.roots.push(emptyRoots[ei]);
    if (!hasOperableEmptyAction(emptyRoots[ei])) emptyGroup.actionless += 1;
  }
  emptyBySurface.forEach(function (group, surface) {
    if (group.roots.length > 0) {
      relationalAccounting["double-empty-state"].candidates += 1;
      relationalAccounting["double-empty-state"].judged += 1;
      emptyStates.push({ selector: describe(surface), rendered: group.roots.length, actionless: group.actionless });
    }
  });
`;
