// A7 — the automation side of the D50 PromptTransform seam (`engine/prompt-transforms`). A `transform_draft`
// rule does NOT watcher-dispatch: it REGISTERS a `PromptTransform` into chat's compose-wired registry as it
// enables/disables/reorders, applied synchronously by the turn pipeline. These tests drive the real service
// lifecycle against a capturing registry and assert: enable registers (right id/point/order), disable
// deregisters, the apply closure renders `{{draft}}` + the rule's template over live room vars, the predicate
// gates the rewrite (false/error ⇒ draft unchanged), a render error passes the draft through unchanged (a
// broken rule never eats the turn), the transform self-guards on chatId (the registry is chat-blind), and a
// reorder re-ranks `order`.

import type { AutomationAction } from "@orb/contracts/automation";
import type { PromptTransform, PromptTransformEnv } from "@orb/contracts/chat";
import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { AutomationService } from "../../../../../packages/server/src/domain/automation/contract/service.ts";
import { createAutomationService } from "../../../../../packages/server/src/domain/automation/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import type { TestPromptRegistry } from "../_support.ts";
import { makeAutomationHarness, makeTestPromptRegistry, principal, seedHostChat, seedUser } from "../_support.ts";

const TURN_STARTED = { bus: "chat", type: "turnStarted" } as const;

function transformArm(template: string, target: "user_input" | "assembled_dynamic" = "user_input"): AutomationAction {
  return { type: "transform_draft", target, template };
}

interface Fixture {
  readonly db: Awaited<ReturnType<typeof freshDb>>;
  readonly host: UserId;
  readonly chatId: ChatId;
  readonly svc: AutomationService;
  readonly registry: TestPromptRegistry;
}

async function setup(): Promise<Fixture> {
  const db = await freshDb();
  const host = await seedUser(db, "user_host");
  const chatId = await seedHostChat(db, host);
  const registry = makeTestPromptRegistry();
  const svc = createAutomationService(makeAutomationHarness(db, { promptRegistry: registry }));
  return { db, host, chatId, svc, registry };
}

/** Create + enable a transform_draft rule; returns its id. */
async function armTransform(f: Fixture, opts: { actions: readonly AutomationAction[]; predicateCel?: string | null }): Promise<AutomationRuleId> {
  const p = principal(f.host);
  const rule = await f.svc.createRule({
    principal: p,
    chatId: f.chatId,
    name: "xf",
    trigger: TURN_STARTED,
    predicateCel: opts.predicateCel ?? null,
    actions: opts.actions,
  });
  await f.svc.setRuleEnabled({ principal: p, ruleId: rule.id, enabled: true });
  return rule.id;
}

function envFor(chatId: ChatId, vars: Record<string, string> = {}): PromptTransformEnv {
  return { chatId, vars };
}

