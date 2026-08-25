// verb: listOwnerRules (C5) — the caller's OWN owner-global rules, in position order.
//
// THE PROPERTY IS THE PARTITION, not the ordering: this verb takes no id, so the only lane it can read is
// the caller's own. That is the D18 single-owned posture (`global_variables` reads its plane the same way),
// and it is what makes the read leak-free BY CONSTRUCTION rather than by a gate — there is no argument a
// caller could supply to ask about someone else. These pins exist so a later "add an ownerId param for
// admin" would red here rather than quietly turning a structural guarantee into a missing check.
//
// The admission matrix that decides which rules can EXIST on this lane is `../substrate/validate.int.test.ts`.

import type { AutomationActionInput } from "@orb/contracts/automation";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { principal, ruleFixture, seedUser } from "../_support.ts";

const DOMAIN_TRIGGER = { bus: "domain", type: "character.updated" } as const;
const GLOBAL_ARM: AutomationActionInput = { type: "set_variable", scope: "global", key: "seen", op: "inc" };

describe("listOwnerRules", () => {
  test("reads ONLY the caller's own lane — a second author's rules are invisible, not forbidden", async () => {
    const f = await ruleFixture();
    const other = await seedUser(f.db, "user_other");
    await f.svc.createRule({ principal: principal(f.host), chatId: null, name: "mine", trigger: DOMAIN_TRIGGER, actions: [GLOBAL_ARM] });
    await f.svc.createRule({ principal: principal(other), chatId: null, name: "theirs", trigger: DOMAIN_TRIGGER, actions: [GLOBAL_ARM] });

    await expect(f.svc.listOwnerRules({ principal: principal(f.host) })).resolves.toMatchObject([{ name: "mine", chatId: null }]);
    await expect(f.svc.listOwnerRules({ principal: principal(other) })).resolves.toMatchObject([{ name: "theirs", chatId: null }]);
  });

  test("a CHAT rule never appears on the global lane, and vice versa — the two lists are disjoint", async () => {
    const f = await ruleFixture();
    await f.svc.createRule({
      principal: principal(f.host),
      chatId: f.chatId,
      name: "room rule",
      trigger: { bus: "chat", type: "messageCommitted" },
      actions: [GLOBAL_ARM],
    });
    await f.svc.createRule({ principal: principal(f.host), chatId: null, name: "library rule", trigger: DOMAIN_TRIGGER, actions: [GLOBAL_ARM] });

    await expect(f.svc.listOwnerRules({ principal: principal(f.host) })).resolves.toMatchObject([{ name: "library rule" }]);
    await expect(f.svc.listRules({ principal: principal(f.host), chatId: f.chatId })).resolves.toMatchObject([{ name: "room rule" }]);
  });

  test("orders by position, which is the order the rules were minted in", async () => {
    const f = await ruleFixture();
    await f.svc.createRule({ principal: principal(f.host), chatId: null, name: "first", trigger: DOMAIN_TRIGGER, actions: [GLOBAL_ARM] });
    await f.svc.createRule({ principal: principal(f.host), chatId: null, name: "second", trigger: DOMAIN_TRIGGER, actions: [GLOBAL_ARM] });
    // Order IS semantics on this lane exactly as it is in a room: the arms of two rules in one dispatch
    // batch share (and mutate) the author's global variable plane.
    const rules = await f.svc.listOwnerRules({ principal: principal(f.host) });
    expect(rules.map((rule) => rule.name)).toEqual(["first", "second"]);
    expect(rules.map((rule) => rule.position)).toEqual([0, 1]);
  });

  test("an author with no global rules reads an EMPTY lane, never someone else's", async () => {
    const f = await ruleFixture();
    const other = await seedUser(f.db, "user_other");
    await f.svc.createRule({ principal: principal(f.host), chatId: null, name: "mine", trigger: DOMAIN_TRIGGER, actions: [GLOBAL_ARM] });
    // The empty read is about WHICH PRINCIPAL ASKED, never about whether any global rule exists — one does.
    await expect(f.svc.listOwnerRules({ principal: principal(other) })).resolves.toEqual([]);
  });
});
