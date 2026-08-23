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
import { WALKER_CENSUS_DECOR } from "./walker/census-decor.ts";
import { WALKER_CENSUS_INTERACTIVE } from "./walker/census-interactive.ts";
import { WALKER_CENSUS_QUALITY } from "./walker/census-quality.ts";
import { WALKER_CENSUS_TEXT } from "./walker/census-text.ts";
import { WALKER_CORE } from "./walker/core.ts";
import { WALKER_RESOLVE } from "./walker/resolve.ts";
import { WALKER_RETURNS } from "./walker/returns.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

export const COLLECT_SAMPLES_JS = `(async () => {
${WALKER_CORE}${WALKER_RESOLVE}${WALKER_CENSUS_TEXT}${WALKER_CENSUS_INTERACTIVE}${WALKER_CENSUS_DECOR}${WALKER_CENSUS_QUALITY}${WALKER_RETURNS}})()`;
