// prompt-cache-prefix — the two-call cache-prefix invariant, driven through the REAL turn verbs, engine,
// pipeline and SHAPE: for calls N and N+1 of one chat, every history row up to N's cache marker is
// byte-identical in N+1. Mirror-exempt (`.suite.int.test.ts`): it crosses verbs, assembly and the engine.

import type { AssemblePersona } from "@orb/contracts/chat";
import type { NamesBehavior } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { chatParticipants } from "@orb/db";
import { rowIndexAtCacheDepth } from "@orb/inference";
import type { Handle, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import type { ResolveForeignInputsOp } from "../../../../packages/server/src/domain/chat/contract/foreign.ts";
import type { GroupOutput, TurnMessage, TurnRequest } from "../../../../packages/server/src/domain/chat/contract/results.ts";
import type { ChatScenario } from "../../../support/chat/index.ts";
import { scenario, tape } from "../../../support/chat/index.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedCharacter, seedMessage, seedParticipant, seedPersona, seedUser } from "./_support.ts";

/** The history rows up to and including the row the runner pins its deepest-in-history marker on. */
function rowsThroughMarker(req: TurnRequest): readonly TurnMessage[] {
  const depth = req.cacheBreakpointFromEnd;
  const at = depth === null ? undefined : rowIndexAtCacheDepth(req.history, depth);
  if (at === undefined) {
    throw new Error(`call carries no history marker (cacheBreakpointFromEnd=${String(depth)}) — the prefix proof would be vacuous`);
  }
  return req.history.slice(0, at + 1);
}

/** Call N+1 repeats call N's history bytes up to N's marker. */
function expectHistoryPrefixKept(before: TurnRequest | undefined, after: TurnRequest | undefined): void {
  if (before === undefined || after === undefined) {
    throw new Error("expected two captured calls");
  }
  const kept = rowsThroughMarker(before);
  // biome-ignore lint/suspicious/noMisplacedAssertion: named assertion helper — asserts for the calling test.
  expect(after.history.slice(0, kept.length), "history above the previous call's cache marker changed").toEqual(kept);
}

/** The text of every user row, in order — what the model reads as "who said what". */
function userTexts(req: TurnRequest | undefined): readonly string[] {
  return (req?.history ?? []).filter((m) => m.role === "user").map((m) => m.content.map((p) => (p.type === "text" ? p.text : "")).join(""));
}

interface TwoHumanRoom {
  readonly scn: ChatScenario;
  readonly alice: UserId;
  readonly bob: UserId;
}

/**
 * A room seating two humans, each on their own persona. The FOREIGN resolver binds `active` to whoever
 * triggered the turn, so these calls prove the history labels hold even when the system persona moves.
 */
async function twoHumanRoom(opts: {
  readonly namesBehavior: NamesBehavior;
  readonly output?: GroupOutput;
  readonly characters?: readonly string[];
}): Promise<TwoHumanRoom> {
  const personaById = new Map<PersonaId, AssemblePersona>();
  const triggerBound: ResolveForeignInputsOp = ({ trigger }) => {
    const active = trigger.kind === "human" && trigger.personaId !== null ? (personaById.get(trigger.personaId) ?? null) : null;
    return Promise.resolve({
      promptConfig: { ...DEFAULT_PROMPT_CONFIG, namesBehavior: opts.namesBehavior },
      personas: { anchor: null, active },
      scanDepth: 6,
      injectionTokenBudget: 0,
    });
  };
  const scn = await scenario.chat(tape().reply("r1").reply("r2").reply("r3"), {
    characters: opts.characters ?? ["aria"],
    output: opts.output ?? "per-speaker",
    resolveForeignInputs: triggerBound,
  });
  const alice = scn.host;
  // A narrator round speaks as the synthetic group character the scenario mints; it must exist for the FK.
  await seedCharacter(scn.db, alice, "group");
  const bob = await seedUser(scn.db, castId<Handle>("bob"));
  const alicePersona = await seedPersona(scn.db, alice, "Alice", { description: "ALICE-DESC" });
  const bobPersona = await seedPersona(scn.db, bob, "Bob", { description: "BOB-DESC" });
  personaById.set(alicePersona, { name: "Alice", description: "ALICE-DESC" });
  personaById.set(bobPersona, { name: "Bob", description: "BOB-DESC" });
  await scn.db
    .update(chatParticipants)
    .set({ activePersonaId: alicePersona })
    .where(and(eq(chatParticipants.chatId, scn.chatId), eq(chatParticipants.userId, alice)));
  await seedParticipant(scn.db, { chatId: scn.chatId, key: "bob", userId: bob, role: "member", joinSeq: 9, activePersonaId: bobPersona });
  return { scn, alice, bob };
}

describe("F3 — a multi-human room's history labels do not depend on who pressed send", () => {
  test("Alice → Bob → Alice: the rows above each call's marker are byte-identical in the next call", async () => {
    const { scn, alice, bob } = await twoHumanRoom({ namesBehavior: "default" });

    await scn.send("hello", { principal: scn.principal(alice) });
    await scn.send("hey", { principal: scn.principal(bob) });
    await scn.send("again", { principal: scn.principal(alice) });

    expect(scn.requests).toHaveLength(3);
    expectHistoryPrefixKept(scn.requests[1], scn.requests[2]);
    // Every user row names its author, including the row of whoever is active on that call. The first row
    // also carries the new-chat marker merged ahead of it.
    const labels = userTexts(scn.requests[2]);
    expect(labels[0]?.endsWith("\n\nAlice: hello")).toBe(true);
    expect(labels.slice(1)).toEqual(["Bob: hey", "Alice: again"]);
    expect(userTexts(scn.requests[0])).toEqual([labels[0]]);
  });

  test('names "none" in a two-human narrator room: user rows are labelled, the narrator row is not', async () => {
    const { scn, alice, bob } = await twoHumanRoom({ namesBehavior: "none", output: "narrator", characters: ["aria", "kai"] });

    await scn.send("hello", { principal: scn.principal(alice) });
    await scn.send("hey", { principal: scn.principal(bob) });

    const last = scn.requests.at(-1);
    const labels = userTexts(last);
    expect(labels[0]?.endsWith("\n\nAlice: hello")).toBe(true);
    // The round's narrator cue merges onto the tail row after Bob's labelled line.
    expect(labels[1]?.startsWith("Bob: hey\n\n")).toBe(true);
    const narratorRow = last?.history.find((m) => m.role === "assistant");
    expect(narratorRow?.content).toEqual([{ type: "text", text: "r1" }]);
  });
});

// The solo room is the trivial roster: none of the multi-human rules may move a byte of it. The expected
// bytes were recorded from the tree before the prefix fixes landed.
describe("solo golden — a one-human room ships the same bytes as before the prefix fixes", () => {
  test("static, dynamic and history of the second call are byte-identical to the recorded golden", async () => {
    const scn = await scenario.chat(tape().reply("Hello there.").reply("Nice to meet you."), { characters: ["aria"] });
    await scn.send("hi");
    await scn.send("my name is Alex");

    const second = scn.requests[1];
    expect(second?.prompt.static).toBe(
      "You are aria in an immersive, ongoing roleplay with Alex. Stay in character. Address Alex in the second person; use their name only when it is one they have chosen for themselves.\n\nthe user",
    );
    expect(second?.prompt.dynamic).toBe("");
    expect(second?.history).toEqual([
      { role: "user", content: [{ type: "text", text: "[Start a new chat]\n\nhi" }] },
      { role: "assistant", content: [{ type: "text", text: "Hello there." }] },
      { role: "user", content: [{ type: "text", text: "my name is Alex" }] },
    ]);
    expect(second?.cacheBreakpointFromEnd).toBe(1);
  });
});

// F8: a row's speaker label is a function of the row. A departed character's reply and an unattributed
// (agent-seat) reply used to borrow whoever spoke on this call, so their bytes flipped per speaker.
describe("F8 — an off-roster or unattributed reply keeps its label whoever speaks now", () => {
  test('names "content": the departed and the unattributed rows are byte-identical across two speakers', async () => {
    const contentPreset: ResolveForeignInputsOp = () =>
      Promise.resolve({
        promptConfig: { ...DEFAULT_PROMPT_CONFIG, namesBehavior: "content" },
        personas: { anchor: { name: "Alex", description: "the user" }, active: { name: "Alex", description: "the user" } },
        scanDepth: 6,
        injectionTokenBudget: 0,
      });
    const scn = await scenario.chat(tape().reply("aria speaks").reply("kai speaks"), { characters: ["aria", "kai"], resolveForeignInputs: contentPreset });
    const departed = await seedCharacter(scn.db, scn.host, "mara");
    await seedMessage(scn.db, scn.chatId, 1, { role: "user", authorUserId: scn.host, content: "hi all" });
    await seedMessage(scn.db, scn.chatId, 2, { role: "assistant", characterId: departed, content: "I was here" });
    await seedMessage(scn.db, scn.chatId, 3, { role: "user", authorUserId: scn.host, content: "and you?" });
    await seedMessage(scn.db, scn.chatId, 4, { role: "assistant", characterId: null, content: "agent line" });
    await seedMessage(scn.db, scn.chatId, 5, { role: "user", authorUserId: scn.host, content: "go on" });

    const [aria, kai] = scn.chars;
    if (aria === undefined || kai === undefined) {
      throw new Error("expected two seated characters");
    }
    await scn.turn.forceCharacterTurn({ principal: scn.principal(), chatId: scn.chatId, characterId: aria });
    await scn.turn.forceCharacterTurn({ principal: scn.principal(), chatId: scn.chatId, characterId: kai });

    const texts = (req: TurnRequest | undefined): readonly string[] =>
      (req?.history ?? []).map((m) => m.content.map((p) => (p.type === "text" ? p.text : "")).join(""));
    const first = texts(scn.requests[0]);
    const second = texts(scn.requests[1]);
    expect(first[1]).toBe("mara: I was here");
    expect(first[3]).toBe("agent line");
    // Every row above the tail (which carries this call's speaker cue) is byte-identical.
    expect(second.slice(0, 4)).toEqual(first.slice(0, 4));
  });
});
