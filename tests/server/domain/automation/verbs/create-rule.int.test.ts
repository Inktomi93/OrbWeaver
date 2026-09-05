// verb: createRule — host authority + the whole validation gauntlet (reserved trigger/arm · bad CEL · arm
// cap · cooldown floor · unattached book), and the born-disabled/position-0 creation (04 §2).

import type { AutomationActionInput, AutomationTrigger } from "@orb/contracts/automation";
import { rpgGameConfigSchema } from "@orb/contracts/rpg";
import { rpgGames } from "@orb/db";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { AutomationChatNotFoundError, AutomationReservedTriggerError, RuleValidationError } from "@orb/server/domain/automation";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedParticipant } from "../../chat/_support.ts";
import { FIXED_NOW_MS, MSG_COMMITTED, principal, ruleFixture, SET_VAR, seedUser } from "../_support.ts";

describe("createRule — authority", () => {
  test("a host creates a rule born disabled at position 0, and the roster announces itself", async () => {
    const { host, chatId, svc, events } = await ruleFixture();
    const rule = await svc.createRule({ principal: principal(host), chatId, name: "greet", trigger: MSG_COMMITTED, actions: [SET_VAR] });
    expect(rule.enabled).toBe(false);
    expect(rule.position).toBe(0);
    expect(rule.trigger).toEqual(MSG_COMMITTED);
    expect(rule.actions).toEqual([SET_VAR]);
    expect(rule.createdAt).toBe(FIXED_NOW_MS);
    // H2 — the dead wire, now live: `rulesChanged` was DECLARED on `AutomationBusEvent` and emitted from
    // nowhere in the tree (event-bus coverage survey §2.3). Id-only + chat-scoped, exactly as the room's
    // host-only filter classifies it.
    expect(events).toEqual([{ type: "rulesChanged", chatId }]);
  });

  // #1427 — `position` is a TOTAL order per scope (sibling arms mutate one shared write-through env in
  // position order, and the reorder verb's totality check assumes it). It used to be a JS `max+1` READ
  // followed by a separate INSERT, so two creates in one scope that interleaved between those two statements
  // both read the same max and both wrote it. It is now allocated by the INSERT's own subquery.
  test("CONCURRENT creates in one chat never collide on a position", async () => {
    const { host, chatId, svc } = await ruleFixture();

    await Promise.all(
      ["a", "b", "c", "d", "e"].map((name) => svc.createRule({ principal: principal(host), chatId, name, trigger: MSG_COMMITTED, actions: [SET_VAR] })),
    );

    const listed = await svc.listRules({ principal: principal(host), chatId });
    expect(listed).toHaveLength(5);
    expect(listed.map((rule) => rule.position).toSorted((x, y) => x - y)).toEqual([0, 1, 2, 3, 4]);
  });

  test("a present member who is not host is forbidden — and a refused write announces nothing", async () => {
    const { db, chatId, svc, events } = await ruleFixture();
    const member = await seedUser(db, "user_member");
    await seedParticipant(db, { chatId, key: "mem", userId: member, role: "member" });
    await expect(svc.createRule({ principal: principal(member), chatId, name: "x", trigger: MSG_COMMITTED, actions: [SET_VAR] })).rejects.toThrow(
      DomainForbiddenError,
    );
    expect(events).toHaveLength(0);
  });

  test("a non-member gets a leak-free chat-not-found — and announces nothing", async () => {
    const { db, chatId, svc, events } = await ruleFixture();
    const stranger = await seedUser(db, "user_stranger");
    await expect(svc.createRule({ principal: principal(stranger), chatId, name: "x", trigger: MSG_COMMITTED, actions: [SET_VAR] })).rejects.toThrow(
      AutomationChatNotFoundError,
    );
    expect(events).toHaveLength(0);
  });
});

