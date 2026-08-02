// Integration: PD-40 analyze (semantic understanding) — compareCharactersDeep (facet diff DECORATED with a
// grounded LLM narrative) + askCard (grounded Q&A over a character's recent PLAYED scenes). Both owner-belt
// via characters.ownerId (a foreign/undistilled card short-circuits to null BEFORE any summarize call). The
// LLM is the scripted `summarize` recorder — a test asserts the narrative parse + that the pass fired.

import { PROSE_SLOTS } from "@orb/contracts/prose";
import type { Db } from "@orb/db";
import { characterSummaries } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createDiscoveryService } from "@orb/server/domain/discovery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import type { SummarizeRecorder } from "../_support.ts";
import { FROZEN_AT, makeDiscoveryHarness, makeSummarizeRecorder, seedCharacter, seedHostedChat, seedMessage, seedUser } from "../_support.ts";

async function seedCard(
  db: Db,
  args: {
    id: string;
    ownerId: UserId;
    name?: string;
    genre?: string;
    tone?: string;
    tags?: string[];
    pitch?: string;
  },
): Promise<CharacterId> {
  const id = await seedCharacter(db, {
    id: args.id,
    ownerId: args.ownerId,
    name: args.name ?? args.id,
  });
  await db.insert(characterSummaries).values({
    characterId: id,
    genre: args.genre ?? null,
    tone: args.tone ?? null,
    tags: args.tags ?? [],
    elevatorPitch: args.pitch ?? null,
    model: "test-summarize-model",
    computedAt: FROZEN_AT,
  });
  return id;
}

function svcFor(db: Db, summarize?: SummarizeRecorder): ReturnType<typeof createDiscoveryService> {
  return createDiscoveryService(makeDiscoveryHarness(db, summarize ? { summarize } : {}).ctx);
}