describe("A7 prompt-transform registration lifecycle", () => {
  test("enabling a transform_draft rule registers a PromptTransform; disabling deregisters it", async () => {
    const f = await setup();
    const ruleId = await armTransform(f, { actions: [transformArm("hi {{draft}}")] });

    const registered = f.registry.list();
    expect(registered).toHaveLength(1);
    const t = registered[0] as PromptTransform;
    expect(t.id).toBe(`automation:${ruleId}:0`);
    expect(t.point).toBe("user_input");
    expect(t.order).toBe(0); // position 0 → order 0

    await f.svc.setRuleEnabled({ principal: principal(f.host), ruleId, enabled: false });
    expect(f.registry.list()).toHaveLength(0);
  });

  test("the arm's target picks the pipeline point; a rule's two arms register two transforms", async () => {
    const f = await setup();
    const ruleId = await armTransform(f, {
      actions: [transformArm("a {{draft}}", "user_input"), transformArm("b {{draft}}", "assembled_dynamic")],
    });

    const byId = new Map(f.registry.list().map((t) => [t.id, t.point] as const));
    expect(byId.get(`automation:${ruleId}:0`)).toBe("user_input");
    expect(byId.get(`automation:${ruleId}:1`)).toBe("assembled_dynamic");
  });

  test("updateRule swaps the applied CLOSURE, not just order — a changed template renders the NEW output", async () => {
    const f = await setup();
    const p = principal(f.host);
    const ruleId = await armTransform(f, { actions: [transformArm("OLD {{draft}}")] });
    // The registered closure applies the ORIGINAL template.
    expect(await (f.registry.list()[0] as PromptTransform).apply("x", envFor(f.chatId))).toBe("OLD x");

    // Edit the template — reload must REPLACE the transform by id (a stale closure would keep rendering "OLD").
    await f.svc.updateRule({ principal: p, ruleId, name: "xf", trigger: TURN_STARTED, actions: [transformArm("NEW {{draft}}")] });

    const after = f.registry.list();
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(`automation:${ruleId}:0`); // same id — replaced in place, not duplicated
    expect(await (after[0] as PromptTransform).apply("x", envFor(f.chatId))).toBe("NEW x");
  });

  test("a reorder re-ranks the transform's order (position IS order)", async () => {
    const f = await setup();
    const p = principal(f.host);
    const first = await armTransform(f, { actions: [transformArm("1 {{draft}}")] });
    const second = await armTransform(f, { actions: [transformArm("2 {{draft}}")] });
    // Positions 0,1 → orders 0,1.
    const orderOf = (id: AutomationRuleId): number | undefined => f.registry.list().find((t) => t.id === `automation:${id}:0`)?.order;
    expect(orderOf(first)).toBe(0);
    expect(orderOf(second)).toBe(1);

    await f.svc.reorderRules({ principal: p, chatId: f.chatId, orderedIds: [second, first] });
    expect(orderOf(second)).toBe(0);
    expect(orderOf(first)).toBe(1);
  });
});

describe("A7 prompt-transform apply", () => {
  test("renders {{draft}} + the template over the live runtime vars (CEL {{expr}} — the arm-template var path)", async () => {
    const f = await setup();
    await armTransform(f, { actions: [transformArm("[{{expr::vars.mood}}] {{draft}}")] });
    const t = f.registry.list()[0] as PromptTransform;

    const out = await t.apply("hello world", envFor(f.chatId, { mood: "grim" }));
    expect(out).toBe("[grim] hello world");
  });

  test("a false predicate leaves the draft UNCHANGED", async () => {
    const f = await setup();
    await armTransform(f, { actions: [transformArm("REWRITTEN")], predicateCel: 'vars.mood == "grim"' });
    const t = f.registry.list()[0] as PromptTransform;

    expect(await t.apply("keep me", envFor(f.chatId, { mood: "happy" }))).toBe("keep me");
    expect(await t.apply("rewrite me", envFor(f.chatId, { mood: "grim" }))).toBe("REWRITTEN");
  });

  test("a render error passes the draft through UNCHANGED (a broken rule never eats the turn)", async () => {
    const f = await setup();
    // An unknown macro WITH args is a strict `unknown-macro` error → the arm render fails.
    await armTransform(f, { actions: [transformArm("{{nope::x}} {{draft}}")] });
    const t = f.registry.list()[0] as PromptTransform;

    expect(await t.apply("survivor", envFor(f.chatId))).toBe("survivor");
  });

  test("self-guards on chatId — a transform ignores another chat's turn (the shared registry is chat-blind)", async () => {
    const f = await setup();
    await armTransform(f, { actions: [transformArm("MINE {{draft}}")] });
    const t = f.registry.list()[0] as PromptTransform;

    const otherChat = castId<ChatId>("chat_other_room");
    expect(await t.apply("theirs", envFor(otherChat))).toBe("theirs"); // untouched
    expect(await t.apply("mine", envFor(f.chatId))).toBe("MINE mine"); // its own chat rewrites
  });
});
