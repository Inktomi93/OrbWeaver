// substrate/fact-resolver — the taxonomy filter + TriggerFact builder. Pins: a non-taxonomy event resolves to
// null (skip), a `message`-shaped event re-reads canon through the injected ops, and the S7 `character.updated`
// carry (contentChanged rides the fact rather than collapsing to a bare id — the header's own defect note).

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { DomainEvent } from "@orb/contracts/events";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { resolveTrigger } from "../../../../../packages/server/src/domain/automation/substrate/fact-resolver.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedMessage } from "../../chat/_support.ts";
import { ruleFixture } from "../_support.ts";

describe("resolveTrigger", () => {
  test("a non-taxonomy event (no FACT_SHAPE entry) resolves to null — the watcher skips it", async () => {
    const { ctx } = await ruleFixture();
    // FABRICATION-OK: deliberate invalid-input probe — a bus event shape outside the taxonomy FACT_SHAPE maps.
    const result = await resolveTrigger(ctx.ops, { type: "delta" } as unknown as ChatBusEvent);
    expect(result).toBeNull();
  });

  test("a message-shaped event re-reads canon (content + depth) through the injected ops", async () => {
    const fixture = await ruleFixture();
    const { messageId } = await seedMessage(fixture.db, fixture.chatId, 1, { content: "hello world" });
    const event: ChatBusEvent = { type: "messageCommitted", chatId: fixture.chatId, messageId };
    const result = await resolveTrigger(fixture.ctx.ops, event);
    expect(result?.fact.message?.content).toBe("hello world");
    expect(result?.automationDepth).toBe(0);
  });

  test("a message id naming no live slot (raced delete) still resolves — the fact carries no message field", async () => {
    const fixture = await ruleFixture();
    const event: ChatBusEvent = { type: "messageCommitted", chatId: fixture.chatId, messageId: castId<MessageId>("message_ghost") };
    const result = await resolveTrigger(fixture.ctx.ops, event);
    expect(result?.fact.message).toBeUndefined();
    expect(result?.automationDepth).toBe(0);
  });

  test("character.updated carries contentChanged on the fact (S7 — not collapsed to a bare id)", async () => {
    const { ctx } = await ruleFixture();
    const event: DomainEvent = { type: "character.updated", characterId: castId("character_x"), contentChanged: true };
    const result = await resolveTrigger(ctx.ops, event);
    expect(result?.fact.character).toEqual({ id: "character_x", contentChanged: true });
    expect(result?.automationDepth).toBe(0);
  });

  test("a scalar chat-less event (asset.created) needs no depth lookup and resolves depth 0", async () => {
    const { ctx } = await ruleFixture();
    const event: DomainEvent = { type: "asset.created", assetId: castId("asset_x") };
    const result = await resolveTrigger(ctx.ops, event);
    expect(result?.fact.assetId).toBe("asset_x");
    expect(result?.automationDepth).toBe(0);
  });
});
