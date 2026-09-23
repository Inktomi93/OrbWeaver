// Pure, DOM-free classification AGGREGATION for ui-audit — collectAudit runs every sample family through
// its family checker (lib/collect-families.ts). Split from the pre-move design-audit-checks.ts (P3 of #393).
//
// WCAG contrast formula + large-text thresholds are standard WCAG 2.x math, not reinvented.
//
// PROVENANCE / ATTRIBUTION: every check whose Finding carries `origin: "impeccable"` adapts a
// detection recipe from pbakaus/impeccable (https://github.com/pbakaus/impeccable,
// cli/engine/rules/checks.mjs + registry/antipatterns.mjs — Copyright 2025 Paul Bakaus,
// Apache License 2.0), MODIFIED for orbweaver: thresholds re-bound to the live token ramp
// (`@orb/ui/tokens`), owner-sacred effect axes exempted, severities mapped to our P0–P3.
// Full rule triage + license statement:
// tooling/src/ui-audit/ops/walker/IMPECCABLE-ADOPTION.md
//
// ── THE RUNG ASSIGNMENT TABLE ────────────────────────────────────────────────────────────────────────
// COLLECTION STRATEGIES (owner ruling 2026-09-01: no gate — rule shape is a judgment call a checker
// can't make; this table is the enforcement). Pick your rung by what your samples need, not "finishing
// the migration" — rung 1 is a legitimate destination for a page-singleton, not debt. Mechanics (what
// each rung's function does, the two rung-2 doors, the reason-map semantics, the walker-filtered trap):
// lib/population-strategies.ts header.
//
// EVERY REGISTERED RULE APPEARS BELOW EXACTLY ONCE, with the reason its rung was DECIDED (#1027 closed
// the "most rules sit at rung 1 by default" residue this table used to carry). The denominator is
// contract/rules.ts; a rule added there and not added here is a rule nobody decided a rung for.
//
// RUNG 1 · nullableFindings / a bare map — no population row is published, and that is the honest shape:
//   landmark-missing          page singleton: one boolean about the document, no denominator exists
//   flat-type-hierarchy       page singleton: the page's own censused size set is the subject
//   skipped-heading           a SEQUENCE verdict over adjacent heading pairs — no per-candidate disposition
//   broken-image              WALKER-PROVEN: only proven-broken images are returned; the check is TOTAL
//   text-overflow             WALKER-PROVEN: every truncation carrying an affordance was excluded upstream (#825)
//   repeated-container-text   WALKER-PROVEN: the walker counted the repeats; every sample is a finding
//   clipped-overflow          WALKER-PROVEN: the walker measured the spill; every sample is a finding
//   edge-flush-cards          WALKER-PROVEN: the walker measured the gutter asymmetry
//   nested-card               WALKER-PROVEN: only the innermost nested cards are returned
//   gradient-text             WALKER-PROVEN: `hasGradientText` is the walker's own verdict, restated
//   animated-img-hover        WALKER-PROVEN: `hasHoverAnimation` is the walker's own verdict, restated
//   For the eight WALKER-PROVEN rows: candidates == judged == affected, so a Node-side row would restate
//   the finding count. Their real denominators live UPSTREAM and belong to a walker census
//   (`relationalAccounting`, the walker-filtered trap) — a change to ops/walker/census-*.ts, never a rung
//   bolted on here, which would report a complete-looking census the walker had already narrowed.
//
// RUNG 2a · accountedFindings — a FULL census whose checker owes every sample a verdict:
//   quiet-state               walker cohort census; samplesAreJudged
//   double-empty-state        walker region census; samplesAreJudged
//   tier-drift                walker tier census; every (element, property) pair returned, pass or fail
//   selection-idiom           walker selection census; candidates exceed returned samples by design;
//                             carried(heterogeneousRest) — cohorts with no majority rest paint, judged
//                             against the smallest delta over their distinct rest paints (#1808)
//   aria-name                 every censused interactive control is judged — the count IS the evidence
//   tabindex-positive         every censused tabindex attribute is judged
//   z-index-escalation        every censused positive z-index is judged
//   icon-tile-stack           every heading with a visible previous sibling is judged
//   reveal-coverage           accounting-only, no items/checker — census-interactive.ts's rest-hidden-
//                             reveal count is the whole rule (#1077), published as excluded(restHiddenReveal):
//                             the fine REST regime does not offer them and the coarse one judges them (#2468)
//   canvas-ink                accounting-only, no items/checker — census-collision.ts's visible-canvas
//                             count is the whole rule (#1079)
//
// RUNG 2b · partitionedFindings — the checker itself names each candidate's disposition, because `null`
// meant two different things and a bare zero conflated them:
//   control-aspect            excluded(roleWithoutSilhouette) · withheld(animating, degenerateBox)
//   unreachable-hint          excluded(finePointer, tooltipRepeatsName, hasReachableDescription,
//                             visibleOwnText, pressDoor) · withheld(noDescriptionWiring) — a fine-pointer
//                             pass measures a pointer the defect cannot exist ON, which CLOSES the
//                             question (#2468; it shipped as a withholding at #2452 and made every
//                             desktop audit a NO VERDICT), while a trigger outside the tooltip seal
//                             publishes no decision to read and leaves it open
//   border-contrast           excluded(noDeclaredBorder, inactiveExempt) · withheld(the backdrop's own
//                             unresolved reason, borderColorUnreadable) — a control that declared no
//                             boundary made no claim, and an unresolvable surround is not a clean edge
//   side-tab                  excluded(statusRegionAccent, ratifiedSelectionRail, illustratedPickerArt)
//   border-accent-on-rounded  same census, same three ratified exemptions, its own affected count
//   glow-shadow               excluded(sanctionedGlowCarrier) — keeps the exemption's REACH visible
//   distorted-image           excluded(noComparableExtent, objectFitCropsOrLetterboxes,
//                             objectFitDoesNotScale — none/scale-down scale no axis independently) ·
//                             withheld(unreadableExtent, unreadableObjectFit — input the rule cannot
//                             read is missing evidence, not a licence to convict; #1808)
//   radial-halo               excluded(sanctionedGlowCarrier) · withheld(unresolvedGradientStop — a
//                             colour-shaped stop the ONE reader declined; the surviving stops are a
//                             partial measurement, never a smaller gradient)
//   radial-spotlight-glow     the same wash census as the row above, its own affected count, and the
//                             same refusal — it belongs to the gradient, not to one rule
//   stripe-background         excluded(otherPatternKind) — one sweep, two disjoint populations
//   grid-line-background      excluded(otherPatternKind)
//   layout-transition         excluded(otherMotionKind, panelExempt) — the motion-law §3.7 carve-out, counted
//   bounce-easing             excluded(otherMotionKind)
//   line-length               excluded(notProseTag, noRenderedBox, noTypeSize) · withheld(chAdvanceUnmeasured, #464)
//   tight-leading             excluded(heading, normalKeywordLeading, noTypeSize)
//   justified-text            excluded(noOwnText)
//   all-caps-body             excluded(heading)
//   wide-tracking             excluded(capsVoice — the ratified micro-caps voice, #148 — and noTypeSize)
//   crushed-tracking          excluded(noTypeSize)
//   caveat-outweighed         excluded(srOnly, codeContext, noAuthoredCaveatClaim, notSentenceShaped)
//
// RUNG 3 · cappedRelationalFindings — a walker relational census plus a representative cap:
//   cohort-anatomy · row-void · pane-ink
//
// RUNG 4 · decisionPopulationFindings — findings repeat by AUTHORED DECISION, so one repair is one row:
//   obscured-target           collision identity pairs BOTH sides of the collision
//   truncated-to-nothing · headline-overhang · inline-padding-leak   the #816 placement-collision arms
//   promoted-layer-offset · off-grid-transform · off-grid-text       the crispness Laws 2-4 arms
//   text-below-ramp · undersized-ui-text                             the two type floors (#989)
//
// NAMED EXCEPTIONS — a bespoke accounting function, because none of the four rungs fits the population:
//   tap-target                       checkTapTargetPopulations (checks-a11y.ts) — rung-4 semantics PLUS
//                                    nested same-owner suppression into `collapsed.sameOwner`
//   duplicate-action-door            checkDuplicateDoorPopulations (checks-quality.ts) — the population is
//                                    (role, name) HOMES folded out of the door census, not the samples
//   hover-contrast                   hoverContrastPopulations (checks-hover.ts) — MERGES a Node/CDP pass's
//                                    census with the check's dispositions; its samples are gathered
//                                    outside COLLECT_SAMPLES_JS, so an absent pass publishes NO row
//   off-theme-font                   fontCensusPopulations (checks-font-census.ts) — the population is the
//                                    PAGE's censused font faces, not per-element samples
//   buried-raster                    checkBuriedRasterPopulations (checks-media.ts) — walker-gathered raster
//                                    carriers with no upstream relational census to join
//   contrast · text-over-art ·       colorTextPopulations (checks-color.ts) — FOUR rules partition ONE text
//   inactive-control-legibility ·    sample list through one shared `ContrastOutcome`, so their four rows
//   gray-on-color                    must be tallied in a single pass or they drift apart
//   script-error                     not collected here AT ALL: the runner captures uncaught page errors
//                                    (ops/run.ts → checkScriptErrors) — events, not DOM candidates
import type { Finding, PopulationAccounting, RulePopulationAccounting } from "../contract/findings.ts";
import type { DesignAuditRuleFamily } from "../contract/rules.ts";
import { DESIGN_AUDIT_RULE_FAMILIES } from "../contract/rules.ts";
import type { RawSamples } from "../contract/samples.ts";
import type { FamilyChecker } from "../contract/types.ts";
import {
  a11yFindings,
  colorFindings,
  decorFindings,
  mediaFindings,
  ornamentFindings,
  qualityFindings,
  structureFindings,
  typographyFindings,
} from "./collect-families.ts";

