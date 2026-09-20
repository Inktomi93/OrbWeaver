// engine/round — the GROUP ROUND DRIVER (the chat design doc Part III §6/§7). .int: the REAL chunk-9 engine + libSQL, so
// the per-speaker lock + the D26 canon persist are exercised. Pins: ONE immutable ctx → N speakers shaped +
// run (each committing its own row, characterId = the resolved speaker); the PER-SPEAKER lock (3 sequential
// turns all commit — a whole-round lock would have blocked speaker 2 → proves the doc's per-speaker model);
// canon advances between speakers (speaker k+1 witnesses k's row); the two-axis nudge per speaker; the
// narrator round (ONE turn authored by the group character); and the locked-yield (a fake engine).

import type { AssembleContext, ChatBusEvent, GroupConfig, MessageView, SpeakerRef } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, Handle, MessageId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import type { SpeakerCandidate } from "../../../../../packages/server/src/domain/chat/contract/arbitration.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import type { TurnEngine, TurnOutcome, TurnPrep, TurnRequest } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine.ts";
import { driveRound } from "../../../../../packages/server/src/domain/chat/engine/round.ts";
import { loadWitnessHorizons } from "../../../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import { loadCanonHistory } from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, scriptedRoleTurn, seedCharacter, seedChat, seedUser, stubRunCompaction, testConnection } from "../_support.ts";

const HOST = castId<UserId>("user_host");
const cid = (k: string): CharacterId => castId<CharacterId>(`character_${k}`);
const charRef = (k: string): SpeakerRef => ({ kind: "character", characterId: cid(k) });

const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Alex", description: "the user" },
  recentMessages: [],
};

/** A 2-character group ctx (characters + index-aligned speakerRefs) — feeds the per-speaker card-section shape so
 *  each speaker renders THEIR OWN card as primary + the other as a co-speaker (the chat design doc §7). */
const GROUP_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Alex", description: "the user" },
  recentMessages: [],
  characters: [
    { name: "Aria", description: "a bold knight" },
    { name: "Bran", description: "a sly rogue" },
  ],
  speakerRefs: [charRef("a"), charRef("b")],
};

const PER_SPEAKER: GroupConfig = { ...DEFAULT_GROUP_CONFIG };
const NARRATOR: GroupConfig = {
  output: "narrator",
  policy: "natural",
  speakerTags: true,
  groupNudge: true,
  autoMode: false,
  autoModeMaxTurns: 6,
  autoModeDelayMs: 1500,
  allowSelfResponses: false,
  memberCardVisibility: "sheet",
};

function realEngine(database: Db, requests: TurnRequest[]): TurnEngine {
  const ctx = makeChatContext(database, {
    runChatTurn: scriptedRoleTurn(requests),
    applyStatsDelta: (): void => undefined,
  });
  return createTurnEngine(ctx, {
    emit: (_e: ChatBusEvent): Promise<void> => Promise.resolve(),


    holder: "tester",
    lockTtlMs: 1000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons,
    recallMemory,
    runCompaction: stubRunCompaction,
  });
}

function base(chatId: ChatId): Omit<TurnPrep, "speakerCharacterId" | "groupNudge" | "shape"> {
  return {
    chatId,
    assembleContext: ASSEMBLE_CTX,
    connection: testConnection(),
    triggeredBy: HOST,
    runAsUserId: HOST,
    kind: "auto",
    intent: {},
  };
}

/** Flatten a wire history's text content (for the nudge assertion). */
function historyText(req: TurnRequest): string {
  return req.history.flatMap((m) => m.content.map((p) => (p.type === "text" ? p.text : ""))).join("\n");
}

let db: Db;
beforeEach(async () => {
  db = await freshDb();
  await seedUser(db, castId<Handle>("host"));
  await seedCharacter(db, HOST, "a");
  await seedCharacter(db, HOST, "b");
  await seedCharacter(db, HOST, "c");
  await seedCharacter(db, HOST, "group");
});

