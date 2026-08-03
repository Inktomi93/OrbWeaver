// verb: createExtractQuiet — the imagery quiet-extraction shaper (imagery-design/02 §2), homed in chat. Proves
// against a real db: it windows the recent canon, resolves the template's {{char}} against the subject/roster
// card (chat's ONE MacroContext), runs the summarize side-LLM, and returns the raw reply text + that call's
// spend. The summarize role + getCard are fakes (the shaper declares their ports; compose binds the real ones).

import type { CharacterCard } from "@orb/contracts/character";
import { historyFloor } from "@orb/contracts/chat";
import type { UserMacroSpec } from "@orb/contracts/preset";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { SummarizeInput, SummarizeOptions } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import type { ChatUserMacroDefs } from "@orb/server/domain/chat";
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

/** IMGMAC — the no-defs arm of the user-macro plane op: neither authoring home declared anything, so the
 *  build returns null and every render falls back to the process singleton (byte-identical to before). */
const NO_USER_MACROS = (): Promise<ChatUserMacroDefs> => Promise.resolve({ preset: [], game: [] });

/** A static user macro `{{house_style}}` — no inputs, so it resolves the same every time (an imagery mode
 *  template is not a turn; a draw-bearing macro would need the picks bag, which the pinned test below covers). */
function houseStyleDef(body: string): UserMacroSpec {
  return { name: "house_style", description: "the host's standing art direction", args: [], body, strict: false, inputs: [] };
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
    const extractQuiet = createExtractQuiet({
      db,
      summarize: fakeSummarize(calls),
      getCard: fakeGetCard("Aria"),
      resolveChatPresetParams: () => Promise.resolve({}),
      resolveUserMacroDefs: NO_USER_MACROS,
    });

    const result = await extractQuiet({ chatId, instruction: "Describe {{char}} in the current moment.", historyFloorSeq: historyFloor(0) });

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
    const extractQuiet = createExtractQuiet({
      db,
      summarize: fakeSummarize(calls),
      getCard: fakeGetCard("Aria"),
      resolveChatPresetParams: () => Promise.resolve({}),
      resolveUserMacroDefs: NO_USER_MACROS,
    });

    await extractQuiet({ chatId, instruction: "Describe {{char}}.", historyFloorSeq: historyFloor(0) });

    expect(calls[0]?.inputs[0]?.userPrompt).toContain("just starting");
  });

  test("a prompt-excluded row is dropped from the window", async () => {
    const db = await freshDb();
    const chatId = await seedRoom(db);
    await seedMessage(db, chatId, 1, { role: "assistant", content: "VISIBLE line." });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "HIDDEN line.", excludedFromPrompt: true });

    const calls: SummarizeCall[] = [];
    const extractQuiet = createExtractQuiet({
      db,
      summarize: fakeSummarize(calls),
      getCard: fakeGetCard("Aria"),
      resolveChatPresetParams: () => Promise.resolve({}),
      resolveUserMacroDefs: NO_USER_MACROS,
    });

    await extractQuiet({ chatId, instruction: "x", historyFloorSeq: historyFloor(0) });

    const userPrompt = calls[0]?.inputs[0]?.userPrompt ?? "";
    expect(userPrompt).toContain("VISIBLE line.");
    expect(userPrompt).not.toContain("HIDDEN line.");
  });

  // §3.6 / D106 summary-plane strip: the extractor's distillation is handed back on the wire (and can seed a
  // durable image prompt), so hidden-class spans must NEVER enter the model's scene — a lie's truth cannot
  // launder into an image prompt. Unconditional (the compaction-sink ruling), like `projectBodyForSummary`.
  test("hidden-class spans are STRIPPED from the scene the side-LLM reads (no lie-truth in the distillation)", async () => {
    const db = await freshDb();
    const chatId = await seedRoom(db);
    await seedMessage(db, chatId, 1, { role: "assistant", content: 'He smiles. <lie character="Z" truth="he is the mole"/> "Nothing."' });

    const calls: SummarizeCall[] = [];
    const extractQuiet = createExtractQuiet({
      db,
      summarize: fakeSummarize(calls),
      getCard: fakeGetCard("Aria"),
      resolveChatPresetParams: () => Promise.resolve({}),
      resolveUserMacroDefs: NO_USER_MACROS,
    });

    await extractQuiet({ chatId, instruction: "x", historyFloorSeq: historyFloor(0) });

    const userPrompt = calls[0]?.inputs[0]?.userPrompt ?? "";
    expect(userPrompt).toContain('He smiles.  "Nothing."');
    expect(userPrompt).not.toContain("mole");
    expect(userPrompt).not.toContain("<lie");
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
    const extractQuiet = createExtractQuiet({
      db,
      summarize: fakeSummarize(calls),
      getCard: fakeGetCard("Aria"),
      resolveChatPresetParams: () => Promise.resolve({}),
      resolveUserMacroDefs: NO_USER_MACROS,
    });

    await extractQuiet({ chatId, instruction: "x", historyFloorSeq: historyFloor(3) });

    const userPrompt = calls[0]?.inputs[0]?.userPrompt ?? "";
    expect(userPrompt).toContain("AFTERJOIN line.");
    expect(userPrompt).not.toContain("PREJOIN secret.");
    expect(userPrompt).not.toContain("ALSO prejoin.");
  });

  // IMGMAC (owner ruling: YES) — THE USER-MACRO PLANE REACHES THE IMAGERY MODE TEMPLATES. The shaper used to
  // call `processMacros` with NO registry, so the process default registry was all a template got: a host who
  // authored `{{house_style}}` on their preset (or their game) saw the literal braces survive into the image
  // prompt. The plane now rides the SAME two authoring homes + the SAME shadow policy the turn build applies
  // (`buildTurnUserMacros`), so a template resolves what a turn would.
  test("IMGMAC: a PRESET user macro resolves inside the mode template", async () => {
    const db = await freshDb();
    const chatId = await seedRoom(db);

    const calls: SummarizeCall[] = [];
    const extractQuiet = createExtractQuiet({
      db,
      summarize: fakeSummarize(calls),
      getCard: fakeGetCard("Aria"),
      resolveChatPresetParams: () => Promise.resolve({}),
      resolveUserMacroDefs: () => Promise.resolve({ preset: [houseStyleDef("in muted watercolour")], game: [] }),
    });

    await extractQuiet({ chatId, instruction: "Describe {{char}}, {{house_style}}.", historyFloorSeq: historyFloor(0) });

    expect(calls[0]?.inputs[0]?.systemPrompt).toBe("Describe Aria, in muted watercolour.");
  });

  test("IMGMAC: a GAME macro SHADOWS the preset's by name — the template resolves what a TURN would", async () => {
    const db = await freshDb();
    const chatId = await seedRoom(db);

    const calls: SummarizeCall[] = [];
    const extractQuiet = createExtractQuiet({
      db,
      summarize: fakeSummarize(calls),
      getCard: fakeGetCard("Aria"),
      resolveChatPresetParams: () => Promise.resolve({}),
      resolveUserMacroDefs: () => Promise.resolve({ preset: [houseStyleDef("in muted watercolour")], game: [houseStyleDef("in harsh charcoal")] }),
    });

    await extractQuiet({ chatId, instruction: "{{house_style}}", historyFloorSeq: historyFloor(0) });

    // Specific-over-general (`shadowPresetUserMacros`) — the same rule the turn build and the picks pane apply.
    expect(calls[0]?.inputs[0]?.systemPrompt).toBe("in harsh charcoal");
  });

  test("IMGMAC: a chat with NO authored macros degrades honestly — an unknown {{macro}} is left alone", async () => {
    const db = await freshDb();
    const chatId = await seedRoom(db);

    const calls: SummarizeCall[] = [];
    const extractQuiet = createExtractQuiet({
      db,
      summarize: fakeSummarize(calls),
      getCard: fakeGetCard("Aria"),
      resolveChatPresetParams: () => Promise.resolve({}),
      resolveUserMacroDefs: NO_USER_MACROS,
    });

    await extractQuiet({ chatId, instruction: "Describe {{char}}, {{house_style}}.", historyFloorSeq: historyFloor(0) });

    // The builtin still resolves; the undeclared macro is untouched (kit's unknown-macro posture), and the
    // build took the null fast path — no per-call registry allocated for a chat that declared nothing.
    expect(calls[0]?.inputs[0]?.systemPrompt).toBe("Describe Aria, {{house_style}}.");
  });
});
