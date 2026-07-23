// service — the chat domain COMPOSITION ROOT (`createChatService`). Proves the assembly: the factory returns
// ONE object exposing every `ChatService` verb (spot-checked across all groups), and the internally-built
// engine + `loadParticipantViews` are wired (a real solo `send` smoke runs a scripted turn end-to-end against
// a real libSQL db, and the returned roster carries the host + the `getCard`-resolved character name).
// Determinism: frozen clock + seeded prng + no-op delay (D46) — no ambient clock / RNG.

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { chatParticipants } from "@orb/db";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import type { ChatService } from "../../../../packages/server/src/domain/chat";
import { createActiveTurns } from "../../../../packages/server/src/domain/chat/active-turns";
import type { ChatContext, ChatServiceDeps } from "../../../../packages/server/src/domain/chat/context";
import type { TurnStreamChunk } from "../../../../packages/server/src/domain/chat/contract/results";
import { createChatService } from "../../../../packages/server/src/domain/chat/service";
import { freshDb } from "../../../support/db";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures";
import { FROZEN_AT, makeChatContext, seedAgent, seedCharacter, seedChat, seedParticipant, seedUser, testConnection } from "./_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

const card = (name: string): CharacterCard => ({ name, description: "", avatarAssetId: null, regexScripts: [] }) as unknown as CharacterCard;

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
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

/** Build the full service over a real db + the same fakes the verb int-tests use. `events` captures the bus.
 *  `ctxOverrides` layers on top (the agent-label test injects `resolveAgentSourceKind`/`resolveUserPublics`). */
