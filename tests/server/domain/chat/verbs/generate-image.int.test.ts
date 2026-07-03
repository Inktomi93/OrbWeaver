// verb: generateImage — the explicit image-generation surface (imagery-design/04 §2). Proves against a real
// libSQL db: the injected `generatePicture` op is called, ONE message is committed authored by the CALLER
// (§2.2 — the initiating principal, a user post), its body STRING carries one `asset:` ref per returned
// image (D51 — never stored blocks), and `messageCommitted` is emitted. The op is a stub (chat can't import
// domain/imagery); the mapping imagery→chat lives at the composition root, not here.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { messages, messageVariants } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createGenerateImage } from "../../../../../packages/server/src/domain/chat/verbs/generate-image";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedChat, seedParticipant, seedUser } from "../_support";

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
  return { userId, role: "user", handle: castId<Handle>("h"), externalId: null, via: "cookie" };
}

describe("generateImage", () => {
  test("commits ONE caller-authored message carrying n asset refs + emits messageCommitted", async () => {
    const host = await seedUser(db, "host");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });

    const calls: unknown[] = [];
    const ctx = makeChatContext(db, {
      generatePicture: (p) => {
        calls.push(p);
        return Promise.resolve({
          images: [{ assetId: "asset_one" }, { assetId: "asset_two" }],
          warnings: [],
        });
      },
    });
    const { generateImage } = createGenerateImage(ctx, { emit });

    const view = await generateImage({
      principal: principal(host),
      chatId,
      mode: "free",
      prompt: "a dragon",
      n: 2,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ chatId, mode: "free", prompt: "a dragon", n: 2 });

    expect(view.role).toBe("user");
    expect(view.authorUserId).toBe(host);

    // Exactly one committed slot; its body is a STRING with two asset refs + the prompt.
    const rows = await db.select().from(messages).where(eq(messages.chatId, chatId));
    expect(rows).toHaveLength(1);
    const variants = await db
      .select()
      .from(messageVariants)
      .where(eq(messageVariants.messageId, view.id))
      .orderBy(asc(messageVariants.idx));
    expect(variants).toHaveLength(1);
    const body = variants[0]?.content ?? "";
    expect(body).toContain("a dragon");
    expect(body).toContain("![generated image](asset:asset_one)");
    expect(body).toContain("![generated image](asset:asset_two)");

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ type: "messageCommitted", chatId, messageId: view.id });
  });

  test("a non-participant is refused (leak-free NOT_FOUND) and never calls the op", async () => {
    const host = await seedUser(db, "host");
    const outsider = await seedUser(db, "outsider");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });

    let called = false;
    const ctx = makeChatContext(db, {
      generatePicture: () => {
        called = true;
        return Promise.resolve({ images: [], warnings: [] });
      },
    });
    const { generateImage } = createGenerateImage(ctx, { emit });

    await expect(
      generateImage({ principal: principal(outsider), chatId, mode: "free", prompt: "x" }),
    ).rejects.toThrow();
    expect(called).toBe(false);
  });
});
