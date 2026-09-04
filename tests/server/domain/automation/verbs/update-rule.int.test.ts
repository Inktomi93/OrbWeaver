// verb: updateRule — replace editable fields (host-only), same validation, resets the error ledger.

import { chatParticipants } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createAutomationService, createEnabledRuleIndex, RuleValidationError } from "@orb/server/domain/automation";
import { and, eq, isNull } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedParticipant } from "../../chat/_support.ts";
import { FIXED_NOW_MS, MSG_COMMITTED, makeAutomationHarness, principal, readFailingDb, ruleFixture, SET_VAR, seedHostChat, seedUser } from "../_support.ts";

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

test("ANY edit clears the mint provenance — a hand-edited rule is no longer the preset's mint (§3-S3; B10's capture must not read a lying bag)", async () => {
  const { host, chatId, svc } = await ruleFixture();
  const [minted] = await svc.createRuleFromPreset({ principal: principal(host), chatId, presetId: "pacingNudge", knobs: { everyN: 4 } });
  expect(minted?.rulePresetId).toBe("pacingNudge"); // the stamp landed (the premise, proven)
  if (minted === undefined) {
    throw new Error("mint returned no rule");
  }
  const updated = await svc.updateRule({ principal: principal(host), ruleId: minted.id, name: minted.name, trigger: minted.trigger, actions: [SET_VAR] });
  expect(updated.rulePresetId).toBeNull();
  expect(updated.rulePresetKnobs).toBeNull();
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

// #1424 — AN EDIT VOIDS THE RULE'S PENDING ASKS. A confirm card stores the arm AS IT RESOLVED at fire time and
// executing it runs that STASHED arm, so a host who edits a dangerous action away must not be able to confirm
// the card still sitting in their room and run the PRE-EDIT act. The confirm's own liveness re-check cannot
// close this: it asks exists/enabled/author-still-hosts, all still true after an edit.
//
// Asserted through the STORE the card is read from (`ctx.suggestions`) — the same map the confirm verb takes
// its record from and the same one `setRuleEnabled(false)`/`deleteRule` already clear.
test("editing a rule VOIDS its pending confirmation cards — the stale card cannot run the pre-edit action", async () => {
  const fx = await ruleFixture();
  const rule = await fx.svc.createRule({ principal: principal(fx.host), chatId: fx.chatId, name: "greet", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  const suggestionId = mintTypeId(ID_PREFIX.automationSuggestion);
  fx.ctx.suggestions.raise({
    id: suggestionId,
    kind: "confirm",
    chatId: fx.chatId,
    source: { kind: "rule", ruleId: rule.id },
    actorUserId: fx.host,
    summary: "Take a turn in the room?",
    expiresAt: FIXED_NOW_MS + 60_000,
    payload: null,
  });
  // THE PREMISE, proven: the card is live before the edit, so its absence after is the edit's doing.
  expect(fx.ctx.suggestions.peek(suggestionId, FIXED_NOW_MS)).not.toBeNull();

  await fx.svc.updateRule({ principal: principal(fx.host), ruleId: rule.id, name: "greet", trigger: MSG_COMMITTED, actions: [SET_VAR] });

  expect(fx.ctx.suggestions.peek(suggestionId, FIXED_NOW_MS)).toBeNull();
});

// #1431 — the durable write is the SOURCE OF TRUTH and an in-process index rebuild is derived state. A failed
// rebuild must not reject an operation that already committed, and the stale index must fail OPEN so canon
// decides. The read facade fails the INDEX's reads only; the verb's own write goes to the real db.
test("an index-refresh failure does NOT reject the committed edit, and the stale index falls back to the DB", async () => {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedHostChat(db, host);
  const failing = { fail: false };
  const enabled = createEnabledRuleIndex(readFailingDb(db, failing));
  const ctx = makeAutomationHarness(db, { enabled });
  const svc = createAutomationService(ctx);
  const rule = await svc.createRule({ principal: principal(host), chatId, name: "greet", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  await enabled.reload();

  failing.fail = true;
  // The edit RESOLVES — the row is written, and a caller told "failed" for a change that landed is the worse
  // half of the defect (the other half is the index that keeps dispatching the pre-edit rule).
  const updated = await svc.updateRule({ principal: principal(host), ruleId: rule.id, name: "greet2", trigger: MSG_COMMITTED, actions: [SET_VAR] });
  expect(updated.name).toBe("greet2");
  expect(enabled.isStale()).toBe(true);
  // FAIL OPEN: while stale the pre-check claims interest in every chat, so the authoritative DB read runs.
  expect(enabled.has(chatId)).toBe(true);

  // And the front door REBUILDS on the next event it sees — the stale latch survives at most one event.
  failing.fail = false;
  await svc.handleEvent({ type: "chatOpened", chatId });
  expect(enabled.isStale()).toBe(false);
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