function makeService(
  names: Readonly<Record<string, string>>,
  ctxOverrides: Partial<ChatContext> = {},
): {
  service: ChatService;
  events: ChatBusEvent[];
} {
  const events: ChatBusEvent[] = [];
  const ctx = makeChatContext(db, {
    runChatTurn: scripted("Hi there"),
    applyStatsDelta: (_b: unknown, _d: Db, _delta: StatsDelta): void => undefined,
    getCard: ({ characterId }) => Promise.resolve(card(names[characterId] ?? "Unknown")),
    mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: castId<CharacterId>("character_group") }),
    resolveUserPublics: () => Promise.resolve(null),
    // ONE seat-decoration read (D44 §12.0/§12.1/§12.5 + the card name loadParticipantViews reads): a CHARACTER
    // seat opts into trusted HTML + carries a raw theme override + resolves its card name; a human/agent seat
    // (characterId null) resolves to the untrusted floor + no override + a null card. Proves the resolved
    // policy + RAW (unmerged) theme are threaded onto ParticipantView (the client reads them, never re-resolves).
    resolveSeatDeco: ({ characterId }) =>
      Promise.resolve(
        characterId === null
          ? { renderPolicy: { trustHtml: false, forbidExternalMedia: true }, themeOverride: null, backgroundOverride: null, card: null }
          : {
              renderPolicy: { trustHtml: true, forbidExternalMedia: false },
              themeOverride: { accent: "oklch(0.7 0.14 250)" },
              backgroundOverride: null,
              card: { name: names[characterId] ?? "Unknown", avatarAssetId: null },
            },
      ),
    ...ctxOverrides,
  });
  const deps: ChatServiceDeps = {
    emit: (event) => {
      events.push(event);
      return Promise.resolve();
    },
    activeTurns: createActiveTurns(),
    prng: seededPrng(),
    delay: () => Promise.resolve(),
    resolveConnection: () => Promise.resolve(testConnection()),
    resolveForeignInputs: () =>
      Promise.resolve({
        promptConfig: DEFAULT_PROMPT_CONFIG,
        personas: { anchor: null, active: null },
        globalRegexScripts: [],
        scanDepth: 6,
        injectionTokenBudget: 0,
      }),
    debitBudget: () => Promise.resolve(),
    resolveTurnPolicy: () => Promise.resolve({ budget: null, allowNonOwnerMaxProSub: false }),
    holder: "replica-test",
    lockTtlMs: 60_000,
  };
  return { service: createChatService(ctx, deps).service, events };
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

  test("a solo send smoke runs the engine end-to-end + commits the canon", async () => {
    const { host, chatId, names } = await seedRoom();
    const { service, events } = makeService(names);

    const outcome = await service.send({
      principal: principal(host),
      chatId,
      content: "yo",
    });

    // The user row + the scripted assistant turn both committed (proves the engine is wired in).
    expect(outcome.messages.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.type === "turnStarted")).toBe(true);
    expect(events.some((e) => e.type === "turnCompleted")).toBe(true);
  });

  test("loadParticipantViews resolves the host + the resolveSeatDeco-backed character name", async () => {
    const { host, chatId, names } = await seedRoom();
    const { service } = makeService(names);

    const roster = await service.listParticipants({ principal: principal(host), chatId });

    const hostRow = roster.find((p) => p.userId === host);
    const charRow = roster.find((p) => p.characterId !== null);
    expect(hostRow?.role).toBe("host");
    expect(charRow?.displayName).toBe("aria"); // resolved via ctx.resolveSeatDeco
    // D44 §12.0 — the RESOLVED render policy is threaded onto each ParticipantView (the client reads it,
    // never re-resolves): the opted-in character carries trusted; the human seat the untrusted floor.
    expect(charRow?.renderPolicy).toEqual({ trustHtml: true, forbidExternalMedia: false });
    expect(hostRow?.renderPolicy).toEqual({ trustHtml: false, forbidExternalMedia: true });
    // D44 §12.1/§12.5 — the RAW theme override is threaded onto each ParticipantView (unmerged: the
    // client, not chat assembly, resolves `character > global > default` via `<ThemeScope>` nesting).
    expect(charRow?.themeOverride).toEqual({ accent: "oklch(0.7 0.14 250)" });
    expect(hostRow?.themeOverride).toBeNull();
  });



  test("a deleted CHARACTER card mid-read degrades to the removed-character label, never the raw id (ruling 2)", async () => {
    const { host, chatId } = await seedRoom();
    // resolveSeatDeco resolves a null card (deleted between the roster read and this resolution) → the
    // seat degrades to the removed-character label.
    const { service } = makeService(
      {},
      {
        resolveSeatDeco: () =>
          Promise.resolve({ renderPolicy: { trustHtml: false, forbidExternalMedia: true }, themeOverride: null, backgroundOverride: null, card: null }),
      },
    );
    const roster = await service.listParticipants({ principal: principal(host), chatId });

    const charRow = roster.find((p) => p.characterId !== null);
    expect(charRow?.displayName).toBe("(removed character)");
    expect(charRow?.displayName).not.toBe(charRow?.characterId);
  });

  test("a HUMAN seat with no resolvable publics degrades to the removed-member label, never the raw id (ruling 2)", async () => {
    const { host, chatId } = await seedRoom();
    // publics resolves null for the host (deleted user row mid-read) — no displayName, no handle.
    const { service } = makeService({}, { resolveUserPublics: () => Promise.resolve(null) });
    const roster = await service.listParticipants({ principal: principal(host), chatId });

    const hostRow = roster.find((p) => p.userId === host);
    expect(hostRow?.displayName).toBe("(removed member)");
    expect(hostRow?.displayName).not.toBe(host);
  });

  test("a HUMAN seat with a handle but no displayName falls to the handle before the removed label (ruling 2)", async () => {
    const { host, chatId } = await seedRoom();
    const { service } = makeService(
      {},
      { resolveUserPublics: () => Promise.resolve({ displayName: null, handle: castId<Handle>("alex"), avatarAssetId: null }) },
    );
    const roster = await service.listParticipants({ principal: principal(host), chatId });

    expect(roster.find((p) => p.userId === host)?.displayName).toBe("alex");
  });
});
