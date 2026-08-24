// verb: updateRule — replace editable fields (host-only), same validation, resets the error ledger.

import { chatParticipants } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { RuleValidationError } from "@orb/server/domain/automation";
import { and, eq, isNull } from "drizzle-orm";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedParticipant } from "../../chat/_support.ts";
import { MSG_COMMITTED, principal, ruleFixture, SET_VAR, seedUser } from "../_support.ts";

test("updateRule replaces the editable fields and announces the edit", async () => {
  const { host, chatId, svc, events } = await ruleFixture();
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "greet", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  const updated = await svc.updateRule({ principal: principal(host), ruleId: rule.id, name: "greet2", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  expect(updated.name).toBe("greet2");
  expect(updated.id).toBe(rule.id);
  expect(events).toEqual([
    { type: "rulesChanged", chatId },
    { type: "rulesChanged", chatId },
  ]);
});

test("an update that fails validation writes nothing and announces nothing", async () => {
  const { host, chatId, svc, events } = await ruleFixture();
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "greet", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  await expect(
    svc.updateRule({ principal: principal(host), ruleId: rule.id, name: "bad", trigger: MSG_COMMITTED, predicateCel: "event.role ==", actions: [SET_VAR] }),
  ).rejects.toThrow(RuleValidationError);
  // Only the create's event stands: `validateRuleInput` runs before `applyRuleUpdate`, so the announce that
  // sits after the write cannot fire on a refusal.
  expect(events).toEqual([{ type: "rulesChanged", chatId }]);
  const [listed] = await svc.listRules({ principal: principal(host), chatId });
  expect(listed?.name).toBe("greet");
});

// D146-b — WHOSE reachability the mint gate asks about, pinned at the one state where the editor and the
// author are different people.
//
// `requireRuleHost` admits any HOST of the rule's chat, and an edited rule still DISPATCHES as its ORIGINAL
// author (`rule.ownerId` is what `runGates`, the arm's `authorUserId` and the tool's exec principal all read).
// So if the gate asked about the CALLER, a successor host could point someone else's rule at a plugin THEY
// installed, and the rule would then be pointed at a tool the identity it runs as cannot drive — a rule
// authored to be permanently paused, minted past a gate that exists to make that impossible. Reachability is a
// question about who ACTS, never about who typed.
//
// The handoff is written in the ORDER the schema forces: ONE present host per chat is PHYSICS
// (`chat_participants_chat_host_unique`), so the author's seat is vacated before the successor takes it.
test("a SUCCESSOR host cannot point the author's rule at a tool only the SUCCESSOR can drive", async () => {
  // Bound after the seed below — the predicate is only called at `updateRule`, so the stub can compare against
  // the real seeded user rather than a hand-spelled id.
  let successorId: UserId | null = null;
  const fx = await ruleFixture({
    tools: {
      // `plugin_successors` belongs to the successor and to nobody else.
      isToolDrivableBy: (name, userId): boolean => name === "plugin_successors" && userId === successorId,
      runTool: () => Promise.resolve({ ok: false, reason: "unavailable" }),
    },
  });
  const rule = await fx.svc.createRule({ principal: principal(fx.host), chatId: fx.chatId, name: "greet", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  const successor = await seedUser(fx.db, "user_successor");
  successorId = successor;
  await fx.db
    .update(chatParticipants)
    .set({ role: "member" })
    .where(and(eq(chatParticipants.chatId, fx.chatId), eq(chatParticipants.userId, fx.host), isNull(chatParticipants.leftSeq)));
  await seedParticipant(fx.db, { chatId: fx.chatId, key: "successor", userId: successor, role: "host" });

  await expect(
    fx.svc.updateRule({
      principal: principal(successor),
      ruleId: rule.id,
      name: "greet",
      trigger: MSG_COMMITTED,
      actions: [{ type: "run_tool", name: "plugin_successors" }],
    }),
  ).rejects.toThrow(RuleValidationError);

  // THE PREMISE, proven rather than assumed: the successor's caller-side host gate really does PASS — the same
  // verb with an ordinary arm succeeds for them. So the refusal above came from the reachability gate, not
  // from `requireRuleHost`.
  const ok = await fx.svc.updateRule({ principal: principal(successor), ruleId: rule.id, name: "greet3", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  expect(ok.name).toBe("greet3");
});
