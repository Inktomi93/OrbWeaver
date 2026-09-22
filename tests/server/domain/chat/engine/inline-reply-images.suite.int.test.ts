// §6.7 INLINE REPLY IMAGES — the whole round trip, end to end, on real libSQL: a model emits a picture
// inside its own turn → the engine stores it → the span lands in canon with a minted alt → a
// `message_assets` link is stamped `inline-reply` → and ON THE NEXT TURN the picture rides back to the model
// as an `image` content-part on an ASSISTANT row. That last assertion is the one that proves the feature
// exists rather than being a one-way display: without it the model can never edit what it drew.
//
// EVERY ARM HERE IS PAIRED WITH ITS REFUSAL, because the predicate this feature relaxes
// (`substrate/wire-history` `ridesAsModelMedia`) is the fence between "the model sees the picture it drew"
// and "the model sees every asset in the room" — and the row it now admits is the same row class an
// `/imagine` illustration post writes today. So the `/imagine` arm is driven through its REAL writer
// (`verbs/post-narrator-message.ts`, which stamps `illustration`) and asserted NOT to ride, in this file,
// against the same engine and the same chat.
//
// `.int` because the proof is a DB one: the `message_assets` row's `origin` column is what the wire-history
// fence reads, and it is also the ONLY reference the asset GC can see (body `asset:` spans are invisible to
// `asset-refs.ts` — `db/schema/chat.ts`'s header). A unit double for either would prove nothing.

