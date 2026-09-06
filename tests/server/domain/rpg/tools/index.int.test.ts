// domain/rpg/tools — the 7 cheap-mode state tool DEFINITIONS (rpg-design/05 §4.5). Int test (the handlers
// read the game + resolution-ladder base from the db, then stage into the accumulator). Pins the DEF shape
// (7 names, member-floor, projectable args), and — assert-the-mutation-fired — that each stateful handler
// STAGES into the `ChatTurnId` accumulator (asserted via `ctx.staging.peek`, the effective state the flush
// would take), that read-through composes two tool calls in one turn, and the off-game/errors-as-data lanes.

import { RPG_LITE_TOOL_NAMES } from "@orb/contracts/rpg";
import type { ChatId, ChatTurnId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { rpgToolDefinitions } from "../../../../../packages/server/src/domain/rpg/index.ts";
import type { ToolDefinition, ToolExecutionContext, ToolHandlerResult } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { expect, principal, seedLiteGame, test } from "../_support.ts";

const TURN = castId<ChatTurnId>("chat_turn_t1");

function defOf(defs: readonly ToolDefinition[], name: string): ToolDefinition {
  const def = defs.find((d) => d.name === name);
  if (def === undefined) {
    throw new Error(`no tool def: ${name}`);
  }
  return def;
}

function exec(chatId: ChatId, turnId: ChatTurnId | null): ToolExecutionContext {
  return { principal: principal(castId<Handle>("host")), triggeredBy: castId("user_host"), chatId, turnId, membership: null };
}

test("the factory returns the 7 lite tool defs — member-floor, builtin, projectable args", async ({ db }) => {
  const { h } = await seedLiteGame(db);
  const defs = rpgToolDefinitions(h.ctx);
  expect(defs.map((d) => d.name).sort()).toEqual(RPG_LITE_TOOL_NAMES.toSorted());
  for (const def of defs) {
    expect(def.capability).toBeNull();
    expect(def.source).toBe("builtin");
    expect(() => projectJsonSchema(def.argsSchema as never)).not.toThrow();
  }
});

test("update_party STAGES a pool delta into the turn's accumulator (the mutation fired)", async ({ db }) => {
  const { chatId, h } = await seedLiteGame(db);
  const result = await defOf(rpgToolDefinitions(h.ctx), "update_party").handler(
    { targetRef: "Goblin", trackerDeltas: [{ key: "rage", delta: 5 }] },
    exec(chatId, TURN),
  );
  expect(result.ok).toBe(true);
  // Assert the accumulator holds the staged mutation — the effective state the flush would take.
  const staged = h.ctx.staging.peek(TURN);
  expect(staged?.actorState[0]?.volatile.trackerValues["rage"]).toEqual({ value: 5, items: null, max: null });
});

test("read-through: two tool calls in one turn compose (tool 2 sees tool 1's write)", async ({ db }) => {
  const { chatId, h } = await seedLiteGame(db);
  const defs = rpgToolDefinitions(h.ctx);
  await defOf(defs, "update_inventory").handler({ targetRef: "Hero", walletDeltas: [{ name: "gold", delta: 10 }] }, exec(chatId, TURN));
  await defOf(defs, "update_inventory").handler({ targetRef: "Hero", walletDeltas: [{ name: "gold", delta: 5 }] }, exec(chatId, TURN));
  const staged = h.ctx.staging.peek(TURN);
  // The second delta composed onto the first (15), not overwrote it — read-through through the accumulator.
  expect(staged?.actorState[0]?.volatile.wallet).toEqual([{ name: "gold", amount: 15 }]);
});

test("upsert_quest STAGES a quest into the snapshot plane", async ({ db }) => {
  const { chatId, h } = await seedLiteGame(db);
  const result = await defOf(rpgToolDefinitions(h.ctx), "upsert_quest").handler({ name: "Find the key", action: "create" }, exec(chatId, TURN));
  expect(result.ok).toBe(true);
  expect(h.ctx.staging.peek(TURN)?.quests[0]?.name).toBe("Find the key");
});

test("add_journal_entry STAGES a journal entry (flushed at commit)", async ({ db }) => {
  const { chatId, h } = await seedLiteGame(db);
  const result = await defOf(rpgToolDefinitions(h.ctx), "add_journal_entry").handler(
    { type: "event", label: "", title: "Arrival", content: "They reached the city." },
    exec(chatId, TURN),
  );
  expect(result.ok).toBe(true);
  // The staged journal rides the same take() the flush drains — assert via take (which also clears the bucket).
  const flush = h.ctx.staging.take(TURN);
  expect(flush?.journal).toEqual([{ type: "event", label: "", title: "Arrival", content: "They reached the city." }]);
});

test("roll_dice returns a baked roll, zero state (nothing staged)", async ({ db }) => {
  const { chatId, h } = await seedLiteGame(db, { dice: [3, 5] });
  const result = await defOf(rpgToolDefinitions(h.ctx), "roll_dice").handler({ notation: "2d6+1" }, exec(chatId, TURN));
  expect(result).toEqual({ ok: true, value: { notation: "2d6+1", total: 11, faces: [4, 6] } });
  expect(h.ctx.staging.peek(TURN)).toBeUndefined(); // no bucket — zero state
});

test("update_party is TOTAL since R3 — the hp refusal lane left with the bespoke arm", async ({ db }) => {
  // The retired `hpDelta` arm refused a delta on a null-hp actor. Health is a tracker now, so the gate moved
  // UPSTREAM to the write schema (an actor who does not carry hp cannot be handed an hp key at all) and this
  // handler has no legality verdict left to return.
  const { chatId, h } = await seedLiteGame(db);
  const result = await defOf(rpgToolDefinitions(h.ctx), "update_party").handler(
    { targetRef: "Ghost", trackerDeltas: [{ key: "hp", delta: -1 }] },
    exec(chatId, TURN),
  );
  expect(result.ok).toBe(true);
  expect(h.ctx.staging.peek(TURN)?.actorState[0]?.volatile.trackerValues["hp"]).toEqual({ value: -1, items: null, max: null });
});

test("a stateful tool on a non-game chat is an errors-as-data denial (never a throw)", async ({ db }) => {
  const { h } = await seedLiteGame(db);
  const noGame = castId<ChatId>("chat_no_game");
  const result = await defOf(rpgToolDefinitions(h.ctx), "update_scene").handler({ location: "Nowhere" }, exec(noGame, TURN));
  expect(result.ok).toBe(false);
  expect((result as Extract<ToolHandlerResult, { ok: false }>).error).toContain("not an rpg game");
});
