// verbs/turn — the turn-running front doors (.int: real libSQL for the lock + the D26 canon persist + a REAL
// engine via `createTurnEngine`). Proves the wiring: identity triple → connection → ONE assemble ctx →
// arbitrate → driveRound; the group round (N speakers), @mention force, auto-mode chaining, send's solo
// (roster-of-1) path, host-only force, abort's owner-only refusal, and the `can()` default-deny. Determinism:
// frozen clock, seeded prng, no-op delay (D46) — no ambient clock / RNG.

import type { CharacterCard } from "@orb/contracts/character";
import type { AssemblePersona, ChatBusEvent } from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { personas } from "@orb/db";
import type {
  CharacterId,
  ChatId,
  Handle,
  MessageId,
  ModelId,
  PersonaId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { resolveRowMacros } from "@orb/kit/macro";
import { beforeEach, describe } from "vitest";
import { createActiveTurns } from "../../../../../packages/server/src/domain/chat/active-turns";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/contract/context";
import { ChatNotFoundError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import type { TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine";
import { tryAcquireLock } from "../../../../../packages/server/src/domain/chat/persistence/lock";
import {
  loadCanonHistory,
  loadMaxMessageSeq,
} from "../../../../../packages/server/src/domain/chat/persistence/queries";
import { createTurn } from "../../../../../packages/server/src/domain/chat/verbs/turn";
import { freshDb } from "../../../../support/db";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures";
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
  return makePrincipal(userId, { handle: castId<Handle>("h") });
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

// A frozen {{roll:d20}} bakes to a literal number; the identity {{user}} stays raw (per-view at read).
const FROZEN_ROLL_RE = /^I roll (\d+) and \{\{user\}\} smiles$/;
// A frozen {{time}} bakes to the send-time clock (HH:mm:ss); server-local zone, so assert the SHAPE.
const FROZEN_TIME_RE = /^the time is \d{2}:\d{2}:\d{2}$/;

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
    /** Capture each wire `TurnRequest` (the guided-routing pins inspect the assembled prompt). */
    onChatRequest?: (request: unknown) => void;
    /** Override the resolved `PromptConfig` (the F1 injection_trigger pin drives trigger-gated sections). */
    promptConfig?: PromptConfig;
    /** Capture the `personaIds` `loadRoom` resolved for the round (the PD-70 presence-gating pin). */
    onForeignInputs?: (args: { readonly personaIds: readonly PersonaId[] }) => void;
    /** Override server-derived presence (default = everyone online; a cast-gating test marks a member away). */
    readPresence?: ChatContext["readPresence"];
  } = {},
): Harness {
  const events: ChatBusEvent[] = [];
  const deltas: StatsDelta[] = [];
  const ctx = makeChatContext(database, {
    runChatTurn: (request) => {
      over.onChatRequest?.(request);
      return scripted(over.content ?? "Hi there")(request);
    },
    applyStatsDelta: (_b: unknown, _d: Db, delta: StatsDelta): void => {
      deltas.push(delta);
    },
    getCard: ({ characterId }) => Promise.resolve(card(names[characterId] ?? "Unknown")),
    mintSyntheticGroupCharacter: () =>
      Promise.resolve({
        characterId: over.groupCharacterId ?? castId<CharacterId>("character_group"),
      }),
    ...(over.readPresence !== undefined ? { readPresence: over.readPresence } : {}),
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
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
  });
  const activeTurns = createActiveTurns();
  const turn = createTurn(ctx, {
    engine,
    activeTurns,
    emit,
    prng: seededPrng(),
    delay: () => Promise.resolve(),
    resolveConnection: () => Promise.resolve(connectionOf()),
    resolveForeignInputs: (args) => {
      over.onForeignInputs?.(args);
      return Promise.resolve({
        promptConfig: over.promptConfig ?? DEFAULT_PROMPT_CONFIG,
        personas: PERSONAS,
        globalRegexScripts: over.hostTierRegexScripts ?? [],
        scanDepth: 6,
        injectionTokenBudget: 0,
      });
    },
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
  opts: {
    output?: string;
    autoMode?: boolean;
    autoModeMaxTurns?: number;
    /** Character keys seeded MUTED (`disabled: true`) — #29's force-turn-on-muted pin. */
    disabledKeys?: readonly string[];
  } = {},
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
    await seedParticipant(db, {
      chatId,
      key: k,
      characterId: cid,
      joinSeq: 0,
      disabled: opts.disabledKeys?.includes(k) ?? false,
    });
    chars.push(cid);
    names[cid] = k;
  }
  return { host, chatId, chars, names };
}

/** Seed a persona row (the `chat_participants.activePersonaId` FK target). */
async function seedPersona(ownerId: UserId, key: string): Promise<PersonaId> {
  const id = castId<PersonaId>(`persona_${key}`);
  await db.insert(personas).values({ id, ownerId, name: key, description: "" });
  return id;
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

describe("send — volatile-macro FREEZE at commit (Chat-Macro-Resolution §0 / the D51 refinement)", () => {
  test("a user message freezes {{roll}} to a baked value while {{user}} stays raw (per-view)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    await h.turn.send({
      principal: principal(host),
      chatId,
      content: "I roll {{roll:d20}} and {{user}} smiles",
    });

    const canon = await loadCanonHistory(db, chatId);
    const stored = canon.find((r) => r.role === "user")?.content ?? "";
    // The nondeterministic {{roll}} is FROZEN to a literal number in canon; the identity {{user}} stays RAW.
    const matched = stored.match(FROZEN_ROLL_RE);
    expect(matched).not.toBeNull();
    expect(stored).toContain("{{user}}");
    expect(stored).not.toContain("{{roll");

    // Re-rendering the stored row on a later turn is byte-stable on the roll AND resolves {{user}} LIVE at
    // read (identity is not baked): the null-stamp fallback is the chat ANCHOR (ruling A — viewer-independent,
    // so the SAME string for the model and every human), and changing the anchor changes the name while the
    // frozen roll is untouched.
    const frozenRoll = matched?.[1];
    const view = (anchorName: string): string =>
      resolveRowMacros(
        stored,
        { characterId: null, personaId: null },
        {
          characterNamesById: new Map<CharacterId, RowCharacterName>(),
          personaNamesById: new Map<PersonaId, RowPersonaName>(),
          fallbackPersonaName: anchorName,
        },
      );
    expect(view("Zara")).toBe(`I roll ${frozenRoll} and Zara smiles`);
    expect(view("Yuki")).toBe(`I roll ${frozenRoll} and Yuki smiles`);
  });

  test("{{time}} freezes to the send-time clock value, not the raw macro", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    await h.turn.send({ principal: principal(host), chatId, content: "the time is {{time}}" });

    const stored =
      (await loadCanonHistory(db, chatId)).find((r) => r.role === "user")?.content ?? "";
    expect(stored).toMatch(FROZEN_TIME_RE);
    expect(stored).not.toContain("{{time}}");
  });

  test("a composer message with NO volatile macros is stored byte-identical (identity/author content untouched)", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);
    const raw = "just {{user}} talking to {{char}}, no dice";

    await h.turn.send({ principal: principal(host), chatId, content: raw });

    expect((await loadCanonHistory(db, chatId)).find((m) => m.role === "user")?.content).toBe(raw);
  });
});

