// verb: resolveStreamAuthority — the `automation.stream` subscribe-time VISIBILITY GATE (04 §5). This is the
// proof the gate BITES: a non-present member never resolves an authority (a leak-free AutomationChatNotFound
// → NOT_FOUND at transport, before any bus tail attaches — a user never receives another chat's automation
// events), while a present host/member resolves the tier the subscription projects by (`host` sees every
// event; `member` sees only the room-visible quickReplySurfaced chips). The injected-op-caller-gate class,
// fail-closed: the chatId is the untrusted input and present-membership is the chokepoint.

import { AutomationChatNotFoundError } from "@orb/server/domain/automation";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedParticipant } from "../../chat/_support.ts";
import { principal, ruleFixture, seedUser } from "../_support.ts";

describe("resolveStreamAuthority — the automation.stream visibility gate", () => {
  test("the host resolves the `host` tier (receives every bus event)", async () => {
    const { host, chatId, svc } = await ruleFixture();
    await expect(svc.resolveStreamAuthority({ principal: principal(host), chatId })).resolves.toBe("host");
  });

  test("a present member (not host) resolves the `member` tier — a KNOWN participant, chips only", async () => {
    const { db, chatId, svc } = await ruleFixture();
    const member = await seedUser(db, "user_member");
    await seedParticipant(db, { chatId, key: "mem", userId: member, role: "member" });
    await expect(svc.resolveStreamAuthority({ principal: principal(member), chatId })).resolves.toBe("member");
  });

  test("a non-present member gets a leak-free chat-not-found (the gate bites — no cross-chat leak)", async () => {
    const { db, chatId, svc } = await ruleFixture();
    const stranger = await seedUser(db, "user_stranger");
    await expect(svc.resolveStreamAuthority({ principal: principal(stranger), chatId })).rejects.toThrow(AutomationChatNotFoundError);
  });

  test("a departed member (leftSeq set) is treated as non-present — fail-closed", async () => {
    const { db, chatId, svc } = await ruleFixture();
    const gone = await seedUser(db, "user_gone");
    await seedParticipant(db, { chatId, key: "gone", userId: gone, role: "member", leftSeq: 5 });
    await expect(svc.resolveStreamAuthority({ principal: principal(gone), chatId })).rejects.toThrow(AutomationChatNotFoundError);
  });
});