describe("createRule — validation refusals", () => {
  test("refuses a reserved trigger — and a validation refusal announces nothing", async () => {
    const { host, chatId, svc, events } = await ruleFixture();
    const trigger: AutomationTrigger = { bus: "chat", type: "messageHidden" };
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger, actions: [SET_VAR] })).rejects.toThrow(
      AutomationReservedTriggerError,
    );
    // The emit sits AFTER the insert, so every gauntlet refusal is silent by construction — nothing was
    // written, so there is nothing for a second host tab to re-read.
    expect(events).toHaveLength(0);
  });

  test("refuses an unparseable CEL predicate", async () => {
    const { host, chatId, svc } = await ruleFixture();
    await expect(
      svc.createRule({ principal: principal(host), chatId, name: "x", trigger: MSG_COMMITTED, predicateCel: "event.role ==", actions: [SET_VAR] }),
    ).rejects.toThrow(RuleValidationError);
  });

  test("refuses more than 8 arms", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arms = Array.from({ length: 9 }, () => SET_VAR);
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger: MSG_COMMITTED, actions: arms })).rejects.toThrow(RuleValidationError);
  });

  test("refuses a post_notification arm below the 60s cooldown floor", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arm: AutomationActionInput = { type: "post_notification", recipient: "host", messageTemplate: "hi" };
    await expect(
      svc.createRule({ principal: principal(host), chatId, name: "x", trigger: MSG_COMMITTED, cooldownSeconds: 10, actions: [arm] }),
    ).rejects.toThrow(RuleValidationError);
  });

  test("refuses a transform_draft arm mixed with a non-transform arm (transform_mix)", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arms: AutomationActionInput[] = [{ type: "transform_draft", target: "user_input", template: "{{draft}}" }, SET_VAR];
    const trigger: AutomationTrigger = { bus: "chat", type: "turnStarted" };
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger, actions: arms })).rejects.toThrow(RuleValidationError);
  });

  test("refuses a transform_draft rule on a non-turnStarted trigger (transform_trigger)", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arm: AutomationActionInput = { type: "transform_draft", target: "user_input", template: "{{draft}}" };
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger: MSG_COMMITTED, actions: [arm] })).rejects.toThrow(
      RuleValidationError,
    );
  });

  test("accepts a transform_draft rule on chat/turnStarted (all-transform)", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arm: AutomationActionInput = { type: "transform_draft", target: "assembled_dynamic", template: "{{draft}}!" };
    const trigger: AutomationTrigger = { bus: "chat", type: "turnStarted" };
    const rule = await svc.createRule({ principal: principal(host), chatId, name: "xf", trigger, actions: [arm] });
    expect(rule.actions).toEqual([arm]);
  });

  // D146-b — THE MINT GATE. A first-party contributor seam asserts exhaustive-and-unique against a compile-time
  // tuple and is BOOT-FATAL both ways; a contributor seam cannot (the vocabulary is not knowable at compile
  // time), so the equivalent strictness moves to the mint and is fatal to the ONE rule that got it wrong.
  //
  // It is also what makes the dispatch-time PAUSE unambiguous: because a stored rule's tool was drivable ONCE,
  // a later `false` can only mean the contributor went away — the engine never has to guess between "gone" and
  // "never yours", and a typo can never masquerade as a paused plugin.
  test("refuses a run_tool arm naming a tool this author cannot drive — the rule is never STORED", async () => {
    const { host, chatId, svc } = await ruleFixture(); // the default tool seam: NOTHING is drivable
    const arm: AutomationActionInput = { type: "run_tool", name: "plugin_someone_elses_tool" };
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger: MSG_COMMITTED, actions: [arm] })).rejects.toThrow(
      RuleValidationError,
    );
    // Nothing stored, and nothing announced — the roster event rides the durable insert.
    expect(await svc.listRules({ principal: principal(host), chatId })).toEqual([]);
  });

  test("accepts a run_tool arm whose tool the author CAN drive — and asks about the AUTHOR, not the chat", async () => {
    // The control for the refusal above: same verb, same shape, one difference — the tool is this author's.
    const asks: { name: string; userId: UserId }[] = [];
    // Bound AFTER the fixture exists (the predicate is only called at `createRule`, below) so the stub can
    // compare against the real seeded author rather than a hand-spelled id.
    let author: UserId | null = null;
    const { host, chatId, svc } = await ruleFixture({
      tools: {
        isToolDrivableBy: (name, userId): boolean => {
          asks.push({ name, userId });
          return name === "plugin_mine" && userId === author;
        },
        runTool: () => Promise.resolve({ ok: false, reason: "unavailable" }),
      },
    });
    author = host;
    const arm: AutomationActionInput = { type: "run_tool", name: "plugin_mine", argsTemplate: '{"a":1}' };

    const rule = await svc.createRule({ principal: principal(host), chatId, name: "x", trigger: MSG_COMMITTED, actions: [arm] });

    // The STORED shape is the PARSED one — the defaults the verb filled, never the caller's params.
    expect(rule.actions).toEqual([{ type: "run_tool", name: "plugin_mine", argsTemplate: '{"a":1}', resultScope: "chat" }]);
    expect(asks).toEqual([{ name: "plugin_mine", userId: host }]);
  });

  test("refuses an insert_world_info_entry arm whose (valid) book is not attached to the chat", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arm: AutomationActionInput = {
      type: "insert_world_info_entry",
      bookId: mintTypeId(ID_PREFIX.worldBook),
      entryKey: "e",
      keys: [],
      contentTemplate: "c",
      position: "before",
    };
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger: MSG_COMMITTED, actions: [arm] })).rejects.toThrow(
      RuleValidationError,
    );
  });
});

