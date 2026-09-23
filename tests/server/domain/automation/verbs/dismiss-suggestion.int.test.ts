// verb: dismissSuggestion — S4's HOST NO. The mirror test for the verb;
// its behavior ALONGSIDE a live fire (an arm stashes, the host dismisses, nothing runs) is proven in
// `confirm-suggestion.int.test.ts`, which drives the real dispatch. What is proven HERE is the verb's own
// contract against a store the test raises into directly: the take, the gate, and the collapse.
//
// WHY DISMISS IS A SERVER VERB AT ALL (the thing a later "simplification" would take away): a dismissed ask
// must actually DIE. If dismissal were client-side state the record would sit in the server's map until its
// TTL, another host tab would keep offering it, and — because the store replaces per `(chatId, ruleId)` —
// the rule's next fire would be silently "answered" by a card the host already refused.

import type { AutomationSuggestionId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { PendingSuggestion } from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import { AUTOMATION_SUGGESTION_TTL_MS } from "../../../../../packages/server/src/domain/automation/substrate/suggestions.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedParticipant } from "../../chat/_support.ts";
import { FIXED_NOW_MS, principal, ruleFixture, seedUser } from "../_support.ts";

const GONE = /automation_suggestion/u;

/** Raise a pending ask directly into the fixture's store (the dispatch's own raise is proven elsewhere). */
function raise(fx: Awaited<ReturnType<typeof ruleFixture>>, id: AutomationSuggestionId = mintTypeId(ID_PREFIX.automationSuggestion)): PendingSuggestion {
  const entry: PendingSuggestion = {
    id,
    kind: "confirm",
    chatId: fx.chatId,
    source: { kind: "rule", ruleId: mintTypeId(ID_PREFIX.automationRule) },
    actorUserId: fx.host,
    summary: "Take a turn in the room?",
    expiresAt: FIXED_NOW_MS + AUTOMATION_SUGGESTION_TTL_MS,
    payload: null,
  };
  fx.ctx.suggestions.raise(entry);
  return entry;
}

test("the host's dismiss TAKES the ask — it is gone from the store, not merely hidden", async () => {
  const fx = await ruleFixture();
  const ask = raise(fx);

  await fx.svc.dismissSuggestion({ principal: principal(fx.host), suggestionId: ask.id });

  expect(fx.ctx.suggestions.peek(ask.id, FIXED_NOW_MS)).toBeNull();
  expect(fx.ctx.suggestions.countForChat(fx.chatId)).toBe(0);
  // #700 — the drop emits the host-only RETIREMENT event so every attached host tab drops the card (the
  // acting tab also retires optimistically; this is the OTHER-tabs channel, no query/replay on this room).
  expect(fx.events.filter((e) => e.type === "suggestionResolved" && e.suggestionId === ask.id)).toHaveLength(1);
});

test("a second dismiss refuses leak-free (idempotent by collapse, exactly like a double confirm)", async () => {
  const fx = await ruleFixture();
  const ask = raise(fx);
  await fx.svc.dismissSuggestion({ principal: principal(fx.host), suggestionId: ask.id });

  await expect(fx.svc.dismissSuggestion({ principal: principal(fx.host), suggestionId: ask.id })).rejects.toThrow(GONE);
});

test("an unknown id refuses the same way a taken one does — the caller learns nothing either way", async () => {
  const fx = await ruleFixture();
  await expect(fx.svc.dismissSuggestion({ principal: principal(fx.host), suggestionId: mintTypeId(ID_PREFIX.automationSuggestion) })).rejects.toThrow(GONE);
});

test("a MEMBER who is not host cannot dismiss the host's card, and the ask survives their click", async () => {
  const fx = await ruleFixture();
  const ask = raise(fx);
  const member = await seedUser(fx.db, "user_member");
  await seedParticipant(fx.db, { chatId: fx.chatId, key: "member", userId: member, role: "member" });

  await expect(fx.svc.dismissSuggestion({ principal: principal(member), suggestionId: ask.id })).rejects.toThrow();
  expect(fx.ctx.suggestions.peek(ask.id, FIXED_NOW_MS)?.id).toBe(ask.id);
});

test("a NON-MEMBER gets the ask's own leak-free not-found (never the chat id they never supplied)", async () => {
  const fx = await ruleFixture();
  const ask = raise(fx);
  const stranger = await seedUser(fx.db, "user_stranger");

  await expect(fx.svc.dismissSuggestion({ principal: principal(stranger), suggestionId: ask.id })).rejects.toThrow(GONE);
});

test("an EXPIRED ask is already gone — a stale card's dismiss refuses instead of pretending", async () => {
  const fx = await ruleFixture();
  const ask = raise(fx);
  // The store sweeps against the INJECTED clock, so this is the same edge the client's own timer uses.
  expect(fx.ctx.suggestions.peek(ask.id, ask.expiresAt)).toBeNull();
  await expect(fx.svc.dismissSuggestion({ principal: principal(fx.host), suggestionId: ask.id })).rejects.toThrow(GONE);
});