describe("send — user-row seq collision retry (U1: the seq TOCTOU is allocated outside the engine lock)", () => {
  test("a raced (chatId,seq) UNIQUE on the user insert re-derives the head and retries — nothing lost", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);

    // Simulate a concurrent same-chat send winning the head between THIS send's `loadMaxMessageSeq` and its
    // insert: on the FIRST `db.batch` (the user-row 3-step dance), a competing writer lands a row at the seq
    // this attempt was about to claim, then the batch fails the `(chatId,seq)` UNIQUE. persistUserMessage must
    // catch the unique violation, re-read the now-higher head, and re-commit — no lost message, no 500.
    let tripped = false;
    const racedDb = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === "batch") {
          return async (stmts: unknown) => {
            if (!tripped) {
              tripped = true;
              const claimed = (await loadMaxMessageSeq(db, chatId)) + 1;
              await seedMessage(db, chatId, claimed, {
                role: "user",
                authorUserId: host,
                content: "racer",
              });
              throw new Error("SQLITE_CONSTRAINT: UNIQUE constraint failed: messages.chat_id, seq");
            }
            return (target as Db).batch(stmts as never);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Db;

    const h = harness(racedDb, names);
    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "hello" });

    expect(tripped).toBe(true); // the retry path actually fired
    const canon = await loadCanonHistory(db, chatId);
    // The racer took seq 1; this send's user row retried onto seq 2, the assistant onto seq 3 — none dropped.
    expect(canon.map((m) => m.content)).toEqual(["racer", "hello", "Hi there"]);
    expect(canon.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(outcome.messages[0]?.content).toBe("hello");
    expect(outcome.messages[0]?.seq).toBe(2);
  });
});

