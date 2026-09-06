// ui-audit in-page walker — segment: SELECTED/UNSELECTED paint deltas (#984).
//
// WHY THIS IS SEPARATE. Selection census is a surface-wide relation with its own pairing and computed-
// paint vocabulary. Keeping it in census-cohort.ts pushed that sibling/row segment toward the tooling
// cap and made the state-pairing seam impossible to review. ops/walker.ts concatenates both strings into
// one IIFE, so this split adds no browser boundary or copied machinery.
//
// THE COHORT IS AN AUTHORED HOME, NOT A PARENT NODE (#1059). This was the one relational family still
// keyed on the raw `choice.parentElement`, and a parent node is an INSTANCE — the exact thing
// `ops/walker/target-identity.ts` exists to stop ("Selector strings are presentation and contain
// nth-of-type instance positions; grouping them would turn one repeated component into N fake repairs").
// A VIRTUALIZED grid proves the cost: Settings -> Appearance's Background picker ALWAYS has exactly one
// selected tile (`appearance-background-section.tsx`'s `selectedTileKey` lights the `none` tile when no
// background is chosen), but MediaGrid renders its cells under one `[data-slot=media-grid-row]` wrapper
// PER ROW — so row 0 paired 1 selected against 7 unselected and JUDGED, while row 1 held 7 unselected
// with no twin and WITHHELD `unmatchedUnselected`, turning a surface whose twin was ON SCREEN into a
// permanent NO VERDICT. The key is now `claim + home + state` — the same shape census-region.ts's
// quiet-state cohorts already use — so one authored cohort stays one cohort across presentation
// wrappers. #987's one-sided ruling is UNCHANGED: a genuinely twin-less cohort of two or more carriers
// is still withheld. What changed is its INPUT — which carriers ARE one cohort.
//
// A COMPONENT PART IS NOT A CHOICE (#1150) — the same ruling, the same shape of correction, one layer
// down. Base UI publishes its state vocabulary on EVERY PART of a component, not only on the root that
// owns the decision: `Radio.Indicator` republishes the root's `data-checked`/`data-unchecked`
// (docs/vendor/base-ui/components/radio.md, Root :433 vs Indicator :492) and its `keepMounted` defaults
// to FALSE, so the indicator EXISTS ONLY WHILE CHECKED and can never have an unselected twin. Measured on
// the live Settings -> Appearance: the two `[data-slot=radio-group-picker-item-check]` spans formed a
// 2-selected/0-unselected cohort and withheld `unmatchedSelected`, which made EVERY Config design-audit
// print population-verdict=NO-VERDICT — while the ratified picker cells they sit inside (#981) were paired
// and judged correctly all along. `Switch.Thumb` is the same defect from the other side: it duplicated the
// `switch-root` cohort and got judged TWICE for one authored decision, as did `list-row-body` inside
// `list-row-root`.
//
// THE TELL IS THE ARIA STATE, NOT THE NESTING. The element that owns the choice publishes it to the
// accessibility tree — role=radio/switch/checkbox + `aria-checked`, `aria-selected`, `aria-pressed`,
// `aria-current`; a PART carries only the `data-*` paint hook it needs for `data-checked:` selectors. So a
// carrier with no aria selection state of its own, whose NEAREST state-carrying ancestor asserts the SAME
// state kind, is that ancestor's presentation and is EXCLUDED (`nestedStatePart` — closed, printed, still
// in the denominator), never withheld. A genuinely nested INDEPENDENT control keeps its own aria state and
// keeps its own cohort; a genuinely one-sided cohort of real carriers is still withheld (#987 :208 intact).
//
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string,
// not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_CENSUS_SELECTION = `  // ── selection idiom: authored STATE DELTAS, surface-wide ────────────────
  // Absolute paint is not a selection idiom: cards have fills, borders, and shadows while unselected.
  // Pair each selected target with an unselected twin from the same authored claim and HOME, then
  // census only the channels that CHANGE. Aggregate all five Base UI state kinds after pairing; splitting
  // them into one-element buckets makes a surface with three vocabularies look like three clean zeros.
  var selectionIdioms = [];
  relationalAccounting["selection-idiom"] = { candidates: 0, judged: 0, withheld: {}, excluded: {} };
  // One carrier cannot express a comparison population. Two carriers assert an authored cohort, so a
  // one-sided pair is real missing twin evidence rather than an N/A singleton.
  var SELECT_COMPARISON_MIN_MEMBERS = 2;
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

  // The four ARIA state attributes that publish "this one is chosen" to the a11y tree. Presence alone is
  // the test — an \`aria-checked="false"\` is still the element ASSERTING it owns the choice. Base UI puts
  // these on the root only; its parts get the data-* hook and nothing else.
  var ARIA_SELECTION_STATE_ATTRS = ["aria-checked", "aria-selected", "aria-pressed", "aria-current"];

  function ownsAriaSelectionState(el) {
    for (var ariaIndex = 0; ariaIndex < ARIA_SELECTION_STATE_ATTRS.length; ariaIndex += 1) {
      if (el.hasAttribute(ARIA_SELECTION_STATE_ATTRS[ariaIndex])) return true;
    }
    return false;
  }

  // NEAREST state-carrying ancestor, not any ancestor: a picker cell inside a selected list row is still a
  // choice of its own, and only the ancestor that owns the SAME state kind can be re-publishing itself.
  function isNestedStatePart(el, state) {
    if (ownsAriaSelectionState(el)) return false;
    for (var partAnc = el.parentElement; partAnc !== null && partAnc !== document.body; partAnc = partAnc.parentElement) {
      var carrier = selectionState(partAnc);
      if (carrier === null) continue;
      return carrier.kind === state.kind;
    }
    return false;
  }

  function samePaintColor(a, b) {
    var left = parseRgb(a);
    var right = parseRgb(b);
    if (left === null || right === null) return a === b;
    return left.r === right.r && left.g === right.g && left.b === right.b && left.a === right.a;
  }

  // TOP-LEVEL-COMMA SPLIT (not a bare \`.split(",")\`): a serialized shadow colour can itself carry a
  // comma (\`rgb(220, 38, 38)\`), which a naive split would cut mid-layer.
  function boxShadowLayers(value) {
    if (!value || value === "none") return [];
    var layers = [];
    var depth = 0;
    var start = 0;
    for (var bi = 0; bi < value.length; bi += 1) {
      var bc = value.charAt(bi);
      if (bc === "(") depth += 1;
      else if (bc === ")") depth -= 1;
      else if (bc === "," && depth === 0) {
        layers.push(value.slice(start, bi).trim());
        start = bi + 1;
      }
    }
    layers.push(value.slice(start).trim());
    return layers;
  }
  var SHADOW_INSET_RE = /(^|\\s)inset(\\s|$)/;
  function boxShadowPart(value, wantInset) {
    return boxShadowLayers(value)
      .filter(function (layer) { return SHADOW_INSET_RE.test(layer) === wantInset; })
      .join(",");
  }

  function selectionDeltaSignature(selectedEl, baseEl) {
    var st = getComputedStyle(selectedEl);
    var base = getComputedStyle(baseEl);
    var channels = [];
    var outline = parseFloat(st.outlineWidth);
    var outlineChanged =
      st.outlineWidth !== base.outlineWidth || st.outlineStyle !== base.outlineStyle || !samePaintColor(st.outlineColor, base.outlineColor);
    if (!Number.isNaN(outline) && outline >= SELECT_RING_MIN_PX && st.outlineStyle !== "none" && outlineChanged) channels.push("ring");
    // THE RATIFIED PERSISTENT-STATE RING IS INSET (#1076, orb-ui audit F4): \`data-pressed:inset-ring-2
    // inset-ring-ring\` (toggle/variants.ts:19) is a box-shadow layer carrying the literal substring
    // \`inset\`, which the old single test vetoed WHOLESALE — a control offering only an inset ring, or a
    // mixed inset+outer box-shadow (the ratified ring composes alongside the outer focus-visible
    // \`ring-*\`), never registered any shadow channel at all. Inset and outer shadow layers are now two
    // INDEPENDENT channels, each firing only on ITS OWN part changing — an outer ring unchanged between
    // the selected and base sample (e.g. an identical at-rest focus placeholder on both) is not
    // double-counted just because the inset part changed alongside it.
    var stInset = boxShadowPart(st.boxShadow, true);
    var baseInset = boxShadowPart(base.boxShadow, true);
    if (stInset !== "" && stInset !== baseInset) channels.push("inset-ring");
    var stOuterShadow = boxShadowPart(st.boxShadow, false);
    var baseOuterShadow = boxShadowPart(base.boxShadow, false);
    if (stOuterShadow !== "" && stOuterShadow !== baseOuterShadow) channels.push("shadow");
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
    var groupKey = authoredTargetClaim(choice) + "|home=" + authoredTargetHome(choice) + "|state=" + state.kind;
    var group = selectionGroups.get(groupKey);
    if (group === undefined) {
      group = { kind: state.kind, selected: [], unselected: [], parts: 0 };
      selectionGroups.set(groupKey, group);
    }
    if (isNestedStatePart(choice, state)) group.parts += 1;
    else if (state.selected) group.selected.push(choice);
    else group.unselected.push(choice);
  }

  var selectionTreatments = new Map();
  var selectionKinds = new Set();
  var selectionTotal = 0;
  selectionGroups.forEach(function (group) {
    relationalAccounting["selection-idiom"].candidates += 1;
    // A cohort with no carriers at all is a component's parts republishing their root's state — closed
    // evidence that the rule does not apply here, and it is checked FIRST so a part cohort can never be
    // mistaken for a thin population (list-row-body) or for missing twin evidence (Radio.Indicator).
    if (group.selected.length + group.unselected.length === 0) {
      excludeRelational(relationalAccounting["selection-idiom"], "nestedStatePart");
      return;
    }
    if (group.selected.length + group.unselected.length < SELECT_COMPARISON_MIN_MEMBERS) {
      excludeRelational(relationalAccounting["selection-idiom"], "insufficientPopulation");
      return;
    }
    if (group.selected.length === 0) {
      withholdRelational(relationalAccounting["selection-idiom"], "unmatchedUnselected", describe(group.unselected[0]));
      return;
    }
    if (group.unselected.length === 0) {
      withholdRelational(relationalAccounting["selection-idiom"], "unmatchedSelected", describe(group.selected[0]));
      return;
    }
    relationalAccounting["selection-idiom"].judged += 1;
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