/** Closed dispatcher: the registry owns the family vocabulary, and a family is counted only when its
 * checker actually executes. Removing a checker is a type error; bypassing dispatch leaves a zero. */
const AUDIT_FAMILY_CHECKERS: Readonly<Record<DesignAuditRuleFamily, FamilyChecker>> = {
  a11y: a11yFindings,
  color: colorFindings,
  decor: decorFindings,
  media: mediaFindings,
  ornament: ornamentFindings,
  quality: qualityFindings,
  structure: structureFindings,
  typography: typographyFindings,
};

export interface AuditCollection {
  readonly findings: readonly Finding[];
  readonly familyScans: Readonly<Record<DesignAuditRuleFamily, number>>;
  readonly populationAccounting: PopulationAccounting;
}

/** Runs every enabled family through the same dispatch that produces its population evidence. */
export function collectAudit(samples: RawSamples): AuditCollection {
  const findings: Finding[] = [];
  const familyScans = Object.fromEntries(DESIGN_AUDIT_RULE_FAMILIES.map((family) => [family, 0])) as Record<DesignAuditRuleFamily, number>;
  const populationAccounting: Record<string, RulePopulationAccounting> = {};
  for (const family of DESIGN_AUDIT_RULE_FAMILIES) {
    const result = AUDIT_FAMILY_CHECKERS[family](samples);
    findings.push(...result.findings);
    familyScans[family] += result.scans;
    // NEVER `Object.assign` (#1317 item 10): the family checkers are independent and each names its own
    // rules, so two families both publishing a row for ONE rule id would have the second silently
    // overwrite the first — a whole family's denominator vanishing with nothing red at compile time or
    // at run time. The accounting map is keyed by RULE, not by family, so the collision is the map's own
    // invariant and belongs here rather than in any one checker.
    for (const [rule, row] of Object.entries(result.populationAccounting ?? {})) {
      if (populationAccounting[rule] !== undefined) {
        throw new Error(`INSTRUMENT ERROR: rule "${rule}" published a population row from two families (second: "${family}") — one rule owns one denominator`);
      }
      populationAccounting[rule] = row;
    }
  }
  return { findings, familyScans, populationAccounting };
}

export function collectFindings(samples: RawSamples): Finding[] {
  return [...collectAudit(samples).findings];
}
