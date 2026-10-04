import { automationRuleCreateSchema, automationRuleUpdateSchema } from "@orb/contracts/automation";
import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@playwright/experimental-ct-react";
import type { editableRule } from "../../../../../packages/client/src/features/automation/lib/rule-save-session.ts";
import { createSeededIds } from "../../../../support/ids.ts";
import type { TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { RuleMutationEchoStory } from "./_rule-echo-stories.tsx";

const ids = createSeededIds();
const firstOwner = castId<UserId>("fixture_echo_first");
const secondOwner = castId<UserId>("fixture_echo_second");
const firstChat = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const secondChat = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const ruleId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const siblingId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const initial: Parameters<typeof editableRule>[0] = {
  id: ruleId,
  chatId: firstChat,
  name: "Original A",
  description: null,
  enabled: false,
  position: 1,
  trigger: { bus: "chat", type: "messageCommitted" },
  predicateCel: null,
  actions: [{ type: "set_variable", scope: "chat", key: "score", op: "set", value: "1" }],
  actionsCorrupt: false,
  rulePresetId: null,
  rulePresetKnobs: null,
  matchAutomationEvents: false,
  suggestOnRefusal: true,
  timeZone: UTC_TIME_ZONE,
  cooldownSeconds: 0,
  maxFiresPerHour: 30,
  lastError: null,
  lastFiredAt: null,
  createdAt: 1,
  updatedAt: 1,
};
const sibling = { ...initial, id: siblingId, name: "Untouched sibling", position: 0 };
const global: Parameters<typeof editableRule>[0] = {
  ...initial,
  chatId: null,
  name: "Untouched global",
  trigger: { bus: "domain", type: "character.updated" },
  actions: [{ type: "set_variable", scope: "global", key: "score", op: "set", value: "1" }],
};
const other = { ...initial, chatId: secondChat, name: "Untouched other chat" };
const committed = { ...initial, name: "Committed B", updatedAt: 2 };
const props = { firstOwner, secondOwner, firstChat, secondChat };

test("update echoes the complete confirmed row into only its original list before save resolves", async ({ mount, page }) => {
  const refetch = trpcHold();
  let reads = 0;
  const routes: TrpcRoutes<"automation.listOwnerRules" | "automation.listRules" | "automation.updateRule"> = {
    "automation.listOwnerRules": () => [global],
    "automation.listRules": (input) => {
      if (input.chatId === secondChat) {
        return [other];
      }
      return reads++ === 0 ? [sibling, initial] : refetch;
    },
    "automation.updateRule": (input) => {
      automationRuleUpdateSchema.parse(input);
      return committed;
    },
  };
  const recorder = await routeTrpc(page, routes);
  await mount(<RuleMutationEchoStory {...props} row={initial} />);
  await expect(page.getByLabel("First chat rules")).toHaveText(JSON.stringify([sibling, initial]));
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect(page.getByLabel("Settled cache")).toHaveText(JSON.stringify([sibling, committed]));
  await expect(page.getByLabel("First chat rules")).toHaveText(JSON.stringify([sibling, committed]));
  await expect(page.getByLabel("Global rules")).toHaveText(JSON.stringify([global]));
  await expect(page.getByLabel("Second chat rules")).toHaveText(JSON.stringify([other]));
  await expect.poll(() => automationRuleUpdateSchema.parse(recorder.lastInput("automation.updateRule"))).toMatchObject({ ruleId, name: "Committed B" });
  await expect.poll(() => recorder.lastInput("automation.updateRule")).not.toHaveProperty("cacheOwnerId");
  await expect.poll(() => recorder.lastInput("automation.updateRule")).not.toHaveProperty("chatId");
  refetch.release([sibling, committed]);
});

test("create appends an acknowledged global row without fabricating or replacing unrelated rows", async ({ mount, page }) => {
  const row = { ...global, name: "Original A" };
  const saved = { ...row, name: "Committed B", updatedAt: 2 };
  const globalSibling = { ...sibling, chatId: null };
  const refetch = trpcHold();
  let reads = 0;
  const routes: TrpcRoutes<"automation.listOwnerRules" | "automation.listRules" | "automation.createRule"> = {
    "automation.listOwnerRules": () => (reads++ === 0 ? [globalSibling] : refetch),
    "automation.listRules": (input) => (input.chatId === firstChat ? [initial] : [other]),
    "automation.createRule": (input) => {
      automationRuleCreateSchema.parse(input);
      return saved;
    },
  };
  const recorder = await routeTrpc(page, routes);
  await mount(<RuleMutationEchoStory {...props} row={row} creating={true} />);
  await expect(page.getByLabel("Global rules")).toHaveText(JSON.stringify([globalSibling]));
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect(page.getByLabel("Settled cache")).toHaveText(JSON.stringify([globalSibling, saved]));
  await expect(page.getByLabel("Global rules")).toHaveText(JSON.stringify([globalSibling, saved]));
  await expect(page.getByLabel("First chat rules")).toHaveText(JSON.stringify([initial]));
  await expect.poll(() => automationRuleCreateSchema.parse(recorder.lastInput("automation.createRule"))).toMatchObject({ name: "Committed B", chatId: null });
  await expect.poll(() => recorder.lastInput("automation.createRule")).not.toHaveProperty("cacheOwnerId");
  await expect.poll(() => recorder.lastInput("automation.createRule")).not.toHaveProperty("input");
  refetch.release([globalSibling, saved]);
});

test("a cold list remains unknown instead of being invented from a single creation response", async ({ mount, page }) => {
  const routes: TrpcRoutes<"automation.listOwnerRules" | "automation.listRules" | "automation.createRule"> = {
    "automation.listOwnerRules": () => [global],
    "automation.listRules": () => [other],
    "automation.createRule": () => committed,
  };
  await routeTrpc(page, routes);
  await mount(<RuleMutationEchoStory {...props} row={initial} creating={true} cold={true} />);
  await expect(page.getByLabel("Global rules")).toHaveText(JSON.stringify([global]));
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect(page.getByLabel("Settled cache")).toHaveText("absent");
  await expect(page.getByLabel("First chat rules")).toHaveText("absent");
});

test("an older exact list read cannot overwrite the response echo after its delayed bytes arrive", async ({ mount, page }) => {
  const older = trpcHold();
  const confirm = trpcHold();
  let reads = 0;
  const routes: TrpcRoutes<"automation.listOwnerRules" | "automation.listRules" | "automation.updateRule"> = {
    "automation.listOwnerRules": () => [global],
    "automation.listRules": (input) => {
      if (input.chatId === secondChat) {
        return [other];
      }
      if (reads++ === 0) {
        return [sibling, initial];
      }
      return reads === 2 ? older : confirm;
    },
    "automation.updateRule": () => committed,
  };
  await routeTrpc(page, routes);
  await mount(<RuleMutationEchoStory {...props} row={initial} holdReconciliation={true} />);
  await expect(page.getByLabel("First chat rules")).toHaveText(JSON.stringify([sibling, initial]));
  await page.getByRole("button", { name: "Refresh scope", exact: true }).click();
  await older.requested;
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect(page.getByLabel("Settled cache")).toHaveText(JSON.stringify([sibling, committed]));
  await expect(page.getByRole("button", { name: "Release reconciliation", exact: true })).toBeEnabled();
  // The settle refetch is held, so only the exact cancellation can stop these bytes. An idle read means
  // they were either dropped or already applied.
  older.release([sibling, initial]);
  await expect(page.getByLabel("First chat read")).toHaveText("idle");
  await expect(page.getByLabel("First chat rules")).toHaveText(JSON.stringify([sibling, committed]));
  await expect(page.getByLabel("Cancellation")).toContainText('"exact":true');
  await page.getByRole("button", { name: "Release reconciliation", exact: true }).click();
  await confirm.requested;
  confirm.release([sibling, committed]);
  await expect(page.getByLabel("First chat read")).toHaveText("idle");
  await expect(page.getByLabel("First chat rules")).toHaveText(JSON.stringify([sibling, committed]));
});

test("a late old-owner response neither cancels nor seeds the rebound owner's global cache", async ({ mount, page }) => {
  const row = { ...global, name: "Original A" };
  const foreign = { ...row, name: "Second owner's row" };
  const saved = { ...row, name: "Committed B" };
  const write = trpcHold();
  let reads = 0;
  const routes: TrpcRoutes<"automation.listOwnerRules" | "automation.listRules" | "automation.updateRule"> = {
    "automation.listOwnerRules": () => (reads++ === 0 ? [row] : [foreign]),
    "automation.listRules": () => [],
    "automation.updateRule": () => write,
  };
  await routeTrpc(page, routes);
  await mount(<RuleMutationEchoStory {...props} row={row} />);
  await expect(page.getByLabel("Global rules")).toHaveText(JSON.stringify([row]));
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await write.requested;
  await page.getByRole("button", { name: "Switch verified owner", exact: true }).click();
  await expect(page.getByLabel("Bound owner")).toHaveText("Second");
  await expect(page.getByLabel("Global rules")).toHaveText(JSON.stringify([foreign]));
  await expect(page.getByLabel("Scope reconciliations")).toHaveText("1");
  write.release(saved);
  await expect(page.getByLabel("Settled cache")).toContainText("failed:This editing session ended");
  await expect(page.getByLabel("Cancellation")).toHaveText("none");
  await expect(page.getByLabel("Scope reconciliations")).toHaveText("1");
  await expect(page.getByLabel("Global rules")).toHaveText(JSON.stringify([foreign]));
});

test("owner rebinding while cancellation is awaited prevents the resumed cache seed", async ({ mount, page }) => {
  const row = { ...global, name: "Original A" };
  const foreign = { ...row, name: "Second owner's row" };
  const saved = { ...row, name: "Committed B" };
  let reads = 0;
  const routes: TrpcRoutes<"automation.listOwnerRules" | "automation.listRules" | "automation.updateRule"> = {
    "automation.listOwnerRules": () => (reads++ === 0 ? [row] : [foreign]),
    "automation.listRules": () => [],
    "automation.updateRule": () => saved,
  };
  await routeTrpc(page, routes);
  await mount(<RuleMutationEchoStory {...props} row={row} holdCancellation={true} />);
  await expect(page.getByLabel("Global rules")).toHaveText(JSON.stringify([row]));
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect(page.getByLabel("Cancellation")).toContainText('"exact":true');
  await expect(page.getByLabel("Settled cache")).toHaveText("idle");
  await page.getByRole("button", { name: "Switch verified owner", exact: true }).click();
  await expect(page.getByLabel("Bound owner")).toHaveText("Second");
  await expect(page.getByLabel("Global rules")).toHaveText(JSON.stringify([foreign]));
  await page.getByRole("button", { name: "Release cancellation", exact: true }).click();
  await expect(page.getByLabel("Settled cache")).toContainText("failed:This editing session ended");
  await expect(page.getByLabel("Scope reconciliations")).toHaveText("1");
  await expect(page.getByLabel("Global rules")).toHaveText(JSON.stringify([foreign]));
});

test("a rejected write never cancels or seeds the committed read", async ({ mount, page }) => {
  const routes: TrpcRoutes<"automation.listOwnerRules" | "automation.listRules" | "automation.updateRule"> = {
    "automation.listOwnerRules": () => [global],
    "automation.listRules": (input) => (input.chatId === firstChat ? [sibling, initial] : [other]),
    "automation.updateRule": () => trpcError({ message: "write refused" }),
  };
  await routeTrpc(page, routes);
  await mount(<RuleMutationEchoStory {...props} row={initial} />);
  await expect(page.getByLabel("First chat rules")).toHaveText(JSON.stringify([sibling, initial]));
  await page.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect(page.getByLabel("Settled cache")).toContainText("failed:write refused");
  await expect(page.getByLabel("Cancellation")).toHaveText("none");
  await expect(page.getByLabel("First chat rules")).toHaveText(JSON.stringify([sibling, initial]));
});
