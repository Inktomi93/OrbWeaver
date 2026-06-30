// verbs/turn — the turn-running front doors (.int: real libSQL for the lock + the D26 canon persist + a REAL
// engine via `createTurnEngine`). Proves the wiring: identity triple → connection → ONE assemble ctx →
// arbitrate → driveRound; the group round (N speakers), @mention force, auto-mode chaining, simpleSend's solo
// path, host-only force, abort's owner-only refusal, and the `can()` default-deny. Determinism: frozen clock,
// seeded prng, no-op delay (D46) — no ambient clock / RNG.

import type { CharacterCard } from "@orb/contracts/character";
import type { AssemblePersona, ChatBusEvent } from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, Handle, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe, expect, test } from "vitest";
import { createActiveTurns } from "../../../../../packages/server/src/domain/chat/active-turns";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/contract/context";
import { ChatNotFoundError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import type { TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine";
import { tryAcquireLock } from "../../../../../packages/server/src/domain/chat/persistence/lock";
import { loadCanonHistory } from "../../../../../packages/server/src/domain/chat/persistence/queries";
import { createTurn } from "../../../../../packages/server/src/domain/chat/verbs/turn";
import { freshDb } from "../../../../support/db";
import {
  FROZEN_AT,
  makeChatContext,
  seedCharacter,
  seedChat,
  seedMessage,
  seedParticipant,
  seedUser,
} from "../_support";

const CAPABILITY = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  output: { maxTokens: { min: 1, max: 8192 } },
  context: { window: 200_000 },
} as unknown as ModelCapability;

function connectionOf(source = "vllm"): ResolvedConnection {
  return {
    api: "chat-completions",
    model: castId<ModelId>("test-model"),
    credential: { source, credentialId: null } as unknown as ResolvedCredential,
    capability: CAPABILITY,
  };
}

const card = (name: string): CharacterCard =>
  ({ name, description: "", avatarAssetId: null, regexScripts: [] }) as unknown as CharacterCard;

function principal(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>("h"), externalId: null, via: "cookie" };
}

/** A scripted role turn — text delta + a terminal `final` carrying the content/economics. */
function scripted(content: string): ChatContext["runChatTurn"] {
  return () =>
    (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      yield { kind: "text", text: content };
      yield {
        kind: "final",
        economics: { content, tokensIn: 4, tokensOut: 2, model: "test-model" },
      };
    })();
}

/** A deterministic PRNG (Park-Miller LCG) — D46 (never `Math.random`). */
function seededPrng(seed = 1): () => number {
  let s = seed;
  return (): number => {
    s = (s * 16_807) % 2_147_483_647;
    return s / 2_147_483_647;
  };
}

const PERSONAS: { anchor: AssemblePersona | null; active: AssemblePersona | null } = {
  anchor: { name: "Nate", description: "the user" },
  active: { name: "Nate", description: "the user" },
};

interface Harness {
  ctx: ChatContext;
  events: ChatBusEvent[];
  deltas: StatsDelta[];
  turn: ReturnType<typeof createTurn>;
  activeTurns: ReturnType<typeof createActiveTurns>;
}

function harness(
  database: Db,
  names: Readonly<Record<string, string>>,
  over: {
    content?: string;
    groupCharacterId?: CharacterId;
    hostTierRegexScripts?: RegexScript[];
  } = {},
): Harness {
  const events: ChatBusEvent[] = [];
  const deltas: StatsDelta[] = [];
  const ctx = makeChatContext(database, {
    runChatTurn: scripted(over.content ?? "Hi there"),
    applyStatsDelta: (_b: unknown, _d: Db, delta: StatsDelta): void => {
      deltas.push(delta);
    },
    getCard: ({ characterId }) => Promise.resolve(card(names[characterId] ?? "Unknown")),
    mintSyntheticGroupCharacter: () =>
      Promise.resolve({
        characterId: over.groupCharacterId ?? castId<CharacterId>("character_group"),
      }),
  });
  const emit = (event: ChatBusEvent): Promise<void> => {
    events.push(event);
    return Promise.resolve();
  };
  const engine = createTurnEngine(ctx, {
    emit,
    debitBudget: () => Promise.resolve(),
    resolveTurnPolicy: () => Promise.resolve({ budget: null, allowNonOwnerMaxProSub: false }),
    holder: "replica-1",
    lockTtlMs: 60_000,
  });
  const activeTurns = createActiveTurns();
  const turn = createTurn(ctx, {
    engine,
    activeTurns,
    emit,
    prng: seededPrng(),
    delay: () => Promise.resolve(),
    resolveConnection: () => Promise.resolve(connectionOf()),
    resolveForeignInputs: () =>
      Promise.resolve({
        promptConfig: DEFAULT_PROMPT_CONFIG,
        personas: PERSONAS,
        globalRegexScripts: over.hostTierRegexScripts ?? [],
        scanDepth: 6,
        injectionTokenBudget: 0,
      }),
  });
  return { ctx, events, deltas, turn, activeTurns };
}

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