describe("send — presence cast-gating (PD-70)", () => {
  /** Seed a host + an away member (each with a persona) + one character; return the ids + persona ids. */
  async function seedTwoHumanRoom(): Promise<{
    host: UserId;
    member: UserId;
    chatId: ChatId;
    hostPersona: PersonaId;
    memberPersona: PersonaId;
    names: Record<string, string>;
  }> {
    const host = await seedUser(db, "host");
    const member = await seedUser(db, "member");
    const hostPersona = await seedPersona(host, "host_pov");
    const memberPersona = await seedPersona(member, "member_pov");
    const chatId = await seedChat(db, "a", {
      metadata: { group: { output: "per-speaker", policy: "natural" } },
    });
    await seedParticipant(db, {
      chatId,
      key: "h",
      userId: host,
      role: "host",
      activePersonaId: hostPersona,
    });
    await seedParticipant(db, {
      chatId,
      key: "m",
      userId: member,
      role: "member",
      activePersonaId: memberPersona,
    });
    const cid = await seedCharacter(db, host, "aria");
    await seedParticipant(db, { chatId, key: "aria", characterId: cid, joinSeq: 0 });
    return { host, member, chatId, hostPersona, memberPersona, names: { [cid]: "aria" } };
  }

  test("an OFFLINE human's persona drops from the round; the host's (and cast) survive", async () => {
    const room = await seedTwoHumanRoom();
    const seen: (readonly PersonaId[])[] = [];
    const h = harness(db, room.names, {
      onForeignInputs: ({ personaIds }) => seen.push(personaIds),
      // The member is away (no live SSE); the host is driving the turn.
      readPresence: (userId) =>
        Promise.resolve({ userId, online: userId !== room.member, lastSeenAt: null }),
    });

    await h.turn.send({ principal: principal(room.host), chatId: room.chatId, content: "hi" });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain(room.hostPersona);
    expect(seen[0]).not.toContain(room.memberPersona);
  });

  test("when BOTH humans are online, both personas are present (no drop)", async () => {
    const room = await seedTwoHumanRoom();
    const seen: (readonly PersonaId[])[] = [];
    const h = harness(db, room.names, {
      onForeignInputs: ({ personaIds }) => seen.push(personaIds),
      readPresence: (userId) => Promise.resolve({ userId, online: true, lastSeenAt: null }),
    });

    await h.turn.send({ principal: principal(room.host), chatId: room.chatId, content: "hi" });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(expect.arrayContaining([room.hostPersona, room.memberPersona]));
  });
});

