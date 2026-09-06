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

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

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
  //
  // NO OWN FILL IS A CLOSED NEGATIVE, NOT A MISSING MEASUREMENT (#1068). A transparent element — the live
  // checkbox-indicator, a glyph host whose background-color is rgba(0, 0, 0, 0) — has no loudness for an
  // ordering rule to rank, so the rule does not apply to it: that is EXCLUDED evidence. Only an
  // unresolvable BACKDROP is the missing measurement WITHHELD is reserved for (#987 polarity). The two
  // used to share one null return, so every fill-less cohort published as withheld(unresolved) — which
  // alone is enough to make a whole run NO VERDICT.
  //
  // AND THE QUESTION IS THE PAINT *UNDER* THE CARRIER (#1155). Asking resolveBackdrop about the carrier's
  // PARENT reads the right colour and the WRONG box: the paint-layer veto then runs against the parent's
  // rect and the parent's subtree, so the carrier's own indicator — and any sibling that never touches
  // the carrier — counted as paint between the carrier and its base. Measured live on Settings ->
  // Appearance (2026-09-02): all three surviving cohorts came back unresolved(paint-layer-over-base)
  // naming the checked cell's own contentless absolute Radio.Indicator, and that alone held every Config
  // design-audit at population-verdict=NO-VERDICT. resolveBackdropUnder asks the question the rule means;
  // a layer genuinely between the base and the carrier's box still refuses.
  var QUIET_NO_OWN_FILL = "no-own-fill";
  function fillContrast(el) {
    var own = parseRgb(getComputedStyle(el).backgroundColor);
    if (own === null || own.a <= 0) return QUIET_NO_OWN_FILL;
    // The walk keeps every translucent ancestor in the stack before producing the flat color actually
    // beneath this state. Skipping those layers would compare against a color nobody sees.
    var backdrop = resolveBackdropUnder(el);
    if (backdrop.kind !== "flat") return null;
    var visibleOwn = compositeOver(own, backdrop.color);
    var ownLum = relLum(visibleOwn);
    var baseLum = relLum(backdrop.color);
    var hi = Math.max(ownLum, baseLum);
    var lo = Math.min(ownLum, baseLum);
    return {
      contrast: Math.round(((hi + WCAG_OFFSET) / (lo + WCAG_OFFSET)) * QUIET_SCALE) / QUIET_SCALE,
    };
  }

  // THE PARTITION MUST BE INDEPENDENT OF THE AXIS IT PARTITIONS (#1068). An authored cohort is split a
  // second time by paint context so a comparison never crosses one — but the context resolved from the
  // subject's OWN parent is state-derived on exactly the components this rule exists for, so the split
  // was a restatement of the ON/OFF axis and the cohort could only ever come out one-sided:
  //
  //   Settings -> Appearance: switch-thumb's nearest opaque ancestor IS switch-root, whose fill is the
  //     track — three ON thumbs over oklch(0.72 0.175 52), seven OFF thumbs over the dim track. Measured
  //     withheld(unmatchedOn=1 unmatchedOff=1) with both twins on screen.
  //   Characters, bulk mode: the checked row's [data-slot=list-row-root][data-selected] carries a 10%
  //     ember tint, so one cohort of ten row checkboxes resolved two backdrops (35,20,9 vs 11,8,7).
  //
  // So the partition resolves ABOVE every state carrier in the subject's own chain — the context the
  // whole component sits in, which is what "do not cross paint contexts" means — while the CONTRAST is
  // still measured against the real backdrop a user sees, state tint included. #987's one-sided ruling is
  // UNCHANGED: two differently-painted panels are still two contexts and a genuinely twin-less cohort is
  // still withheld. What changed is its INPUT — which carriers share one context.
  var QUIET_STATE_CARRIER_SEL =
    "[data-checked],[data-unchecked],[data-selected],[data-unselected],[data-current],[data-not-current],[data-pressed],[data-unpressed],[data-active],[data-inactive],[aria-checked],[aria-selected],[aria-pressed],[aria-current]";
  var QUIET_CONTEXT_MAX_LEVELS = 24;
  function stateIndependentContext(el) {
    var context = el.parentElement;
    var levels = 0;
    for (var anc = el.parentElement; anc !== null && anc !== document.body && levels < QUIET_CONTEXT_MAX_LEVELS; anc = anc.parentElement, levels += 1) {
      if (anc.matches(QUIET_STATE_CARRIER_SEL)) context = anc.parentElement;
    }
    return context;
  }
  function contextBackdropKey(el) {
    var context = stateIndependentContext(el);
    if (context === null) return null;
    // resolveBackdropAt, not resolveBackdrop: a partition key describes the surface the whole component
    // sits on, and the painted things INSIDE that container are what it backs — vetoing on them made
    // every populated context unresolvable (#1155). Its own fill stays in the key, so two
    // differently-painted panels are still two contexts (#1068's anti-collapse fence).
    var backdrop = resolveBackdropAt(context);
    if (backdrop.kind !== "flat") return null;
    return [backdrop.color.r, backdrop.color.g, backdrop.color.b, backdrop.color.a].join(",");
  }

  var onEls = document.querySelectorAll("[data-checked]");
  var offEls = document.querySelectorAll("[data-unchecked]");
  var quietAuthoredCohorts = new Map();
  // This census only ever reads data-checked/data-unchecked, so every subject's state KIND is "checked" —
  // the shape census-selection.ts's isNestedStatePart compares its nearest state-carrying ancestor to.
  var QUIET_CHECKED_STATE = { kind: "checked" };
  function addQuietState(el, state) {
    if (!isVisible(el)) return;
    var contrast = fillContrast(el);
    var key = authoredTargetClaim(el) + "|home=" + authoredTargetHome(el);
    var cohort = quietAuthoredCohorts.get(key);
    if (cohort === undefined) {
      cohort = [];
      quietAuthoredCohorts.set(key, cohort);
    }
    cohort.push({
      state: state,
      part: isNestedStatePart(el, QUIET_CHECKED_STATE),
      contrast: contrast,
      context: contextBackdropKey(el),
      selector: describe(el),
    });
  }
  for (var oi2 = 0; oi2 < onEls.length; oi2 += 1) {
    addQuietState(onEls[oi2], "on");
  }
  for (var fi = 0; fi < offEls.length; fi += 1) {
    addQuietState(offEls[fi], "off");
  }
  // A cohort that paints NO fill at all is closed evidence that the ordering rule has no subject there
  // (excluded); one whose paint or context could not be resolved is a missing measurement (withheld).
  // Resolved states then partition by state-independent paint context; every one-sided partition is
  // explicit withholding.
  quietAuthoredCohorts.forEach(function (authoredCohort) {
    var unfilled = 0;
    for (var fillIndex = 0; fillIndex < authoredCohort.length; fillIndex += 1) {
      if (authoredCohort[fillIndex].contrast === QUIET_NO_OWN_FILL) unfilled += 1;
    }
    if (unfilled === authoredCohort.length) {
      relationalAccounting["quiet-state"].candidates += 1;
      excludeRelational(relationalAccounting["quiet-state"], "noOwnFill");
      return;
    }
    // A cohort only SOME of whose members paint is deliberately still withheld: ranking a measured
    // loudness against an unmeasured one is the fabricated comparison #987 refuses.
    if (unfilled > 0 || authoredCohort.some(function (entry) { return entry.contrast === null || entry.context === null; })) {
      relationalAccounting["quiet-state"].candidates += 1;
      withholdRelational(relationalAccounting["quiet-state"], "unresolved", authoredCohort[0].selector);
      return;
    }
    var byContext = new Map();
    for (var quietIndex = 0; quietIndex < authoredCohort.length; quietIndex += 1) {
      var quietEntry = authoredCohort[quietIndex];
      var contextCohort = byContext.get(quietEntry.context);
      if (contextCohort === undefined) {
        contextCohort = [];
        byContext.set(quietEntry.context, contextCohort);
      }
      contextCohort.push(quietEntry);
    }
    byContext.forEach(function (cohort) {
      relationalAccounting["quiet-state"].candidates += 1;
      var on = 0;
      var off = 0;
      var offSelector = null;
      var parts = 0;
      for (var quietMember = 0; quietMember < cohort.length; quietMember += 1) {
        var member = cohort[quietMember];
        if (member.part) parts += 1;
        if (member.state === "on" && member.contrast.contrast > on) on = member.contrast.contrast;
        if (member.state === "off" && member.contrast.contrast > off) {
          off = member.contrast.contrast;
          offSelector = member.selector;
        }
      }
      // A ONE-SIDED COHORT OF COMPONENT PARTS IS A CLOSED FACT, NOT MISSING EVIDENCE (#1155, the #1150
      // vocabulary one rule over). A part carries no aria state of its own and republishes its root's, and
      // Base UI's Radio.Indicator defaults keepMounted:false — the OFF twin is never rendered, so there is
      // nothing withholding could ever be waiting for. This is deliberately NOT census-selection.ts's
      // blanket part exclusion: quiet-state ranks PAINT, and a part that mounts in BOTH states paints two
      // real fills, so Switch.Thumb keeps its own judged cohort (#1068's control). Only the one-sided,
      // all-parts case closes. A one-sided cohort with any real CARRIER in it is still withheld (#987).
      if ((on === 0 || off === 0) && parts === cohort.length) {
        excludeRelational(relationalAccounting["quiet-state"], "nestedStatePart");
        return;
      }
      if (on === 0) {
        withholdRelational(relationalAccounting["quiet-state"], "unmatchedOff", cohort[0].selector);
        return;
      }
      if (off === 0 || offSelector === null) {
        withholdRelational(relationalAccounting["quiet-state"], "unmatchedOn", cohort[0].selector);
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
