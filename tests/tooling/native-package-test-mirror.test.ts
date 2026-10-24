// A client, inference, kit, contracts or db suite reaches production only from its package's cake and through
// exported doors, a client feature suite only through its own feature; every other reach is a native finding.
import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { runNicedSync } from "@orb/tooling/floor/process/proc";

const RULE = {
  kitCake: "tests-kit-mirror-cake",
  kitDoors: "tests-kit-front-doors-only",
  kitTypes: "tests-kit-type-contracts-own-internals",
  contractsCake: "tests-contracts-mirror-cake",
  contractsTypes: "tests-contracts-type-contracts-own-internals",
  dbCake: "tests-db-mirror-cake",
  dbDoors: "tests-db-front-doors-only",
  // A listed suite's own copy of its tree's rule, named for the suite.
  dbListedCake: "tests-db-mirror-cake-listed-schema-chat-freeze-provenance",
  inferenceCake: "tests-inference-mirror-cake",
  inferenceDoors: "tests-inference-front-doors-only",
  clientCake: "tests-client-mirror-cake",
  clientDoors: "tests-client-front-doors-only",
  clientListedDoors: "tests-client-front-doors-only-listed-features-plugin-native-guest-protocol",
  clientOwnFeature: "tests-client-mirror-own-feature",
  clientOwnTier: "tests-client-mirror-own-tier",
  clientTypes: "tests-client-type-contracts-own-internals",
  clientTierTypes: "tests-client-type-contracts-tier-doors",
} as const;

// Every door is a file a real package's exports map names, because the config reads those maps.
const MODULES = {
  kitDoor: "packages/kit/src/dice/index.ts",
  kitInternal: "packages/kit/src/dice/deep.ts",
  contractsDoor: "packages/contracts/src/chat/index.ts",
  contractsInternal: "packages/contracts/src/chat/deep.ts",
  dbDoor: "packages/db/src/schema/index.ts",
  dbInternal: "packages/db/src/schema/deep.ts",
  inferenceDoor: "packages/inference/src/index.ts",
  inferenceInternal: "packages/inference/src/roles/deep.ts",
  serverDoor: "packages/server/src/foundation/observability/index.ts",
  bootDoor: "packages/server/src/entry/boot/index.ts",
  chatDoor: "packages/client/src/features/chat/index.ts",
  chatInternal: "packages/client/src/features/chat/lib/deep.ts",
  rpgDoor: "packages/client/src/features/rpg/index.ts",
  rpgInternal: "packages/client/src/features/rpg/lib/deep.ts",
  stateDoor: "packages/client/src/state/index.ts",
  guestLeaf: "packages/client/src/lib/plugin-ui-guest-protocol.ts",
  libInternal: "packages/client/src/lib/deep.ts",
} as const;

const SUITE = {
  kit: "tests/kit/dice/probe.test.ts",
  kitContract: "tests/kit/dice/probe.test-d.ts",
  contracts: "tests/contracts/chat/probe.contract.test.ts",
  contractsContract: "tests/contracts/chat/probe.test-d.ts",
  db: "tests/db/schema/probe.int.test.ts",
  // On the closed reach list, which may run exactly the door its line names.
  dbListed: "tests/db/schema/chat-freeze-provenance.repo.int.test.ts",
  inference: "tests/inference/roles/probe.int.test.ts",
  inferenceContract: "tests/inference/roles/probe.test-d.ts",
  chat: "tests/client/features/chat/lib/probe.dom.test.ts",
  chatStory: "tests/client/features/chat/components/_probe-stories.tsx",
  chatContract: "tests/client/features/chat/probe.dom.test-d.ts",
  tier: "tests/client/state/probe.dom.test.ts",
  tierContract: "tests/client/features/probe.dom.test-d.ts",
  // On the closed reach list, which may run exactly the leaf its line names.
  clientListed: "tests/client/features/plugin/native-guest-protocol.ct.tsx",
} as const;

// A sibling path needs its `./`, or the resolver reads it as a package name.
function relativeSpecifier(from: string, to: string): string {
  const path = relative(dirname(from), to);
  return path.startsWith(".") ? path : `./${path}`;
}

