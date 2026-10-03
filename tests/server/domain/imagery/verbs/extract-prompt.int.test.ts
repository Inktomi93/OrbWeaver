// verb: extractPrompt — the standalone step-1 preview. Returns the RAW post-processReply
// keywords (NO step-4 prefix — that belt is generatePicture's), so the user can review the prompt before
// spending on a generation. Dispatches multimodal → caption, else → text extraction; never generates or stores.

import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { IanaTimeZone } from "@orb/kit/time";
import { parseIanaTimeZone } from "@orb/kit/time";
import { createImageryService, PromptExtractionFailedError } from "@orb/server/domain/imagery";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedOwner } from "../_support.ts";

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

  // The fake extraction yields no usable keywords, so every call refuses before a generation writes: the
  // zone handed to chat is the whole observable here.
  test("the viewer's zone reaches chat's extraction from both the preview and a generation", async () => {
    const db = await freshDb();
    const owner = await seedOwner(db, castId<Handle>("owner"));
    const zones: (IanaTimeZone | undefined)[] = [];
    const { ctx } = makeHarness(db, {
      extractQuiet: (p) => {
        zones.push(p.timeZone);
        return Promise.resolve({ text: "()", costUsd: null });
      },
    });
    const imagery = createImageryService(ctx);
    const kathmandu = parseIanaTimeZone("Asia/Kathmandu");
    if (kathmandu === null) {
      throw new Error("the platform must know Asia/Kathmandu");
    }
    const caller = principal(owner);

    await expect(imagery.extractPrompt({ caller, chatId: CHAT, mode: "scenario", timeZone: kathmandu })).rejects.toThrow(PromptExtractionFailedError);
    await expect(imagery.generatePicture({ caller, chatId: CHAT, mode: "scenario", timeZone: kathmandu })).rejects.toThrow(PromptExtractionFailedError);
    await expect(imagery.generatePicture({ caller, chatId: CHAT, mode: "scenario" })).rejects.toThrow(PromptExtractionFailedError);

    expect(zones).toEqual([kathmandu, kathmandu, undefined]);
  });
});
