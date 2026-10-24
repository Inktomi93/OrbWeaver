// A server suite reaches production only through its mirror's own module door, the primitives and a type-only
// import of another door; every other runtime reach is a native dependency-cruiser finding.
import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

const OWN_MODULE = "tests-server-mirror-own-module";
const OWN_TIER = "tests-server-mirror-own-tier";
const FRONT_DOORS = "tests-server-front-doors-only";
const TYPE_CONTRACTS = "tests-server-type-contracts-own-internals";
// A listed suite's own copy of its mirror rule, named for the suite.
const LISTED = "tests-server-mirror-own-tier-listed-entry-compose-share-graph";
const TIER_CONTRACTS = "tests-server-type-contracts-tier-doors";
const RULES = [OWN_MODULE, OWN_TIER, FRONT_DOORS, TYPE_CONTRACTS, TIER_CONTRACTS, LISTED] as const;

const MODULES = {
  ownDoor: "packages/server/src/domain/probe/index.ts",
  siblingDoor: "packages/server/src/domain/other/index.ts",
  infraDoor: "packages/server/src/infra/probe/index.ts",
  infraInternal: "packages/server/src/infra/probe/deep.ts",
  otherInfraInternal: "packages/server/src/infra/other/deep.ts",
  primitiveDoor: "packages/server/src/primitives/probe/index.ts",
  entryDoor: "packages/server/src/entry/compose/index.ts",
  relayDoor: "packages/server/src/infra/relay/index.ts",
  networkDoor: "packages/server/src/infra/network/index.ts",
} as const;

const DOMAIN_SUITE = "tests/server/domain/probe/verbs/probe.int.test.ts";
const ENTRY_SUITE = "tests/server/entry/auth/probe.int.test.ts";
const TIER_SUITE = "tests/server/domain/probe.suite.int.test.ts";
const INFRA_SUITE = "tests/server/infra/probe/probe.int.test.ts";
const INFRA_CONTRACT = "tests/server/infra/probe/probe.test-d.ts";
const ENTRY_CONTRACT = "tests/server/entry/compose/probe.test-d.ts";
const TIER_CONTRACT = "tests/server/infra/probe.test-d.ts";
// A suite on the closed constant list, which may import exactly the module its line names.
const REACHER = "tests/server/entry/compose/share-graph.int.test.ts";

// A sibling path needs its `./`, or the resolver reads it as a package name.
function relativeSpecifier(from: string, to: string): string {
  const path = relative(dirname(from), to);
  return path.startsWith(".") ? path : `./${path}`;
}

test.for([
  { name: "a domain suite running its own module's door", entry: DOMAIN_SUITE, target: MODULES.ownDoor, typeOnly: false, rule: null },
  { name: "a domain suite running a sibling domain's door", entry: DOMAIN_SUITE, target: MODULES.siblingDoor, typeOnly: false, rule: OWN_MODULE },
  { name: "a domain suite naming a sibling door's type", entry: DOMAIN_SUITE, target: MODULES.siblingDoor, typeOnly: true, rule: null },
  { name: "a domain suite running a lower tier's door", entry: DOMAIN_SUITE, target: MODULES.infraDoor, typeOnly: false, rule: OWN_MODULE },
  { name: "a domain suite running a primitive", entry: DOMAIN_SUITE, target: MODULES.primitiveDoor, typeOnly: false, rule: null },
  { name: "an entry suite running another entry door", entry: ENTRY_SUITE, target: MODULES.entryDoor, typeOnly: false, rule: null },
  { name: "an entry suite running a domain door", entry: ENTRY_SUITE, target: MODULES.ownDoor, typeOnly: false, rule: OWN_TIER },
  { name: "a domain tier suite running a domain door", entry: TIER_SUITE, target: MODULES.siblingDoor, typeOnly: false, rule: null },
  { name: "a domain tier suite running a lower tier's door", entry: TIER_SUITE, target: MODULES.infraDoor, typeOnly: false, rule: OWN_TIER },
  { name: "an infra suite running its own module's internal file", entry: INFRA_SUITE, target: MODULES.infraInternal, typeOnly: false, rule: FRONT_DOORS },
  { name: "an infra type contract naming its own internal type", entry: INFRA_CONTRACT, target: MODULES.infraInternal, typeOnly: true, rule: null },
  {
    name: "an infra type contract naming another module's internal type",
    entry: INFRA_CONTRACT,
    target: MODULES.otherInfraInternal,
    typeOnly: true,
    rule: TYPE_CONTRACTS,
  },
  { name: "an entry type contract naming a door's type", entry: ENTRY_CONTRACT, target: MODULES.infraDoor, typeOnly: true, rule: null },
  {
    name: "an entry type contract naming another module's internal type",
    entry: ENTRY_CONTRACT,
    target: MODULES.infraInternal,
    typeOnly: true,
    rule: TIER_CONTRACTS,
  },
  {
    name: "a tier-level type contract naming an internal type of its tier",
    entry: TIER_CONTRACT,
    target: MODULES.infraInternal,
    typeOnly: true,
    rule: TIER_CONTRACTS,
  },
  { name: "a listed suite running its listed constant's module", entry: REACHER, target: MODULES.relayDoor, typeOnly: false, rule: null },
  { name: "a listed suite running a module its line does not name", entry: REACHER, target: MODULES.networkDoor, typeOnly: false, rule: LISTED },
] as const)("the native server test mirror judges $name", async (row, { plantedTree, repoRoot }) => {
  const modules = Object.fromEntries(Object.values(MODULES).map((path) => [path, "export const probe = 1;\nexport type Probe = number;\n"]));
  const reexport = row.typeOnly ? "export type { Probe as Read }" : "export { probe as read }";
  const root = await plantedTree({ ...modules, [row.entry]: `${reexport} from ${JSON.stringify(relativeSpecifier(row.entry, row.target))};\n` });
  const result = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    [row.entry, "--config", join(repoRoot, ".dependency-cruiser.ts"), "--output-type", "err-long"],
    {
      cwd: root,
    },
  );
  const output = result.stdout + result.stderr;
  expect(output).not.toContain("not-to-unresolvable");
  for (const rule of RULES) {
    expect(output.includes(`${rule}: ${row.entry}`), output).toBe(rule === row.rule);
  }
});