test.for([
  { name: "a kit suite running its own door", entry: SUITE.kit, target: MODULES.kitDoor, typeOnly: false, rule: null },
  { name: "a kit suite running a contracts door", entry: SUITE.kit, target: MODULES.contractsDoor, typeOnly: false, rule: RULE.kitCake },
  { name: "a kit suite naming a contracts door's type", entry: SUITE.kit, target: MODULES.contractsDoor, typeOnly: true, rule: null },
  { name: "a kit suite running its own internal file", entry: SUITE.kit, target: MODULES.kitInternal, typeOnly: false, rule: RULE.kitDoors },
  { name: "a kit type contract naming its own internal type", entry: SUITE.kitContract, target: MODULES.kitInternal, typeOnly: true, rule: null },
  {
    name: "a kit type contract naming a contracts internal type",
    entry: SUITE.kitContract,
    target: MODULES.contractsInternal,
    typeOnly: true,
    rule: RULE.kitTypes,
  },
  { name: "a contracts suite running a kit door", entry: SUITE.contracts, target: MODULES.kitDoor, typeOnly: false, rule: null },
  { name: "a contracts suite running a db door", entry: SUITE.contracts, target: MODULES.dbDoor, typeOnly: false, rule: RULE.contractsCake },
  { name: "a contracts suite naming a db door's type", entry: SUITE.contracts, target: MODULES.dbDoor, typeOnly: true, rule: null },
  {
    name: "a contracts type contract naming a db internal type",
    entry: SUITE.contractsContract,
    target: MODULES.dbInternal,
    typeOnly: true,
    rule: RULE.contractsTypes,
  },
  { name: "a db suite running a contracts door", entry: SUITE.db, target: MODULES.contractsDoor, typeOnly: false, rule: null },
  { name: "a db suite running a server door", entry: SUITE.db, target: MODULES.serverDoor, typeOnly: false, rule: RULE.dbCake },
  { name: "a db suite running its own internal file", entry: SUITE.db, target: MODULES.dbInternal, typeOnly: false, rule: RULE.dbDoors },
  { name: "a listed db suite running its listed door", entry: SUITE.dbListed, target: MODULES.bootDoor, typeOnly: false, rule: null },
  {
    name: "a listed db suite running a door its line does not name",
    entry: SUITE.dbListed,
    target: MODULES.serverDoor,
    typeOnly: false,
    rule: RULE.dbListedCake,
  },
  { name: "an inference suite running its door", entry: SUITE.inference, target: MODULES.inferenceDoor, typeOnly: false, rule: null },
  { name: "an inference suite running a server door", entry: SUITE.inference, target: MODULES.serverDoor, typeOnly: false, rule: RULE.inferenceCake },
  {
    name: "an inference type contract naming an internal type",
    entry: SUITE.inferenceContract,
    target: MODULES.inferenceInternal,
    typeOnly: true,
    rule: RULE.inferenceDoors,
  },
  { name: "a feature suite running its own feature's door", entry: SUITE.chat, target: MODULES.chatDoor, typeOnly: false, rule: null },
  { name: "a feature suite running a client tier door", entry: SUITE.chat, target: MODULES.stateDoor, typeOnly: false, rule: null },
  { name: "a feature suite running another feature's door", entry: SUITE.chat, target: MODULES.rpgDoor, typeOnly: false, rule: RULE.clientOwnFeature },
  { name: "a feature suite naming another feature door's type", entry: SUITE.chat, target: MODULES.rpgDoor, typeOnly: true, rule: null },
  { name: "a feature suite running its own internal file", entry: SUITE.chat, target: MODULES.chatInternal, typeOnly: false, rule: RULE.clientDoors },
  { name: "a feature suite running a server door", entry: SUITE.chat, target: MODULES.serverDoor, typeOnly: false, rule: RULE.clientCake },
  { name: "a story mounting its own feature's door", entry: SUITE.chatStory, target: MODULES.chatDoor, typeOnly: false, rule: null },
  { name: "a story mounting its own feature's internal file", entry: SUITE.chatStory, target: MODULES.chatInternal, typeOnly: false, rule: RULE.clientDoors },
  { name: "a story mounting another feature's door", entry: SUITE.chatStory, target: MODULES.rpgDoor, typeOnly: false, rule: RULE.clientOwnFeature },
  { name: "a client tier suite running a feature door", entry: SUITE.tier, target: MODULES.chatDoor, typeOnly: false, rule: RULE.clientOwnTier },
  { name: "a feature type contract naming its own internal type", entry: SUITE.chatContract, target: MODULES.chatInternal, typeOnly: true, rule: null },
  {
    name: "a feature type contract naming another feature's internal type",
    entry: SUITE.chatContract,
    target: MODULES.rpgInternal,
    typeOnly: true,
    rule: RULE.clientTypes,
  },
  {
    name: "a features-level type contract naming a feature's internal type",
    entry: SUITE.tierContract,
    target: MODULES.chatInternal,
    typeOnly: true,
    rule: RULE.clientTierTypes,
  },
  { name: "a listed client suite running its listed leaf", entry: SUITE.clientListed, target: MODULES.guestLeaf, typeOnly: false, rule: null },
  {
    name: "a listed client suite running a leaf its line does not name",
    entry: SUITE.clientListed,
    target: MODULES.libInternal,
    typeOnly: false,
    rule: RULE.clientListedDoors,
  },
] as const)("the native package test mirror judges $name", async (row, { plantedTree, repoRoot }) => {
  const modules = Object.fromEntries(Object.values(MODULES).map((path) => [path, "export const probe = 1;\nexport type Probe = number;\n"]));
  const reexport = row.typeOnly ? "export type { Probe as Read }" : "export { probe as read }";
  const root = await plantedTree({ ...modules, [row.entry]: `${reexport} from ${JSON.stringify(relativeSpecifier(row.entry, row.target))};\n` });
  const result = runNicedSync(
    join(repoRoot, "node_modules/.bin/depcruise"),
    [row.entry, "--config", join(repoRoot, ".dependency-cruiser.ts"), "--output-type", "err-long"],
    { cwd: root },
  );
  const output = result.stdout + result.stderr;
  expect(output).not.toContain("not-to-unresolvable");
  for (const rule of Object.values(RULE)) {
    expect(output.includes(`${rule}: ${row.entry}`), output).toBe(rule === row.rule);
  }
});
