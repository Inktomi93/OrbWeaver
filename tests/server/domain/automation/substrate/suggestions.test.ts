// S4 — the pending-ask STORE (RULED F1's in-RAM map). Pure unit: no db, no service, an injected clock as a
// plain number. The four properties the whole confirm path rests on, each pinned against the shape a real
// race produces rather than against the implementation:
//   TAKE-ONCE       — the double-click answer. Two claims of one id, exactly one payload.
//   REPLACE-PER-KEY — a cadence rule that fires every beat keeps ONE live ask, so the band's one-visible-
//                     card budget is bounded by RULE COUNT and not by fire rate.
//   TTL             — swept explicitly against the injected clock (no timer), on every observing call.
//   VOID            — by rule (consent withdrawn) and by chat (the RULED host-handoff wall).

import type { AutomationSuggestionKind } from "@orb/contracts/automation";
import type { AutomationRuleId, AutomationSuggestionId, ChatId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { PendingSuggestion } from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import { AUTOMATION_SUGGESTION_TTL_MS, createSuggestionStore } from "../../../../../packages/server/src/domain/automation/substrate/suggestions.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const NOW = 1_700_000_000_000;
const CHAT_A = castId<ChatId>("chat_a");
const CHAT_B = castId<ChatId>("chat_b");
const RULE_1 = castId<AutomationRuleId>("automationrule_1");
const RULE_2 = castId<AutomationRuleId>("automationrule_2");
const AUTHOR = castId<UserId>("user_author");

function ask(over: Partial<PendingSuggestion> = {}): PendingSuggestion {
  const kind: AutomationSuggestionKind = "confirm";
  return {
    id: mintTypeId(ID_PREFIX.automationSuggestion),
    kind,
    chatId: CHAT_A,
    ruleId: RULE_1,
    authorUserId: AUTHOR,
    summary: "Take a turn in the room?",
    expiresAt: NOW + AUTOMATION_SUGGESTION_TTL_MS,
    stashed: null,
    ...over,
  };
}

test("claim is TAKE-ONCE — the second claim of one id finds nothing (the double-click answer)", () => {
  const store = createSuggestionStore();
  const entry = ask();
  store.raise(entry);

  expect(store.claim(entry.id, NOW)?.id).toBe(entry.id);
  expect(store.claim(entry.id, NOW)).toBeNull();
  // …and the peek that a racing confirm would have done first is equally empty afterwards.
  expect(store.peek(entry.id, NOW)).toBeNull();
});

test("raise REPLACES per (chatId, ruleId) — one rule keeps ONE live ask however often it fires", () => {
  const store = createSuggestionStore();
  const first = ask({ summary: "beat 1" });
  const second = ask({ summary: "beat 2" });
  store.raise(first);
  store.raise(second);

  expect(store.countForChat(CHAT_A)).toBe(1);
  expect(store.peek(first.id, NOW)).toBeNull(); // the superseded ask is GONE, not shadowed
  expect(store.peek(second.id, NOW)?.summary).toBe("beat 2");
});

test("a DIFFERENT rule in the same chat gets its own slot (the replace is per rule, not per chat)", () => {
  const store = createSuggestionStore();
  store.raise(ask({ ruleId: RULE_1 }));
  store.raise(ask({ ruleId: RULE_2 }));
  expect(store.countForChat(CHAT_A)).toBe(2);
});

test("the TTL is swept against the INJECTED clock, on the calls that can observe an expired ask", () => {
  const store = createSuggestionStore();
  const entry = ask();
  store.raise(entry);

  const justBefore = entry.expiresAt - 1;
  expect(store.peek(entry.id, justBefore)?.id).toBe(entry.id);
  // ON the deadline (not merely past it) the ask is gone — the client drops its card on the same edge.
  expect(store.peek(entry.id, entry.expiresAt)).toBeNull();
  expect(store.countForChat(CHAT_A)).toBe(0);
  // And the sweep frees the SLOT, so the same rule's NEXT fire raises a fresh ask that lives its own TTL.
  const next = ask({ expiresAt: entry.expiresAt + AUTOMATION_SUGGESTION_TTL_MS });
  store.raise(next);
  expect(store.claim(next.id, entry.expiresAt + 1)?.id).toBe(next.id);
});

test("listForChat sweeps too — an expired ask never reaches the host-handoff re-check", () => {
  const store = createSuggestionStore();
  const stale = ask({ expiresAt: NOW + 1 });
  const live = ask({ ruleId: RULE_2 });
  store.raise(stale);
  store.raise(live);
  expect(store.listForChat(CHAT_A, NOW + 2).map((a) => a.id)).toEqual([live.id]);
});

test("voidRule drops one rule's asks; voidChat drops the whole room's (the handoff wall)", () => {
  const store = createSuggestionStore();
  const r1 = ask({ ruleId: RULE_1 });
  const r2 = ask({ ruleId: RULE_2 });
  // A real ruleId belongs to exactly ONE chat (the FK), so the other room's ask carries its own rule id —
  // `voidRule` is keyed on the rule alone and would otherwise be asked a question reality never poses.
  const other = ask({ chatId: CHAT_B, ruleId: castId<AutomationRuleId>("automationrule_3") });
  store.raise(r1);
  store.raise(r2);
  store.raise(other);

  expect(store.voidRule(RULE_1)).toBe(1);
  expect(store.peek(r1.id, NOW)).toBeNull();
  expect(store.peek(r2.id, NOW)?.id).toBe(r2.id);

  expect(store.voidChat(CHAT_A)).toBe(1);
  expect(store.countForChat(CHAT_A)).toBe(0);
  // Another room's asks are untouched — authority died in ONE room.
  expect(store.peek(other.id, NOW)?.id).toBe(other.id);
});

test("countForChat is the ZERO-COST pre-check — it answers without sweeping or allocating", () => {
  const store = createSuggestionStore();
  const entry = ask();
  store.raise(entry);
  // The hot bus path calls this on EVERY chatUpdated; it must be honest for a chat that has never had an ask.
  expect(store.countForChat(CHAT_B)).toBe(0);
  expect(store.countForChat(CHAT_A)).toBe(1);
});

test("drop is the dismiss half of the same take — idempotent by collapse", () => {
  const store = createSuggestionStore();
  const entry = ask();
  store.raise(entry);
  expect(store.drop(entry.id, NOW)?.id).toBe(entry.id);
  expect(store.drop(entry.id, NOW)).toBeNull();
});

test("an unknown id is null, never a throw (a stale card's click is a refusal, not a fault)", () => {
  const store = createSuggestionStore();
  const ghost: AutomationSuggestionId = mintTypeId(ID_PREFIX.automationSuggestion);
  expect(store.peek(ghost, NOW)).toBeNull();
  expect(store.claim(ghost, NOW)).toBeNull();
  expect(store.drop(ghost, NOW)).toBeNull();
});