/** Seed a host + a `policy` group chat with N characters; returns the ids. */
async function seedRoom(
  policy: string,
  charKeys: readonly string[],
  opts: { output?: string; autoMode?: boolean; autoModeMaxTurns?: number } = {},
): Promise<{ host: UserId; chatId: ChatId; chars: CharacterId[]; names: Record<string, string> }> {
  const host = await seedUser(db, "host");
  const group: Record<string, unknown> = {
    output: opts.output ?? "per-speaker",
    policy,
    ...(opts.autoMode === true
      ? { autoMode: true, autoModeMaxTurns: opts.autoModeMaxTurns ?? 2, autoModeDelayMs: 0 }
      : {}),
  };
  const chatId = await seedChat(db, "a", { metadata: { group } });
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  const chars: CharacterId[] = [];
  const names: Record<string, string> = {};
  for (const k of charKeys) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential fixture seeding — deterministic ids + join order.
    const cid = await seedCharacter(db, host, k);
    await seedParticipant(db, { chatId, key: k, characterId: cid, joinSeq: 0 });
    chars.push(cid);
    names[cid] = k;
  }
  return { host, chatId, chars, names };
}

describe("send — the solo path (roster-of-1)", () => {
  test("commits the user row + the assistant turn; emits the lifecycle", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "hello" });

    expect(outcome.aborted).toBe(false);
    expect(outcome.messages).toHaveLength(2);
    expect(outcome.messages[0]?.role).toBe("user");
    expect(outcome.messages[0]?.content).toBe("hello");
    expect(outcome.messages[0]?.authorUserId).toBe(host);
    expect(outcome.messages[1]?.role).toBe("assistant");
    expect(outcome.messages[1]?.content).toBe("Hi there");

    const canon = await loadCanonHistory(db, chatId);
    expect(canon.map((m) => m.seq)).toEqual([1, 2]);
    expect(canon.map((m) => m.role)).toEqual(["user", "assistant"]);
    const types = h.events.map((e) => e.type);
    expect(types).toContain("messageCommitted");
    expect(types).toContain("turnStarted");
    expect(types).toContain("turnCompleted");
  });
});

describe("send — the group round (N speakers via driveRound)", () => {
  test("a list-policy 2-character room commits one assistant per speaker, in order", async () => {
    const { host, chatId, chars, names } = await seedRoom("list", ["aria", "bryn"]);
    const h = harness(db, names);

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "hi all" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(2);
    expect(assistants.map((m) => m.characterId)).toEqual(chars);
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.map((m) => m.seq)).toEqual([1, 2, 3]);
  });

  test("a human @mention hard-overrides the policy to the named character only", async () => {
    const { host, chatId, chars, names } = await seedRoom("list", ["aria", "bryn"]);
    const h = harness(db, names);

    const outcome = await h.turn.send({
      principal: principal(host),
      chatId,
      content: "@bryn hello",
    });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.characterId).toBe(chars[1]);
  });
});

describe("send — narrator output (group character authors the turn)", () => {
  test("a narrator round commits one assistant authored by the synthetic group character", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria", "bryn"], {
      output: "narrator",
    });
    // The synthetic group character is a REAL `characters` row (the `messages.characterId` FK; §10).
    const groupCharacterId = await seedCharacter(db, host, "group");
    const h = harness(db, names, { groupCharacterId });

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "narrate" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]?.characterId).toBe(groupCharacterId);
  });
});

describe("send — auto-mode AI→AI chain", () => {
  test("autoMode chains additional turns past the human round (deterministic, ban-last)", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria", "bryn"], {
      autoMode: true,
      autoModeMaxTurns: 2,
    });
    const h = harness(db, names);

    await h.turn.send({ principal: principal(host), chatId, content: "go" });

    // human round (aria, bryn) + 2 chained turns = 4 assistant rows + the 1 user row.
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.filter((m) => m.role === "assistant")).toHaveLength(4);
    expect(canon).toHaveLength(5);
  });
});

