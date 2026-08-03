// Bus event-sequence GOLDEN snapshots — pin the EXACT per-verb bus emission sequence + the load-bearing
// payload shapes. Orb proves the bus is DURABLE and MONOTONIC (chat_events seq) and that individual events
// FIRE, but NOTHING pins the ORDER of a turn's emissions: a refactor that emitted `messageCommitted(user)`
// AFTER `turnStarted`-then-generation, or dropped `turnCompleted`, or reordered the fork's create/update
// pair, passes every existing test while corrupting every live client's optimistic-render ordering (the SSE
// consumers replay in emit order). This golden-snapshots the sequence for the load-bearing verbs so a
// reordered/added/dropped emit fails LOUD with a readable diff.
//
// It drives the REAL verbs over a REAL db with a scripted provider through the N4 harness (`scenario.chat`),
// capturing the actual `ChatBusEvent`s. The turn-family verbs (send/swipe/continue) ride the harness's own
// recorder; the canon-edit verbs (edit/delete/move/fork) are wired over the SAME real `ctx` with a local
// recorder (they live outside the turn engine). Assertions pin the exact `type` sequence + the discriminant
// payload fields (intent, targetMessageId, role) that make the sequence meaningful.

import type { AssemblePersona, ChatBusEvent } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { describe } from "vitest";
import type { ResolveForeignInputsOp } from "../../../../packages/server/src/domain/chat/contract/foreign.ts";
import { createEdit } from "../../../../packages/server/src/domain/chat/verbs/edit.ts";
import { createFork } from "../../../../packages/server/src/domain/chat/verbs/fork.ts";
import { scenario } from "../../../support/chat/index.ts";
import { tape } from "../../../support/chat/tape.ts";
import { expect, test } from "../../../support/fixtures.ts";

const PERSONA: AssemblePersona = { name: "Nate", description: "the user" };

/** The scenario's default FOREIGN resolver (edit re-folds regex/macros through it — the canon-edit verbs
 *  need it wired the same way the turn path does). */
const resolveForeignInputs: ResolveForeignInputsOp = () =>
  Promise.resolve({
    promptConfig: DEFAULT_PROMPT_CONFIG,
    personas: { anchor: PERSONA, active: PERSONA },
    globalRegexScripts: [],
    scanDepth: 6,
    injectionTokenBudget: 0,
  });

/** The `type` sequence of a captured event list — the golden snapshot's primary axis. */
const types = (events: readonly ChatBusEvent[]): string[] => events.map((e) => e.type);

