// NAVIGABILITY — the half of the a11y check family that judges whether a control can be NAMED, EXPLAINED
// and REACHED, split out of `checks-a11y.ts` at the tooling 450-line cap. That file's header already named
// the two concerns it carried ("CONTROL GEOMETRY + navigability"); this is the second one, on its own:
// accessible names, the coarse-pointer reachability of a tooltip's explanation, the main landmark, the
// positive-tabindex smell, and heading order. Pure; thresholds cited. Provenance: lib/collect.ts header.
import type { CandidateDisposition, Finding } from "../contract/findings.ts";
import type { AccessibleNameInput, HeadingSample, LandmarkInput, TabIndexInput, UnreachableHintInput } from "../contract/samples.ts";
/** Any of aria-labelledby/aria-label/the NATIVE `<label>` association/visible text/title/alt satisfies
 *  "has a name"; the probe doesn't need the browser's exact precedence order since it never computes what
 *  the name IS. The native-label arm arrived at #1009: without it a control named by a `<label for>` alone
 *  — correct, lint-clean HTML — was a P1, and the census could not see the name at all. Measured scope: no
 *  live app surface relies on the native association alone (Base UI belts every one with aria-labelledby),
 *  so this closed a LATENT false-positive class rather than a live wall. */
export function checkAccessibleName(input: AccessibleNameInput): Finding | null {
  const hasName =
    input.hasVisibleText ||
    Boolean(input.ariaLabel?.trim()) ||
    Boolean(input.ariaLabelledbyText?.trim()) ||
    Boolean(input.nativeLabelText?.trim()) ||
    Boolean(input.title?.trim()) ||
    Boolean(input.altText?.trim());
  if (hasName) {
    return null;
  }
  return {
    rule: "aria-name",
    severity: "P1",
    selector: input.selector,
    value: "no accessible name",
    message: `<${input.tag}> is interactive but exposes no accessible name — add visible text, a <label for> (or wrap it in one), aria-label, aria-labelledby, title, or alt`,
    origin: "orbweaver",
  };
}

/** THE TELL, RE-DERIVED AFTER #2455 (#2452). The rule was designed against a DANGLING
 *  `aria-describedby` — the shape `@orb/ui`'s tooltip seal shipped until 2026-09-19, where every trigger
 *  pointed at a popup Base UI mounts only while open. That tell is gone: the seal now renders an
 *  always-mounted description node, so the surviving question is the one the defect was always about —
 *  AT A COARSE POINTER, WHERE THE POPUP CANNOT BE OPENED AT ALL (Base UI's hover is `mouseOnly` and its
 *  focus fallback gates on `:focus-visible`), IS THE TOOLTIP'S CONTENT REACHABLE BY ANY OTHER ROUTE?
 *
 *  The four routes, in the order this reads them: a rest-resolving description, a `title`/`aria-description`,
 *  the control's own visible text, and a press-openable door (#2443's Popover remedy). The seal's published
 *  decision supplies the fifth answer, which is not a route but the absence of a question: `name` means the
 *  tooltip only repeats the control's accessible name, so there is nothing a user is missing.
 *
 *  POLARITY (#987): `withheld` where this instrument cannot judge — a trigger outside the seal publishes
 *  no decision, so the question stays open and the run is honestly NO VERDICT. `excluded` where measured
 *  facts prove the rule inapplicable.
 *
 *  THE POINTER IS AN EXCLUSION, NOT A WITHHOLDING (#2468, measured 2026-09-20). This arm shipped as
 *  `withheld(finePointer)` on 2026-09-19, and the pointer is a fact the pass KNOWS about itself — so
 *  every desktop `--design-audit` of any surface carrying a visible tooltip trigger became a NO VERDICT
 *  the day it landed, whatever the surface actually looks like: on `--goto characters` at `a5b34759f` the
 *  population read candidates=17, judged=0, withheld(finePointer=17) — one of three rules holding that
 *  run's verdict. The rule's own question is COARSE-ONLY by construction — "at a coarse pointer,
 *  where the popup cannot be opened at all" — so on a fine pointer the popup opens on hover and there is
 *  no defect to have. That is a candidate whose measured facts close the question by proving the rule
 *  does not apply, which §"Polarity" spells `excluded`, exactly as `canvas-ink` spells a canvas the DOM
 *  census reached and cannot read. Nothing goes quiet: the population row still prints
 *  `candidates=N … excluded(finePointer=N)`, and the SAME surface at `--mobile` judges the same cohort
 *  (measured: `candidates=7 excluded(tooltipRepeatsName=7)`), which is the proof this closes a regime,
 *  not an eye. `noDescriptionWiring` below is untouched and is the rule's surviving refusal. */
