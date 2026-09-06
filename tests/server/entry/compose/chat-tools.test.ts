// entry/compose/chat-tools — the `react` builtin's DEFINITION, homed at the composition root because a
// domain-side one would close an import cycle (chat ↔ tool-use). The BEHAVIOR is the injected
// `reactAsCharacter` op's (tested at its verb); what this file owns and this test pins is the SEAM:
// the model-facing args schema (names, never ids; a closed emoji vocabulary so an off-vocabulary ask
// comes back as a correctable schema error), the null-chat refusal, and the projection of the op's
// errors-as-data result into a `ToolHandlerResult` the model can narrate.
//
// The declared ceiling is `capability: null` (member floor): the executing principal is the turn's
// resolved host and the verb's own membership guard is the gate — so a definition that silently grew a
// capability, or a handler that threw instead of answering, would both be regressions here.

import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { ReactAsCharacterOp } from "../../../../packages/server/src/domain/chat/contract/results.ts";
import type { ToolExecutionContext } from "../../../../packages/server/src/domain/tool-use/contract/params.ts";
import { createReactToolDefinition } from "../../../../packages/server/src/entry/compose/chat-tools.ts";
import { principal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";

const HEART = "\u2764\ufe0f";
const USER = castId<UserId>("user_host");
const CHAT = castId<ChatId>("chat_react");

function execContext(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    principal: principal(USER),
    triggeredBy: USER,
    chatId: CHAT,
    turnId: null,
    membership: null,
    ...overrides,
  };
}

function definition(op: ReactAsCharacterOp): ReturnType<typeof createReactToolDefinition> {
  return createReactToolDefinition({ reactAsCharacter: op });
}

const okOp: ReactAsCharacterOp = () => Promise.resolve({ ok: true, alreadyReacted: false, character: "Aria", emoji: HEART, target: "the whole message" });

describe("chat-tools — the react tool's declared shape", () => {
  test("registers at the contracts-owned wire name with the member floor (capability null)", () => {
    const def = definition(okOp);

    expect(def.name).toBe("react");
    expect(def.capability).toBeNull();
    expect(def.source).toBe("builtin");
  });

  test("the args schema takes NAMES and a CLOSED emoji vocabulary — an off-vocabulary ask fails the parse", () => {
    const def = definition(okOp);

    expect(def.argsSchema.safeParse({ character: "Aria", emoji: HEART }).success).toBe(true);
    expect(def.argsSchema.safeParse({ character: "Aria", emoji: HEART, toSpeaker: "Bo" }).success).toBe(true);
    expect(def.argsSchema.safeParse({ character: "Aria", emoji: "not-an-emoji" }).success).toBe(false);
    expect(def.argsSchema.safeParse({ character: "", emoji: HEART }).success).toBe(false);
  });
});

describe("chat-tools — the handler is a projection, never a second gate", () => {
  test("refuses as DATA (never a throw) when there is no chat in scope", async () => {
    const op = vi.fn(okOp);
    const def = definition(op);

    const result = await def.handler({ character: "Aria", emoji: HEART }, execContext({ chatId: null }));

    expect(result).toStrictEqual({ ok: false, error: "react requires a chat context" });
    // The op is never reached — the null-chat arm is decided before delegation.
    expect(op).not.toHaveBeenCalled();
  });

  test("threads the principal, the chat and the parsed names into the injected op", async () => {
    const op = vi.fn(okOp);
    const def = definition(op);

    await def.handler({ character: "Aria", emoji: HEART, toSpeaker: "Bo" }, execContext());

    expect(op).toHaveBeenCalledWith({
      principal: principal(USER),
      chatId: CHAT,
      characterName: "Aria",
      emoji: HEART,
      toSpeaker: "Bo",
    });
  });

  test("omits `toSpeaker` entirely when the model did not name one (never a literal undefined key)", async () => {
    const op = vi.fn(okOp);
    const def = definition(op);

    await def.handler({ character: "Aria", emoji: HEART }, execContext());

    expect(op.mock.calls[0]?.[0]).not.toHaveProperty("toSpeaker");
  });

  test("maps the op's refusal REASON into the model-facing error, not a platform fault", async () => {
    const def = definition(() => Promise.resolve({ ok: false, reason: "no character named Aria is in this room" }));

    const result = await def.handler({ character: "Aria", emoji: HEART }, execContext());

    expect(result).toStrictEqual({ ok: false, error: "no character named Aria is in this room" });
  });

  test("reports a fresh reaction as `reacted: true` and the idempotent repeat as `reacted: false`", async () => {
    const fresh = await definition(okOp).handler({ character: "Aria", emoji: HEART }, execContext());
    const repeat = await definition(() => Promise.resolve({ ok: true, alreadyReacted: true, character: "Aria", emoji: HEART, target: "Bo's line" })).handler(
      { character: "Aria", emoji: HEART },
      execContext(),
    );

    expect(fresh).toStrictEqual({
      ok: true,
      value: { reacted: true, alreadyReacted: false, character: "Aria", emoji: HEART, target: "the whole message" },
    });
    expect(repeat).toStrictEqual({
      ok: true,
      value: { reacted: false, alreadyReacted: true, character: "Aria", emoji: HEART, target: "Bo's line" },
    });
  });
});