describe("bus golden — the turn lifecycle (send/swipe/continue) exact sequences", () => {
  test("send (solo): messageCommitted(user) → turnAccepted → turnStarted → delta → messageCommitted(assistant) → turnCompleted", async () => {
    const chat = await scenario.chat(tape().reply("Hi there"), { characters: ["aria"] });

    await chat.send("hello");

    // The user row commits FIRST (canon is durable before the turn starts); the AI round then ACCEPTS the turn
    // (opening the client's Stop slot BEFORE arbitration) and only afterwards the engine's turnStarted fires.
    expect(types(chat.events)).toEqual(["messageCommitted", "turnAccepted", "turnStarted", "delta", "messageCommitted", "turnCompleted"]);
    // The lifecycle payload discriminants that make the sequence load-bearing.
    const accepted = chat.events.find((e) => e.type === "turnAccepted");
    expect(accepted).toMatchObject({ intent: "send", speakerCharacterId: null, targetMessageId: null });
    const started = chat.events.find((e) => e.type === "turnStarted");
    expect(started).toMatchObject({ intent: "send", targetMessageId: null });
    const committed = chat.events.filter((e) => e.type === "messageCommitted");
    expect(committed[0]).toMatchObject({ view: { role: "user", content: "hello" } });
    expect(committed[1]).toMatchObject({ view: { role: "assistant", content: "Hi there" } });
    expect(chat.events.at(-1)).toMatchObject({ type: "turnCompleted", intent: "send" });
  });

  test("swipe: turnStarted(targetMessageId set) → delta → messageCommitted(assistant) → turnCompleted", async () => {
    const chat = await scenario.chat(tape().reply("first").reply("second swipe"), {
      characters: ["aria"],
    });
    const sent = await chat.send("hello");
    const assistantId = sent.messages.find((m) => m.role === "assistant")?.id;
    if (assistantId === undefined) {
      throw new Error("no assistant message to swipe");
    }
    const before = chat.events.length;

    await chat.turn.swipe({
      principal: chat.principal(),
      chatId: chat.chatId,
      messageId: assistantId,
    });

    const swipeEvents = chat.events.slice(before);
    expect(types(swipeEvents)).toEqual(["turnStarted", "delta", "messageCommitted", "turnCompleted"]);
    // The swipe targets the existing slot — the pin that distinguishes it from `send`.
    expect(swipeEvents[0]).toMatchObject({ intent: "swipe", targetMessageId: assistantId });
  });

  test("auto-mode chain: each chained iteration re-opens the slot — … turnCompleted → turnAccepted → turnStarted …", async () => {
    // A natural-policy 2-character room: the human round's ONE arbitration drives its selected speakers (both,
    // here) under a single `turnAccepted`; then the autoMode chain runs one AI→AI continuation whose OWN
    // arbitration emits its OWN `turnAccepted` (so Stop renders through a chain-arbitration hang). The
    // load-bearing pin: the chain boundary reads turnCompleted → turnAccepted → turnStarted — the slot RE-OPENS
    // for the continuation instead of staying idle after the human round (the chain-window Stop-affordance fix).
    const chat = await scenario.chat(tape().reply("one").reply("two").reply("three").reply("four"), {
      characters: ["aria", "bryn"],
      policy: "natural",
      autoMode: true,
      autoModeMaxTurns: 1,
    });

    await chat.send("go");

    expect(types(chat.events)).toEqual([
      "messageCommitted",
      // human round: ONE accept, then a start→terminal per selected speaker
      "turnAccepted",
      "turnStarted",
      "delta",
      "messageCommitted",
      "turnCompleted",
      "turnStarted",
      "delta",
      "messageCommitted",
      "turnCompleted",
      // chain continuation: its own arbitration re-opens the slot BEFORE the engine turn
      "turnAccepted",
      "turnStarted",
      "delta",
      "messageCommitted",
      "turnCompleted",
    ]);
    // The chain boundary: a turnCompleted is immediately followed by turnAccepted → turnStarted (the re-open).
    const seq = types(chat.events);
    const chainAcceptIdx = seq.lastIndexOf("turnAccepted");
    expect(seq[chainAcceptIdx - 1]).toBe("turnCompleted");
    expect(seq[chainAcceptIdx + 1]).toBe("turnStarted");
    // Every accept carries no speaker/target on accept; the chained one is a `generate` continuation.
    const accepts = chat.events.filter((e) => e.type === "turnAccepted");
    for (const a of accepts) {
      expect(a).toMatchObject({ speakerCharacterId: null, targetMessageId: null });
    }
    expect(accepts.at(-1)).toMatchObject({ intent: "generate" });
  });

  test("continue: turnStarted(intent continue) → delta → messageCommitted → turnCompleted", async () => {
    const chat = await scenario.chat(tape().reply("start").reply(" more"), {
      characters: ["aria"],
    });
    const sent = await chat.send("hello");
    const assistantId = sent.messages.find((m) => m.role === "assistant")?.id;
    if (assistantId === undefined) {
      throw new Error("no assistant message to continue");
    }
    const before = chat.events.length;

    await chat.turn.continueTurn({
      principal: chat.principal(),
      chatId: chat.chatId,
      messageId: assistantId,
    });

    const contEvents = chat.events.slice(before);
    expect(types(contEvents)).toEqual(["turnStarted", "delta", "messageCommitted", "turnCompleted"]);
    expect(contEvents[0]).toMatchObject({ intent: "continue", targetMessageId: assistantId });
  });
});