describe("send — the D19 triple (run-as-host attribution)", () => {
  test("a member's send runs the AI as the host; the user row is authored by the member", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, "member");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const h = harness(db, names);

    const outcome = await h.turn.send({ principal: principal(member), chatId, content: "hi" });

    expect(outcome.messages[0]?.authorUserId).toBe(member); // the user row is the caller's
    expect(h.deltas).toHaveLength(1);
    expect(h.deltas[0]?.ownerId).toBe(host); // the AI economics are attributed to the host (runAsUserId)
  });

  test("a non-member is refused (leak-free NOT_FOUND — can() default-deny)", async () => {
    const { chatId, names } = await seedRoom("natural", ["aria"]);
    const stranger = await seedUser(db, "stranger");
    const h = harness(db, names);

    await expect(
      h.turn.send({ principal: principal(stranger), chatId, content: "hi" }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);
  });
});

describe("simpleSend — the byte-identical solo path", () => {
  test("commits the user row + one assistant for the primary character", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    const outcome = await h.turn.simpleSend({ principal: principal(host), chatId, content: "yo" });

    expect(outcome.messages).toHaveLength(2);
    expect(outcome.messages[1]?.role).toBe("assistant");
    expect(outcome.messages[1]?.characterId).toBe(chars[0]);
  });
});

describe("forceCharacterTurn — host-only", () => {
  test("the host forces a specific character to speak (no user row)", async () => {
    const { host, chatId, chars, names } = await seedRoom("list", ["aria", "bryn"]);
    const h = harness(db, names);

    const outcome = await h.turn.forceCharacterTurn({
      principal: principal(host),
      chatId,
      characterId: chars[1] as CharacterId,
    });

    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.role).toBe("assistant");
    expect(outcome.messages[0]?.characterId).toBe(chars[1]);
  });

  test("a plain member is refused with not_host", async () => {
    const { chatId, chars, names } = await seedRoom("list", ["aria"]);
    const member = await seedUser(db, "member");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const h = harness(db, names);

    await expect(
      h.turn.forceCharacterTurn({
        principal: principal(member),
        chatId,
        characterId: chars[0] as CharacterId,
      }),
    ).rejects.toMatchObject({ code: "not_host" });
  });

  test("forcing a non-roster character is a leak-free NOT_FOUND", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria"]);
    const h = harness(db, names);

    await expect(
      h.turn.forceCharacterTurn({
        principal: principal(host),
        chatId,
        characterId: castId<CharacterId>("character_ghost"),
      }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);
  });
});

describe("abort — owner-only (rollback-theft defense)", () => {
  test("a caller aborting another user's in-flight turn is refused not_turn_owner", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, "member");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const h = harness(db, names);
    // A turn owned by the host is in flight.
    h.activeTurns.register(chatId, host);

    await expect(h.turn.abort({ principal: principal(member), chatId })).rejects.toMatchObject({
      code: "not_turn_owner",
    });
  });

  test("a caller aborts their OWN in-flight turn (signalled)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);
    const handle = h.activeTurns.register(chatId, host);

    await h.turn.abort({ principal: principal(host), chatId });

    expect(handle.signal.aborted).toBe(true);
    expect(h.activeTurns.countActive(chatId)).toBe(0);
  });

  test("abort with nothing in flight is a no-op", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);
    await expect(h.turn.abort({ principal: principal(host), chatId })).resolves.toBeUndefined();
  });
});

describe("swipe — append-variant on an existing assistant slot (D26)", () => {
  test("appends a variant + advances the selection; slot attribution unchanged", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hi" });
    const { messageId } = await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: chars[0] as CharacterId,
      content: "first take",
    });
    const h = harness(db, names);

    const outcome = await h.turn.swipe({ principal: principal(host), chatId, messageId });

    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.id).toBe(messageId);
    expect(outcome.messages[0]?.variantCount).toBe(2);
    expect(outcome.messages[0]?.selectedVariantIdx).toBe(1);
    expect(outcome.messages[0]?.content).toBe("Hi there");
    expect(outcome.messages[0]?.characterId).toBe(chars[0]);
    // No new slot — the canon length is unchanged.
    expect(await loadCanonHistory(db, chatId)).toHaveLength(2);
  });

  test("swiping a non-assistant slot is a leak-free NOT_FOUND", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "user",
      authorUserId: host,
      content: "hi",
    });
    const h = harness(db, names);
    await expect(
      h.turn.swipe({ principal: principal(host), chatId, messageId }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);
  });
});

