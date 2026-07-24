// engine/round — the GROUP ROUND DRIVER (chat.md Part III §6/§7). .int: the REAL chunk-9 engine + libSQL, so
// the per-speaker lock + the D26 canon persist are exercised. Pins: ONE immutable ctx → N speakers shaped +
// run (each committing its own row, characterId = the resolved speaker); the PER-SPEAKER lock (3 sequential
// turns all commit — a whole-round lock would have blocked speaker 2 → proves the doc's per-speaker model);
// canon advances between speakers (speaker k+1 witnesses k's row); the two-axis nudge per speaker; the
// narrator round (ONE turn authored by the group character); and the locked-yield (a fake engine).

import type { AssembleContext, ChatBusEvent, GroupConfig, MessageView, SpeakerRef } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, MessageId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import type { CastName } from "../../../../../packages/server/src/domain/chat/contract/arbitration";
import { CHAT_OP_CODES, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import type { TurnEngine, TurnOutcome, TurnPrep, TurnRequest } from "../../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine";
import { driveRound } from "../../../../../packages/server/src/domain/chat/engine/round";
import { loadWitnessHorizons } from "../../../../../packages/server/src/domain/chat/memory/persistence/queries";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall";
import { loadCanonHistory } from "../../../../../packages/server/src/domain/chat/persistence/queries";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, scriptedRoleTurn, seedCharacter, seedChat, seedUser, testConnection } from "../_support";

const HOST = castId<UserId>("user_host");
const cid = (k: string): CharacterId => castId<CharacterId>(`character_${k}`);
const charRef = (k: string): SpeakerRef => ({ kind: "character", characterId: cid(k) });

const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Nate", description: "the user" },
  recentMessages: [],
};

/** A 2-character group ctx (cast + index-aligned castMembers) — feeds the per-speaker card-section shape so
 *  each speaker renders THEIR OWN card as primary + the other as a co-speaker (chat.md §7). */
const GROUP_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Nate", description: "the user" },
  recentMessages: [],
  cast: [
    { name: "Aria", description: "a bold knight" },
    { name: "Bran", description: "a sly rogue" },
  ],
  castMembers: [charRef("a"), charRef("b")],
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
    debitBudget: (): Promise<void> => Promise.resolve(),
    resolveTurnPolicy: async () => ({ budget: null, allowNonOwnerMaxProSub: false }),
    holder: "tester",
    lockTtlMs: 1000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons,
    recallMemory,
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
  await seedUser(db, "host");
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
    const speakers: CastName[] = [
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
      castName: "Aria, Bran, Cara",
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
      castName: "Aria, Bran",
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
      castName: "Aria, Bran",
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
      castName: "Aria, Bran",
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
      castName: "Aria, Bran",
    });
    expect(historyText(requests[0] as TurnRequest)).toContain("only as Aria");
    expect(historyText(requests[1] as TurnRequest)).toContain("only as Bran");
  });

  test("the per-chat lock is released after the round (a subsequent round runs)", async () => {
    const chatId = await seedChat(db, "rel");
    const requests: TurnRequest[] = [];
    const engine = realEngine(db, requests);
    const speakers: CastName[] = [{ ref: charRef("a"), name: "Aria" }];
    await driveRound({
      engine,
      base: base(chatId),
      group: PER_SPEAKER,
      speakers,
      groupCharacterId: null,
      castName: "Aria",
    });
    await driveRound({
      engine,
      base: base(chatId),
      group: PER_SPEAKER,
      speakers,
      groupCharacterId: null,
      castName: "Aria",
    });
    expect((await loadCanonHistory(db, chatId)).map((m) => m.seq)).toEqual([1, 2]);
  });
});

describe("driveRound — narrator round (one cast turn, group-character authored)", () => {
  test("commits ONE row authored by the synthetic group character", async () => {
    const chatId = await seedChat(db, "narr");
    const requests: TurnRequest[] = [];
    const outcome = await driveRound({
      engine: realEngine(db, requests),
      base: base(chatId),
      group: NARRATOR,
      speakers: [], // ignored for narrator
      groupCharacterId: cid("group"),
      castName: "Aria & Bran",
    });
    expect(outcome.messages).toHaveLength(1);
    const history = await loadCanonHistory(db, chatId);
    expect(history.map((m) => m.characterId)).toEqual([cid("group")]);
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
        castName: "x",
      }),
    ).rejects.toThrow("group-character");
  });
});

describe("driveRound — locked yields the round (a human send interleaved — §6)", () => {
  test("a mid-round locked refusal returns the committed-so-far without throwing", async () => {
    let calls = 0;
    const view = { id: castId<MessageId>("message_x") } as unknown as MessageView;
    const fakeEngine: TurnEngine = {
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
      castName: "Aria, Bran",
    });
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.aborted).toBe(false);
    expect(calls).toBe(2);
  });
});

describe("driveRound — an engine turn that RETURNS aborted stops the round + propagates the whole truth", () => {
  const abortedView = { id: castId<MessageId>("message_ab") } as unknown as MessageView;

  test("single-speaker: an aborted engine outcome propagates aborted:true + reason", async () => {
    const fakeEngine: TurnEngine = {
      runTurn: (): Promise<TurnOutcome> => Promise.resolve({ messages: [], aborted: true, abortReason: "user" }),
    };
    const outcome = await driveRound({
      engine: fakeEngine,
      base: base(castId<ChatId>("chat_ab1")),
      group: PER_SPEAKER,
      speakers: [{ ref: charRef("a"), name: "Aria" }],
      groupCharacterId: null,
      castName: "Aria",
    });
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe("user");
    expect(outcome.messages).toHaveLength(0);
  });

  test("mid-round multi-speaker: speaker 1 commits, speaker 2 aborts → round carries BOTH the committed row AND aborted:true", async () => {
    let calls = 0;
    const committedView = { id: castId<MessageId>("message_1") } as unknown as MessageView;
    const fakeEngine: TurnEngine = {
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
      castName: "Aria, Bran",
    });
    // The whole truth: the row that landed before the abort rides along, AND the round reports aborted.
    expect(outcome.messages).toEqual([committedView]);
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe("user");
    // The loop STOPPED at speaker 2 — speaker 3 (had there been one) never runs; here calls stop at 2.
    expect(calls).toBe(2);
  });

  test("the stale (lock-loss) reason propagates through the round just as `user` does", async () => {
    const fakeEngine: TurnEngine = {
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
      castName: "Aria, Bran",
    });
    expect(outcome.aborted).toBe(true);
    expect(outcome.abortReason).toBe("stale");
    expect(outcome.messages).toEqual([abortedView]);
  });
});
