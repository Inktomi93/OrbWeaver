// The design-audit IN-PAGE FACT WALKER — a raw JS string evaluated in the probe page (see
// _shared/browser.ts for why a string, not a function). It only GATHERS raw samples
// (computed-style values, geometry, censuses); every severity/threshold verdict lives in
// ../lib/checks-* so the decisions stay unit-testable without a browser. The few
// walker-side predicates (nested-card shape, gradient-text shape, overshoot beziers,
// structural-signature grouping) are bounded FACT filters following the original walker's
// nestedCards/gradientTexts precedent — their verdicts are still pass-throughs in checks.
//
// SEGMENTED, NOT REWRITTEN (P3 of #393): the IIFE exceeds the tooling-size cap as one file, so it is
// split by rule family under ops/walker/ and concatenated here IN ORDER — one function scope, so the
// cross-segment references (describe, isVisible, parseRgb, resolveBackdrop, allEls, textEls…) behave
// exactly as in the pre-split monolith. The byte-equality of the composition against the monolith was
// proven at the split (the P2 slicer-artifact fence, replayed).
//
// ORDER IS LOAD-BEARING, AND FUNCTION HOISTING DOES NOT SAVE IT. Every segment shares one function
// body, so a `function foo(){}` in a later segment IS callable from an earlier one — but the `var`
// constants those functions close over are hoisted UNDEFINED and only initialize when their own line
// runs. `authoredTargetClaim` reads `TARGET_VARIANT_ATTRS`; `authoredTargetHome` reads
// `TARGET_HOME_MAX`. Calling either before WALKER_TARGET_IDENTITY's lines have executed throws on
// `undefined.length`, so that segment now sits immediately after WALKER_CORE (its only external
// dependency is CORE's `INTERACTIVE_SELECTOR`) rather than after WALKER_CENSUS_TEXT — which is what
// lets the TEXT census carry authored identity and group its findings by authored decision.
//
// PROVENANCE / ATTRIBUTION: the sample families marked "impeccable" adapt detection
// recipes from pbakaus/impeccable (https://github.com/pbakaus/impeccable,
// cli/engine/rules/checks.mjs — Copyright 2025 Paul Bakaus, Apache License 2.0). The code is
// re-written for this walker's raw-facts-only architecture and MODIFIED against orbweaver law
// (token-ramp bindings, sanctioned-effect exemptions) — see
// tooling/src/ui-audit/IMPECCABLE-ADOPTION.md for the full 59-rule
// triage, the divergences, and the license statement.

import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { CENSUS_OBSERVE_CEILING_MS, CENSUS_OBSERVE_MIN_MS, CENSUS_SETTLE_POLL_MS } from "../lib/budgets.ts";
import { WALKER_ACCESSIBLE_NAME } from "./walker/accessible-name.ts";
import { WALKER_CENSUS_ACCENT } from "./walker/census-accent.ts";
import { WALKER_CENSUS_BORDER } from "./walker/census-border.ts";
import { WALKER_CENSUS_COHORT } from "./walker/census-cohort.ts";
import { WALKER_CENSUS_COLLISION } from "./walker/census-collision.ts";
import { WALKER_CENSUS_DECOR } from "./walker/census-decor.ts";
import { WALKER_CENSUS_FRAME } from "./walker/census-frame.ts";
import { WALKER_CENSUS_GLOW } from "./walker/census-glow.ts";
import { WALKER_CENSUS_GRID } from "./walker/census-grid.ts";
import { WALKER_CENSUS_INTERACTIVE } from "./walker/census-interactive.ts";
import { WALKER_CENSUS_INTERACTIVE_NAVIGABILITY } from "./walker/census-interactive-navigability.ts";
import { WALKER_CENSUS_OCCLUSION } from "./walker/census-occlusion.ts";
import { WALKER_CENSUS_QUALITY } from "./walker/census-quality.ts";
import { WALKER_CENSUS_REGION } from "./walker/census-region.ts";
import { WALKER_CENSUS_SELECTION } from "./walker/census-selection.ts";
import { WALKER_CENSUS_TEXT } from "./walker/census-text.ts";
import { WALKER_CENSUS_TIER } from "./walker/census-tier.ts";
import { WALKER_CORE } from "./walker/core.ts";
import { WALKER_HIT_EXTENT } from "./walker/hit-extent.ts";
import { WALKER_OBSCURED_REACH } from "./walker/obscured-reach.ts";
import { WALKER_RESOLVE } from "./walker/resolve.ts";
import { WALKER_RETURNS } from "./walker/returns.ts";
import { WALKER_STATE_GLOW } from "./walker/state-glow.ts";
import { WALKER_STATE_PAINT } from "./walker/state-paint.ts";
import { WALKER_TARGET_IDENTITY } from "./walker/target-identity.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

/** WALKER_CORE's mutation observer calls this, but the declaration lived inside PRE_WALK_SETTLE — so any
 *  OTHER page pass that reuses WALKER_CORE (ops/hover.ts's forced-state pass) would install an observer
 *  whose callback throws `mutationCarriesElement is not defined` on the first DOM change, and an async
 *  throw inside an observer surfaces as a page error, which this instrument reports as a P0 script-error
 *  finding. One home, prepended to both compositions; order and scope are unchanged for the main walk. */