describe("bus golden — the canon-edit verbs (edit/delete/move) exact sequences", () => {
  test("editMessage → exactly [messageEdited] with the fresh view", async () => {
    const chat = await scenario.chat(tape().reply("Hi there"), { characters: ["aria"] });
    const sent = await chat.send("hello");
    const userId = sent.messages.find((m) => m.role === "user")?.id;
    if (userId === undefined) {
      throw new Error("no user message to edit");
    }

    const busEvents: ChatBusEvent[] = [];
    const edit = createEdit(chat.ctx, {
      emit: (e) => {
        busEvents.push(e);
        return Promise.resolve();
      },
      resolveForeignInputs,
    });

    await edit.editMessage({
      principal: chat.principal(),
      chatId: chat.chatId,
      messageId: userId,
      content: "hello (edited)",
    });

    expect(types(busEvents)).toEqual(["messageEdited"]);
    expect(busEvents[0]).toMatchObject({
      messageId: userId,
      view: { content: "hello (edited)" },
    });
  });

  test("deleteMessages → exactly [messagesDeleted] carrying the deleted id set", async () => {
    const chat = await scenario.chat(tape().reply("Hi there"), { characters: ["aria"] });
    const sent = await chat.send("hello");
    const userId = sent.messages.find((m) => m.role === "user")?.id;
    if (userId === undefined) {
      throw new Error("no user message to delete");
    }

    const busEvents: ChatBusEvent[] = [];
    const edit = createEdit(chat.ctx, {
      emit: (e) => {
        busEvents.push(e);
        return Promise.resolve();
      },
      resolveForeignInputs,
    });

    await edit.deleteMessages({
      principal: chat.principal(),
      chatId: chat.chatId,
      messageIds: [userId],
    });

    expect(types(busEvents)).toEqual(["messagesDeleted"]);
    expect(busEvents[0]).toMatchObject({ messageIds: [userId] });
  });

  test("moveMessage → exactly [messagesReordered]", async () => {
    // Two user turns so there is a reorderable pair (each send scripts one assistant reply).
    const chat = await scenario.chat(tape().reply("a").reply("b"), { characters: ["aria"] });
    const first = await chat.send("first");
    await chat.send("second");
    const firstUser = first.messages.find((m) => m.role === "user");
    if (firstUser === undefined) {
      throw new Error("no user message to move");
    }

    const busEvents: ChatBusEvent[] = [];
    const edit = createEdit(chat.ctx, {
      emit: (e) => {
        busEvents.push(e);
        return Promise.resolve();
      },
      resolveForeignInputs,
    });

    // Move the first user turn (seq 1) down past the following assistant + user rows.
    await edit.moveMessage({
      principal: chat.principal(),
      chatId: chat.chatId,
      messageId: firstUser.id,
      toSeq: firstUser.seq + 2,
    });

    expect(types(busEvents)).toEqual(["messagesReordered"]);
  });
});

describe("bus golden — fork emits the create pair", () => {
  test("forkChat → the new room's chatCreated leads the sequence", async () => {
    const chat = await scenario.chat(tape().reply("Hi there"), { characters: ["aria"] });
    await chat.send("hello");

    const busEvents: ChatBusEvent[] = [];
    const fork = createFork(chat.ctx, {
      emit: (e) => {
        busEvents.push(e);
        return Promise.resolve();
      },
      loadParticipantViews: () => Promise.resolve([]),
    });

    const result = await fork.forkChat({ principal: chat.principal(), chatId: chat.chatId });

    // The fork's first emission announces the new room to its members (chatCreated on the NEW chatId).
    expect(busEvents[0]).toMatchObject({ type: "chatCreated", chatId: result.chat.id });
  });
});