describe("createRule — the S5 run_analysis admission rows", () => {
  const turnTrigger: AutomationTrigger = { bus: "chat", type: "turnCompleted" };

  test("refuses a routeless analysis arm (an arm that could think and do nothing)", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arm: AutomationActionInput = { type: "run_analysis", brief: "b", routes: {} };
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger: turnTrigger, actions: [arm] })).rejects.toThrow(
      "at least one output route",
    );
  });

  test("refuses TWO confirm-class routes on one arm — the S4 store replaces per (chat, rule), so cards would silently displace each other", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arm: AutomationActionInput = { type: "run_analysis", brief: "b", routes: { steer: { apply: "confirm" }, suggest: {} } };
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger: turnTrigger, actions: [arm] })).rejects.toThrow(
      "at most one confirm-class route",
    );
  });

  test("refuses a lore route whose book is not attached (the same consent gate as the insert arm's)", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arm: AutomationActionInput = { type: "run_analysis", brief: "b", routes: { lore: { bookId: mintTypeId(ID_PREFIX.worldBook) } } };
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger: turnTrigger, actions: [arm] })).rejects.toThrow("not attached");
  });

  test("refuses ANY analysis arm on an ACTIVE-game chat (the game owns its own steering — D109; §3-S5.7, typed `active_game`)", async () => {
    const { db, host, chatId, svc } = await ruleFixture();
    await db.insert(rpgGames).values({
      id: mintTypeId(ID_PREFIX.rpgGame),
      chatId,
      mode: "lite",
      status: "active",
      // The REAL all-defaults config (the same `parse({})` the fresh-game path folds to) — never a cast.
      config: rpgGameConfigSchema.parse({}),
    });
    const arm: AutomationActionInput = { type: "run_analysis", brief: "b", routes: { steer: {} } };
    await expect(svc.createRule({ principal: principal(host), chatId, name: "x", trigger: turnTrigger, actions: [arm] })).rejects.toThrow(
      "directs its own story",
    );
  });

  test("admits + stores the pacing shape (steer-direct) with the parsed defaults, on a game-less chat", async () => {
    const { host, chatId, svc } = await ruleFixture();
    const arm: AutomationActionInput = { type: "run_analysis", brief: "Watch the pacing.", steer: "slow burn", routes: { steer: {} } };
    const rule = await svc.createRule({ principal: principal(host), chatId, name: "pacing", trigger: turnTrigger, actions: [arm] });
    expect(rule.actions).toEqual([{ type: "run_analysis", brief: "Watch the pacing.", steer: "slow burn", routes: { steer: { apply: "direct" } } }]);
  });
});