describe("send / impersonate — persona attribution fallback (PD-100)", () => {
  /** Seed a solo room whose host carries an ACTIVE persona (+ a spare persona for the explicit-wins arm). */
  async function seedPersonaRoom(): Promise<{
    host: UserId;
    chatId: ChatId;
    hostPersona: PersonaId;
    spare: PersonaId;
    names: Record<string, string>;
  }> {
    const host = await seedUser(db, "host");
    const hostPersona = await seedPersona(host, "host_pov");
    const spare = await seedPersona(host, "spare_pov");
    const chatId = await seedChat(db, "a", {
      metadata: { group: { output: "per-speaker", policy: "natural" } },
    });
    await seedParticipant(db, {
      chatId,
      key: "h",
      userId: host,
      role: "host",
      activePersonaId: hostPersona,
    });
    const cid = await seedCharacter(db, host, "aria");
    await seedParticipant(db, { chatId, key: "aria", characterId: cid, joinSeq: 0 });
    return { host, chatId, hostPersona, spare, names: { [cid]: "aria" } };
  }

  test("an OMITTED personaId stamps the participant's activePersonaId (send + impersonate)", async () => {
    const { host, chatId, hostPersona, names } = await seedPersonaRoom();
    const h = harness(db, names);

    const sent = await h.turn.send({ principal: principal(host), chatId, content: "hi" });
    expect(sent.messages[0]?.personaId).toBe(hostPersona);

    const imp = await h.turn.impersonate({ principal: principal(host), chatId });
    expect(imp.messages[0]?.role).toBe("user");
    expect(imp.messages[0]?.personaId).toBe(hostPersona);
  });

  test("an EXPLICIT personaId wins over the active persona; an explicit null stays null", async () => {
    const { host, chatId, spare, names } = await seedPersonaRoom();
    const h = harness(db, names);

    const explicit = await h.turn.send({
      principal: principal(host),
      chatId,
      content: "hi",
      personaId: spare,
    });
    expect(explicit.messages[0]?.personaId).toBe(spare);

    const nulled = await h.turn.send({
      principal: principal(host),
      chatId,
      content: "again",
      personaId: null,
    });
    expect(nulled.messages[0]?.personaId).toBeNull();
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
    // TWO deltas ride the send (stats.md canon-mutator push): the USER row's (owner-grain only —
    // characterId null) then the assistant turn's — BOTH attributed to the host (runAsUserId, D19).
    expect(h.deltas).toHaveLength(2);
    expect(h.deltas[0]?.userTurns).toBe(1);
    expect(h.deltas[0]?.characterId).toBeNull();
    expect(h.deltas.map((d) => d.ownerId)).toEqual([host, host]);
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

describe("send — a solo room drives exactly ONE speaker (PD-95: the deleted simpleSend was byte-identical)", () => {
  test("commits the user row + one assistant for the primary character", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "yo" });

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

  // #29 decision: force-turn ALLOWS a muted target. Mute (`disabled`) is passive arbitration exclusion
  // — it keeps a member out of `natural`/`smart` AUTO-selection — but a host CAN still explicitly summon
  // them. The two predicates are deliberately distinct: `isArbiterEligible` (present AND not muted) gates
  // auto-selection; forceCharacterTurn's target check is PRESENCE-only.
  test("a MUTED-but-present member is still force-summonable (drives a turn voiced by them)", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria", "bryn"], {
      disabledKeys: ["bryn"],
    });
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

  test("the SAME muted member is excluded from a `natural` auto-round (send picks only the enabled one)", async () => {
    // aria enabled, bryn muted → the eligible set is {aria}; a normal send never voices bryn (the
    // arbitration-exclusion half of the #29 decision — force-turn overrides, auto-selection does not).
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria", "bryn"], {
      disabledKeys: ["bryn"],
    });
    const h = harness(db, names);

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "hi all" });

    const assistants = outcome.messages.filter((m) => m.role === "assistant");
    expect(assistants.length).toBeGreaterThan(0);
    for (const m of assistants) {
      expect(m.characterId).toBe(chars[0]);
      expect(m.characterId).not.toBe(chars[1]);
    }
  });
});

describe("abort — owner-only (rollback-theft defense)", () => {
  test("a caller aborting another user's in-flight turn is refused not_turn_owner", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const member = await seedUser(db, "member");
    await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
    const h = harness(db, names);
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

describe("guided steer routing (chat.md §6, PD-63)", () => {
  test("send threads the guided steer into the assembled prompt (system-marker default; {{input}} spliced)", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, { onChatRequest: (r) => requests.push(r) });

    await h.turn.send({
      principal: principal(host),
      chatId,
      content: "hi",
      guided: { action: "response", input: "be dramatic" },
    });

    // The DEFAULT `response` template wraps the user's steering text; system placement renders it at the
    // {{guided_instruction}} marker — it must reach the wire request the engine dispatched.
    const wire = JSON.stringify(requests);
    expect(wire).toContain("special consideration");
    expect(wire).toContain("be dramatic");
  });

  test("an unsteered send carries NO guided template text", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, { onChatRequest: (r) => requests.push(r) });

    await h.turn.send({ principal: principal(host), chatId, content: "hi" });

    expect(JSON.stringify(requests)).not.toContain("special consideration");
  });

  test("impersonate's guided steer threads {{person}} (composer wand's 1st/2nd/3rd-person picker)", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, { onChatRequest: (r) => requests.push(r) });

    await h.turn.impersonate({
      principal: principal(host),
      chatId,
      guided: { action: "impersonate", input: "ask about the ruins", person: "third" },
    });

    // The default `impersonate` template carries a literal `{{person}}-person perspective` slot —
    // the wand's picked word must land there (never the kit resolver's "first" floor).
    const wire = JSON.stringify(requests);
    expect(wire).toContain("third-person perspective");
    expect(wire).toContain("ask about the ruins");
  });

  test("impersonate with NO person picked falls back to the kit resolver's 'first' default", async () => {
    const { host, chatId, names } = await seedRoom("list", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, { onChatRequest: (r) => requests.push(r) });

    await h.turn.impersonate({
      principal: principal(host),
      chatId,
      guided: { action: "impersonate", input: "ask about the ruins" },
    });

    expect(JSON.stringify(requests)).toContain("first-person perspective");
  });
});

