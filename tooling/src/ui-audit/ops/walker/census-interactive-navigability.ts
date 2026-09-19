// ui-audit in-page walker — segment: interactive NAVIGABILITY census: tabindex smell + the coarse-pointer
// unreachable-hint census + z-index escalation. Split out of `census-interactive.ts` at the tooling-size
// cap along the REVEAL boundary: everything here runs AFTER the reveal sweep has been restored, reads only
// resolved geometry/attributes, and needs none of the tap-target probe's viewport-bound machinery.
//
// IT IS THE NEXT SEGMENT, NOT AN INDEPENDENT ONE. `ops/walker.ts` concatenates the segments IN ORDER into
// one IIFE, so this text runs in the SAME scope, immediately after `WALKER_CENSUS_INTERACTIVE`, and reads
// its hoisted `var`s (`pointerCoarse`, `allEls`) plus CORE's `isVisible`/`isDevChrome`/`describe`. Moving
// it earlier, or into a scope of its own, changes behavior. Raw JS in a template literal (no backticks /
// dollar-brace — see _shared/browser.ts for why a string, not a function). Provenance: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_CENSUS_INTERACTIVE_NAVIGABILITY = `  // \`pointerCoarse\` is declared in the segment above, #1077 — the unreachable-hint census reads it here.
  // ── tabindex smell ────────────────────────────────────────────────────────
  var tabIndexes = [];
  var tabIndexEls = document.querySelectorAll("[tabindex]");
  for (var t = 0; t < tabIndexEls.length; t += 1) {
    var tel = tabIndexEls[t];
    if (!isVisible(tel) || isDevChrome(tel)) continue;
    var raw = tel.getAttribute("tabindex");
    var val = Number(raw);
    if (!Number.isNaN(val)) tabIndexes.push({ selector: describe(tel), tabIndex: val });
  }

  // ── unreachable hint: a tooltip whose content no coarse pointer can reach (#2452) ──
  // THE MECHANISM, RE-DERIVED ON THE TREE (RULE-AUTHORING.md step 1). Base UI 1.7.0 builds the tooltip's
  // hover with mouseOnly: true and gates its focus fallback on :focus-visible, so at a COARSE pointer
  // the popup cannot be opened at all — whatever it says is reachable only if the control ALSO carries a
  // rest-readable description, a title/aria-description, the same words as its own visible text, or a
  // press-openable door. The popup is unmounted at rest, so this census cannot read the tooltip's text;
  // it reads @orb/ui's published DECISION instead (data-tooltip-describes, minted in
  // packages/ui/src/primitives/tooltip/tooltip.tsx) — name means the tooltip only repeats the control's
  // own name and there is nothing to reach, caller means the seal deliberately left the description to
  // the call site. A trigger with NO such attribute is outside the seal and the rule withholds on it.
  // Base UI omits the trigger identifier entirely on a DISABLED trigger (TooltipTrigger.js:244), so the
  // population is the vendor's own definition of an active tooltip trigger.
  var unreachableHints = [];
  var tooltipTriggers = document.querySelectorAll("[data-base-ui-tooltip-trigger]");
  for (var uh = 0; uh < tooltipTriggers.length; uh += 1) {
    var uel = tooltipTriggers[uh];
    if (!isVisible(uel) || isDevChrome(uel)) continue;
    var describedIds = String(uel.getAttribute("aria-describedby") || "").trim().split(/\s+/).filter(Boolean);
    var resolvedCount = 0;
    for (var di = 0; di < describedIds.length; di += 1) {
      var target = uel.ownerDocument.getElementById(describedIds[di]);
      if (target && String(target.textContent || "").trim().length > 0) resolvedCount += 1;
    }
    unreachableHints.push({
      selector: describe(uel),
      describesDecision: uel.getAttribute("data-tooltip-describes"),
      describedByIds: describedIds.length,
      describedByResolved: resolvedCount,
      title: uel.getAttribute("title"),
      ariaDescription: uel.getAttribute("aria-description"),
      ownText: String(uel.textContent || "").trim(),
      // The press door #2443 landed: Base UI's Popover trigger declares aria-haspopup="dialog". Read it
      // on the trigger itself OR on a descendant: a TooltipTrigger that RENDERS a PopoverTrigger and a
      // wrapped inner button both occur on this tree.
      pressDoor: uel.getAttribute("aria-haspopup") === "dialog" || uel.querySelector("[aria-haspopup='dialog']") !== null,
      coarsePointer: pointerCoarse,
    });
  }

  // ── z-index escalation (positioned elements only — z-index is inert on static) ──
  var zIndexes = [];
  for (var z = 0; z < allEls.length; z += 1) {
    var zel = allEls[z];
    if (!isVisible(zel)) continue;
    var zstyle = getComputedStyle(zel);
    if (zstyle.position === "static") continue;
    var zval = Number(zstyle.zIndex);
    if (!Number.isNaN(zval) && zval > 0) zIndexes.push({ selector: describe(zel), zIndex: zval });
  }
`;
