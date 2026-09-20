// verbs/turn `send` — the #67 composer-attach TRUST BOUNDARY + structural persist (.int: real libSQL, a REAL
// engine, real `assets`/`message_assets` rows). Proves:
//   • happy path — an OWNED attachment lands a `message_assets` retaining row (the GC-visible FK) AND a
//     `![](asset:<id>)` ref in the persisted body (D51 render), in the SAME committed message;
//   • cross-user reject — an asset owned by ANOTHER user is refused `attachment_not_owned` (no row, no message);
//   • foreign-chat reject — a non-member attaching to a chat they can't post to is a leak-free NOT_FOUND.
// The trust boundary is wired to the REAL owner-scoped asset query (via `filterOwnedAssetIds`), so the whole
// path (verb → op → per-user `assets` scope → persist) is exercised, not a stub.

import type { CharacterCard } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { assets, messageAssets } from "@orb/db";
import type { AssetId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createActiveTurns } from "../../../../../packages/server/src/domain/chat/active-turns.ts";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import { ChatNotFoundError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import type { TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine.ts";
import { loadWitnessHorizons } from "../../../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import { loadCanonHistory } from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { createTurn } from "../../../../../packages/server/src/domain/chat/verbs/turn.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, seedCharacter, seedChat, seedParticipant, seedUser, stubRunCompaction, testConnection } from "../_support.ts";

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** A scripted assistant turn so `send` completes a real round (the attach lands on the USER row regardless). */
function scripted(content: string): ChatContext["runChatTurn"] {
  return () =>
    (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      yield { kind: "text", text: content };
      yield {
        kind: "final",
        economics: { content, tokensIn: 1, tokensOut: 1, model: "test-model" },
      };
    })();
}

// @orb-waive no-test-fabrication(unknown): minimal card stand-in — the round reads only name/regexScripts (attach asserts the USER row). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const STUB_CARD = {
  name: "Aria",
  description: "",
  avatarAssetId: null,
  regexScripts: [],
} as unknown as CharacterCard;

function seededPrng(seed = 1): () => number {
  let s = seed;
  return (): number => {
    s = (s * 16_807) % 2_147_483_647;
    return s / 2_147_483_647;
  };
}

/** Seed an `assets` row owned by `ownerId` (the trust boundary reads its owner-scoped existence). */
async function seedAsset(database: Db, ownerId: UserId, key: string): Promise<AssetId> {
  const id = castId<AssetId>(`asset_${key}`);
  await database.insert(assets).values({
    id,
    ownerId,
    kind: "attachment",
    mime: "image/png",
    size: 4,
    hash: `hash-${key}`,
    animated: false,
  });
  return id;
}

interface Harness {
  turn: ReturnType<typeof createTurn>;
  events: ChatBusEvent[];
}

/** A minimal real-engine harness whose `filterOwnedAssetIds` is the REAL owner-scoped `assets` query. */
function harness(database: Db, names: Readonly<Record<string, string>>): Harness {
  const events: ChatBusEvent[] = [];
  const ctx = makeChatContext(database, {
    runChatTurn: scripted("ok"),
    getCard: () => Promise.resolve(STUB_CARD),
    // #67 — the REAL trust boundary: the owner-scoped subset among the claimed ids (a foreign owner's asset
    // is absent, exactly as `assets.resolveOwnedAssetRefs` would return it).
    filterOwnedAssetIds: async (userId, assetIds) => {
      if (assetIds.length === 0) {
        return [];
      }
      const rows = await database
        .select({ id: assets.id })
        .from(assets)
        .where(and(eq(assets.ownerId, userId), inArray(assets.id, [...assetIds])));
      return rows.map((r) => r.id);
    },
  });
  void names;
  const emit = (event: ChatBusEvent): Promise<void> => {
    events.push(event);
    return Promise.resolve();
  };
  const engine = createTurnEngine(ctx, {
    emit,

    holder: "replica-1",
    lockTtlMs: 60_000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons,
    recallMemory,
    runCompaction: stubRunCompaction,
  });
  const turn = createTurn(ctx, {
    claimChat: (): Promise<void> => Promise.resolve(),
    engine,
    activeTurns: createActiveTurns(),
    emit,
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
  });
  return { turn, events };
}

