// engine/round — the GROUP ROUND DRIVER (chat.md Part III §6/§7). .int: the REAL chunk-9 engine + libSQL, so
// the per-speaker lock + the D26 canon persist are exercised. Pins: ONE immutable ctx → N speakers shaped +
// run (each committing its own row, characterId = the resolved speaker); the PER-SPEAKER lock (3 sequential
// turns all commit — a whole-round lock would have blocked speaker 2 → proves the doc's per-speaker model);
// canon advances between speakers (speaker k+1 witnesses k's row); the two-axis nudge per speaker; the
// narrator round (ONE turn authored by the group character); and the locked-yield (a fake engine).

import type { AssembleContext, ChatBusEvent, GroupConfig, MessageView } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, MessageId, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe, expect, test } from "vitest";
import type { CastName } from "../../../../../packages/server/src/domain/chat/contract/arbitration";
import {
  CHAT_OP_CODES,
  ChatOperationError,
} from "../../../../../packages/server/src/domain/chat/contract/errors";
import type {
  TurnEngine,
  TurnOutcome,
  TurnPrep,
  TurnRequest,
  TurnStreamChunk,
} from "../../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine";
import { driveRound } from "../../../../../packages/server/src/domain/chat/engine/round";
import { loadCanonHistory } from "../../../../../packages/server/src/domain/chat/persistence/queries";
import { freshDb } from "../../../../support/db";
import { makeChatContext, seedCharacter, seedChat, seedUser } from "../_support";

const HOST = castId<UserId>("user_host");
const cid = (k: string): CharacterId => castId<CharacterId>(`character_${k}`);

const CAPABILITY = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  output: { maxTokens: { min: 1, max: 8192 } },
  context: { window: 200_000 },
} as unknown as ModelCapability;

function connection(): ResolvedConnection {
  return {
    api: "chat-completions",
    model: castId<ModelId>("test-model"),
    credential: { source: "vllm", credentialId: null } as unknown as ResolvedCredential,
    capability: CAPABILITY,
  };
}

const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Nate", description: "the user" },
  recentMessages: [],
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

/** A scripted role turn echoing `text` (the captured request is appended to `sink`). */
function scriptedRole(sink: TurnRequest[]): ReturnType<typeof makeChatContext>["runChatTurn"] {
  return (req: TurnRequest) => {
    sink.push(req);
    return (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      yield { kind: "text", text: "reply" };
      yield { kind: "final", economics: { content: "reply", tokensIn: 2, tokensOut: 1 } };
    })();
  };
}

function realEngine(database: Db, requests: TurnRequest[]): TurnEngine {
  const ctx = makeChatContext(database, {
    runChatTurn: scriptedRole(requests),
    applyStatsDelta: (): void => undefined,
  });
  return createTurnEngine(ctx, {
    emit: (_e: ChatBusEvent): Promise<void> => Promise.resolve(),
    debitBudget: (): Promise<void> => Promise.resolve(),
    resolveTurnPolicy: () => Promise.resolve({ budget: null, allowNonOwnerMaxProSub: false }),
    holder: "replica-1",
    lockTtlMs: 60_000,
  });
}

function base(chatId: ChatId): Omit<TurnPrep, "speakerCharacterId" | "groupNudge" | "shape"> {
  return {
    chatId,
    assembleContext: ASSEMBLE_CTX,
    connection: connection(),
    triggeredBy: HOST,
    runAsUserId: HOST,
    kind: "auto",
    intent: {},
  };
}

/** Flatten a wire history's text content (for the nudge assertion). */
function historyText(req: TurnRequest): string {
  return req.history
    .flatMap((m) => m.content.map((p) => (p.type === "text" ? p.text : "")))
    .join("\n");
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
      { characterId: cid("a"), name: "Aria" },
      { characterId: cid("b"), name: "Bran" },
      { characterId: cid("c"), name: "Cara" },
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

  test("ONE immutable ctx: every speaker's request shares the same built system block", async () => {
    const chatId = await seedChat(db, "ctx");
    const requests: TurnRequest[] = [];
    await driveRound({
      engine: realEngine(db, requests),
      base: base(chatId),
      group: PER_SPEAKER,
      speakers: [
        { characterId: cid("a"), name: "Aria" },
        { characterId: cid("b"), name: "Bran" },
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
        { characterId: cid("a"), name: "Aria" },
        { characterId: cid("b"), name: "Bran" },
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
        { characterId: cid("a"), name: "Aria" },
        { characterId: cid("b"), name: "Bran" },
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
    const speakers: CastName[] = [{ characterId: cid("a"), name: "Aria" }];
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
        { characterId: cid("a"), name: "Aria" },
        { characterId: cid("b"), name: "Bran" },
      ],
      groupCharacterId: null,
      castName: "Aria, Bran",
    });
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.aborted).toBe(false);
    expect(calls).toBe(2);
  });
});