export function classifyUnreachableHint(input: UnreachableHintInput): CandidateDisposition {
  if (!input.coarsePointer) {
    return { kind: "excluded", reason: "finePointer" };
  }
  if (input.describesDecision === null) {
    return { kind: "withheld", reason: "noDescriptionWiring" };
  }
  if (input.describesDecision === "name") {
    return { kind: "excluded", reason: "tooltipRepeatsName" };
  }
  if (input.describedByResolved > 0 || Boolean(input.title?.trim()) || Boolean(input.ariaDescription?.trim())) {
    return { kind: "excluded", reason: "hasReachableDescription" };
  }
  if (input.ownText.length > 0) {
    return { kind: "excluded", reason: "visibleOwnText" };
  }
  if (input.pressDoor) {
    return { kind: "excluded", reason: "pressDoor" };
  }
  return {
    kind: "judged",
    finding: {
      rule: "unreachable-hint",
      severity: "P2",
      selector: input.selector,
      value: `describedBy ${String(input.describedByIds)} id(s), ${String(input.describedByResolved)} resolving`,
      message:
        "at a coarse pointer this control's only explanation is a tooltip no tap can open, and it has no rest-readable description and no press door — give it an always-mounted description or a press-openable disclosure (the HintTrigger Popover shape)",
      origin: "orbweaver",
    },
  };
}

export function checkMainLandmark(input: LandmarkInput): Finding | null {
  if (input.main) {
    return null;
  }
  return {
    rule: "landmark-missing",
    severity: "P2",
    selector: "body",
    value: "no <main>/role=main",
    message: 'page has no main landmark — wrap primary content in <main> or role="main"',
    origin: "orbweaver",
  };
}

export function checkTabIndexSmell(input: TabIndexInput): Finding | null {
  if (input.tabIndex <= 0) {
    return null;
  }
  return {
    rule: "tabindex-positive",
    severity: "P2",
    selector: input.selector,
    value: `tabindex=${input.tabIndex}`,
    message: 'positive tabindex overrides natural DOM order — breaks predictable keyboard navigation; use tabindex="0" and reorder in the DOM instead',
    origin: "orbweaver",
  };
}

export function checkHeadingOrder(headings: readonly HeadingSample[]): Finding[] {
  const findings: Finding[] = [];
  let prevLevel = 0;
  let prevText = "";
  for (const h of headings) {
    if (prevLevel > 0 && h.level > prevLevel + 1) {
      findings.push({
        rule: "skipped-heading",
        severity: "P2",
        // The OFFENDING heading's own locatable selector, never the tag (#1317 item 5): "h3" is not a
        // selector a reader can open on a page with more than one h3, which is every page.
        selector: h.selector,
        value: `h${prevLevel} "${prevText}" → h${h.level} "${h.text}"`,
        message: `heading level skips from h${prevLevel} to h${h.level} (missing h${prevLevel + 1}) — screen readers navigate by heading hierarchy (UIP §13.10 N7)`,
        origin: "impeccable",
      });
    }
    prevLevel = h.level;
    prevText = h.text;
  }
  return findings;
}
