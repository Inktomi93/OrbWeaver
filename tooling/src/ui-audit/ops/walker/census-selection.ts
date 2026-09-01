// ui-audit in-page walker — segment: SELECTED/UNSELECTED paint deltas (#984).
//
// WHY THIS IS SEPARATE. Selection census is a surface-wide relation with its own pairing and computed-
// paint vocabulary. Keeping it in census-cohort.ts pushed that sibling/row segment toward the tooling
// cap and made the state-pairing seam impossible to review. ops/walker.ts concatenates both strings into
// one IIFE, so this split adds no browser boundary or copied machinery.
//
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string,
// not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

export const WALKER_CENSUS_SELECTION = `  // ── selection idiom: authored STATE DELTAS, surface-wide ────────────────
  // Absolute paint is not a selection idiom: cards have fills, borders, and shadows while unselected.
  // Pair each selected target with an unselected twin from the same authored claim and parent, then
  // census only the channels that CHANGE. Aggregate all five Base UI state kinds after pairing; splitting
  // them into one-element buckets makes a surface with three vocabularies look like three clean zeros.
  var selectionIdioms = [];
  var SELECT_MIN_ELS = 3;
  var SELECT_RING_MIN_PX = 1;
  var SELECT_BAR_MIN_PX = 2;

  function selectionState(el) {
    if (el.hasAttribute("data-checked") || el.getAttribute("aria-checked") === "true") return { kind: "checked", selected: true };
    if (el.hasAttribute("data-unchecked") || el.getAttribute("aria-checked") === "false") return { kind: "checked", selected: false };
    if (el.hasAttribute("data-selected") || el.getAttribute("aria-selected") === "true") return { kind: "selected", selected: true };
    if (el.hasAttribute("data-unselected") || el.getAttribute("aria-selected") === "false") return { kind: "selected", selected: false };
    var current = el.getAttribute("aria-current");
    if (el.hasAttribute("data-current") || (current !== null && current !== "false")) return { kind: "current", selected: true };
    if (el.hasAttribute("data-not-current") || current === "false") return { kind: "current", selected: false };
    if (el.hasAttribute("data-pressed") || el.getAttribute("aria-pressed") === "true") return { kind: "pressed", selected: true };
    if (el.hasAttribute("data-unpressed") || el.getAttribute("aria-pressed") === "false") return { kind: "pressed", selected: false };
    if (el.hasAttribute("data-active")) return { kind: "active", selected: true };
    if (el.hasAttribute("data-inactive")) return { kind: "active", selected: false };
    return null;
  }

  function samePaintColor(a, b) {
    var left = parseRgb(a);
    var right = parseRgb(b);
    if (left === null || right === null) return a === b;
    return left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a;
  }

  function selectionDeltaSignature(selectedEl, baseEl) {
    var st = getComputedStyle(selectedEl);
    var base = getComputedStyle(baseEl);
    var channels = [];
    var outline = parseFloat(st.outlineWidth);
    var outlineChanged =
      st.outlineWidth !== base.outlineWidth || st.outlineStyle !== base.outlineStyle || !samePaintColor(st.outlineColor, base.outlineColor);
    if (!Number.isNaN(outline) && outline >= SELECT_RING_MIN_PX && st.outlineStyle !== "none" && outlineChanged) channels.push("ring");
    if (st.boxShadow && st.boxShadow !== "none" && st.boxShadow.indexOf("inset") === -1 && st.boxShadow !== base.boxShadow) channels.push("shadow");
    var bg = parseRgb(st.backgroundColor);
    if (bg !== null && bg.a > 0 && !samePaintColor(st.backgroundColor, base.backgroundColor)) channels.push("fill");
    var sides = ["Top", "Right", "Bottom", "Left"];
    var thick = [];
    for (var sideIndex = 0; sideIndex < sides.length; sideIndex += 1) {
      var side = sides[sideIndex];
      var widthName = "border" + side + "Width";
      var styleName = "border" + side + "Style";
      var colorName = "border" + side + "Color";
      var width = parseFloat(st[widthName]);
      var changed =
        st[widthName] !== base[widthName] || st[styleName] !== base[styleName] || !samePaintColor(st[colorName], base[colorName]);
      if (!Number.isNaN(width) && width >= SELECT_BAR_MIN_PX && st[styleName] !== "none" && changed) thick.push(side.toLowerCase());
    }
    if (thick.length === 1) channels.push("bar-" + thick[0]);
    else if (thick.length > 1) channels.push("border");
    var selectedUnderline = st.textDecorationLine && st.textDecorationLine.indexOf("underline") !== -1;
    var baseUnderline = base.textDecorationLine && base.textDecorationLine.indexOf("underline") !== -1;
    if (selectedUnderline && !baseUnderline) channels.push("underline");
    return channels.length === 0 ? "none" : channels.sort().join("+");
  }

  var selectionGroups = new Map();
  for (var selectionIndex = 0; selectionIndex < allEls.length; selectionIndex += 1) {
    var choice = allEls[selectionIndex];
    if (!isVisible(choice) || choice.parentElement === null) continue;
    var state = selectionState(choice);
    if (state === null) continue;
    var groupsAtParent = selectionGroups.get(choice.parentElement);
    if (groupsAtParent === undefined) {
      groupsAtParent = new Map();
      selectionGroups.set(choice.parentElement, groupsAtParent);
    }
    var groupKey = authoredTargetClaim(choice) + "|state=" + state.kind;
    var group = groupsAtParent.get(groupKey);
    if (group === undefined) {
      group = { kind: state.kind, selected: [], unselected: [] };
      groupsAtParent.set(groupKey, group);
    }
    if (state.selected) group.selected.push(choice);
    else group.unselected.push(choice);
  }

  var selectionTreatments = new Map();
  var selectionKinds = new Set();
  var selectionTotal = 0;
  selectionGroups.forEach(function (groupsAtParent) {
    groupsAtParent.forEach(function (group) {
      if (group.selected.length === 0 || group.unselected.length === 0) return;
      var baseEl = group.unselected[0];
      for (var selectedIndex = 0; selectedIndex < group.selected.length; selectedIndex += 1) {
        var selectedEl = group.selected[selectedIndex];
        var signature = selectionDeltaSignature(selectedEl, baseEl);
        if (signature === "none") continue;
        selectionTotal += 1;
        selectionKinds.add(group.kind);
        var treatment = selectionTreatments.get(signature);
        if (treatment === undefined) selectionTreatments.set(signature, { count: 1, selector: describe(selectedEl) });
        else treatment.count += 1;
      }
    });
  });

  if (selectionTotal >= SELECT_MIN_ELS) {
    var treatments = [];
    selectionTreatments.forEach(function (value, signature) {
      treatments.push({ signature: signature, count: value.count, selector: value.selector });
    });
    treatments.sort(function (a, b) { return b.count - a.count; });
    selectionIdioms.push({
      stateKinds: Array.from(selectionKinds).sort().join("+"),
      elements: selectionTotal,
      treatments: treatments.length,
      signatures: treatments.map(function (treatment) { return treatment.signature + "x" + treatment.count; }).join(" · "),
      exampleSelector: treatments.length > 1 ? treatments[treatments.length - 1].selector : treatments[0].selector,
    });
  }
`;
