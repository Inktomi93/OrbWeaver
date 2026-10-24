import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { ServerTestHarness } from "@orb/testkit/node/composed";

type CreateRule = ServerTestHarness["services"]["automation"]["createRule"];

/** Author and enable a real rule; the root owns its dispatcher, indexes and serial lanes. */
export async function enabledRule(
  root: ServerTestHarness,
  fields: Omit<Parameters<CreateRule>[0], "principal" | "timeZone">,
): Promise<Awaited<ReturnType<CreateRule>>> {
  const principal = await root.principalFor(root.ownerId);
  const rule = await root.services.automation.createRule({ ...fields, principal, timeZone: UTC_TIME_ZONE });
  await root.services.automation.setRuleEnabled({ principal, ruleId: rule.id, enabled: true });
  return rule;
}
