// prompt-cache-prefix — the two-call cache-prefix invariant, driven through the REAL turn verbs, engine,
// pipeline and SHAPE: for calls N and N+1 of one chat, every history row up to N's cache marker is
// byte-identical in N+1. Mirror-exempt (`.suite.int.test.ts`): it crosses verbs, assembly and the engine.

import type { CharacterCard } from "@orb/contracts/character";
import type { AssemblePersona } from "@orb/contracts/chat";
import type { ProviderId } from "@orb/contracts/inference";
import type { NamesBehavior, PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import type { Resolved } from "@orb/inference";
import { rowIndexAtCacheDepth } from "@orb/inference";
import type { Handle, ModelId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createTurnPersonaResolver } from "@orb/server/entry/compose";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { curatedRows } from "../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../packages/inference/src/capability/synthesize.ts";
import type { ResolveForeignInputsOp } from "../../../../packages/server/src/domain/chat/contract/foreign.ts";
import type { GroupOutput, TurnMessage, TurnRequest } from "../../../../packages/server/src/domain/chat/contract/results.ts";
import { loadPersonasForOwners } from "../../../../packages/server/src/domain/persona/persistence/queries.ts";
import type { ChatScenario } from "../../../support/chat/index.ts";
import { scenario, tape } from "../../../support/chat/index.ts";
import { freshDb } from "../../../support/db.ts";
import { makeResolved } from "../../../support/factories/resolved-connection.ts";
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

/** A card whose own description reads `{{user}}` — the CARD-context probe (pinned persona). */
function cardOf(name: string, description: string): CharacterCard {
  return {
    name,
    description,
    personality: null,
    scenario: null,
    greetings: [],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    regexScripts: [],
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
  };
}

/** The composition root's persona binding (`createTurnPersonaResolver`) over the real consent-gated persona
 *  read, with the default preset. */
function composedPersonas(db: Db): ResolveForeignInputsOp {
  const resolvePersonas = createTurnPersonaResolver(async ({ personaIds, allowedOwnerIds }) => {
    const rows = await loadPersonasForOwners(db, [...new Set(personaIds)], [...new Set(allowedOwnerIds)]);
    return new Map(rows.map((row) => [row.id, row]));
  });
  return async (args) => ({ promptConfig: DEFAULT_PROMPT_CONFIG, personas: await resolvePersonas(args), scanDepth: 6, injectionTokenBudget: 0 });
}

async function setSeatPersona(scn: ChatScenario, userId: UserId, personaId: PersonaId | null): Promise<void> {
  await scn.db
    .update(chatParticipants)
    .set({ activePersonaId: personaId })
    .where(and(eq(chatParticipants.chatId, scn.chatId), eq(chatParticipants.userId, userId)));
}

async function setAnchor(scn: ChatScenario, personaId: PersonaId | null): Promise<void> {
  await scn.db.update(chats).set({ anchorPersonaId: personaId }).where(eq(chats.id, scn.chatId));
}

/** A room driven by the real persona binding, with `aria`'s card probing card-context `{{user}}`. */
async function composedRoom(card: string): Promise<ChatScenario> {
  const db = await freshDb();
  return await scenario.chat(tape().reply("r1").reply("r2").reply("r3").reply("r4").reply("r5"), {
    db,
    resolveForeignInputs: composedPersonas(db),
    ctx: { getCard: () => Promise.resolve(cardOf("aria", card)) },
  });
}

function requestAt(scn: ChatScenario, index: number): TurnRequest {
  const req = scn.requests[index];
  if (req === undefined) {
    throw new Error(`no captured call ${String(index)}`);
  }
  return req;
}

// F3(b): the system block's persona half comes from the room's ANCHOR human, never from whoever pressed send.
// The owner's acceptance criterion, verbatim as a test: everything above the tail is byte-identical across
// senders, and only the anchor-dependent bytes move when the host re-anchors.
describe("F3 — the system block speaks for the anchor human, whoever presses send", () => {
  test("Alice → Bob → Alice → the host re-anchors to Bob → Bob", async () => {
    const scn = await composedRoom("{{user}} is aria's oldest friend");
    const alice = scn.host;
    const bob = await seedUser(scn.db, castId<Handle>("bob"));
    const alicePersona = await seedPersona(scn.db, alice, "Alice", { description: "ALICE-DESC" });
    const bobPersona = await seedPersona(scn.db, bob, "Bob", { description: "BOB-DESC" });
    await setSeatPersona(scn, alice, alicePersona);
    await seedParticipant(scn.db, { chatId: scn.chatId, key: "bob", userId: bob, role: "member", joinSeq: 9, activePersonaId: bobPersona });
    await setAnchor(scn, alicePersona);

    await scn.send("hello", { principal: scn.principal(alice) });
    await scn.send("hey", { principal: scn.principal(bob) });
    await scn.send("again", { principal: scn.principal(alice) });
    await setAnchor(scn, bobPersona);
    await scn.send("last", { principal: scn.principal(bob) });

    const [first, second, third, fourth] = [0, 1, 2, 3].map((i) => requestAt(scn, i));
    if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
      throw new Error("expected four calls");
    }
    // Who pressed send changes nothing above the tail.
    expect(first.prompt.static).toContain("Alice is aria's oldest friend");
    expect(second.prompt.static).toBe(first.prompt.static);
    expect(third.prompt.static).toBe(first.prompt.static);
    expect([second.prompt.dynamic, third.prompt.dynamic]).toEqual([first.prompt.dynamic, first.prompt.dynamic]);
    expectHistoryPrefixKept(second, third);
    // The re-anchor moves only the anchor-dependent bytes: the same block, with Bob where Alice was.
    expect(fourth.prompt.static).not.toBe(third.prompt.static);
    expect(fourth.prompt.static).toBe(third.prompt.static.replaceAll("ALICE-DESC", "BOB-DESC").replaceAll("Alice", "Bob"));
    expectHistoryPrefixKept(third, fourth);
  });

  test("a human send and an auto turn in a solo room with a swapped persona share one system block", async () => {
    const scn = await composedRoom("{{user}} is my brother");
    const alex = await seedPersona(scn.db, scn.host, "Alex", { description: "ALEX-DESC" });
    const steve = await seedPersona(scn.db, scn.host, "Steve", { description: "STEVE-DESC" });
    await setAnchor(scn, alex);
    await setSeatPersona(scn, scn.host, steve);

    await scn.send("hi", { principal: scn.principal() });
    await scn.requestTurn({ chatId: scn.chatId, initiator: "automation", triggeredBy: scn.host, automationDepth: 1 });

    const human = requestAt(scn, 0);
    const auto = requestAt(scn, 1);
    expect(auto.prompt.static).toBe(human.prompt.static);
    // The pinned persona still splits card from preset: the card names the anchor, the preset the seat.
    expect(human.prompt.static).toContain("Alex is my brother");
    expect(human.prompt.static).toContain("roleplay with Steve");
  });

  test("an unstamped user row keeps its label between a human send and an auto turn (F8)", async () => {
    const scn = await composedRoom("aria the innkeeper");
    const alex = await seedPersona(scn.db, scn.host, "Alex", { description: "ALEX-DESC" });
    await setAnchor(scn, alex);
    await setSeatPersona(scn, scn.host, alex);
    await seedMessage(scn.db, scn.chatId, 1, { role: "user", authorUserId: scn.host, personaId: null, content: "an old line" });
    await seedMessage(scn.db, scn.chatId, 2, { role: "assistant", characterId: scn.chars[0] ?? null, content: "a reply" });

    await scn.send("hi", { principal: scn.principal() });
    await scn.requestTurn({ chatId: scn.chatId, initiator: "automation", triggeredBy: scn.host, automationDepth: 1 });

    expect(userTexts(requestAt(scn, 1))[0]).toBe(userTexts(requestAt(scn, 0))[0]);
    expectHistoryPrefixKept(requestAt(scn, 0), requestAt(scn, 1));
  });

  test("an impersonate draft speaks as the human who asked for it", async () => {
    const scn = await composedRoom("aria the innkeeper");
    const alice = scn.host;
    const bob = await seedUser(scn.db, castId<Handle>("bob"));
    const alicePersona = await seedPersona(scn.db, alice, "Alice", { description: "ALICE-DESC" });
    const bobPersona = await seedPersona(scn.db, bob, "Bob", { description: "BOB-DESC" });
    await setSeatPersona(scn, alice, alicePersona);
    await seedParticipant(scn.db, { chatId: scn.chatId, key: "bob", userId: bob, role: "member", joinSeq: 9, activePersonaId: bobPersona });
    await setAnchor(scn, alicePersona);

    await scn.send("hello", { principal: scn.principal(bob) });
    for await (const _delta of scn.turn.impersonateStream({ principal: scn.principal(bob), chatId: scn.chatId })) {
      // Drained for the captured request; the draft text is not under test.
    }

    expect(requestAt(scn, 0).prompt.static).toContain("roleplay with Alice");
    expect(requestAt(scn, 1).prompt.static).toContain("roleplay with Bob");
  });
});