/** Seed a solo host+character chat; returns the host + chatId. */
async function seedSolo(database: Db): Promise<{ host: UserId; chatId: ChatId }> {
  const host = await seedUser(database, castId<Handle>("host"));
  const chatId = await seedChat(database, "a", {
    metadata: { group: { output: "per-speaker", policy: "natural" } },
  });
  await seedParticipant(database, { chatId, key: "h", userId: host, role: "host" });
  const cid = await seedCharacter(database, host, "aria");
  await seedParticipant(database, { chatId, key: "aria", characterId: cid, joinSeq: 0 });
  return { host, chatId };
}

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("send — #67 attach TRUST BOUNDARY", () => {
  test("an OWNED attachment lands a message_assets row + an asset:<id> body ref on the user turn", async () => {
    const { host, chatId } = await seedSolo(db);
    const assetId = await seedAsset(db, host, "owned");
    const h = harness(db, {});

    const outcome = await h.turn.send({
      principal: principal(host),
      chatId,
      content: "look at this",
      attachmentAssetIds: [assetId],
    });

    // The user row's body carries the D51 render ref (parsed to a media block at render).
    const userRow = outcome.messages.find((m) => m.role === "user");
    expect(userRow?.content).toContain(`![attachment](asset:${assetId})`);
    expect(userRow?.content).toContain("look at this");

    // The STRUCTURAL retaining row landed, linked to the committed user slot (the GC-visible FK).
    const rows = await db
      .select({ messageId: messageAssets.messageId, assetId: messageAssets.assetId })
      .from(messageAssets)
      .where(eq(messageAssets.assetId, assetId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.messageId).toBe(userRow?.id);
  });

  test("a message with NO attachments writes NO message_assets rows (byte-identical to a plain send)", async () => {
    const { host, chatId } = await seedSolo(db);
    const h = harness(db, {});

    const outcome = await h.turn.send({ principal: principal(host), chatId, content: "plain" });

    expect(outcome.messages.find((m) => m.role === "user")?.content).toBe("plain");
    const rows = await db.select({ id: messageAssets.id }).from(messageAssets);
    expect(rows).toHaveLength(0);
  });

  test("attaching ANOTHER user's asset is refused attachment_not_owned — no message, no row", async () => {
    const { host, chatId } = await seedSolo(db);
    const stranger = await seedUser(db, castId<Handle>("stranger"));
    const foreignAsset = await seedAsset(db, stranger, "foreign");
    const h = harness(db, {});

    await expect(
      h.turn.send({
        principal: principal(host),
        chatId,
        content: "steal this",
        attachmentAssetIds: [foreignAsset],
      }),
    ).rejects.toMatchObject({ code: "attachment_not_owned" });

    // The refusal is BEFORE any write: no canon row, no message_assets row.
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
    const rows = await db.select({ id: messageAssets.id }).from(messageAssets);
    expect(rows).toHaveLength(0);
  });

  test("a non-member attaching to a foreign chat is a leak-free NOT_FOUND (the post gate wins first)", async () => {
    const { chatId } = await seedSolo(db);
    const outsider = await seedUser(db, castId<Handle>("outsider"));
    const outsiderAsset = await seedAsset(db, outsider, "outsider");
    const h = harness(db, {});

    await expect(
      h.turn.send({
        principal: principal(outsider),
        chatId,
        content: "intrude",
        attachmentAssetIds: [outsiderAsset],
      }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);
    expect(await loadCanonHistory(db, chatId)).toHaveLength(0);
  });
});
