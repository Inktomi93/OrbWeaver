// Tap targets (pointer-conditional floors) + accessible names + landmark + tabindex + heading
// order. Pure; thresholds cited. Provenance: lib/collect.ts header.
import type { Finding, Severity } from "../contract/findings.ts";
import type { AccessibleNameInput, HeadingSample, LandmarkInput, TabIndexInput, TapTargetInput } from "../contract/samples.ts";

// ── Tap targets ──────────────────────────────────────────────────────────────
// The relevant floor is pointer-conditional (D62): coarse/touch owes the AAA 2.5.5 44px target,
// fine pointer only owes the AA 2.5.8 24px minimum — `checkTapTarget` takes the pointer type
// the page was measured under so desktop density isn't flagged against the touch floor.
const TAP_COARSE_WARN_PX = 44; // WCAG 2.5.5 (AAA) — recommended touch target on a coarse pointer
const TAP_COARSE_FAIL_PX = 32; // below this even a coarse pointer can't reliably hit — hard floor
const TAP_FINE_MIN_PX = 24; // WCAG 2.5.8 (AA) — the only target-size floor a mouse actually owes

export function checkTapTarget(input: TapTargetInput, pointerCoarse: boolean): Finding | null {
  const shortSide = Math.min(input.width, input.height);
  if (pointerCoarse) {
    if (shortSide >= TAP_COARSE_WARN_PX) {
      return null;
    }
    const severity: Severity = shortSide < TAP_COARSE_FAIL_PX ? "P1" : "P2";
    const floor = severity === "P1" ? `${TAP_COARSE_FAIL_PX}px hard floor` : `${TAP_COARSE_WARN_PX}px recommended minimum`;
    return {
      rule: "tap-target",
      severity,
      selector: input.selector,
      value: `${Math.round(input.width)}×${Math.round(input.height)}px`,
      message: `interactive element's short side is ${Math.round(shortSide)}px — below the ${floor}; grow the hit area to ≥${TAP_COARSE_WARN_PX}×${TAP_COARSE_WARN_PX}px`,
      origin: "orbweaver",
    };
  }
  if (shortSide >= TAP_FINE_MIN_PX) {
    return null;
  }
  return {
    rule: "tap-target",
    severity: "P1",
    selector: input.selector,
    value: `${Math.round(input.width)}×${Math.round(input.height)}px`,
    message: `interactive element's short side is ${Math.round(shortSide)}px — below WCAG AA's ${TAP_FINE_MIN_PX}px minimum (fine pointer); grow the hit area to ≥${TAP_FINE_MIN_PX}×${TAP_FINE_MIN_PX}px`,
    origin: "orbweaver",
  };
}

/** Any of aria-labelledby/aria-label/visible text/title/alt satisfies "has a name"; the probe
 *  doesn't need the browser's exact precedence order since it never computes what the name IS. */
export function checkAccessibleName(input: AccessibleNameInput): Finding | null {
  const hasName =
    input.hasVisibleText ||
    Boolean(input.ariaLabel?.trim()) ||
    Boolean(input.ariaLabelledbyText?.trim()) ||
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
    message: `<${input.tag}> is interactive but exposes no accessible name — add visible text, aria-label, aria-labelledby, title, or alt`,
    origin: "orbweaver",
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
        selector: `h${h.level}`,
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