/** A direct-wire connection whose capability is the REAL curated fold for `model`, so SHAPE reads the same
 *  `turns` facts a production turn on that model reads. */
function curatedAnthropic(model: string): Resolved<"chat"> {
  const { capability } = synthesizeCapability("generation", "anthropic", {
    curated: curatedRows({ model, providerId: castId<ProviderId>("anthropic"), wire: "anthropic-messages", api: "anthropic-messages" }),
  });
  return makeResolved({ providerId: "anthropic", capability, model: castId<ModelId>(model) });
}

const PER_TURN_NOTE = "[PER-TURN NOTE]";
const DEPTH_TWO_NOTE = "[DEPTH-2 NOTE]";
const BELOW_HISTORY_NOTE = "[BELOW-HISTORY NOTE]";

/** The default preset plus three system-role literals: a trigger-gated (per-turn) one above Chat History, one
 *  injected at depth 2, and one listed below Chat History. */
function placementPreset(roleHandling: "strict" | undefined): PromptConfig {
  const perTurn: PromptSection = {
    type: "literal",
    id: "per-turn",
    name: "per-turn",
    role: "system",
    enabled: true,
    content: PER_TURN_NOTE,
    trigger: ["normal"],
  };
  const atDepth: PromptSection = {
    type: "literal",
    id: "at-depth",
    name: "at-depth",
    role: "system",
    enabled: true,
    content: DEPTH_TWO_NOTE,
    inject: { depth: 2 },
  };
  const below: PromptSection = { type: "literal", id: "below", name: "below", role: "system", enabled: true, content: BELOW_HISTORY_NOTE };
  const pivot = DEFAULT_PROMPT_CONFIG.sections.findIndex((s) => s.type === "marker" && s.marker === "chat_history");
  const sections = [...DEFAULT_PROMPT_CONFIG.sections.slice(0, pivot), perTurn, atDepth, ...DEFAULT_PROMPT_CONFIG.sections.slice(pivot), below];
  return {
    ...DEFAULT_PROMPT_CONFIG,
    sections,
    params: roleHandling === undefined ? DEFAULT_PROMPT_CONFIG.params : { ...DEFAULT_PROMPT_CONFIG.params, advanced: { roleHandling } },
  };
}

