// NOT a test file (no `.test` suffix). Runs the repository's own dependency-cruiser rules, by name, over a planted
// tree in-process. Passing only the named rules keeps dependency-cruiser's per-rule regex safety check off the
// rest of the config, which is what made a spawned run cost seconds per case.
import type { ICruiseOptions, IForbiddenRuleType } from "dependency-cruiser";
import { cruise } from "dependency-cruiser";
import { z } from "zod";
import dependencyCruiser from "../../.dependency-cruiser.ts";

export interface Violation {
  readonly rule: string;
  readonly from: string;
  readonly to: string;
}

const CRUISE_RESULT = z.object({
  summary: z.object({ violations: z.array(z.object({ rule: z.object({ name: z.string() }), from: z.string(), to: z.string() })) }),
});

const UNRESOLVABLE = "not-to-unresolvable";

const FORBIDDEN: readonly IForbiddenRuleType[] = dependencyCruiser.forbidden;

/** The violations of the named repository rules over `entries` inside the planted `root`, plus every unresolvable import. */
export async function cruiseRules(root: string, entries: readonly string[], ruleNames: readonly string[]): Promise<readonly Violation[]> {
  const forbidden = FORBIDDEN.filter(({ name }) => name !== undefined && [...ruleNames, UNRESOLVABLE].includes(name));
  const missing = ruleNames.filter((name) => !forbidden.some((rule) => rule.name === name));
  if (missing.length > 0) {
    throw new Error(`no such dependency-cruiser rule in .dependency-cruiser.ts: ${missing.join(", ")}`);
  }
  const options: ICruiseOptions = { ...dependencyCruiser.options, ruleSet: { forbidden }, validate: true, baseDir: root };
  const { output } = await cruise([...entries], options, dependencyCruiser.options.enhancedResolveOptions);
  const parsed = CRUISE_RESULT.parse(typeof output === "string" ? JSON.parse(output) : output);
  return parsed.summary.violations.map(({ rule, from, to }) => ({ rule: rule.name, from, to }));
}

/** Does the run hold a violation of `rule` from any of `paths`? */
export function fires(violations: readonly Violation[], rule: string, paths: readonly string[]): boolean {
  return violations.some((violation) => violation.rule === rule && paths.includes(violation.from));
}

/** Every unresolvable import in the run: a planted tree that cannot resolve its own modules judges nothing. */
export function unresolvable(violations: readonly Violation[]): readonly Violation[] {
  return violations.filter(({ rule }) => rule === UNRESOLVABLE);
}
