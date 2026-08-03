// verb: extractPrompt — the standalone step-1 preview (imagery-design/02 §2). Returns the RAW post-processReply
// keywords (NO step-4 prefix — that belt is generatePicture's), so the user can review the prompt before
// spending on a generation. Dispatches multimodal → caption, else → text extraction; never generates or stores.

import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createImageryService } from "@orb/server/domain/imagery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedOwner } from "../_support";

const CHAT = castId<ChatId>("chat_room");

describe("extractPrompt", () => {
  test("an extraction mode returns the raw keywords (no prefix), the source, and the spend", async () => {
    const db = await freshDb();
    const owner = await seedOwner(db, castId<Handle>("owner"));
    const { ctx, extractInstructions } = makeHarness(db);

    const preview = await createImageryService(ctx).extractPrompt({ caller: principal(owner), chatId: CHAT, mode: "character" });

    expect(extractInstructions).toHaveLength(1);
    expect(preview).toEqual({ prompt: "keyword one, keyword two", mode: "character", source: "extracted", costUsd: 0.005 });
  });

  test("a multimodal mode captions the avatar (source captioned)", async () => {
    const db = await freshDb();
    const owner = await seedOwner(db, castId<Handle>("owner"));
    const { ctx, captionInstructions } = makeHarness(db);

    const preview = await createImageryService(ctx).extractPrompt({
      caller: principal(owner),
      chatId: CHAT,
      mode: "face_multimodal",
      subjectCharacterId: castId("character_aria"),
    });

    expect(captionInstructions).toHaveLength(1);
    expect(preview.source).toBe("captioned");
    expect(preview.prompt).toBe("caption alpha, caption beta");
  });
});