/** One send over a four-row history on `model`, returning the captured request. */
async function placementTurn(model: string, roleHandling: "strict" | undefined): Promise<TurnRequest> {
  const preset = placementPreset(roleHandling);
  const scn = await scenario.chat(tape().reply("r"), { promptConfig: preset, connection: curatedAnthropic(model) });
  await seedMessage(scn.db, scn.chatId, 1, { role: "user", authorUserId: scn.host, content: "u1" });
  await seedMessage(scn.db, scn.chatId, 2, { role: "assistant", characterId: scn.chars[0] ?? null, content: "a1" });
  await seedMessage(scn.db, scn.chatId, 3, { role: "user", authorUserId: scn.host, content: "u2" });
  await seedMessage(scn.db, scn.chatId, 4, { role: "assistant", characterId: scn.chars[0] ?? null, content: "a2" });
  await scn.send("u3");
  return requestAt(scn, 0);
}

function rowText(m: TurnMessage): string {
  return m.content.map((p) => (p.type === "text" ? p.text : "")).join("");
}

// The owner's placement ruling (SillyTavern parity): every section stays where the prompt order puts it. A
// per-turn section above Chat History is system-region content on every model; a system row at depth N or below
// Chat History stays a real system row where the model and level take one, and folds to user in place otherwise.
describe("F5 — sections stay at their prompt position; only a fold level changes a system row's role", () => {
  test("a mid-conversation-system model keeps the depth-2 and below-history rows as system rows in place", async () => {
    const req = await placementTurn("claude-opus-5", undefined);
    const roles = req.history.map((m) => m.role);
    const texts = req.history.map(rowText);
    expect(req.prompt.dynamic).toContain(PER_TURN_NOTE);
    expect(texts.some((t) => t.includes(PER_TURN_NOTE))).toBe(false);
    const depthRow = texts.indexOf(DEPTH_TWO_NOTE);
    expect(roles[depthRow]).toBe("system");
    expect([texts[depthRow - 1], texts[depthRow + 1]]).toEqual(["u2", "a2"]);
    expect(req.history.at(-1)).toEqual({ role: "system", content: [{ type: "text", text: BELOW_HISTORY_NOTE }] });
  });

  test("an older model and a strict preset fold the same rows into user text at the same place", async () => {
    for (const [model, level] of [
      ["claude-haiku-4-5", undefined],
      ["claude-opus-5", "strict"],
    ] as const) {
      const req = await placementTurn(model, level);
      const texts = req.history.map(rowText);
      expect(
        req.history.some((m) => m.role === "system"),
        `${model} ${String(level)}`,
      ).toBe(false);
      expect(req.prompt.dynamic).toContain(PER_TURN_NOTE);
      const depthRow = texts.findIndex((t) => t.includes(DEPTH_TWO_NOTE));
      expect(req.history[depthRow]?.role).toBe("user");
      expect(texts[depthRow + 1]).toBe("a2");
      expect(texts.at(-1)).toContain(BELOW_HISTORY_NOTE);
      expect(req.history.at(-1)?.role).toBe("user");
    }
  });
});
