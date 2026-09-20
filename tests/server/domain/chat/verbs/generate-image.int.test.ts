// verb: generateImage — the explicit image-generation surface (imagery-design/04 §2). Proves against a real
// libSQL db: the injected `generatePicture` op is called, ONE message is committed authored by the CALLER
// (§2.2 — the initiating principal, a user post), its body STRING carries one `asset:` ref per returned
// image (D51 — never stored blocks), and `messageCommitted` is emitted. The op is a stub (chat can't import
// domain/imagery); the mapping imagery→chat lives at the composition root, not here.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { messages, messageVariants, ownerStats, statsCanonVersions } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { AssetId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createGenerateImage } from "../../../../../packages/server/src/domain/chat/verbs/generate-image.ts";
import { applyStatsDelta } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, noClaim, seedChat, seedMessage, seedParticipant, seedUser } from "../_support.ts";

let db: Db;
let emitted: ChatBusEvent[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
});

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

describe("generateImage", () => {
  test("an unrelated unique failure stays loud instead of spinning the append retry", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "unique");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    const existing = await seedMessage(db, chatId, 1, { role: "user", authorUserId: host });
    let providerCalls = 0;
    const ctx = makeChatContext(db, {
      newMessageId: () => existing.messageId,
      generatePicture: () => {
        providerCalls += 1;
        return Promise.resolve({ images: [{ assetId: castId<AssetId>("asset_one") }], warnings: [] });
      },
    });
    const { generateImage } = createGenerateImage(ctx, { emit, claimChat: noClaim });

    await expect(generateImage({ principal: principal(host), chatId, mode: "free" })).rejects.toThrow();
    expect(providerCalls).toBe(1);
    expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(1);
  });

  test("concurrent completed generations both append canon without re-running either provider call", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });

    let arrivals = 0;
    let release: (() => void) | undefined;
    const together = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    const ctx = makeChatContext(db, {
      generatePicture: async (p) => {
        calls.push(p.prompt ?? "");
        arrivals += 1;
        if (arrivals === 2) {
          release?.();
        }
        await together;
        return {
          images: [{ assetId: castId<AssetId>(`asset_${p.prompt ?? "none"}`) }],
          warnings: [],
        };
      },
    });
    const { generateImage } = createGenerateImage(ctx, { emit, claimChat: noClaim });

    const views = await Promise.all([
      generateImage({ principal: principal(host), chatId, mode: "free", prompt: "one" }),
      generateImage({ principal: principal(host), chatId, mode: "free", prompt: "two" }),
    ]);

    expect(calls.toSorted((a, b) => a.localeCompare(b))).toEqual(["one", "two"]);
    expect(new Set(views.map((view) => view.seq))).toEqual(new Set([1, 2]));
    expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(2);
  });

  test("commits ONE caller-authored message carrying n asset refs + emits messageCommitted", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });

    const calls: unknown[] = [];
    const ctx = makeChatContext(db, {
      applyStatsDelta: (batch, deltaDb, delta) => applyStatsDelta(batch as BatchStmt[], deltaDb, delta),
      generatePicture: (p) => {
        calls.push(p);
        return Promise.resolve({
          images: [{ assetId: castId<AssetId>("asset_one") }, { assetId: castId<AssetId>("asset_two") }],
          warnings: [],
        });
      },
    });
    const { generateImage } = createGenerateImage(ctx, { emit, claimChat: noClaim });

    const view = await generateImage({
      principal: principal(host),
      chatId,
      mode: "free",
      prompt: "a dragon",
      n: 2,
      size: "portrait",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ chatId, mode: "free", prompt: "a dragon", n: 2, size: "portrait" });

    expect(view.role).toBe("user");
    expect(view.authorUserId).toBe(host);

    // Exactly one committed slot; its body is a STRING with two asset refs + the prompt.
    const rows = await db.select().from(messages).where(eq(messages.chatId, chatId));
    expect(rows).toHaveLength(1);
    const variants = await db.select().from(messageVariants).where(eq(messageVariants.messageId, view.id)).orderBy(asc(messageVariants.idx));
    expect(variants).toHaveLength(1);
    const body = variants[0]?.content ?? "";
    expect(body).toContain("a dragon");
    expect(body).toContain("![generated image](asset:asset_one)");
    expect(body).toContain("![generated image](asset:asset_two)");

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ type: "messageCommitted", chatId, messageId: view.id });
    expect((await db.select().from(ownerStats).where(eq(ownerStats.ownerId, host)))[0]?.userTurns).toBe(1);
    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, host)))[0]?.version).toBe(1);
  });

  test("maps each imagery warning onto a chat `warning` bus event (doc 03 §2.1)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });

    const ctx = makeChatContext(db, {
      generatePicture: () =>
        Promise.resolve({
          images: [{ assetId: castId<AssetId>("asset_one") }],
          warnings: [{ code: "image_edit_dropped", detail: "img-model lacks image-edit; generated without the avatar reference" }],
        }),
    });
    const { generateImage } = createGenerateImage(ctx, { emit, claimChat: noClaim });

    await generateImage({ principal: principal(host), chatId, mode: "free", prompt: "a dragon" });

    // The message still committed; the warning rides the one chat `warning` surface after it.
    const warnings = emitted.filter((e) => e.type === "warning");
    expect(warnings).toEqual([{ type: "warning", chatId, code: "image_edit_dropped" }]);
  });

  test("a non-participant is refused (leak-free NOT_FOUND) and never calls the op", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const outsider = await seedUser(db, castId<Handle>("outsider"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });

    let called = false;
    const ctx = makeChatContext(db, {
      generatePicture: () => {
        called = true;
        return Promise.resolve({ images: [], warnings: [] });
      },
    });
    const { generateImage } = createGenerateImage(ctx, { emit, claimChat: noClaim });

    await expect(generateImage({ principal: principal(outsider), chatId, mode: "free", prompt: "x" })).rejects.toThrow();
    expect(called).toBe(false);
  });

  // ── The husk belt (#1463 item 6) ──────────────────────────────────────────────────────────────────────
  // Claiming publishes the room into every member's library and replays the creation economics — a one-way
  // transition a FAILED generation must not spend. The picture must exist before the room is claimed; the
  // claim still precedes the canon write (the `verbs/claim-chat.ts` ordering invariant).
  test("a failed picture generation never claims the husk", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "husk", { startedAt: null });
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    const claims: string[] = [];
    const ctx = makeChatContext(db, { generatePicture: () => Promise.reject(new Error("the image backend refused")) });
    const { generateImage } = createGenerateImage(ctx, {
      emit,
      claimChat: (id) => {
        claims.push(id);
        return Promise.resolve();
      },
    });

    await expect(generateImage({ principal: principal(host), chatId, mode: "free", prompt: "x" })).rejects.toThrow("refused");
    expect(claims).toEqual([]);
    expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toEqual([]);
  });

  test("a successful generation claims the room (before the canon write)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "claimed", { startedAt: null });
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    const claims: string[] = [];
    // The canon rows present AT CLAIM — the ordering invariant's own subject: the claim replays the deltas
    // over the canon that exists when it runs, so this post's row must NOT be among them.
    let canonAtClaim = -1;
    const ctx = makeChatContext(db, {
      generatePicture: () => Promise.resolve({ images: [{ assetId: castId<AssetId>("asset_ok") }], warnings: [] }),
    });
    const { generateImage } = createGenerateImage(ctx, {
      emit,
      claimChat: async (id) => {
        claims.push(id);
        canonAtClaim = (await db.select().from(messages).where(eq(messages.chatId, chatId))).length;
      },
    });

    await generateImage({ principal: principal(host), chatId, mode: "free", prompt: "x" });
    expect(claims).toEqual([chatId]);
    expect(canonAtClaim).toBe(0);
    expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(1);
  });

  test("a hostless chat is refused before the claim AND before the picture is paid for", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "orphan", { startedAt: null });
    // A present MEMBER with no host seat — the room has nobody to own the committed economics.
    await seedParticipant(db, { chatId, key: "m", userId: host, role: "member" });
    const claims: string[] = [];
    let pictures = 0;
    const ctx = makeChatContext(db, {
      generatePicture: () => {
        pictures += 1;
        return Promise.resolve({ images: [], warnings: [] });
      },
    });
    const { generateImage } = createGenerateImage(ctx, {
      emit,
      claimChat: (id) => {
        claims.push(id);
        return Promise.resolve();
      },
    });

    await expect(generateImage({ principal: principal(host), chatId, mode: "free", prompt: "x" })).rejects.toThrow("no host");
    expect(claims).toEqual([]);
    expect(pictures).toBe(0);
  });
});