describe("driveRound — per-speaker round (ONE ctx, N speakers, per-speaker lock)", () => {
  test("runs each resolved speaker, committing a row per speaker (characterId = speaker)", async () => {
    const chatId = await seedChat(db, "r");
    const requests: TurnRequest[] = [];
    const engine = realEngine(db, requests);
    const speakers: SpeakerCandidate[] = [
      { ref: charRef("a"), name: "Aria" },
      { ref: charRef("b"), name: "Bran" },
      { ref: charRef("c"), name: "Cara" },
    ];

    const outcome = await driveRound({
      engine,
      base: base(chatId),
      group: PER_SPEAKER,
      speakers,
      groupCharacterId: null,
      narratorSpeakerName: "Aria, Bran, Cara",
      narratorMemberNames: [],
    });

    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toHaveLength(3);

    const history = await loadCanonHistory(db, chatId);
    // 3 sequential commits PROVE the per-speaker lock (a whole-round lock would have refused speaker 2).
    expect(history.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(history.map((m) => m.characterId)).toEqual([cid("a"), cid("b"), cid("c")]);
    expect(history.every((m) => m.role === "assistant")).toBe(true);
  });

  test("per-speaker card section: each speaker renders THEIR OWN card as primary + the other as co-speaker (§7)", async () => {
    const chatId = await seedChat(db, "cards");
    const requests: TurnRequest[] = [];
    await driveRound({
      engine: realEngine(db, requests),
      base: { ...base(chatId), assembleContext: GROUP_CTX },
      group: PER_SPEAKER,
      speakers: [
        { ref: charRef("a"), name: "Aria" },
        { ref: charRef("b"), name: "Bran" },
      ],
      groupCharacterId: null,
      narratorSpeakerName: "Aria, Bran",
      narratorMemberNames: [],
    });
    expect(requests).toHaveLength(2);
    const prompt = (r: TurnRequest): string => `${r.prompt.static}\n${r.prompt.dynamic}`;
    // Aria's turn: Aria is primary; Bran is the co-speaker ("[Also present — Bran]").
    expect(prompt(requests[0] as TurnRequest)).toContain("Also present — Bran");
    // Bran's turn: the primary SWAPPED per speaker — Aria is now the co-speaker.
    expect(prompt(requests[1] as TurnRequest)).toContain("Also present — Aria");
  });

  test("ONE immutable ctx: every speaker's request shares the same built system block", async () => {
    const chatId = await seedChat(db, "ctx");
    const requests: TurnRequest[] = [];
    await driveRound({
      engine: realEngine(db, requests),
      base: base(chatId),
      group: PER_SPEAKER,
      speakers: [
        { ref: charRef("a"), name: "Aria" },
        { ref: charRef("b"), name: "Bran" },
      ],
      groupCharacterId: null,
      narratorSpeakerName: "Aria, Bran",
      narratorMemberNames: [],
    });
    expect(requests).toHaveLength(2);
    expect(requests[0]?.prompt.static).toBe(requests[1]?.prompt.static);
  });

  test("canon advances between speakers: speaker k+1's history includes speaker k's committed row", async () => {
    const chatId = await seedChat(db, "adv");
    const requests: TurnRequest[] = [];
    await driveRound({
      engine: realEngine(db, requests),
      base: base(chatId),
      group: PER_SPEAKER,
      speakers: [
        { ref: charRef("a"), name: "Aria" },
        { ref: charRef("b"), name: "Bran" },
      ],
      groupCharacterId: null,
      narratorSpeakerName: "Aria, Bran",
      narratorMemberNames: [],
    });
    // The 2nd speaker sees the 1st speaker's committed reply (canon grew between per-speaker turns).
    expect(requests[1]?.history.length ?? 0).toBeGreaterThan(requests[0]?.history.length ?? 0);
  });

  test("the two-axis group nudge fences each speaker by name (multi-speaker round)", async () => {
    const chatId = await seedChat(db, "nudge");
    const requests: TurnRequest[] = [];
    await driveRound({
      engine: realEngine(db, requests),
      base: base(chatId),
      group: PER_SPEAKER,
      speakers: [
        { ref: charRef("a"), name: "Aria" },
        { ref: charRef("b"), name: "Bran" },
      ],
      groupCharacterId: null,
      narratorSpeakerName: "Aria, Bran",
      narratorMemberNames: [],
    });
    expect(historyText(requests[0] as TurnRequest)).toContain("only as Aria");
    expect(historyText(requests[1] as TurnRequest)).toContain("only as Bran");
  });

  test("the host's PROSE override re-words the round nudge, keeping the per-speaker name fence", async () => {
    // PROSE-1 `chat.group.roundNudge`: the fence is the one line stopping the model voicing every character,
    // so it is exactly the sentence a host wants to tune. It resolves off the round's ONE immutable ctx.
    const chatId = await seedChat(db, "nudge-prose");
    const requests: TurnRequest[] = [];
    await driveRound({
      engine: realEngine(db, requests),
      base: {
        ...base(chatId),
        assembleContext: { ...ASSEMBLE_CTX, prose: { "chat.group.roundNudge": { text: "[SPEAK AS {{name}}. Nobody else.]", baseVersion: 1 } } },
      },
      group: PER_SPEAKER,
      speakers: [
        { ref: charRef("a"), name: "Aria" },
        { ref: charRef("b"), name: "Bran" },
      ],
      groupCharacterId: null,
      narratorSpeakerName: "Aria, Bran",
      narratorMemberNames: [],
    });
    expect(historyText(requests[0] as TurnRequest)).toContain("[SPEAK AS Aria. Nobody else.]");
    expect(historyText(requests[0] as TurnRequest)).not.toContain("Write the next reply only as");
    expect(historyText(requests[1] as TurnRequest)).toContain("[SPEAK AS Bran. Nobody else.]");
  });

  test("the per-chat lock is released after the round (a subsequent round runs)", async () => {
    const chatId = await seedChat(db, "rel");
    const requests: TurnRequest[] = [];
    const engine = realEngine(db, requests);
    const speakers: SpeakerCandidate[] = [{ ref: charRef("a"), name: "Aria" }];
    await driveRound({
      engine,
      base: base(chatId),
      group: PER_SPEAKER,
      speakers,
      groupCharacterId: null,
      narratorSpeakerName: "Aria",
      narratorMemberNames: [],
    });
    await driveRound({
      engine,
      base: base(chatId),
      group: PER_SPEAKER,
      speakers,
      groupCharacterId: null,
      narratorSpeakerName: "Aria",
      narratorMemberNames: [],
    });
    expect((await loadCanonHistory(db, chatId)).map((m) => m.seq)).toEqual([1, 2]);
  });
});

describe("driveRound — narrator round (one turn for every character, group-character authored)", () => {
  test("commits ONE row authored by the synthetic group character", async () => {
    const chatId = await seedChat(db, "narr");
    const requests: TurnRequest[] = [];
    const outcome = await driveRound({
      engine: realEngine(db, requests),
      base: base(chatId),
      group: NARRATOR,
      speakers: [], // ignored for narrator
      groupCharacterId: cid("group"),
      narratorSpeakerName: "Aria & Bran",
      narratorMemberNames: [],
    });
    expect(outcome.messages).toHaveLength(1);
    const history = await loadCanonHistory(db, chatId);
    expect(history.map((m) => m.characterId)).toEqual([cid("group")]);
  });

  // ── The PRODUCE half of per-speaker color (§12.4). A narrator round is ONE speaker by construction, so
  // the per-speaker fence can never fire for it; its two INDEPENDENT toggles ride the same trailing-user
  // seam. Without the `<speaker>` instruction the renderer's split has nothing to split on — which is
  // exactly the state the shipped narrator transcripts were generated in.
  test("a MULTI-member narrator round asks for the <speaker> markers AND names the characters", async () => {
    const chatId = await seedChat(db, "narr-nudge");
    const requests: TurnRequest[] = [];
    await driveRound({
      engine: realEngine(db, requests),
      base: base(chatId),
      group: NARRATOR,
      speakers: [],
      groupCharacterId: cid("group"),
      narratorSpeakerName: "Aria, Bran",
      narratorMemberNames: ["Aria", "Bran"],
    });
    const text = historyText(requests[0] as TurnRequest);
    expect(text).toContain("<speaker>Name</speaker>");
    expect(text).toContain("voicing the present characters (Aria, Bran)");
    // NEVER the per-speaker fence — that line would ask for the opposite of a narrator turn.
    expect(text).not.toContain("Write the next reply only as");
  });

  test("speakerTags OFF drops the marker instruction but keeps the group nudge (independent toggles)", async () => {
    const chatId = await seedChat(db, "narr-notags");
    const requests: TurnRequest[] = [];
    await driveRound({
      engine: realEngine(db, requests),
      base: base(chatId),
      group: { ...NARRATOR, speakerTags: false },
      speakers: [],
      groupCharacterId: cid("group"),
      narratorSpeakerName: "Aria, Bran",
      narratorMemberNames: ["Aria", "Bran"],
    });
    const text = historyText(requests[0] as TurnRequest);
    expect(text).not.toContain("<speaker>");
    expect(text).toContain("voicing the present characters (Aria, Bran)");
  });

  test("a SINGLE-CHARACTER narrator round sends no nudge at all (byte-identical single turn)", async () => {
    const chatId = await seedChat(db, "narr-solo");
    const requests: TurnRequest[] = [];
    await driveRound({
      engine: realEngine(db, requests),
      base: base(chatId),
      group: NARRATOR,
      speakers: [],
      groupCharacterId: cid("group"),
      narratorSpeakerName: "Aria",
      narratorMemberNames: ["Aria"],
    });
    const text = historyText(requests[0] as TurnRequest);
    expect(text).not.toContain("<speaker>");
    expect(text).not.toContain("voicing the present characters");
  });

  test("the host's PROSE override re-words the speaker-tag instruction (PROSE-1, owner-editable)", async () => {
    const chatId = await seedChat(db, "narr-prose");
    const requests: TurnRequest[] = [];
    await driveRound({
      engine: realEngine(db, requests),
      base: {
        ...base(chatId),
        assembleContext: { ...ASSEMBLE_CTX, prose: { "chat.group.speakerTags": { text: "[TAG THEM: <speaker>X</speaker>.]", baseVersion: 1 } } },
      },
      group: NARRATOR,
      speakers: [],
      groupCharacterId: cid("group"),
      narratorSpeakerName: "Aria, Bran",
      narratorMemberNames: ["Aria", "Bran"],
    });
    const text = historyText(requests[0] as TurnRequest);
    expect(text).toContain("[TAG THEM: <speaker>X</speaker>.]");
    expect(text).not.toContain("Wrap each character's spoken lines");
  });

  test("a narrator round with no group-character id is a wiring bug (throws — §10)", async () => {
    const chatId = await seedChat(db, "narrbad");
    await expect(
      driveRound({
        engine: realEngine(db, []),
        base: base(chatId),
        group: NARRATOR,
        speakers: [],
        groupCharacterId: null,
        narratorSpeakerName: "x",
        narratorMemberNames: [],
      }),
    ).rejects.toThrow("group-character");
  });
});

describe("driveRound — locked yields the round (a human send interleaved — §6)", () => {
  test("a mid-round locked refusal returns the committed-so-far without throwing", async () => {
    let calls = 0;
    // @orb-waive no-test-fabrication(unknown): minimal MessageView stand-in — driveRound only threads `.id` through from the outcome. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const view = { id: castId<MessageId>("message_x") } as unknown as MessageView;
    const fakeEngine: Pick<TurnEngine, "runTurn"> = {
      runTurn: (): Promise<TurnOutcome> => {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve({ messages: [view], aborted: false, abortReason: undefined });
        }
        return Promise.reject(new ChatOperationError(CHAT_OP_CODES.locked, "in flight"));
      },
    };
    const outcome = await driveRound({
      engine: fakeEngine,
      base: base(castId<ChatId>("chat_x")),
      group: PER_SPEAKER,
      speakers: [
        { ref: charRef("a"), name: "Aria" },
        { ref: charRef("b"), name: "Bran" },
      ],
      groupCharacterId: null,
      narratorSpeakerName: "Aria, Bran",
      narratorMemberNames: [],
    });
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.aborted).toBe(false);
    expect(calls).toBe(2);
  });
});