// F1 (the ST `injection_trigger` gate, live-wired): the verb maps its `TurnKind` → the assemble ctx's
// `generationType` (turn.ts `GENERATION_TYPE_FOR_KIND`) so a trigger-gated preset section fires on the RIGHT
// turn kind. Before F1 every live turn hardcoded "normal", so `trigger:["continue"]` NEVER fired and
// `trigger:["normal"]` fired on swipe/continue too. These pins drive REAL turns end-to-end (production supplies
// the type — no hand-fed `generationType`) and read the wire the engine dispatched.
const NORMAL_MARK = "NORMAL-TRIGGER-SECTION";
const CONTINUE_MARK = "CONTINUE-TRIGGER-SECTION";
function triggerGatedConfig(): PromptConfig {
  const sections = [
    { type: "marker", id: "m1", name: "sys", marker: "main_prompt", role: "system", enabled: true },
    {
      type: "literal",
      id: "l-normal",
      name: "normal-only",
      role: "system",
      content: NORMAL_MARK,
      enabled: true,
      trigger: ["normal"],
    },
    {
      type: "literal",
      id: "l-continue",
      name: "continue-only",
      role: "system",
      content: CONTINUE_MARK,
      enabled: true,
      trigger: ["continue"],
    },
    {
      type: "marker",
      id: "m2",
      name: "hist",
      marker: "chat_history",
      role: "system",
      enabled: true,
    },
  ] satisfies PromptSection[];
  return {
    schemaVersion: 3,
    sections,
    params: {},
    regexScripts: [],
    variables: [],
  } satisfies PromptConfig;
}

