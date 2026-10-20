// Strict authoring routes over the real composed graph. The lost-response recovery is proven over the box
// owner's real loopback session in tests/server/transport/trpc/routers/automation-response-loss.int.test.ts.
import "@orb/testkit/node/composed-real.ts";
import { automationRules } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, OTHER_USER_ID, OWNER_USER_ID, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { seedChat, seedParticipant } from "../../../domain/chat/_support.ts";

const body = {
  timeZone: UTC_TIME_ZONE,
  name: "custom",
  trigger: { bus: "chat" as const, type: "messageCommitted" as const },
  actions: [{ type: "set_variable" as const, scope: "chat" as const, key: "mood", op: "set" as const, value: "grim" }],
};

test("owner-local global requests and reorder cannot recover or write another owner's marker", async ({ db, ownerCaller, otherCaller }) => {
  const globalBody = {
    ...body,
    chatId: null,
    creationRequestId: mintTypeId(ID_PREFIX.automationRuleCreation),
    trigger: { bus: "domain" as const, type: "character.updated" as const },
    actions: [{ ...body.actions[0], type: "set_variable" as const, scope: "global" as const, key: "mood", op: "set" as const, value: "grim" }],
  };
  const foreign = await otherCaller.automation.createRule({ ...globalBody, name: "foreign private rule marker" });
  const own = await ownerCaller.automation.createRule({ ...globalBody, name: "own marker" });
  expect(own.name).toBe("own marker");
  expect(own.id).not.toBe(foreign.id);
  expect(await ownerCaller.automation.createRule({ ...globalBody, name: "ignored retry" })).toEqual(own);
  const before = await db.select().from(automationRules).where(eq(automationRules.id, foreign.id));
  await expect.soft(ownerCaller.automation.reorderRules({ chatId: null, orderedIds: [own.id, foreign.id] })).toThrowTRPCError("BAD_REQUEST");
  expect(await db.select().from(automationRules).where(eq(automationRules.id, foreign.id))).toEqual(before);
  await expect(ownerCaller.automation.reorderRules({ chatId: null, orderedIds: [mintTypeId(ID_PREFIX.automationRule)] })).toThrowTRPCError("BAD_REQUEST");
  await ownerCaller.automation.reorderRules({ chatId: null, orderedIds: [own.id] });
  expect(await otherCaller.automation.listOwnerRules()).toEqual([foreign]);
  expect(await ownerCaller.automation.listOwnerRules()).toEqual([own]);
});

test("a save's zone lands canonical, and a zone the server does not know is stored as UTC instead of blocking the save", async ({ db, ownerCaller }) => {
  const chatId = await seedChat(db, "zones", { id: mintTypeId(ID_PREFIX.chat) });
  await seedParticipant(db, { chatId, key: "zones-host", userId: OWNER_USER_ID, role: "host" });
  const birth = (timeZone: string): Parameters<typeof ownerCaller.automation.createRule>[0] => ({
    ...body,
    timeZone,
    chatId,
    creationRequestId: mintTypeId(ID_PREFIX.automationRuleCreation),
  });
  expect((await ownerCaller.automation.createRule(birth("Etc/Unknown"))).timeZone).toBe("UTC");
  expect((await ownerCaller.automation.createRule(birth("+05:45"))).timeZone).toBe("UTC");
  const minted = await ownerCaller.automation.createRuleFromPreset({ chatId, presetId: "pacingNudge", timeZone: "Mars/Olympus_Mons" });
  expect(minted.map((mintedRule) => mintedRule.timeZone)).toEqual(["UTC"]);

  const rule = await ownerCaller.automation.createRule(birth("asia/kathmandu"));
  expect(rule.timeZone).toBe("Asia/Kathmandu");
  expect((await ownerCaller.automation.updateRule({ ...body, timeZone: "Etc/Unknown", ruleId: rule.id })).timeZone).toBe("UTC");
});

test("a stored zone the server no longer knows still lists, so the host can reopen the rule and re-save it", async ({ db, ownerCaller }) => {
  const chatId = await seedChat(db, "stale-zone", { id: mintTypeId(ID_PREFIX.chat) });
  await seedParticipant(db, { chatId, key: "stale-zone-host", userId: OWNER_USER_ID, role: "host" });
  const rule = await ownerCaller.automation.createRule({ ...body, chatId, creationRequestId: mintTypeId(ID_PREFIX.automationRuleCreation) });
  // A zone this ICU never knew stands in for one a future ICU drops.
  await db
    .update(automationRules)
    .set({ timeZone: "Mars/Olympus_Mons" as typeof automationRules.$inferSelect.timeZone })
    .where(eq(automationRules.id, rule.id));

  expect((await ownerCaller.automation.listRules({ chatId })).map((row) => row.timeZone)).toEqual(["Mars/Olympus_Mons"]);
  const saved = await ownerCaller.automation.updateRule({ ...body, timeZone: "Asia/Kathmandu", ruleId: rule.id });
  expect(saved.timeZone).toBe("Asia/Kathmandu");
});

test("strict mounted authoring creates disabled, updates losslessly without birth metadata, then reorders", async ({
  db,
  ownerCaller,
  otherCaller,
  anonCaller,
}) => {
  void otherCaller;
  const chatId = await seedChat(db, "editor", { id: mintTypeId(ID_PREFIX.chat) });
  await seedParticipant(db, { chatId, key: "editor-host", userId: OWNER_USER_ID, role: "host" });
  await seedParticipant(db, { chatId, key: "editor-member", userId: OTHER_USER_ID, role: "member" });
  const birth = { ...body, chatId, creationRequestId: mintTypeId(ID_PREFIX.automationRuleCreation) };
  const first = await ownerCaller.automation.createRule(birth);
  expect(first.enabled).toBe(false);
  expect(first).not.toHaveProperty("creationRequestId");
  expect(first).not.toHaveProperty("ownerId");
  await expect(otherCaller.automation.createRule(birth)).toThrowTRPCError("FORBIDDEN");
  await expect(anonCaller.automation.createRule(birth)).toThrowTRPCError("UNAUTHORIZED");
  const forgedBirth = { ...birth, enabled: true };
  await expect(ownerCaller.automation.createRule(forgedBirth)).toThrowTRPCError("BAD_REQUEST");
  const replacement = { ...body, ruleId: first.id, description: "", predicateCel: null, cooldownSeconds: 0, maxFiresPerHour: 0, matchAutomationEvents: false };
  const edited = await ownerCaller.automation.updateRule(replacement);
  expect(edited).toMatchObject({ description: "", predicateCel: null, maxFiresPerHour: 0, enabled: false });
  const stored = await db.select().from(automationRules).where(eq(automationRules.id, first.id));
  expect(stored[0]?.creationRequestId).toBe(birth.creationRequestId);
  expect(stored[0]?.ownerId).toBe(OWNER_USER_ID);
  expect(await ownerCaller.automation.createRule(birth)).toEqual(edited);
  const second = await ownerCaller.automation.createRule({ ...birth, creationRequestId: mintTypeId(ID_PREFIX.automationRuleCreation), name: "second" });
  await ownerCaller.automation.reorderRules({ chatId, orderedIds: [second.id, first.id] });
  expect((await ownerCaller.automation.listRules({ chatId })).map((rule) => rule.id)).toEqual([second.id, first.id]);
  await expect(otherCaller.automation.updateRule(replacement)).toThrowTRPCError("FORBIDDEN");
  expect(await ownerCaller.automation.listRuleTools()).toEqual([]);
});