export const WALKER_MUTATION_CARRIES = `  function mutationCarriesElement(record) {
    var nodes = [].slice.call(record.addedNodes).concat([].slice.call(record.removedNodes));
    for (var mn = 0; mn < nodes.length; mn += 1) {
      var mutationNode = nodes[mn];
      if (mutationNode.nodeType === 1 || (mutationNode.querySelector && mutationNode.querySelector("*") !== null)) return true;
    }
    return false;
  }
`;

/** Settle and census execute in ONE page task. A Node-side wait followed by a second evaluate leaves a
 *  same-count replacement gap between "settled" and the identity snapshot — precisely the blindness #976
 *  closes. Child-list revision joins element count so replacement cannot masquerade as quiet. */
const PRE_WALK_SETTLE = `  var preWalkRevision = 0;
  var preWalkMutationCount = 0;
${WALKER_MUTATION_CARRIES}  var preWalkObserver = new MutationObserver(function (records) {
    for (var pm = 0; pm < records.length; pm += 1) {
      if (!mutationCarriesElement(records[pm])) continue;
      preWalkRevision += 1;
      preWalkMutationCount += 1;
    }
  });
  preWalkObserver.observe(document.documentElement, { childList: true, subtree: true });
  var preWalkStarted = Date.now();
  var preWalkLatest = document.getElementsByTagName("*").length;
  var preWalkLastRevision = preWalkRevision;
  var preWalkHeld = false;
  while (Date.now() - preWalkStarted < ${CENSUS_OBSERVE_CEILING_MS}) {
    await new Promise(function (resolve) { setTimeout(resolve, ${CENSUS_SETTLE_POLL_MS}); });
    var preWalkCurrent = document.getElementsByTagName("*").length;
    preWalkHeld = preWalkCurrent === preWalkLatest && preWalkRevision === preWalkLastRevision;
    preWalkLatest = preWalkCurrent;
    preWalkLastRevision = preWalkRevision;
    if (preWalkHeld && Date.now() - preWalkStarted >= ${CENSUS_OBSERVE_MIN_MS}) break;
  }
  var preWalkPending = preWalkObserver.takeRecords();
  for (var pp = 0; pp < preWalkPending.length; pp += 1) {
    if (!mutationCarriesElement(preWalkPending[pp])) continue;
    preWalkRevision += 1;
    preWalkMutationCount += 1;
    preWalkHeld = false;
  }
  preWalkObserver.disconnect();
  var preWalkSettlement = {
    count: preWalkLatest,
    stabilized: preWalkHeld,
    mutations: preWalkMutationCount,
  };
`;

// WALKER_CENSUS_FRAME sits immediately after WALKER_CORE and before every census that scrolls: it
// measures the page's RESTING frame against the viewport, and it reads only CORE's primitives, so its
// placement owes nothing to a later segment's `var` vocabulary (its own header carries the ruling).
//
// WALKER_OBSCURED_REACH sits immediately after WALKER_CENSUS_COLLISION, whose function-scope half it
// is: it reads that segment's `relationalAccounting` and writes the `obscured-target` row back into it.
// It is a sibling FILE rather than an arm inside that one because the compositor-reach mechanism is its
// own subject with its own committed proof (ops/walker/obscured-reach.ts's header states the #2491 mirror
// this closed); the composition order is what makes the split free.
//
// WALKER_STATE_PAINT + WALKER_STATE_GLOW sit immediately after WALKER_RESOLVE, IN THAT ORDER, in BOTH
// compositions (here and ops/hover.ts): their functions call RESOLVE's `parseRgb`/`resolveBackdrop` and
// CORE's `describe` (call-time resolution — safe), and their `var` vocabulary (STATE_PAINT_ATTRS,
// STATE_VARIANT_TRANSFORM_RE; PSEUDOS, GLOW_LAYER_INSET_TOLERANCE_PX, ctaGlowResolvedCache) must be
// INITIALIZED before WALKER_CENSUS_DECOR and WALKER_CENSUS_GLOW read it — the exact "var hoists
// UNDEFINED" ordering rule stated above. The pair is TWO files because state-paint.ts reached the
// `tooling-size` cap and the glow vocabulary was its one self-contained third (#2494,
// docs/law/Core-Tooling-Law.md §4.3); the composition order makes that split free, as for
// WALKER_OBSCURED_REACH above.
export const COLLECT_SAMPLES_JS = `(async () => {
${PRE_WALK_SETTLE}${WALKER_CORE}${WALKER_CENSUS_FRAME}${WALKER_TARGET_IDENTITY}${WALKER_RESOLVE}${WALKER_STATE_PAINT}${WALKER_STATE_GLOW}${WALKER_CENSUS_TEXT}${WALKER_HIT_EXTENT}${WALKER_ACCESSIBLE_NAME}${WALKER_CENSUS_INTERACTIVE}${WALKER_CENSUS_INTERACTIVE_NAVIGABILITY}${WALKER_CENSUS_BORDER}${WALKER_CENSUS_DECOR}${WALKER_CENSUS_ACCENT}${WALKER_CENSUS_GLOW}${WALKER_CENSUS_QUALITY}${WALKER_CENSUS_COLLISION}${WALKER_OBSCURED_REACH}${WALKER_CENSUS_OCCLUSION}${WALKER_CENSUS_COHORT}${WALKER_CENSUS_SELECTION}${WALKER_CENSUS_REGION}${WALKER_CENSUS_TIER}${WALKER_CENSUS_GRID}${WALKER_RETURNS}})()`;
