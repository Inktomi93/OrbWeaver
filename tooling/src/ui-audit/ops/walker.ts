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
// PROVENANCE / ATTRIBUTION: the sample families marked "impeccable" adapt detection
// recipes from pbakaus/impeccable (https://github.com/pbakaus/impeccable,
// cli/engine/rules/checks.mjs — Copyright 2025 Paul Bakaus, Apache License 2.0). The code is
// re-written for this walker's raw-facts-only architecture and MODIFIED against orbweaver law
// (token-ramp bindings, sanctioned-effect exemptions) — see
// .claude/skills/side-eye-design-review/reference/impeccable-adoption.md for the full 59-rule
// triage, the divergences, and the license statement.

import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { CENSUS_OBSERVE_CEILING_MS, CENSUS_OBSERVE_MIN_MS, CENSUS_SETTLE_POLL_MS } from "../lib/budgets.ts";
import { WALKER_CENSUS_COHORT } from "./walker/census-cohort.ts";
import { WALKER_CENSUS_COLLISION } from "./walker/census-collision.ts";
import { WALKER_CENSUS_DECOR } from "./walker/census-decor.ts";
import { WALKER_CENSUS_INTERACTIVE } from "./walker/census-interactive.ts";
import { WALKER_CENSUS_QUALITY } from "./walker/census-quality.ts";
import { WALKER_CENSUS_TEXT } from "./walker/census-text.ts";
import { WALKER_CORE } from "./walker/core.ts";
import { WALKER_HIT_EXTENT } from "./walker/hit-extent.ts";
import { WALKER_RESOLVE } from "./walker/resolve.ts";
import { WALKER_RETURNS } from "./walker/returns.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

/** Settle and census execute in ONE page task. A Node-side wait followed by a second evaluate leaves a
 *  same-count replacement gap between "settled" and the identity snapshot — precisely the blindness #976
 *  closes. Child-list revision joins element count so replacement cannot masquerade as quiet. */
const PRE_WALK_SETTLE = `  var preWalkRevision = 0;
  var preWalkMutationCount = 0;
  function mutationCarriesElement(record) {
    var nodes = [].slice.call(record.addedNodes).concat([].slice.call(record.removedNodes));
    for (var mn = 0; mn < nodes.length; mn += 1) {
      var mutationNode = nodes[mn];
      if (mutationNode.nodeType === 1 || (mutationNode.querySelector && mutationNode.querySelector("*") !== null)) return true;
    }
    return false;
  }
  var preWalkObserver = new MutationObserver(function (records) {
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

export const COLLECT_SAMPLES_JS = `(async () => {
${PRE_WALK_SETTLE}${WALKER_CORE}${WALKER_RESOLVE}${WALKER_CENSUS_TEXT}${WALKER_HIT_EXTENT}${WALKER_CENSUS_INTERACTIVE}${WALKER_CENSUS_DECOR}${WALKER_CENSUS_QUALITY}${WALKER_CENSUS_COLLISION}${WALKER_CENSUS_COHORT}${WALKER_RETURNS}})()`;
