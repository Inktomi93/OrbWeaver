// verb: createExtractQuiet — the imagery quiet-extraction shaper (imagery-design/02 §2), homed in chat. Proves
// against a real db: it windows the recent canon, resolves the template's {{char}} against the subject/roster
// card (chat's ONE MacroContext), runs the summarize side-LLM, and returns the raw reply text + that call's
// spend. The summarize role + getCard are fakes (the shaper declares their ports; compose binds the real ones).

import type { CharacterCard } from "@orb/contracts/character";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { SummarizeInput, SummarizeOptions } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { createExtractQuiet } from "@orb/server/domain/chat";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../_support";

interface SummarizeCall {
  readonly inputs: readonly SummarizeInput[];
  readonly opts: SummarizeOptions | undefined;
}

/** A recording summarize fake returning one item with a known cost. */
function fakeSummarize(
  sink: SummarizeCall[],
  text = "resolved keywords",
  costUsd: number | null = 0.007,
): (inputs: SummarizeInput[], opts?: SummarizeOptions) => Promise<SummarizeResult> {
  return (inputs: SummarizeInput[], opts?: SummarizeOptions): Promise<SummarizeResult> => {
    sink.push({ inputs, opts });
    return Promise.resolve({ items: [{ text, usage: { tokensIn: null, tokensOut: null, costUsd } }], model: "sum-model" });
  };
}

/** A getCard fake that names the roster's primary character. */
function fakeGetCard(name: string): () => Promise<CharacterCard> {
  // FABRICATION-OK: minimal CharacterCard double — the shaper reads only the card's name.
  return (): Promise<CharacterCard> => Promise.resolve({ name, avatarAssetId: null } as unknown as CharacterCard);
}

/** Seed a host + a character + a chat with both seated; returns the chat id. */
async function seedRoom(db: Db): Promise<ChatId> {
  const host = await seedUser(db, "host");
  const characterId = await seedCharacter(db, host, "aria");
  const chatId = await seedChat(db, "room");
  await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "char", characterId, role: "member" });
  return chatId;
}

describe("createExtractQuiet", () => {
  test("resolves {{char}} against the roster card + frames the recent canon, returns text + cost", async () => {
    const db = await freshDb();
    const chatId = await seedRoom(db);
    await seedMessage(db, chatId, 1, { role: "user", content: "Where are we?" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "A rain-slick alley at dusk." });

    const calls: SummarizeCall[] = [];
    const extractQuiet = createExtractQuiet({ db, summarize: fakeSummarize(calls), getCard: fakeGetCard("Aria") });

    const result = await extractQuiet({ chatId, instruction: "Describe {{char}} in the current moment.", historyFloorSeq: 0 });

    expect(calls).toHaveLength(1);
    const item = calls[0]?.inputs[0];
    // {{char}} resolved against the roster's primary character card.
    expect(item?.systemPrompt).toBe("Describe Aria in the current moment.");
    // The recent canon is framed as the scene the extractor reads.
    expect(item?.userPrompt).toContain("A rain-slick alley at dusk.");
    expect(item?.userPrompt).toContain("Where are we?");
    // A low-temp classify call.
    expect(calls[0]?.opts?.temperature).toBeLessThan(1);
    expect(result.text).toBe("resolved keywords");
    expect(result.costUsd).toBe(0.007);
  });

  test("an empty chat frames a conversation-starting placeholder (no history)", async () => {
    const db = await freshDb();
    const chatId = await seedRoom(db);

    const calls: SummarizeCall[] = [];
    const extractQuiet = createExtractQuiet({ db, summarize: fakeSummarize(calls), getCard: fakeGetCard("Aria") });

    await extractQuiet({ chatId, instruction: "Describe {{char}}.", historyFloorSeq: 0 });

    expect(calls[0]?.inputs[0]?.userPrompt).toContain("just starting");
  });

  test("a prompt-excluded row is dropped from the window", async () => {
    const db = await freshDb();
    const chatId = await seedRoom(db);
    await seedMessage(db, chatId, 1, { role: "assistant", content: "VISIBLE line." });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "HIDDEN line.", excludedFromPrompt: true });

    const calls: SummarizeCall[] = [];
    const extractQuiet = createExtractQuiet({ db, summarize: fakeSummarize(calls), getCard: fakeGetCard("Aria") });

    await extractQuiet({ chatId, instruction: "x", historyFloorSeq: 0 });

    const userPrompt = calls[0]?.inputs[0]?.userPrompt ?? "";
    expect(userPrompt).toContain("VISIBLE line.");
    expect(userPrompt).not.toContain("HIDDEN line.");
  });

  // The extraction's product is a model DISTILLATION of the transcript returned to ONE human on the wire
  // (`imagery.extractPrompt`), so it is viewer-plane: a `from-join`-clamped caller's pre-join rows must never
  // reach the side-LLM at all. The floor is resolved at the compose gate by `resolveViewerVisibility`.
  test("a positive history floor keeps every PRE-JOIN row out of the scene the side-LLM reads", async () => {
    const db = await freshDb();
    const chatId = await seedRoom(db);
    await seedMessage(db, chatId, 1, { role: "assistant", content: "PREJOIN secret." });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "ALSO prejoin." });
    await seedMessage(db, chatId, 3, { role: "assistant", content: "AFTERJOIN line." });

    const calls: SummarizeCall[] = [];
    const extractQuiet = createExtractQuiet({ db, summarize: fakeSummarize(calls), getCard: fakeGetCard("Aria") });

    await extractQuiet({ chatId, instruction: "x", historyFloorSeq: 3 });

    const userPrompt = calls[0]?.inputs[0]?.userPrompt ?? "";
    expect(userPrompt).toContain("AFTERJOIN line.");
    expect(userPrompt).not.toContain("PREJOIN secret.");
    expect(userPrompt).not.toContain("ALSO prejoin.");
  });
});
