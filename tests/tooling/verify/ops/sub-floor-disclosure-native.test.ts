import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { ruleMessages } from "./native-rule-probe.ts";

const SUB_FLOOR_NATIVE_BASE_MS = 60_000;
const SUB_FLOOR = "orb/sub-floor-disclosure";
const CLIENT = "packages/client/src/features/a/probe.tsx";
const RPG_HOME = "packages/client/src/features/rpg/components/rpg-beat-row.tsx";
const TEXT_TRIGGER = 'export const G = <CollapsibleTrigger size="text">Advanced</CollapsibleTrigger>;';

for (const [name, source, path, count] of [
  // The retired gate's mustFlag rows, in order.
  ["a sub-floor trigger", TEXT_TRIGGER, CLIENT, 1],
  ["the self-closing spelling", 'export const G = <CollapsibleTrigger size="text" chevron={false} render={<span />} />;', CLIENT, 1],
  ["the ui package", TEXT_TRIGGER, "packages/ui/src/primitives/collapsible/story.tsx", 1],
  ["a retired marker comment exempts nothing", `// @sub-floor-ok: the retired grammar\n${TEXT_TRIGGER}`, CLIENT, 1],
  // The retired gate's mustPass rows, in order (its waiver-marker row belonged to the marker engine).
  ["the default arm", "export const G = <CollapsibleTrigger>Advanced</CollapsibleTrigger>;", CLIENT, 0],
  ["the explicit control arm", 'export const G = <CollapsibleTrigger size="control">Advanced</CollapsibleTrigger>;', CLIENT, 0],
  ["another tag", 'export const G = <Trigger size="text">Advanced</Trigger>;', CLIENT, 0],
  ["a size reached through a variable", 'const arm = "text";\nexport const G = <CollapsibleTrigger size={arm}>Advanced</CollapsibleTrigger>;', CLIENT, 0],
  [
    "a CT story outside the population",
    'export const G = <CollapsibleTrigger size="text">Running text</CollapsibleTrigger>;',
    "tests/ui/primitives/collapsible/story.ct.tsx",
    0,
  ],
  // Arms the lint rule adds around the same claim.
  ["a braced literal", 'export const G = <CollapsibleTrigger size={"text"}>Advanced</CollapsibleTrigger>;', CLIENT, 1],
  [
    "two triggers are two findings",
    'export const G = <><CollapsibleTrigger size="text">a</CollapsibleTrigger><CollapsibleTrigger size="text">b</CollapsibleTrigger></>;',
    CLIENT,
    2,
  ],
  ["a member tag", 'export const G = <Collapsible.Trigger size="text">Advanced</Collapsible.Trigger>;', CLIENT, 0],
  // The two ruled mounts are reasoned homes of the rule; the same shape anywhere else is a finding.
  ["the rpg beat row home", TEXT_TRIGGER, RPG_HOME, 0],
  ["the tool-calls disclosure home", TEXT_TRIGGER, "packages/client/src/features/rpg/components/turn-tool-calls-disclosure.tsx", 0],
  ["a sibling of a home is not a home", TEXT_TRIGGER, "packages/client/src/features/rpg/components/rpg-other-row.tsx", 1],
  // A home owns its one ruled mount, not the file: a second mount is still a finding, and a home with none is stale.
  ["a second mount in the rpg beat row home", `${TEXT_TRIGGER}\nexport const H = <CollapsibleTrigger size="text">b</CollapsibleTrigger>;`, RPG_HOME, 1],
  [
    "a second mount in the tool-calls disclosure home",
    `${TEXT_TRIGGER}\nexport const H = <CollapsibleTrigger size={"text"}>b</CollapsibleTrigger>;`,
    "packages/client/src/features/rpg/components/turn-tool-calls-disclosure.tsx",
    1,
  ],
  ["the same two mounts in a sibling of the home", `${TEXT_TRIGGER}\n${TEXT_TRIGGER}`, "packages/client/src/features/rpg/components/rpg-other-row.tsx", 2],
  ["a home that no longer mounts the opt-out is stale", "export const G = <CollapsibleTrigger>Advanced</CollapsibleTrigger>;", RPG_HOME, 1],
  ["an empty home is stale", "export const G = null;", "packages/client/src/features/rpg/components/turn-tool-calls-disclosure.tsx", 1],
  ["a file that is not a home owes no mount", "export const G = null;", "packages/client/src/features/rpg/components/rpg-other-row.tsx", 0],
] as const) {
  test(`native sub-floor disclosure ${name}`, { timeout: scaledBudget(SUB_FLOOR_NATIVE_BASE_MS) }, async ({ repoRoot }) => {
    expect(await ruleMessages(repoRoot, SUB_FLOOR, source, path)).toHaveLength(count);
  });
}
