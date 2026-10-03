// Strict authoring routes over the real composed graph. The response-loss case drops the HTTP response
// only after the actual tRPC handler has committed and built it; retry must recover, not mint again.
import "../../../../support/composed-real.ts";
import { once } from "node:events";
import { createServer } from "node:http";
import { join } from "node:path";
import { automationRules } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { createCas } from "@orb/server/infra/storage";
import { eq } from "drizzle-orm";
import { createApp } from "../../../../../packages/server/src/entry/app.ts";
import { expect, OTHER_USER_ID, OWNER_USER_ID, test } from "../../../../support/fixtures.ts";
import { principal } from "../../../domain/automation/_support.ts";
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

test("lost mounted HTTP response after real commit recovers one unchanged birth with no second position", async ({
  db,
  app,
  ownerCaller,
  clock,
  importStagingDir,
}) => {
  const chatId = await seedChat(db, "lost-birth", { id: mintTypeId(ID_PREFIX.chat) });
  await seedParticipant(db, { chatId, key: "lost-host", userId: OWNER_USER_ID, role: "host" });
  const birth = { ...body, chatId, creationRequestId: mintTypeId(ID_PREFIX.automationRuleCreation) };
  const committed = Promise.withResolvers<void>();
  const handlerFailure = Promise.withResolvers<never>();
  const mounted = createApp({
    now: () => clock.now(),
    db,
    seam: {
      resolvePrincipal: () =>
        Promise.resolve({ principal: { ...principal(OWNER_USER_ID), role: "owner", via: "header" }, sessionId: null, csrfHeaderPresent: false }),
      debugGateAdmits: () => false,
    },
    services: app.services,
    presence: app.presence,
    sockets: app.sockets,
    rateLimit: { enforce: (): Promise<void> => Promise.resolve() },
    assets: app.assets,
    cas: createCas(join(importStagingDir, "unhit-cas")),
    character: app.services.character,
    portability: app.portability,
    settleImportMemory: app.settleImportMemory,
    importWorldInfo: app.importWorldInfo,
    importCardScripts: app.importCardScripts,
    exportService: app.exportService,
    sessions: app.sessions,
    isShuttingDown: () => false,
    credentialsKeyOk: () => true,
    inContainer: false,
    relayHosts: () => [],
    shareState: () => ({ state: "off" }),
    // This fixture tests a durable rule write, not first-request default-library seeding.
    seedUserCharacters: (): void => undefined,
    oidcProviderName: "fixture",
  });
  const forgedCatalog = await mounted.fetch(
    new Request(`http://127.0.0.1/api/trpc/automation.listRuleTools?input=${encodeURIComponent(JSON.stringify({ userId: OTHER_USER_ID }))}`),
    { incoming: { socket: { remoteAddress: "127.0.0.1", remotePort: 1, remoteFamily: "IPv4" } } },
  );
  expect(forgedCatalog.status).toBe(400);
  const server = createServer((req, res) => {
    void (async (): Promise<void> => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        if (!Buffer.isBuffer(chunk)) {
          throw new Error("expected an HTTP byte buffer");
        }
        chunks.push(chunk);
      }
      const response = await mounted.fetch(
        new Request(`http://127.0.0.1${req.url}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: Buffer.concat(chunks).toString("utf8"),
        }),
        { incoming: req },
      );
      if (response.status !== 200) {
        throw new Error(`expected committed response, got ${response.status}`);
      }
      await response.text();
      committed.resolve();
      res.destroy();
    })().catch((error: Error) => {
      handlerFailure.reject(error);
      res.destroy();
    });
  });
  server.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected loopback address");
    }
    const request = fetch(`http://127.0.0.1:${address.port}/api/trpc/automation.createRule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(birth),
    });
    const responseLost = expect(request).rejects.toThrow();
    await Promise.race([committed.promise, handlerFailure.promise]);
    await responseLost;
    const stored = await ownerCaller.automation.listRules({ chatId });
    expect(stored).toHaveLength(1);
    expect(await ownerCaller.automation.createRule(birth)).toEqual(stored[0]);
    expect(await ownerCaller.automation.createRule({ ...birth, name: "response-loss retry" })).toEqual(stored[0]);
    expect(await ownerCaller.automation.listRules({ chatId })).toEqual(stored);
    const recovered = stored[0];
    if (recovered === undefined) {
      throw new Error("expected committed birth");
    }
    const updated = await ownerCaller.automation.updateRule({ ...body, ruleId: recovered.id, name: "ordinary update after recovery" });
    expect(updated).toMatchObject({ id: recovered.id, name: "ordinary update after recovery", enabled: false, position: 0 });
    expect(await ownerCaller.automation.listRules({ chatId })).toEqual([updated]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
  }
});