describe("continueTurn / undoContinue / revertContinue — extend in place (D26)", () => {
  test("continue extends; undo restores the pre-continue state; revert re-applies it", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hi" });
    const { messageId } = await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: chars[0] as CharacterId,
      content: "Once upon a time",
    });
    const h = harness(db, names);

    const cont = await h.turn.continueTurn({ principal: principal(host), chatId, messageId });
    expect(cont.messages[0]?.content).toBe("Once upon a timeHi there");

    const undone = await h.turn.undoContinue({ principal: principal(host), chatId, messageId });
    expect(undone.content).toBe("Once upon a time");

    const reverted = await h.turn.revertContinue({ principal: principal(host), chatId, messageId });
    expect(reverted.content).toBe("Once upon a timeHi there");
  });

  test("undoContinue on a never-continued variant is refused no_continuation", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    const { messageId } = await seedMessage(db, chatId, 1, {
      role: "assistant",
      characterId: chars[0] as CharacterId,
      content: "plain",
    });
    const h = harness(db, names);
    await expect(
      h.turn.undoContinue({ principal: principal(host), chatId, messageId }),
    ).rejects.toMatchObject({ code: "no_continuation" });
  });
});

describe("impersonate — a model-generated role:user slot (D26)", () => {
  test("commits a human-voiced user message authored by the caller", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    const outcome = await h.turn.impersonate({ principal: principal(host), chatId });

    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.role).toBe("user");
    expect(outcome.messages[0]?.authorUserId).toBe(host);
    expect(outcome.messages[0]?.characterId).toBeNull();
    expect(outcome.messages[0]?.content).toBe("Hi there");
  });
});

describe("generate — LOCK-FREE (runs concurrent with a held send lock)", () => {
  test("commits while a foreign lock is held; a locked send is refused on the same chat", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);
    // A concurrent (foreign) turn holds the per-chat lock.
    await tryAcquireLock(db, {
      chatId,
      holder: "other-replica",
      now: FROZEN_AT,
      expiresAt: FROZEN_AT + 60_000,
    });

    // A locked path (simpleSend → the engine acquires the lock) is refused…
    await expect(
      h.turn.simpleSend({ principal: principal(host), chatId, content: "blocked" }),
    ).rejects.toMatchObject({ code: "locked" });

    // …but the lock-free generate commits concurrently.
    const outcome = await h.turn.generate({ principal: principal(host), chatId });
    expect(outcome.messages).toHaveLength(1);
    expect(outcome.messages[0]?.role).toBe("assistant");
    expect(outcome.messages[0]?.characterId).toBe(chars[0]);
  });
});

describe("send — SEND USER_INPUT regex (D53; chat.md §2/§7)", () => {
  test("the persisted user row is the POST-USER_INPUT-regex text (canon-mutating at write)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const script = regexScriptSchema.parse({
      id: "u",
      name: "u",
      findRegex: "badword",
      replaceString: "****",
      placement: ["USER_INPUT"],
    });
    const h = harness(db, names, { hostTierRegexScripts: [script] });

    const outcome = await h.turn.send({
      principal: principal(host),
      chatId,
      content: "this is a badword here",
    });

    // The user row returned by the verb is the transformed text…
    expect(outcome.messages[0]?.role).toBe("user");
    expect(outcome.messages[0]?.content).toBe("this is a **** here");
    // …and the PERSISTED canon row reflects it (re-loaded from the db — the stored row is post-regex).
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.find((m) => m.role === "user")?.content).toBe("this is a **** here");
  });

  test("no host-tier scripts → the row is the RAW composer text (member has no entry point — D19)", async () => {
    // The verb's ONLY regex source is the host-tier union the gather computes under `runAsUserId`.
    // A non-host member's scripts have no parameter on that surface (structural — see regex-tier.test.ts), so
    // with none supplied the composer text is persisted verbatim.
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    const outcome = await h.turn.send({
      principal: principal(host),
      chatId,
      content: "raw badword text",
    });
    expect(outcome.messages[0]?.content).toBe("raw badword text");
  });
});
