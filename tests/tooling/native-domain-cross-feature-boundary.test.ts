// The installed dependency checker must refuse every cross-domain import, type-only included, except a type-only
// import of the D117 workloads door.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

const DOMAIN = "packages/server/src/domain";
// The probe sits at the domain root so each import climbs one directory; a deeper probe trips the parent-climb rule
// before the rule under test.
const ENTRY = `${DOMAIN}/alpha/probe.ts`;

// Each case cruises the whole config once: about ten seconds on a loaded box.
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
] as const)("the domain boundary judges $name", { timeout: 60_000 }, async ({ source, rule }, { plantedTree, repoRoot }) => {
  const root = await plantedTree({
    [`${DOMAIN}/alpha/contract/view.ts`]: "export interface AlphaView { readonly id: string; }",
    [`${DOMAIN}/beta/contract/view.ts`]: "export interface BetaView { readonly id: string; }",
    [`${DOMAIN}/beta/index.ts`]: 'export type { BetaView } from "./contract/view.ts";\nexport const beta = 1;',
    [`${DOMAIN}/workloads/contract/contribution.ts`]: "export interface WorkloadContribution { readonly kind: string; }",
    [`${DOMAIN}/workloads/index.ts`]: 'export type { WorkloadContribution } from "./contract/contribution.ts";\nexport const reserved = 1;',
    [ENTRY]: source,
  });
  const result = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    [ENTRY, "--config", join(repoRoot, ".dependency-cruiser.ts"), "--output-type", "err-long"],
    {
      cwd: root,
    },
  );
  const output = result.stdout + result.stderr;
  expect(result.errorCode, output).toBeUndefined();
  expect(output).not.toContain("not-to-unresolvable");
  expect(result.status === 0, output).toBe(rule === null);
  expect(output).toContain(rule === null ? "no dependency violations found" : `${rule}: ${ENTRY}`);
});