import type { ChatBusEvent, DurableChatBusEvent } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { StatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import { assets, messageAssets } from "@orb/db";
import type { GeneratedImage } from "@orb/inference";
import type { AssetId, CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import type { ResolvedMediaRef, TurnMessage, TurnPrep, TurnRequest, TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine.ts";
import { loadWitnessHorizons } from "../../../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
import { recallMemory } from "../../../../../packages/server/src/domain/chat/memory/recall/recall.ts";
import { loadCanonHistory } from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { createPostNarratorMessage } from "../../../../../packages/server/src/domain/chat/verbs/post-narrator-message.ts";
import { freshDb } from "../../../../support/db.ts";
import { makeCapability, makeGenerationCapability, makeResolved, TEST_PROVIDER_ID } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId } from "../../../../support/inference-identities.ts";
import { FROZEN_AT, makeChatContext, seedCharacter, seedChat, seedParticipant, seedUser, stubRunCompaction } from "../_support.ts";

const HOST = castId<UserId>("user_host");

/** A model that both SEES and PRODUCES pictures — `input ∋ image` gates the vision parts the second turn
 *  must carry, `output.modalities ∋ image` is what makes the reply-picture knob legal in the first place. */
const IMAGE_CONNECTION = makeResolved({
  providerId: TEST_PROVIDER_ID,
  api: "chat-completions",
  capability: makeCapability(
    makeGenerationCapability({ input: ["text", "image"], output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text", "image"] } }),
  ),
});

const PNG: GeneratedImage = { url: undefined, base64: "aGVsbG8=", mediaType: "image/png" };

/** A turn that writes prose and emits ONE picture after the first sentence, captured into `sink`. */
function pictureTurn(sink: TurnRequest[], prose: string, images: readonly GeneratedImage[]): ChatContext["runChatTurn"] {
  return (req: TurnRequest) => {
    sink.push(req);
    return (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      yield { kind: "text", text: prose };
      yield { kind: "final", economics: { content: prose, model: testModelId("test-model"), replyImages: images, tokensIn: 1, tokensOut: 1 } };
    })();
  };
}

interface Harness {
  readonly ctx: ChatContext;
  readonly events: ChatBusEvent[];
  readonly requests: TurnRequest[];
  readonly engine: ReturnType<typeof createTurnEngine>;
  readonly stored: AssetId[];
}

/** The engine wired the way a real room is, with TWO seams faked and both of them honestly:
 *   • `storeInlineReplyImage` mints a REAL `assets` row (the `message_assets` FK is the whole point), or
 *     returns null when the arm is testing a refusal;
 *   • `resolveImageUrl` answers with a CAS-shaped URL so a riding part is recognizable on the wire. */
function harness(database: Db, over: { readonly runChatTurn: ChatContext["runChatTurn"]; readonly storeFails?: boolean }): Harness {
  const events: ChatBusEvent[] = [];
  const requests: TurnRequest[] = [];
  const stored: AssetId[] = [];
  let counter = 0;
  const ctx = makeChatContext(database, {
    runChatTurn: over.runChatTurn,
    applyStatsDelta: (_batch: unknown, _db: Db, _delta: StatsDelta): void => undefined,
    emitChatChanged: (): Promise<void> => Promise.resolve(),
    resolveImageUrl: ({ ref }): Promise<ResolvedMediaRef | null> =>
      Promise.resolve(ref.kind === "asset" ? { url: `https://cas.test/${ref.assetId}`, media: "image" } : { url: ref.url, media: "image" }),
    // The narrator writer mints the room's hidden group-narrator identity; the CONTROL arm drives that real
    // writer, so the op must answer with the seeded character rather than throwing.
    mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: castId<CharacterId>("character_aria") }),
    storeInlineReplyImage: async (ownerId, _image) => {
      if (over.storeFails === true) {
        return null;
      }
      counter += 1;
      const assetId = castId<AssetId>(`asset_inline_${counter}`);
      await database
        .insert(assets)
        .values({ id: assetId, ownerId, kind: "generated", mime: "image/png", size: 5, hash: `hash_inline_${counter}`, uploadedAt: FROZEN_AT });
      stored.push(assetId);
      return { assetId };
    },
  });
  const engine = createTurnEngine(ctx, {
    emit: (event: DurableChatBusEvent): Promise<void> => {
      events.push(event);
      return Promise.resolve();
    },
    holder: "replica-1",
    lockTtlMs: 60_000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons,
    recallMemory,
    runCompaction: stubRunCompaction,
  });
  return { ctx, events, requests, engine, stored };
}

function prepOf(chatId: ChatId): TurnPrep {
  return {
    chatId,
    assembleContext: {
      character: { name: "Aria", description: "a bold knight" },
      promptConfig: { ...DEFAULT_PROMPT_CONFIG, params: { ...DEFAULT_PROMPT_CONFIG.params, replyMedia: "text+image" } },
      activePersona: { name: "Nate", description: "the user" },
      recentMessages: [],
    },
    connection: IMAGE_CONNECTION,
    triggeredBy: HOST,
    funderUserId: HOST,
    runAsUserId: HOST,
    kind: "send",
    intent: { replyMedia: "text+image" },
    speakerCharacterId: null,
  };
}

async function seedRoom(database: Db, key: string): Promise<ChatId> {
  await seedUser(database, castId<Handle>("host"));
  const chatId = await seedChat(database, key);
  await seedParticipant(database, { chatId, key: "host", userId: HOST, role: "host" });
  return chatId;
}

/** Every media part the wire history carried, flattened across rows — what the MODEL actually received. */
function mediaParts(history: readonly TurnMessage[]): readonly { readonly type: string; readonly url: string }[] {
  return history.flatMap((row) => row.content.flatMap((part) => (part.type === "image" || part.type === "video" ? [{ type: part.type, url: part.url }] : [])));
}

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("§6.7 inline reply images — the round trip", () => {
  test("the picture lands in canon as a span with a MINTED alt, and its link is stamped inline-reply", async () => {
    const chatId = await seedRoom(db, "inline-canon");
    const sink: TurnRequest[] = [];
    const h = harness(db, { runChatTurn: pictureTurn(sink, "She unrolls the map across the crate.", [PNG]) });

    await h.engine.runTurn(prepOf(chatId));

    const canon = await loadCanonHistory(db, chatId);
    const reply = canon.at(-1);
    // The ALT is the model's own preceding sentence (F22) — never a counter, because it is baked into canon
    // at generation time and can never be corrected at render.
    expect(reply?.content).toBe("She unrolls the map across the crate.\n\n![She unrolls the map across the crate.](asset:asset_inline_1)");

    // THE GC ANCHOR + THE FENCE INPUT, one row. Body `asset:` spans are invisible to `asset-refs.ts`, so
    // without this link the blob is reaped under a live transcript.
    const links = await db
      .select()
      .from(messageAssets)
      .where(eq(messageAssets.messageId, reply?.id ?? castId("none")));
    expect(links.map((l) => ({ assetId: l.assetId, origin: l.origin }))).toEqual([{ assetId: "asset_inline_1", origin: "inline-reply" }]);
  });

  test("THE PIN — a SECOND turn carries the prior assistant picture back as an `image` part on an assistant row", async () => {
    // This is the whole feature: the model can see, and therefore edit, the picture it drew last turn.
    const chatId = await seedRoom(db, "inline-rides");
    const sink: TurnRequest[] = [];
    const h = harness(db, { runChatTurn: pictureTurn(sink, "She unrolls the map.", [PNG]) });

    await h.engine.runTurn(prepOf(chatId));
    await h.engine.runTurn(prepOf(chatId));

    const secondTurn = sink.at(-1);
    expect(secondTurn).toBeDefined();
    expect(mediaParts(secondTurn?.history ?? [])).toEqual([{ type: "image", url: "https://cas.test/asset_inline_1" }]);
    // …and it rides on an ASSISTANT row, not laundered onto a user line.
    const carrier = (secondTurn?.history ?? []).find((row) => row.content.some((part) => part.type === "image"));
    expect(carrier?.role).toBe("assistant");
  });

  test("THE CONTROL — an /imagine illustration post in the SAME room does NOT ride, though it is an assistant row with a real asset ref", async () => {
    // Driven through the REAL narrator writer, so the `illustration` stamp under test is the one production
    // writes. The two arms differ ONLY in that column.
    const chatId = await seedRoom(db, "inline-illustration");
    await seedCharacter(db, HOST, "aria");
    const illustrationAssetId = castId<AssetId>("asset_imagine_1");
    await db.insert(assets).values({
      id: illustrationAssetId,
      ownerId: HOST,
      kind: "generated",
      mime: "image/png",
      size: 5,
      hash: "hash_imagine_1",
      uploadedAt: FROZEN_AT,
    });

    const sink: TurnRequest[] = [];
    const h = harness(db, { runChatTurn: pictureTurn(sink, "A quiet beat.", []) });
    const postNarrator = createPostNarratorMessage(h.ctx, { emit: () => Promise.resolve(), claimChat: () => Promise.resolve() });
    await postNarrator(chatId, "", [illustrationAssetId], undefined);

    await h.engine.runTurn(prepOf(chatId));

    const request = sink.at(-1);
    // The link the narrator writer stamped is `illustration`, so the fence holds: no media part at all, and
    // the asset id never appears on the wire in any shape.
    const links = await db.select().from(messageAssets);
    expect(links.map((l) => l.origin)).toEqual(["illustration"]);
    expect(mediaParts(request?.history ?? [])).toEqual([]);
    expect(JSON.stringify(request?.history ?? [])).not.toContain(illustrationAssetId);
  });

  test("a STORE REFUSAL loses the picture and nothing else: prose commits, no span, no link, one warning", async () => {
    // The bytes are already paid for and the PROSE is the product. Canon must never name an asset that does
    // not exist, and the author is told once — §6.7's "couldn't save this picture".
    const chatId = await seedRoom(db, "inline-refused");
    const sink: TurnRequest[] = [];
    const h = harness(db, { runChatTurn: pictureTurn(sink, "She unrolls the map.", [PNG]), storeFails: true });

    await h.engine.runTurn(prepOf(chatId));

    const canon = await loadCanonHistory(db, chatId);
    expect(canon.at(-1)?.content).toBe("She unrolls the map.");
    expect(await db.select().from(messageAssets)).toEqual([]);
    expect(h.events.filter((e) => e.type === "warning").map((e) => (e.type === "warning" ? e.code : null))).toContain("reply_image_failed");
  });

  test("a text-only reply is BYTE-IDENTICAL to before the feature — no link, no span, no store call", async () => {
    const chatId = await seedRoom(db, "inline-none");
    const sink: TurnRequest[] = [];
    const h = harness(db, { runChatTurn: pictureTurn(sink, "Just words.", []) });

    await h.engine.runTurn(prepOf(chatId));

    const canon = await loadCanonHistory(db, chatId);
    expect(canon.at(-1)?.content).toBe("Just words.");
    expect(h.stored).toEqual([]);
    expect(await db.select().from(messageAssets)).toEqual([]);
  });
});