describe("compareCharactersDeep", () => {
  test("decorates the facet diff with the grounded LLM narrative", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const a = await seedCard(db, {
      id: "a",
      ownerId: owner,
      name: "Aria",
      genre: "fantasy",
      tone: "dark",
      tags: ["dragons", "curse"],
      pitch: "A cursed knight.",
    });
    const b = await seedCard(db, {
      id: "b",
      ownerId: owner,
      name: "Bryn",
      genre: "fantasy",
      tone: "tense",
      tags: ["dragons", "heist"],
    });
    // The scripted summarizer returns the guided-decode JSON the verb parses into the narrative.
    const summarize = makeSummarizeRecorder([
      JSON.stringify({
        summary: "Two fantasy leads.",
        overlap: "Both dragons.",
        distinction: "Curse vs heist.",
      }),
    ]);

    const deep = await svcFor(db, summarize).compareCharactersDeep(owner, a, b);
    expect(deep).not.toBeNull();
    // The base diff is intact (same belt + diff as compareCharacters).
    expect(deep?.sameGenre).toBe(true);
    expect(deep?.sharedTags).toEqual(["dragons"]);
    // The narrative parsed from the scripted reply — and is NOT flagged degraded (it validated first try).
    expect(deep?.narrative).toEqual({
      summary: "Two fantasy leads.",
      overlap: "Both dragons.",
      distinction: "Curse vs heist.",
      degraded: false,
    });
    // The summarize pass actually fired (one input for the one comparison).
    expect(summarize.calls).toHaveLength(1);
    expect(summarize.calls[0]).toHaveLength(1);
    // PROSE-1 `discovery.compare.system` — unset, the SYSTEM prompt is the shipped default, byte for byte.
    expect(summarize.calls[0]?.[0]?.systemPrompt).toBe(PROSE_SLOTS["discovery.compare.system"].text);
  });

  test("the card owner's PROSE override replaces the compare system prompt (the caller rung, not the room host)", async () => {
    // The threading proof: the slot resolves under `resolveUserProse(userId)` — the same caller rung the
    // sampling ladder reads — so a host's edit reaches the wire and nothing else on the call changes.
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const a = await seedCard(db, { id: "a", ownerId: owner, name: "Aria", genre: "fantasy", tone: "dark", tags: ["dragons"] });
    const b = await seedCard(db, { id: "b", ownerId: owner, name: "Bryn", genre: "fantasy", tone: "tense", tags: ["dragons"] });
    const summarize = makeSummarizeRecorder([JSON.stringify({ summary: "s", overlap: "o", distinction: "d" })]);
    const svc = createDiscoveryService(
      makeDiscoveryHarness(db, {
        summarize,
        resolveUserProse: () => Promise.resolve({ "discovery.compare.system": { text: "Compare them in one dry sentence.", baseVersion: 1 } }),
      }).ctx,
    );

    await svc.compareCharactersDeep(owner, a, b);

    expect(summarize.calls[0]?.[0]?.systemPrompt).toBe("Compare them in one dry sentence.");
  });

  test("a double validation failure degrades to raw narrative — the diff still returns (D79)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const a = await seedCard(db, { id: "a", ownerId: owner, name: "Aria", genre: "fantasy", tone: "dark", tags: ["dragons", "curse"] });
    const b = await seedCard(db, { id: "b", ownerId: owner, name: "Bryn", genre: "fantasy", tone: "tense", tags: ["dragons", "heist"] });
    // The model ignores the json_schema on BOTH the first turn and the retry — no JSON object to extract, so
    // runStructuredTurn throws StructuredOutputError and the verb degrades (the diff is the truth, not the prose).
    const summarize = makeSummarizeRecorder(["totally free-text, no json here"]);

    const deep = await svcFor(db, summarize).compareCharactersDeep(owner, a, b);
    expect(deep).not.toBeNull();
    // The base diff is intact — the degrade never discards it.
    expect(deep?.sameGenre).toBe(true);
    expect(deep?.sharedTags).toEqual(["dragons"]);
    // The narrative degraded to the raw reply, overlap/distinction blanked — and SAYS SO. Without the flag the
    // client renders unparseable model output under "Deep compare" beside two empty section bodies, which is
    // indistinguishable from a real narrative: the degrade has to travel as data or it is a lie by omission.
    expect(deep?.narrative).toEqual({ summary: "totally free-text, no json here", overlap: "", distinction: "", degraded: true });
    // The bounded retry actually fired (first turn + one retry) before the degrade.
    expect(summarize.calls).toHaveLength(2);
  });

  test("null on self/foreign — and never calls summarize", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const a = await seedCard(db, { id: "a", ownerId: owner, genre: "fantasy", tags: ["x"] });
    const foreign = await seedCard(db, { id: "f", ownerId: other, genre: "horror", tags: ["y"] });
    const summarize = makeSummarizeRecorder(["unused"]);
    const svc = svcFor(db, summarize);

    expect(await svc.compareCharactersDeep(owner, a, a)).toBeNull(); // self
    expect(await svc.compareCharactersDeep(owner, a, foreign)).toBeNull(); // foreign belt
    expect(await svc.compareCharactersDeep(owner, a, castId<CharacterId>("character_missing"))).toBeNull();
    // No summarize call happened — the belt short-circuits before inference.
    expect(summarize.calls).toEqual([]);
  });
});

