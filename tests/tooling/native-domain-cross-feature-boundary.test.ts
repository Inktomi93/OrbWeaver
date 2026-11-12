// The installed dependency checker must refuse every cross-domain import, type-only included, except a type-only
// import of the D117 workloads door.
import { expect, test } from "@orb/testkit/tooling";
import { cruiseRules, unresolvable } from "./_native-cruise.ts";

const DOMAIN = "packages/server/src/domain";
// The probe sits at the domain root so each import climbs one directory; a deeper probe trips the parent-climb rule
// before the rule under test.
const ENTRY = `${DOMAIN}/alpha/probe.ts`;

const RULES = ["domain-no-cross-feature", "domain-workloads-door-types-only"] as const;

test.for([
  {
    name: "a type-only import of another domain's door",
    source: 'import type { BetaView } from "../beta/index.ts"; export type Value = BetaView;',
    rule: "domain-no-cross-feature",
  },
  {
    name: "a type-only import of another domain's contract file",
    source: 'import type { BetaView } from "../beta/contract/view.ts"; export type Value = BetaView;',
    rule: "domain-no-cross-feature",
  },
  {
    name: "a value import of another domain's door",
    source: 'import { beta } from "../beta/index.ts"; export const value = beta;',
    rule: "domain-no-cross-feature",
  },
  {
    name: "a value import of the workloads door",
    source: 'import { reserved } from "../workloads/index.ts"; export const value = reserved;',
    rule: "domain-workloads-door-types-only",
  },
  {
    name: "a type-only import of the workloads door",
    source: 'import type { WorkloadContribution } from "../workloads/index.ts"; export type Value = WorkloadContribution;',
    rule: null,
  },
  { name: "an import inside the same domain", source: 'import type { AlphaView } from "./contract/view.ts"; export type Value = AlphaView;', rule: null },
] as const)("the domain boundary judges $name", async ({ source, rule }, { plantedTree }) => {
  const root = await plantedTree({
    [`${DOMAIN}/alpha/contract/view.ts`]: "export interface AlphaView { readonly id: string; }",
    [`${DOMAIN}/beta/contract/view.ts`]: "export interface BetaView { readonly id: string; }",
    [`${DOMAIN}/beta/index.ts`]: 'export type { BetaView } from "./contract/view.ts";\nexport const beta = 1;',
    [`${DOMAIN}/workloads/contract/contribution.ts`]: "export interface WorkloadContribution { readonly kind: string; }",
    [`${DOMAIN}/workloads/index.ts`]: 'export type { WorkloadContribution } from "./contract/contribution.ts";\nexport const reserved = 1;',
    [ENTRY]: source,
  });
  const violations = await cruiseRules(root, [ENTRY], RULES);
  expect(unresolvable(violations)).toEqual([]);
  // Exactly the named rule refuses the probe, and an admitted import trips neither.
  expect(violations.filter(({ from }) => from === ENTRY).map((violation) => violation.rule)).toEqual(rule === null ? [] : [rule]);
});
