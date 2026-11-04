import type { LintResult } from "stylelint";

/** Reject engine diagnostics before rule filtering can discard them. */
export function assertStylelintEngineSucceeded(results: readonly LintResult[]): void {
  for (const result of results) {
    const failures = [
      ...result.parseErrors.map(({ text }) => text),
      ...result.invalidOptionWarnings.map(({ text }) => text),
      ...result.warnings.filter(({ rule, text }) => rule === "CssSyntaxError" || text.startsWith("Unknown rule ")).map(({ text }) => text),
    ];
    if (failures.length > 0) {
      throw new Error(`Stylelint engine failure in ${result.source ?? "<input>"}: ${failures.join("; ")}`);
    }
  }
}
