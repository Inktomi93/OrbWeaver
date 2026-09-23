// The house tool exit contract (AGENTS.md "Verification tiers" — the verify harness's hard contract, spoken fleet-wide):
// 0 clean · 1 violations · 2 tool-broke (the run is NOT a verdict) · 3 misuse (bad args).
export const EXIT = {
  clean: 0,
  violations: 1,
  toolError: 2,
  misuse: 3,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** The contract name for a code (`1 (violations)`) — unknown codes pass through bare. */
export function describeExit(code: number): string {
  const name = Object.entries(EXIT).find(([, v]) => v === code)?.[0];
  return name === undefined ? String(code) : `${code} (${name})`;
}
