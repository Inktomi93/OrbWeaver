// service — the chat domain COMPOSITION ROOT (`createChatService`). Proves the assembly: the factory returns
// ONE object exposing every `ChatService` verb (spot-checked across all groups), and the internally-built
// engine + `loadParticipantViews` are wired (a real `simpleSend` smoke runs a scripted turn end-to-end against
// a real libSQL db, and the returned roster carries the host + the `getCard`-resolved character name).
// Determinism: frozen clock + seeded prng + no-op delay (D46) — no ambient clock / RNG.

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, ChatInviteId, Handle, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe, expect, test } from "vitest";
import type { ChatService } from "../../../../packages/server/src/domain/chat";
import { createActiveTurns } from "../../../../packages/server/src/domain/chat/active-turns";
import type {
  ChatContext,
  ChatServiceDeps,
} from "../../../../packages/server/src/domain/chat/contract/context";
import type { TurnStreamChunk } from "../../../../packages/server/src/domain/chat/contract/results";
import { createChatService } from "../../../../packages/server/src/domain/chat/service";
import { freshDb } from "../../../support/db";
import { makeChatContext, seedCharacter, seedChat, seedParticipant, seedUser } from "./_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

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

/** A scripted role turn — a text delta + the terminal `final` carrying content/economics. */
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

/** Build the full service over a real db + the same fakes the verb int-tests use. `events` captures the bus. */
function makeService(names: Readonly<Record<string, string>>): {
  service: ChatService;
  events: ChatBusEvent[];
} {
  const events: ChatBusEvent[] = [];
  let inviteCounter = 0;
  const ctx = makeChatContext(db, {
    runChatTurn: scripted("Hi there"),
    applyStatsDelta: (_b: unknown, _d: Db, _delta: StatsDelta): void => undefined,
    getCard: ({ characterId }) => Promise.resolve(card(names[characterId] ?? "Unknown")),
    mintSyntheticGroupCharacter: () =>
      Promise.resolve({ characterId: castId<CharacterId>("character_group") }),
  });
  const deps: ChatServiceDeps = {
    emit: (event) => {
      events.push(event);
      return Promise.resolve();
    },
    activeTurns: createActiveTurns(),
    prng: seededPrng(),
    delay: () => Promise.resolve(),
    resolveConnection: () => Promise.resolve(connectionOf()),
    resolveForeignInputs: () =>
      Promise.resolve({
        promptConfig: DEFAULT_PROMPT_CONFIG,
        personas: { anchor: null, active: null },
        globalRegexScripts: [],
        scanDepth: 6,
        injectionTokenBudget: 0,
      }),
    hashToken: (token) => `hash:${token}`,
    newInviteId: () => {
      inviteCounter += 1;
      return castId<ChatInviteId>(`chat_invite_${inviteCounter}`);
    },
    debitBudget: () => Promise.resolve(),
    resolveTurnPolicy: () => Promise.resolve({ budget: null, allowNonOwnerMaxProSub: false }),
    holder: "replica-test",
    lockTtlMs: 60_000,
  };
  return { service: createChatService(ctx, deps), events };
}

/** Seed a solo room (host + one character) with `per-speaker`/`natural` group config. */
async function seedRoom(): Promise<{
  host: UserId;
  chatId: ChatId;
  names: Record<string, string>;
}> {
  const host = await seedUser(db, "host");
  const chatId = await seedChat(db, "a", {
    metadata: { group: { output: "per-speaker", policy: "natural" } },
  });
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  const cid = await seedCharacter(db, host, "aria");
  await seedParticipant(db, { chatId, key: "aria", characterId: cid, joinSeq: 0 });
  return { host, chatId, names: { [cid]: "aria" } };
}

describe("createChatService — assembly", () => {
  // One representative verb per `ChatService` group — proves the spread covers every bundle.
  const spotCheck = [
    "startChat",
    "listChats",
    "getChat",
    "send",
    "swipe",
    "simpleSend",
    "compact",
    "editMessage",
    "forkChat",
    "setChatInjection",
    "getVariables",
    "delete",
    "setGroupConfig",
    "createInvite",
    "redeemInvite",
    "kick",
    "acceptHostHandoff",
  ] as const satisfies readonly (keyof ChatService)[];

  test("exposes every verb across all groups as a function", () => {
    const { service } = makeService({});
    for (const verb of spotCheck) {
      expect(typeof service[verb]).toBe("function");
    }
  });

  test("a simpleSend smoke runs the engine end-to-end + commits the canon", async () => {
    const { host, chatId, names } = await seedRoom();
    const { service, events } = makeService(names);

    const outcome = await service.simpleSend({
      principal: principal(host),
      chatId,
      content: "yo",
    });

    // The user row + the scripted assistant turn both committed (proves the engine is wired in).
    expect(outcome.messages.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === "turnStarted")).toBe(true);
    expect(events.some((e) => e.type === "turnCompleted")).toBe(true);
  });

  test("loadParticipantViews resolves the host + the getCard-backed character name", async () => {
    const { host, chatId, names } = await seedRoom();
    const { service } = makeService(names);

    const roster = await service.listParticipants({ principal: principal(host), chatId });

    const hostRow = roster.find((p) => p.userId === host);
    const charRow = roster.find((p) => p.characterId !== null);
    expect(hostRow?.role).toBe("host");
    expect(charRow?.displayName).toBe("aria"); // resolved via ctx.getCard
  });
});
