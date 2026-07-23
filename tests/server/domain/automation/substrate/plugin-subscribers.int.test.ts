// P4 — the plugin `events.on` fan-out (plugin-design/04 §P4), driven end-to-end off `handleEvent`. A plugin
// subscriber is a NON-RULE consumer of the resolved TriggerFact; these tests exercise the THREE load-bearing
// gates against a real db + real membership canon (this delivers to UNTRUSTED guests):
//   (a) cascade-depth — depth ≥ cap delivers to NObody; a depth ≥ 1 cascade fact reaches a plugin ONLY if it
//       opted in (matchAutomationEvents); the SAME guard the rule dispatch runs.
//   (b) visibility (LEAK-FREE) — an installer who is NOT a present member of the fact's chat gets ZERO
//       deliveries for it; a member does. Ownership gates the chat-less domain facts.
//   (c) declared-match — only the trigger types the plugin declared deliver.
// The fan-out runs alongside rule dispatch: a chat with a plugin subscriber but NO rules still delivers.

import type { AutomationTrigger, TriggerFact } from "@orb/contracts/automation";
import type { ChatId, MessageId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { AutomationOps } from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import type { PluginSubscriberRegistry, PluginTriggerSubscriber } from "../../../../../packages/server/src/domain/automation/contract/plugin-subscribers.ts";
import { createAutomationService, createPluginSubscriberRegistry } from "../../../../../packages/server/src/domain/automation/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedChat, seedParticipant } from "../../chat/_support.ts";
import { makeAutomationHarness, seedHostChat, seedUser } from "../_support.ts";

type TriggerType = AutomationTrigger["type"];

/** A capturing subscriber — records every fact it is DELIVERED so a test can assert what reached the guest. */
function capturingSubscriber(
  installer: UserId,
  declared: readonly TriggerType[],
  opts: { matchAutomationEvents?: boolean } = {},
): { readonly subscriber: PluginTriggerSubscriber; readonly delivered: TriggerFact[] } {
  const delivered: TriggerFact[] = [];
  return {
    delivered,
    subscriber: {
      installer,
      declaredEvents: new Set(declared),
      matchAutomationEvents: opts.matchAutomationEvents ?? false,
      deliver: (fact): void => void delivered.push(fact),
    },
  };
}

function chatOpened(chatId: ChatId): { type: "chatOpened"; chatId: ChatId } {
  return { type: "chatOpened", chatId };
}

function turnCompleted(chatId: ChatId): { type: "turnCompleted"; chatId: ChatId; intent: "send"; messageId: MessageId } {
  return { type: "turnCompleted", chatId, intent: "send", messageId: mintTypeId(ID_PREFIX.message) };
}

/** Ops whose `getTurnOrigin` reports a fixed cascade depth (the depth-gate probe) — mirrors handle-event's. */
function depthOps(depth: number): AutomationOps {
  return {
    chat: {
      getMessageFact: () => Promise.resolve(null),
      getTurnOrigin: () => Promise.resolve({ initiator: "automation" as const, automationDepth: depth }),
      readVariables: () => Promise.resolve({}),
      readChoicePicks: () => Promise.resolve({}),
      applyVariableOps: () => Promise.resolve(),
      listBackgroundChoices: () => Promise.resolve([]),
      setChatBackground: () => Promise.resolve(),
      requestTurn: () => Promise.resolve({ costUsd: null, messageCount: 0 }),
    },
    worldInfo: { upsertEntries: () => Promise.resolve({ inserted: 0, updated: 0, skippedHandEdited: 0 }) },
    notifications: { emit: () => Promise.resolve() },
    imagery: { generatePicture: () => Promise.resolve({ costUsd: null, imageCount: 0 }) },
    summarizeQuiet: () => Promise.resolve({ text: "", costUsd: null }),
  };
}

interface Fixture {
  readonly db: Awaited<ReturnType<typeof freshDb>>;
  readonly host: UserId;
  readonly chatId: ChatId;
  readonly registry: PluginSubscriberRegistry;
  readonly svc: ReturnType<typeof createAutomationService>;
}

async function setup(ops?: AutomationOps): Promise<Fixture> {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedHostChat(db, host); // host is a PRESENT member of chatId
  const registry = createPluginSubscriberRegistry();
  const ctx = makeAutomationHarness(db, { pluginSubscribers: registry, ...(ops !== undefined ? { ops } : {}) });
  return { db, host, chatId, registry, svc: createAutomationService(ctx) };
}

describe("plugin events.on fan-out — the P4 delivery gates", () => {
  test("delivers a declared, visible, human-plane fact — even with ZERO rules on the chat", async () => {
    const f = await setup();
    const cap = capturingSubscriber(f.host, ["chatOpened"]);
    f.registry.register(cap.subscriber);

    await f.svc.handleEvent(chatOpened(f.chatId));

    expect(cap.delivered.map((x) => x.type)).toEqual(["chatOpened"]);
    expect(cap.delivered[0]?.chatId).toBe(f.chatId);
  });

  test("(c) declared-match — an UNdeclared trigger type is never delivered", async () => {
    const f = await setup();
    const cap = capturingSubscriber(f.host, ["messageCommitted"]); // declares a DIFFERENT type
    f.registry.register(cap.subscriber);

    await f.svc.handleEvent(chatOpened(f.chatId));

    expect(cap.delivered).toEqual([]);
  });

  test("(b) visibility LEAK-FREE — an installer who is NOT a present member gets ZERO deliveries", async () => {
    const f = await setup();
    // A stranger who installed a plugin but is NOT a participant of this chat.
    const stranger = await seedUser(f.db, "user_stranger");
    const member = capturingSubscriber(f.host, ["chatOpened"]);
    const outsider = capturingSubscriber(stranger, ["chatOpened"]);
    f.registry.register(member.subscriber);
    f.registry.register(outsider.subscriber);

    await f.svc.handleEvent(chatOpened(f.chatId));

    expect(member.delivered.map((x) => x.type)).toEqual(["chatOpened"]); // member sees it
    expect(outsider.delivered).toEqual([]); // the stranger's plugin sees NOTHING — no leak
  });

  test("(b) visibility — a LEFT member (leftSeq set) no longer receives", async () => {
    const f = await setup();
    // Seed a second chat where `host` was a member but LEFT; a fact for it must not deliver to host's plugin.
    const otherChat = await seedChat(f.db, "left");
    await seedParticipant(f.db, { chatId: otherChat, key: "left_host", userId: f.host, role: "host", leftSeq: 5 });
    const cap = capturingSubscriber(f.host, ["chatOpened"]);
    f.registry.register(cap.subscriber);

    await f.svc.handleEvent(chatOpened(otherChat));

    expect(cap.delivered).toEqual([]);
  });

  test("(b) visibility — a chat-less DOMAIN fact (character.updated) delivers only to the resource OWNER", async () => {
    const f = await setup();
    const stranger = await seedUser(f.db, "user_stranger");
    // A character owned by `host`; a character.updated fact must reach host's plugin, never the stranger's.
    const char = await seedCharacter(f.db, { ownerId: f.host });
    const owner = capturingSubscriber(f.host, ["character.updated"]);
    const outsider = capturingSubscriber(stranger, ["character.updated"]);
    f.registry.register(owner.subscriber);
    f.registry.register(outsider.subscriber);

    await f.svc.handleEvent({ type: "character.updated", characterId: char.id, contentChanged: true });

    expect(owner.delivered.map((x) => x.characterId)).toEqual([char.id]);
    expect(outsider.delivered).toEqual([]); // a non-owner's plugin sees NOTHING — no cross-owner leak
  });

  test("(a) cascade hard-cap — nothing delivers at depth ≥ 3, even declared + opted-in + visible", async () => {
    const f = await setup(depthOps(3));
    const cap = capturingSubscriber(f.host, ["turnCompleted"], { matchAutomationEvents: true });
    f.registry.register(cap.subscriber);

    await f.svc.handleEvent(turnCompleted(f.chatId));

    expect(cap.delivered).toEqual([]);
  });

  test("(a) cascade opt-in — a depth-1 fact is suppressed WITHOUT matchAutomationEvents, delivered WITH it", async () => {
    const suppressed = await setup(depthOps(1));
    const off = capturingSubscriber(suppressed.host, ["turnCompleted"], { matchAutomationEvents: false });
    suppressed.registry.register(off.subscriber);
    await suppressed.svc.handleEvent(turnCompleted(suppressed.chatId));
    expect(off.delivered).toEqual([]); // un-opted cascade — suppressed

    const opted = await setup(depthOps(1));
    const on = capturingSubscriber(opted.host, ["turnCompleted"], { matchAutomationEvents: true });
    opted.registry.register(on.subscriber);
    await opted.svc.handleEvent(turnCompleted(opted.chatId));
    expect(on.delivered.map((x) => x.type)).toEqual(["turnCompleted"]); // opted in — delivered
  });

  test("(a) the fan-out threads the fact's RESOLVED cascade depth to deliver (the plugin turn's +1 source)", async () => {
    const f = await setup(depthOps(2)); // below the hard cap; opted-in so a depth ≥ 1 fact delivers
    const depths: number[] = [];
    f.registry.register({
      installer: f.host,
      declaredEvents: new Set<TriggerType>(["turnCompleted"]),
      matchAutomationEvents: true,
      deliver: (_fact, automationDepth): void => void depths.push(automationDepth),
    });

    await f.svc.handleEvent(turnCompleted(f.chatId));

    // The plugin host folds this onto InvocationChat.automationDepth; a chat.requestTurn from the handler stamps 3.
    expect(depths).toEqual([2]);
  });

  test("unregister stops future deliveries", async () => {
    const f = await setup();
    const cap = capturingSubscriber(f.host, ["chatOpened"]);
    const unregister = f.registry.register(cap.subscriber);

    await f.svc.handleEvent(chatOpened(f.chatId));
    unregister();
    await f.svc.handleEvent(chatOpened(f.chatId));

    expect(cap.delivered).toHaveLength(1); // only the pre-unregister fire
  });

  test("a throwing guest deliver is isolated — a sibling subscriber still receives", async () => {
    const f = await setup();
    const boom: PluginTriggerSubscriber = {
      installer: f.host,
      declaredEvents: new Set<TriggerType>(["chatOpened"]),
      matchAutomationEvents: false,
      deliver: (): void => {
        throw new Error("guest handler blew up");
      },
    };
    const ok = capturingSubscriber(f.host, ["chatOpened"]);
    f.registry.register(boom);
    f.registry.register(ok.subscriber);

    await f.svc.handleEvent(chatOpened(f.chatId));

    expect(ok.delivered.map((x) => x.type)).toEqual(["chatOpened"]);
  });
});
