// ui-audit in-page walker — segment: THE FORM-CONTROL BOUNDARY CENSUS (`border-contrast`, WCAG 1.4.11).
//
// WHY IT EXISTS (#1361, folded into #1315 by the owner's ruling on the census's `--contrast-edge` row):
// snap's `--contrast-edge` arm answers the boundary question for ONE selector a caller already suspects,
// which means the defect has to be noticed by eye before the instrument can confirm it. #1361 was found
// exactly that way — the chat search field's border measured 1.69:1 dark / 1.77:1 light against the
// surround on `[aria-label="Search chats"]`, and nothing swept for it. This census asks the same question
// of EVERY form control on the surface, so the boundary a designer declared and the boundary a user can
// see stop being two different facts nobody compares.
//
// MECHANISM MATCH (tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md step 1). Two receipts, both re-derivable:
//   • the ink is authored as an OKLCH token, so the colour is read through `parseRgb` — the canvas probe
//     from ops/walker/resolve.ts (table row 1), never an rgb()/hex regex;
//   • what the border is measured AGAINST is `resolveBackdropUnder(el)` — the paint the control's own box
//     sits on, with EL's box and EL's subtree as the veto fences (table row 10). Handing `resolveBackdrop`
//     the element would return the control's OWN fill, which is the inside of the boundary, not the
//     outside, and would make every field with a distinct fill read as a clean border.
//
// THE CANDIDATE SET IS DECLARED BORDERS, NOT ALL CONTROLS. A control that declares no border is not
// claiming a boundary affordance at all (it may be separated by fill, elevation or a label), so it is
// `excluded(noDeclaredBorder)` — a closed, printed exclusion, never a silent skip. A control that DOES
// declare one has made the claim, and a declared boundary the eye cannot resolve is the defect. Inactive
// controls carry WCAG 1.4.11's own exemption through the fleet-shared `INACTIVE_KIND_EXPR`.
//
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the segments IN
// ORDER, so this one must sit AFTER WALKER_RESOLVE (`parseRgb`, `resolveBackdropUnder`) and after the core
// primitives (`isVisible`, `isDevChrome`, `describe`). Raw JS in a template literal (no backticks /
// dollar-brace — see _shared/browser.ts for why a string, not a function). Provenance: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { INACTIVE_KIND_EXPR } from "../../../_shared/wcag.ts";
import { BORDER_CONTRAST_SIDES } from "../../contract/samples-interactive.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_CENSUS_BORDER = `  // ── form-control boundary census (border-contrast, WCAG 1.4.11) ──
  var borderContrasts = [];
  // The control roles a boundary is an AFFORDANCE for: a text field, a text area, a native select, and
  // the composite triggers Base UI renders as a div carrying the role (a bare <div role=combobox> is
  // structurally invisible to a tag-only selector — tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md row 3's class, one axis over).
  var BORDER_CONTROL_SEL = "input,textarea,select,[role=combobox],[role=textbox],[role=searchbox],[role=spinbutton],[role=listbox]";
  var BORDER_SIDES = ${JSON.stringify(BORDER_CONTRAST_SIDES)};
  var borderControls = document.querySelectorAll(BORDER_CONTROL_SEL);
  for (var bc = 0; bc < borderControls.length; bc += 1) {
    var bel = borderControls[bc];
    // The offered-control vocabulary the tap-target census already uses — two vocabularies would let a
    // phantom mint a boundary finding nobody can see. Hidden native inputs (Base UI belts a visually
    // hidden <input> behind every composite) are exactly what this drops.
    if (!isVisible(bel) || isDevChrome(bel)) continue;
    if (bel.closest("[aria-hidden='true']")) continue;
    if (isVisuallyHidden(bel)) continue;
    var brect = bel.getBoundingClientRect();
    if (Math.min(brect.width, brect.height) <= 2) continue;
    var bstyle = getComputedStyle(bel);
    var borderSides = [];
    for (var bs = 0; bs < BORDER_SIDES.length; bs += 1) {
      var side = BORDER_SIDES[bs];
      var capitalized = side.charAt(0).toUpperCase() + side.slice(1);
      var bStyleValue = bstyle["border" + capitalized + "Style"] || "none";
      var bWidth = Number.parseFloat(bstyle["border" + capitalized + "Width"]) || 0;
      // \`none\`/\`hidden\` paint nothing whatever the width says; a zero width paints nothing whatever the
      // style says. Either way the side is not a declared boundary and is not carried.
      if (bWidth <= 0 || bStyleValue === "none" || bStyleValue === "hidden") continue;
      var bColor = parseRgb(bstyle["border" + capitalized + "Color"]);
      borderSides.push({
        side: side,
        widthPx: bWidth,
        style: bStyleValue,
        color: bColor === null ? null : { r: bColor.r, g: bColor.g, b: bColor.b, a: bColor.a === undefined ? 1 : bColor.a },
      });
    }
    var borderInactiveKind = (function (el) { return ${INACTIVE_KIND_EXPR}; })(bel);
    borderContrasts.push({
      selector: describe(bel),
      tag: bel.tagName.toLowerCase(),
      role: bel.getAttribute("role"),
      inactiveKind: borderInactiveKind,
      sides: borderSides,
      surround: resolveBackdropUnder(bel),
    });
  }
`;