describe("F1 — injection_trigger gate is wired per TurnKind (not hardcoded normal)", () => {
  test("send drives generationType 'normal' → the normal-gated section fires, the continue-gated one does not", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    const requests: unknown[] = [];
    const h = harness(db, names, {
      promptConfig: triggerGatedConfig(),
      onChatRequest: (r) => requests.push(r),
    });

    await h.turn.send({ principal: principal(host), chatId, content: "hi" });

    const wire = JSON.stringify(requests);
    expect(wire).toContain(NORMAL_MARK);
    expect(wire).not.toContain(CONTINUE_MARK);
  });

  test("swipe drives generationType 'swipe' → NEITHER the normal- nor the continue-gated section fires", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hi" });
    const { messageId } = await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: chars[0] as CharacterId,
      content: "first take",
    });
    const requests: unknown[] = [];
    const h = harness(db, names, {
      promptConfig: triggerGatedConfig(),
      onChatRequest: (r) => requests.push(r),
    });

    await h.turn.swipe({ principal: principal(host), chatId, messageId });

    const wire = JSON.stringify(requests);
    expect(wire).not.toContain(NORMAL_MARK);
    expect(wire).not.toContain(CONTINUE_MARK);
  });

  test("continue drives generationType 'continue' → the continue-gated section fires, the normal-gated one does not", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hi" });
    const { messageId } = await seedMessage(db, chatId, 2, {
      role: "assistant",
      characterId: chars[0] as CharacterId,
      content: "the tale so far",
    });
    const requests: unknown[] = [];
    const h = harness(db, names, {
      promptConfig: triggerGatedConfig(),
      onChatRequest: (r) => requests.push(r),
    });

    await h.turn.continueTurn({ principal: principal(host), chatId, messageId });

    const wire = JSON.stringify(requests);
    expect(wire).toContain(CONTINUE_MARK);
    expect(wire).not.toContain(NORMAL_MARK);
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
  test("commits while a foreign lock is held; a locked send yields its round on the same chat", async () => {
    const { host, chatId, chars, names } = await seedRoom("natural", ["aria"]);
    const h = harness(db, names);
    await tryAcquireLock(db, {
      chatId,
      holder: "other-replica",
      now: FROZEN_AT,
      expiresAt: FROZEN_AT + 60_000,
    });

    // A locked round path (send → the engine acquires the per-speaker lock) YIELDS the round (§6 — a
    // human send interleaved): the user row commits, the speaker turn is refused by the lock, driveRound
    // stops with what committed so far. (The deleted simpleSend hit the engine directly and REJECTED
    // `locked` — the round path's yield is the production behavior; PD-95.)
    const locked = await h.turn.send({ principal: principal(host), chatId, content: "blocked" });
    expect(locked.messages).toHaveLength(1);
    expect(locked.messages[0]?.role).toBe("user");

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

// ── Cross-chat IDOR (stickler F1): a message-targeting turn verb gates `requireParticipant(chatId)` but
// then loads + mutates the target by bare `messageId`. Before the fix, `loadSlotTarget`/`loadContinueSnapshot`
// queried `WHERE messages.id = ?` with NO chatId predicate, so a member of chat A passing `{chatId: A,
// messageId: <a message in chat B>}` could read + append to B's canon as a non-member. The loaders are now
// chat-scoped in-query, so a foreign message is indistinguishable from a nonexistent one and B stays untouched.
describe("cross-chat IDOR (F1) — swipe/continue/undo must be scoped to chatId", () => {
  /** Victim room B (alice hosts, one character, one assistant message M) + attacker room A (bob hosts). Bob is
   *  a PRESENT member of A [so `requireParticipant(A)` passes] and a NON-member of B. */
  async function seedTwoRooms(): Promise<{
    alice: UserId;
    bob: UserId;
    victimChat: ChatId;
    attackerChat: ChatId;
    victimMessageId: MessageId;
    names: Record<string, string>;
  }> {
    const alice = await seedUser(db, "alice");
    const bob = await seedUser(db, "bob");
    const victimChat = await seedChat(db, "victim", {
      metadata: { group: { output: "per-speaker", policy: "natural" } },
    });
    await seedParticipant(db, { chatId: victimChat, key: "va", userId: alice, role: "host" });
    const victimChar = await seedCharacter(db, alice, "vic");
    await seedParticipant(db, {
      chatId: victimChat,
      key: "vc",
      characterId: victimChar,
      joinSeq: 0,
    });
    await seedMessage(db, victimChat, 1, {
      role: "user",
      authorUserId: alice,
      content: "victim opening",
    });
    const { messageId: victimMessageId } = await seedMessage(db, victimChat, 2, {
      role: "assistant",
      characterId: victimChar,
      content: "victim canon",
    });
    const attackerChat = await seedChat(db, "attacker", {
      metadata: { group: { output: "per-speaker", policy: "natural" } },
    });
    await seedParticipant(db, { chatId: attackerChat, key: "ab", userId: bob, role: "host" });
    return {
      alice,
      bob,
      victimChat,
      attackerChat,
      victimMessageId,
      names: { [victimChar]: "vic" },
    };
  }

  /** A messageId that exists in NO chat — the nonexistent-message control (the response a foreign id must match). */
  const ghost = castId<MessageId>("message_ghost");

  test("swipe with a chat-B messageId is refused identically to a nonexistent id — B's canon untouched", async () => {
    const room = await seedTwoRooms();
    const h = harness(db, room.names);

    // Bob (host of A, non-member of B) targets B's assistant message via A → leak-free NOT_FOUND…
    await expect(
      h.turn.swipe({
        principal: principal(room.bob),
        chatId: room.attackerChat,
        messageId: room.victimMessageId,
      }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);
    // …indistinguishable from a genuinely nonexistent message in A.
    await expect(
      h.turn.swipe({
        principal: principal(room.bob),
        chatId: room.attackerChat,
        messageId: ghost,
      }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);

    // B's canon is unmutated: M still carries its single original variant (no appended swipe, no flip).
    const canonB = await loadCanonHistory(db, room.victimChat);
    const m = canonB.find((row) => row.id === room.victimMessageId);
    expect(m?.content).toBe("victim canon");
    expect(m?.variantCount).toBe(1);
  });

  test("continueTurn with a chat-B messageId is refused identically to a nonexistent id — B's canon untouched", async () => {
    const room = await seedTwoRooms();
    const h = harness(db, room.names);

    await expect(
      h.turn.continueTurn({
        principal: principal(room.bob),
        chatId: room.attackerChat,
        messageId: room.victimMessageId,
      }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(
      h.turn.continueTurn({
        principal: principal(room.bob),
        chatId: room.attackerChat,
        messageId: ghost,
      }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);

    const canonB = await loadCanonHistory(db, room.victimChat);
    expect(canonB.find((row) => row.id === room.victimMessageId)?.content).toBe("victim canon");
  });

  test("undoContinue with a chat-B messageId is refused no_continuation — B's real continuation stays intact", async () => {
    const room = await seedTwoRooms();
    const h = harness(db, room.names);

    // Alice legitimately continues M in B → writes the D26 snapshot columns + extends the content (so the
    // foreign undo below WOULD succeed against an unscoped loader — this is the real exploit precondition).
    const cont = await h.turn.continueTurn({
      principal: principal(room.alice),
      chatId: room.victimChat,
      messageId: room.victimMessageId,
    });
    expect(cont.messages[0]?.content).toBe("victim canonHi there");

    // Bob (member of A, non-member of B) tries to roll back B's continuation via A → no_continuation…
    await expect(
      h.turn.undoContinue({
        principal: principal(room.bob),
        chatId: room.attackerChat,
        messageId: room.victimMessageId,
      }),
    ).rejects.toMatchObject({ code: "no_continuation" });
    // …indistinguishable from a nonexistent message in A (both hit the empty-snapshot refusal).
    await expect(
      h.turn.undoContinue({
        principal: principal(room.bob),
        chatId: room.attackerChat,
        messageId: ghost,
      }),
    ).rejects.toMatchObject({ code: "no_continuation" });

    // B's continuation is intact: bob's undo did NOT restore the pre-continue content.
    const canonB = await loadCanonHistory(db, room.victimChat);
    expect(canonB.find((row) => row.id === room.victimMessageId)?.content).toBe(
      "victim canonHi there",
    );
  });
});

// TODO(#60): C5 (reattribution flips the stamp — a persona/character re-stamp re-resolves BOTH the
// macro subject and the attribution chrome from the SAME producer, content untouched) is out of scope
// here; it rides task #60 (persona reattribution, in flight separately per Chat-Macro-Resolution.md §5).

// ── Storage stays RAW (D51) — task #59 S5. Chat-Macro-Resolution.md §0: content stores literal
// `{{macros}}`; resolution happens ONLY at consumption (ASSEMBLE/DISPLAY), never at write. This is the
// real-DB pin: a full send/persist round-trip with `{{user}}`/`{{char}}` in BOTH the user's composer text
// and the model's reply must leave the committed canon row's `content` byte-identical to the raw macro
// text — never resolved to a name, even though the SAME turn's assemble ctx carries a real persona.
describe("storage stays RAW (D51) — macros in message content are never resolved at persist time", () => {
  test("the committed user AND assistant rows still hold the literal {{user}}/{{char}} tokens", async () => {
    const { host, chatId, names } = await seedRoom("natural", ["aria"]);
    // No host-tier regex rides this turn — the user text and the scripted reply both carry raw macros.
    const h = harness(db, names, { content: "{{char}} nods at {{user}}." });

    const outcome = await h.turn.send({
      principal: principal(host),
      chatId,
      content: "{{user}} waves at {{char}}.",
    });

    // The verb's OWN return value is unresolved…
    expect(outcome.messages[0]?.content).toBe("{{user}} waves at {{char}}.");
    expect(outcome.messages[1]?.content).toBe("{{char}} nods at {{user}}.");

    // …and a FRESH re-read of the persisted canon (real libSQL, not the in-memory return value) proves the
    // row was never mutated at write: the stored content is the SAME literal macro text.
    const canon = await loadCanonHistory(db, chatId);
    expect(canon.map((m) => m.content)).toEqual([
      "{{user}} waves at {{char}}.",
      "{{char}} nods at {{user}}.",
    ]);
  });
});