describe("askCard", () => {
  test("answers from the character's recent PLAYED scenes, grounded", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const hero = await seedCard(db, {
      id: "character_hero",
      ownerId: owner,
      name: "Hero",
      genre: "fantasy",
    });
    const chat = await seedHostedChat(db, "chat_1", owner);
    // Two played assistant scenes for the hero (SELECTED variant content is the grounding corpus).
    await seedMessage(db, {
      id: "m1",
      chatId: chat,
      seq: 1,
      createdAt: FROZEN_AT - 1000,
      characterId: hero,
      variant: { content: "Hero drew the moonblade." },
    });
    await seedMessage(db, {
      id: "m2",
      chatId: chat,
      seq: 2,
      createdAt: FROZEN_AT,
      characterId: hero,
      variant: { content: "Hero swore an oath to the queen." },
    });
    const summarize = makeSummarizeRecorder([JSON.stringify({ answer: "They wield a moonblade.", grounded: true })]);

    const ans = await svcFor(db, summarize).askCard(owner, hero, "What weapon?");
    expect(ans).not.toBeNull();
    expect(ans?.characterId).toBe(hero);
    expect(ans?.question).toBe("What weapon?");
    expect(ans?.answer).toBe("They wield a moonblade.");
    expect(ans?.grounded).toBe(true);
    expect(ans?.degraded).toBe(false);
    expect(ans?.sampledMessages).toBe(2);
    // The scenes reached the prompt (grounding), most-recent first.
    const prompt = summarize.calls[0]?.[0]?.userPrompt ?? "";
    expect(prompt).toContain("moonblade");
    expect(prompt).toContain("oath to the queen");
    // PROSE-1 `discovery.ask.system` — unset ⇒ the shipped default.
    expect(summarize.calls[0]?.[0]?.systemPrompt).toBe(PROSE_SLOTS["discovery.ask.system"].text);
  });

  test("the card owner's PROSE override replaces the ask system prompt", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const hero = await seedCard(db, { id: "character_hero", ownerId: owner, name: "Hero", genre: "fantasy" });
    const summarize = makeSummarizeRecorder([JSON.stringify({ answer: "a moonblade", grounded: true })]);
    const svc = createDiscoveryService(
      makeDiscoveryHarness(db, {
        summarize,
        resolveUserProse: () => Promise.resolve({ "discovery.ask.system": { text: "Answer from the scenes only.", baseVersion: 1 } }),
      }).ctx,
    );

    await svc.askCard(owner, hero, "What weapon?");

    expect(summarize.calls[0]?.[0]?.systemPrompt).toBe("Answer from the scenes only.");
  });

  test("a double validation failure degrades to ungrounded raw text — the answer still returns (D79)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const hero = await seedCard(db, { id: "character_hero", ownerId: owner, name: "Hero", genre: "fantasy" });
    const chat = await seedHostedChat(db, "chat_1", owner);
    await seedMessage(db, { id: "m1", chatId: chat, seq: 1, createdAt: FROZEN_AT, characterId: hero, variant: { content: "Hero drew the moonblade." } });
    // The model never returns the json_schema shape (first turn + retry) — the verb degrades to raw + ungrounded.
    const summarize = makeSummarizeRecorder(["I think they use a sword, probably."]);

    const ans = await svcFor(db, summarize).askCard(owner, hero, "What weapon?");
    expect(ans).not.toBeNull();
    expect(ans?.answer).toBe("I think they use a sword, probably.");
    // `grounded` is the MODEL'S OWN claim (contract/results.ts). A parse failure produced no claim at all, so
    // the degrade must be its own field — reading `grounded: false` here as "the model said it's speculative"
    // is the conflation this flag exists to break.
    expect(ans?.grounded).toBe(false);
    expect(ans?.degraded).toBe(true);
    expect(ans?.sampledMessages).toBe(1);
    // The bounded retry fired before the degrade.
    expect(summarize.calls).toHaveLength(2);
  });

  test("null on a foreign/undistilled character — and never calls summarize", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const foreign = await seedCard(db, { id: "f", ownerId: other, genre: "horror" });
    // An owned but UNDISTILLED character (no character_summaries row) also fails the belt.
    const bare = await seedCharacter(db, { id: "bare", ownerId: owner, name: "Bare" });
    const summarize = makeSummarizeRecorder(["unused"]);
    const svc = svcFor(db, summarize);

    expect(await svc.askCard(owner, foreign, "q")).toBeNull(); // foreign belt
    expect(await svc.askCard(owner, bare, "q")).toBeNull(); // undistilled
    expect(await svc.askCard(owner, castId<CharacterId>("nope"), "q")).toBeNull();
    expect(summarize.calls).toEqual([]);
  });
});
