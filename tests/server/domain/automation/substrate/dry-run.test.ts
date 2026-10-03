// substrate/dry-run — the testRule engine: predicate evaluation (always-fire on null/empty, chat-scoped
// binding, parse/eval error surfacing) and the arm preview renderer (template selection + strict-arg error
// surfacing). Pure — no db, no I/O; determinism needs no injected clock here (CEL/macro do not read one).

import type { AutomationCelEnv } from "@orb/contracts/automation";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { IanaTimeZone } from "@orb/kit/time";
import { parseIanaTimeZone, UTC_TIME_ZONE } from "@orb/kit/time";
import { describe } from "vitest";
import {
  emptyDryRunEnv,
  evaluatePredicate,
  renderArmPreview,
  ruleClock,
  synthFact,
} from "../../../../../packages/server/src/domain/automation/substrate/dry-run.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const BASE_ENV: AutomationCelEnv = {
  event: { bus: "chat", type: "chatOpened", chatId: "chat_x" },
  vars: { mood: "grim" },
  choice: {},
  global: { streak: "3" },
  chat: { id: "chat_x", messageCount: 5 },
  ...ruleClock(1_700_000_000_000, null),
};

describe("evaluatePredicate", () => {
  test("null and empty predicates always fire", () => {
    expect(evaluatePredicate(null, BASE_ENV, true)).toBe(true);
    expect(evaluatePredicate("", BASE_ENV, true)).toBe(true);
  });

  test("a chat-scoped predicate reads the bound chat plane", () => {
    expect(evaluatePredicate("chat.messageCount > 3", BASE_ENV, true)).toBe(true);
    expect(evaluatePredicate("chat.messageCount > 100", BASE_ENV, true)).toBe(false);
  });

  test("a chat-keyed predicate against an UNSCOPED (owner-global) frame answers predicate_error, never an invented empty room", () => {
    const result = evaluatePredicate("chat.messageCount > 3", BASE_ENV, false);
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  test("a parse error surfaces as {error}", () => {
    const result = evaluatePredicate("this is not cel (((", BASE_ENV, true);
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  test("a non-boolean result is a typed error, not a truthy coercion", () => {
    const result = evaluatePredicate("chat.messageCount", BASE_ENV, true);
    expect(result).toEqual({ error: "predicate must evaluate to a boolean" });
  });
});

describe("renderArmPreview", () => {
  const render = { env: BASE_ENV, nowMs: 1_700_000_000_000, prng: () => 0.5, chatScoped: true };

  test("an arm with no template field (set_chat_background — a model QUIET pick, no host text) previews as a bare type marker", () => {
    expect(renderArmPreview({ type: "set_chat_background", confirmFirst: false }, render)).toEqual({
      type: "set_chat_background",
    });
  });

  test("a rendered template previews the resolved text", () => {
    const preview = renderArmPreview({ type: "post_notification", recipient: "host", messageTemplate: "streak is {{getglobalvar::streak}}" }, render);
    expect(preview).toEqual({ type: "post_notification", renderedPreview: "streak is 3" });
  });

  test("a strict-arg error surfaces as the arm's typed refusal, not a silently-wrong render", () => {
    const preview = renderArmPreview({ type: "post_notification", recipient: "host", messageTemplate: "{{unknownmacro}}" }, render);
    expect(preview).toMatchObject({ type: "post_notification", error: expect.any(String) });
  });

  test("transform_draft seeds an EMPTY {{draft}} so the rest of the template still renders", () => {
    const preview = renderArmPreview({ type: "transform_draft", target: "user_input", template: "was:[{{draft}}]" }, render);
    expect(preview).toEqual({ type: "transform_draft", renderedPreview: "was:[]" });
  });
});

test("synthFact carries the trigger + chatId with no other facts", () => {
  const chatId = castId<ChatId>("chat_x");
  expect(synthFact({ bus: "chat", type: "chatOpened" }, chatId)).toEqual({ bus: "chat", type: "chatOpened", chatId });
  expect(synthFact({ bus: "domain", type: "character.updated" }, null)).toEqual({ bus: "domain", type: "character.updated", chatId: null });
});

test("emptyDryRunEnv binds chat.id to '' for an owner-global (null chatId) rule, never a fabricated room", () => {
  const env = emptyDryRunEnv({
    chatId: null,
    messageCount: 0,
    global: {},
    event: { bus: "domain", type: "character.updated", chatId: null },
    clock: ruleClock(1000, null),
  });
  expect(env.chat).toEqual({ id: "", messageCount: 0 });
  expect(env.vars).toEqual({});
  expect(env.choice).toEqual({});
});

function zone(name: string): IanaTimeZone {
  const parsed = parseIanaTimeZone(name);
  if (parsed === null) {
    throw new Error(`test zone ${name} is unknown to this platform`);
  }
  return parsed;
}

describe("ruleClock", () => {
  const kathmandu = zone("Asia/Kathmandu");
  const newYork = zone("America/New_York");

  test("a rule saved before rules carried a zone keeps reading UTC", () => {
    // 2023-11-14T22:13:20.000Z is a Tuesday.
    expect(ruleClock(1_700_000_000_000, null)).toEqual({ now: { epochMs: 1_700_000_000_000, hour: 22, dayOfWeek: 2 }, timeZone: UTC_TIME_ZONE });
  });

  test("a +5:45 zone turns the hour at quarter past the UTC hour, and carries the day across midnight", () => {
    // 17:14:59Z is 22:59:59 in Kathmandu; one second later is 23:00. 18:15Z is local midnight, Friday.
    expect(ruleClock(Date.UTC(2026, 0, 15, 17, 14, 59), kathmandu).now).toMatchObject({ hour: 22, dayOfWeek: 4 });
    expect(ruleClock(Date.UTC(2026, 0, 15, 17, 15, 0), kathmandu).now).toMatchObject({ hour: 23, dayOfWeek: 4 });
    expect(ruleClock(Date.UTC(2026, 0, 15, 18, 15, 0), kathmandu).now).toMatchObject({ hour: 0, dayOfWeek: 5 });
    expect(ruleClock(Date.UTC(2026, 0, 15, 18, 15, 0), kathmandu).timeZone).toBe("Asia/Kathmandu");
  });

  test("New York's spring-forward day skips 02:00 and its fall-back day repeats 01:00", () => {
    // 2026-03-08 (Sunday): 06:59Z is 01:59 EST, 07:00Z is 03:00 EDT.
    expect(ruleClock(Date.UTC(2026, 2, 8, 6, 59), newYork).now).toMatchObject({ hour: 1, dayOfWeek: 0 });
    expect(ruleClock(Date.UTC(2026, 2, 8, 7, 0), newYork).now).toMatchObject({ hour: 3, dayOfWeek: 0 });
    // 2026-11-01 (Sunday): 05:30Z is 01:30 EDT and 06:30Z is 01:30 EST; 07:00Z is 02:00 EST.
    expect(ruleClock(Date.UTC(2026, 10, 1, 5, 30), newYork).now.hour).toBe(1);
    expect(ruleClock(Date.UTC(2026, 10, 1, 6, 30), newYork).now.hour).toBe(1);
    expect(ruleClock(Date.UTC(2026, 10, 1, 7, 0), newYork).now.hour).toBe(2);
  });

  test("the quiet-hours clause reads the rule's zone, not UTC", () => {
    // The awake-hours preset's 23→08 window, as the builder mints it.
    const awake = "(int(now.hour) < 23 && int(now.hour) >= 8)";
    // 17:20Z: 17:20 in UTC (awake), 23:05 in Kathmandu (quiet).
    const instant = Date.UTC(2026, 0, 15, 17, 20);
    expect(evaluatePredicate(awake, { ...BASE_ENV, ...ruleClock(instant, null) }, true)).toBe(true);
    expect(evaluatePredicate(awake, { ...BASE_ENV, ...ruleClock(instant, kathmandu) }, true)).toBe(false);
  });
});