describe("driveRound — an engine turn that RETURNS aborted stops the round + propagates the whole truth", () => {
  // @orb-waive no-test-fabrication(unknown): minimal MessageView stand-in — driveRound only threads `.id` through from the outcome. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const abortedView = { id: castId<MessageId>("message_ab") } as unknown as MessageView;

  test("single-speaker: an aborted engine outcome propagates aborted:true + reason", async () => {
    const fakeEngine: Pick<TurnEngine, "runTurn"> = {
      runTurn: (): Promise<TurnOutcome> => Promise.resolve({ messages: [], aborted: true, abortReason: "user" }),
    };
    const outcome = await driveRound({
      engine: fakeEngine,
      base: base(castId<ChatId>("chat_ab1")),
      group: PER_SPEAKER,
      speakers: [{ ref: charRef("a"), name: "Aria" }],
      groupCharacterId: null,
      narratorSpeakerName: "Aria",
      narratorMemberNames: [],
    });
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe("user");
    expect(outcome.messages).toHaveLength(0);
  });

  test("mid-round multi-speaker: speaker 1 commits, speaker 2 aborts → round carries BOTH the committed row AND aborted:true", async () => {
    let calls = 0;
    // @orb-waive no-test-fabrication(unknown): minimal MessageView stand-in — driveRound only threads `.id` through from the outcome. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const committedView = { id: castId<MessageId>("message_1") } as unknown as MessageView;
    const fakeEngine: Pick<TurnEngine, "runTurn"> = {
      runTurn: (): Promise<TurnOutcome> => {
        calls += 1;
        // Speaker 1 commits normally; speaker 2 is cancelled mid-round (a caller abort landed between speakers).
        return calls === 1
          ? Promise.resolve({ messages: [committedView], aborted: false, abortReason: undefined })
          : Promise.resolve({ messages: [], aborted: true, abortReason: "user" });
      },
    };
    const outcome = await driveRound({
      engine: fakeEngine,
      base: base(castId<ChatId>("chat_ab2")),
      group: PER_SPEAKER,
      speakers: [
        { ref: charRef("a"), name: "Aria" },
        { ref: charRef("b"), name: "Bran" },
      ],
      groupCharacterId: null,
      narratorSpeakerName: "Aria, Bran",
      narratorMemberNames: [],
    });
    // The whole truth: the row that landed before the abort rides along, AND the round reports aborted.
    expect(outcome.messages).toEqual([committedView]);
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe("user");
    // The loop STOPPED at speaker 2 — speaker 3 (had there been one) never runs; here calls stop at 2.
    expect(calls).toBe(2);
  });

  test("the stale (lock-loss) reason propagates through the round just as `user` does", async () => {
    const fakeEngine: Pick<TurnEngine, "runTurn"> = {
      runTurn: (): Promise<TurnOutcome> => Promise.resolve({ messages: [abortedView], aborted: true, abortReason: "stale" }),
    };
    const outcome = await driveRound({
      engine: fakeEngine,
      base: base(castId<ChatId>("chat_ab3")),
      group: PER_SPEAKER,
      speakers: [
        { ref: charRef("a"), name: "Aria" },
        { ref: charRef("b"), name: "Bran" },
      ],
      groupCharacterId: null,
      narratorSpeakerName: "Aria, Bran",
      narratorMemberNames: [],
    });
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe("stale");
    expect(outcome.messages).toEqual([abortedView]);
  });
});
