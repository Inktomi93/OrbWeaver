// verb: extractPrompt — the standalone step-1 preview. Returns the RAW post-processReply
// keywords (NO step-4 prefix — that belt is generatePicture's), so the user can review the prompt before
// spending on a generation. Dispatches multimodal → caption, else → text extraction; never generates or stores.

import { DEFAULT_CAPTION_INSTRUCTIONS, DEFAULT_PROMPT_TEMPLATES } from "@orb/contracts/imagery";
import { assets, characters } from "@orb/db";
import type { AssetId, CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { IanaTimeZone } from "@orb/kit/time";
import { parseIanaTimeZone } from "@orb/kit/time";
import { createImageryService, PromptExtractionFailedError } from "@orb/server/domain/imagery";
import { and, eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeCharacter } from "../../../../support/factories/character.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, PNG_BYTES, principal, seedOwner } from "../_support.ts";

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

describe("extractPrompt — a member's /imagine preview runs as the room host (D298)", () => {
  test("the template and the Utility funder are the host's; the viewer the shaper clamps to stays the member", async () => {
    const db = await freshDb();
    const host = await seedOwner(db, castId<Handle>("host"));
    const member = await seedOwner(db, castId<Handle>("member"));
    const templateFor: UserId[] = [];
    const extraction: { readonly viewer: UserId; readonly funder: UserId }[] = [];
    const roomAsked: { readonly caller: UserId; readonly chatId: ChatId }[] = [];
    const { ctx } = makeHarness(db, {
      resolveRoomRunAs: (caller, chatId) => {
        roomAsked.push({ caller: caller.userId, chatId });
        return Promise.resolve(principal(host));
      },
      resolvePromptTemplate: (runAs, mode) => {
        templateFor.push(runAs.userId);
        return Promise.resolve(DEFAULT_PROMPT_TEMPLATES[mode]);
      },
      extractQuiet: (p) => {
        extraction.push({ viewer: p.caller.userId, funder: p.funderUserId });
        return Promise.resolve({ text: "keyword one", costUsd: null });
      },
    });

    await createImageryService(ctx).extractPrompt({ caller: principal(member), chatId: CHAT, mode: "scenario" });

    expect(roomAsked).toEqual([{ caller: member, chatId: CHAT }]);
    expect(templateFor).toEqual([host]);
    expect(extraction).toEqual([{ viewer: member, funder: host }]);
  });

  // The reads are the owner-scoped ones the character and assets domains enforce (a character and its avatar
  // belong to the host alone), so a read made as the member finds nothing.
  test("a member's caption reads the host's subject card and avatar as the host, and funds as the host", async () => {
    const db = await freshDb();
    const host = await seedOwner(db, castId<Handle>("host"));
    const member = await seedOwner(db, castId<Handle>("member"));
    const avatar = castId<AssetId>("asset_host_avatar");
    const subject = castId<CharacterId>("character_aria");
    await db.insert(assets).values({ id: avatar, ownerId: host, kind: "avatar", mime: "image/png", size: PNG_BYTES.length, hash: "host_avatar" });
    await db.insert(characters).values(makeCharacter({ id: subject, ownerId: host, avatarAssetId: avatar }));
    const reads: { readonly card: UserId[]; readonly avatar: UserId[]; readonly instruction: UserId[]; readonly funder: UserId[] } = {
      card: [],
      avatar: [],
      instruction: [],
      funder: [],
    };
    const { ctx } = makeHarness(db, {
      resolveRoomRunAs: () => Promise.resolve(principal(host)),
      getCard: async (caller, characterId) => {
        reads.card.push(caller.userId);
        const [row] = await db
          .select()
          .from(characters)
          .where(and(eq(characters.id, characterId), eq(characters.ownerId, caller.userId)));
        if (row === undefined) {
          throw new Error("character not found");
        }
        return row;
      },
      readAsset: async (caller, assetId) => {
        reads.avatar.push(caller.userId);
        const [row] = await db
          .select({ id: assets.id })
          .from(assets)
          .where(and(eq(assets.id, assetId), eq(assets.ownerId, caller.userId)));
        if (row === undefined) {
          throw new Error("asset not found");
        }
        return { bytes: PNG_BYTES, mime: "image/png" };
      },
      resolveCaptionInstruction: (runAs, mode) => {
        reads.instruction.push(runAs.userId);
        return Promise.resolve(DEFAULT_CAPTION_INSTRUCTIONS[mode]);
      },
      captionImage: (p) => {
        reads.funder.push(p.runAs.userId);
        return Promise.resolve({ text: "caption alpha", costUsd: null });
      },
    });

    const preview = await createImageryService(ctx).extractPrompt({
      caller: principal(member),
      chatId: CHAT,
      mode: "face_multimodal",
      subjectCharacterId: subject,
    });

    expect(preview.source).toBe("captioned");
    expect(reads).toEqual({ card: [host], avatar: [host], instruction: [host], funder: [host] });
  });
});
