// The rule-creation store: a pending custom rule's request identity persisted per verified user. Each test
// re-imports the store over an in-memory localStorage, because the store's storage key and its
// durable-local namespace binding are both fixed at module init.

import type { ChatId, VerifiedUserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";
import { createSeededIds } from "../../support/ids.ts";

const ALICE = castId<VerifiedUserId>("fixture_rule_alice");
const BOB = castId<VerifiedUserId>("fixture_rule_bob");
const ENDED = "This editing session ended when the signed-in account changed. Reopen the rule to continue.";

const ids = createSeededIds();
const chatId: ChatId = typeIdSchema(ID_PREFIX.chat).parse(ids.next(ID_PREFIX.chat));
const ruleId = typeIdSchema(ID_PREFIX.automationRule).parse(ids.next(ID_PREFIX.automationRule));
const checkpoint = { modelVersion: 1, baseline: "baseline", predecessor: null, draftJson: "{}" };

function aliceKey(): string {
  return `orb:u/${ALICE}/rule-creations`;
}

type StoreModule = typeof import("../../../packages/client/src/state/rule-creation-store.ts");
type DurableLocalModule = typeof import("../../../packages/client/src/state/durable-local.ts");

async function freshState(
  seed: Record<string, string> = {},
): Promise<{ readonly state: StoreModule & Pick<DurableLocalModule, "bindDurableLocalToUser">; readonly map: Map<string, string> }> {
  const map = new Map(Object.entries(seed));
  vi.resetModules();
  const storage = {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      map.set(key, value);
    },
    removeItem: (key: string): void => {
      map.delete(key);
    },
  };
  // zustand's default persist storage reads `window.localStorage`; the durable-local hints read the global.
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
  const store = await import("../../../packages/client/src/state/rule-creation-store.ts");
  const { bindDurableLocalToUser } = await import("../../../packages/client/src/state/durable-local.ts");
  return { state: { ...store, bindDurableLocalToUser }, map };
}

function persistedSessions(map: ReadonlyMap<string, string>, key: string): unknown {
  const raw = map.get(key);
  return raw === undefined ? undefined : (JSON.parse(raw) as { state: { sessions: unknown } }).state.sessions;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rule-creation store", () => {
  test("before a verified identity binds, nothing is readable and nothing can begin", async () => {
    const { state, map } = await freshState();

    expect(() => state.assertRuleDraftOwner(ALICE)).toThrow(ENDED);
    expect(() => state.beginRuleCreation(chatId, ALICE)).toThrow(ENDED);
    expect(state.readRuleCreation("automation_rule_creation_anything")).toBeUndefined();
    expect(persistedSessions(map, aliceKey())).toBeUndefined();
  });

  test("the bound owner's session persists its request identity, takes its target, retires its checkpoint, and is forgotten alone", async () => {
    const { state, map } = await freshState();
    await state.bindDurableLocalToUser(ALICE);

    const first = state.beginRuleCreation(chatId, ALICE);
    const second = state.beginRuleCreation(null, ALICE);
    expect(typeIdSchema(ID_PREFIX.automationRuleCreation).safeParse(first.requestId).success).toBe(true);
    expect(first).toMatchObject({ chatId, ruleId: null, checkpoint: null });
    expect(state.readRuleCreation(first.requestId)).toEqual(first);
    expect(persistedSessions(map, aliceKey())).toEqual([first, second]);

    state.acknowledgeRuleCreation(first.requestId, ruleId, ALICE, checkpoint);
    expect(state.readRuleCreation(first.requestId)).toEqual({ ...first, ruleId, checkpoint });
    expect(state.readRuleCreation(second.requestId)).toEqual(second);

    state.clearRuleRecoveryCheckpoint(first.requestId, ALICE);
    expect(state.readRuleCreation(first.requestId)).toEqual({ ...first, ruleId, checkpoint: null });

    state.forgetRuleCreation(first.requestId, ALICE);
    expect(state.readRuleCreation(first.requestId)).toBeUndefined();
    expect(persistedSessions(map, aliceKey())).toEqual([second]);
  });

  test("another signed-in user can neither read nor write the first user's session, which survives a switch back", async () => {
    const { state } = await freshState();
    await state.bindDurableLocalToUser(ALICE);
    const creation = state.beginRuleCreation(chatId, ALICE);

    await state.bindDurableLocalToUser(BOB);
    expect(state.readRuleCreation(creation.requestId)).toBeUndefined();
    expect(() => state.acknowledgeRuleCreation(creation.requestId, ruleId, ALICE, checkpoint)).toThrow(ENDED);
    expect(() => state.forgetRuleCreation(creation.requestId, ALICE)).toThrow(ENDED);

    await state.bindDurableLocalToUser(ALICE);
    expect(state.readRuleCreation(creation.requestId)).toEqual(creation);
  });

  test("rehydration drops an unreadable session row and degrades an unreadable checkpoint to none", async () => {
    const kept = typeIdSchema(ID_PREFIX.automationRuleCreation).parse(ids.next(ID_PREFIX.automationRuleCreation));
    const healed = typeIdSchema(ID_PREFIX.automationRuleCreation).parse(ids.next(ID_PREFIX.automationRuleCreation));
    const blob = JSON.stringify({
      state: {
        sessions: [
          { requestId: kept, chatId, ruleId: null, checkpoint },
          { requestId: "not-a-type-id", chatId, ruleId: null, checkpoint: null },
          { requestId: healed, chatId: null, ruleId, checkpoint: { modelVersion: "one" } },
        ],
      },
      version: 1,
    });
    const { state } = await freshState({ [aliceKey()]: blob });

    await state.bindDurableLocalToUser(ALICE);

    expect(state.readRuleCreation(kept)).toEqual({ requestId: kept, chatId, ruleId: null, checkpoint });
    expect(state.readRuleCreation("not-a-type-id")).toBeUndefined();
    expect(state.readRuleCreation(healed)).toEqual({ requestId: healed, chatId: null, ruleId, checkpoint: null });
  });
});
