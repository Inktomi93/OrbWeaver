// tests/support/chat/scenario.int — the ACCEPTANCE PROOF for the N4 harness: the same behavior the
// hand-rolled `verbs/turn.int.test.ts` covers (its `harness()` + `seedRoom()` + local `scripted()` fake),
// re-expressed through `scenario.chat(tape, opts)` — real db, real verbs, real engine, scripted provider —
// with LESS boilerplate. The converted headliner is the solo single-turn send (turn.int's "send — the solo
// path" test); the rest exercises the FIFO runner over a group round and the three named assertions. This is
// the harness's OWN test (it lives in the support tree, testing the support substrate — the mirror gate
// exempts `tests/support/`), NOT a duplicate of the turn.int suite (that stays the domain's coverage; the
// full conversion sweep is a follow-up).

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { ChatNotFoundError } from "../../../packages/server/src/domain/chat/contract/errors";
import { expect, test } from "../fixtures";
import { assertEventSequence, assertStaticPrefixStable, assertTokenTotalsConsistent } from "./assertions";
import { scenario } from "./scenario";
import { tape } from "./tape";

describe("scenario.chat — the converted solo single-turn send (turn.int 'send — the solo path')", () => {
  test("commits the user row + the assistant turn; emits the lifecycle", async () => {
    const chat = await scenario.chat(tape().reply("Hi there"), { characters: ["aria"] });

    const outcome = await chat.send("hello");

    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toHaveLength(2);
    expect(outcome.messages[0]?.role).toBe("user");
    expect(outcome.messages[0]?.content).toBe("hello");
    expect(outcome.messages[0]?.authorUserId).toBe(chat.host);
    expect(outcome.messages[1]?.role).toBe("assistant");
    expect(outcome.messages[1]?.content).toBe("Hi there");

    const canon = await chat.loadCanon();
    expect(canon.map((m) => m.seq)).toEqual([1, 2]);
    expect(canon.map((m) => m.role)).toEqual(["user", "assistant"]);

    // The named event-sequence assertion replaces the hand-rolled `types.toContain(...)` triple.
    assertEventSequence(chat.events, ["turnStarted", "messageCommitted", "turnCompleted"]);
  });
});

describe("scenario.chat — the FIFO runner drives a group round in speaker order", () => {
  test("a list-policy 2-character room dequeues one scripted reply per speaker, in order", async () => {
    const chat = await scenario.chat(tape().reply("from aria").reply("from bryn"), {
      characters: ["aria", "bryn"],
      policy: "list",
    });

    const outcome = await chat.send("hi all");

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(2);
    expect(assistants.map((m) => m.characterId)).toEqual(chat.chars);
    expect(assistants.map((m) => m.content)).toEqual(["from aria", "from bryn"]);
  });
});

describe("scenario.chat — the named token/prefix assertions over a two-turn solo scenario", () => {
  test("the static system prefix is byte-stable across turns and the token totals sum to the tape economics", async () => {
    const chat = await scenario.chat(tape().reply("one").reply("two"), { characters: ["aria"] });

    await chat.send("first");
    await chat.send("second");

    // Two solo sends → exactly two captured wire requests.
    expect(chat.requests).toHaveLength(2);
    // The cache-stable system prefix must not drift turn-to-turn.
    assertStaticPrefixStable(chat.requests);
    // Two assistant turns at the default 4-in/2-out economics → 8 in / 4 out summed across the stats deltas.
    assertTokenTotalsConsistent(chat.statsDeltas, { tokensIn: 8, tokensOut: 4 });
  });
});

describe("scenario.chat — a scripted error surfaces as a thrown ProviderError (turnAborted, then rethrow)", () => {
  test("an error-tape turn rejects with the typed provider failure", async () => {
    const chat = await scenario.chat(tape().error({ kind: "server" }), { characters: ["aria"] });

    await expect(chat.send("hi")).toThrowProviderError("server");
    // The engine emitted turnAborted before rethrowing (the post-turnStarted error path).
    expect(chat.events.map((e) => e.type)).toContain("turnAborted");
  });

  test("a rate-limit tape rejects with kind:'rate_limit'", async () => {
    const chat = await scenario.chat(tape().rateLimit(), { characters: ["aria"] });

    await expect(chat.send("hi")).toThrowProviderError("rate_limit");
  });
});

describe("scenario.chat — leak-free NOT_FOUND for a non-member (can() default-deny)", () => {
  test("a stranger's send is refused leak-free (not a member)", async () => {
    const chat = await scenario.chat(tape().reply("Hi there"), { characters: ["aria"] });
    const stranger = chat.principal(castId<UserId>("user_stranger"));

    await expect(chat.turn.send({ principal: stranger, chatId: chat.chatId, content: "hi" })).rejects.toBeInstanceOf(ChatNotFoundError);
  });
});
