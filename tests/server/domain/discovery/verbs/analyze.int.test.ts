// Integration: PD-40 analyze (semantic understanding) — compareCharactersDeep (facet diff DECORATED with a
// grounded LLM narrative) + askCard (grounded Q&A over a character's recent PLAYED scenes). Both owner-belt
// via characters.ownerId (a foreign/undistilled card short-circuits to null BEFORE any summarize call). The
// LLM is the scripted `summarize` recorder — a test asserts the narrative parse + that the pass fired.

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
    // The narrative parsed from the scripted reply.
    expect(deep?.narrative).toEqual({
      summary: "Two fantasy leads.",
      overlap: "Both dragons.",
      distinction: "Curse vs heist.",
    });
    // The summarize pass actually fired (one input for the one comparison).
    expect(summarize.calls).toHaveLength(1);
    expect(summarize.calls[0]).toHaveLength(1);
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
    expect(ans?.sampledMessages).toBe(2);
    // The scenes reached the prompt (grounding), most-recent first.
    const prompt = summarize.calls[0]?.[0]?.userPrompt ?? "";
    expect(prompt).toContain("moonblade");
    expect(prompt).toContain("oath to the queen");
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
