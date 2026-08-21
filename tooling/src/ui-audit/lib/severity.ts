// Severity-ladder predicates over the contract's tuple-derived union.
import type { Severity } from "../contract/findings.ts";
import { SEVERITIES } from "../contract/findings.ts";

export function isValidSeverity(s: string): s is Severity {
  return (SEVERITIES as readonly string[]).includes(s);
}

/** True when `sev` is at least as severe as `floor` (P0 is the worst, P3 the mildest). */
export function isAtOrAboveSeverity(sev: Severity, floor: Severity): boolean {
  return SEVERITIES.indexOf(sev) <= SEVERITIES.indexOf(floor);
}
