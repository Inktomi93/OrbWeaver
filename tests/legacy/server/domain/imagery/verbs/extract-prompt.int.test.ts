// verb: extractPrompt — the standalone step-1 preview. Returns the RAW post-processReply
// keywords (NO step-4 prefix — that belt is generatePicture's), so the user can review the prompt before
// spending on a generation. Dispatches multimodal → caption, else → text extraction; never generates or stores.
// @subject packages/server/src/domain/imagery/verbs/extract-prompt.ts

import { DEFAULT_CAPTION_INSTRUCTIONS, DEFAULT_PROMPT_TEMPLATES } from "@orb/contracts/imagery";
import { characters } from "@orb/db";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { IanaTimeZone } from "@orb/kit/time";
import { parseIanaTimeZone } from "@orb/kit/time";
import { createAssetsService } from "@orb/server/domain/assets";
import { createCharacterService } from "@orb/server/domain/character";
import { freshDb } from "@orb/testkit/node/db.ts";
import { makeCharacter } from "@orb/testkit/node/factories/character.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, onTestFinished } from "vitest";
import { createImageryService, PromptExtractionFailedError } from "#server/domain/imagery/index.ts";
import { makeHarness as makeAssetsHarness } from "../../assets/_support.ts";
import { makeHarness as makeCharacterHarness } from "../../character/_support.ts";
import { makeHarness, PNG_BYTES, principal, seedOwner } from "../_support.ts";

const CHAT = castId<ChatId>("chat_room");

describe("extractPrompt", () => {
  test("an extraction mode returns the raw keywords (no prefix), the source, and the spend", async () => {
    const db = await freshDb();
    const owner = await seedOwner(db, castId<Handle>("owner"));
    const { ctx, extractInstructions } = makeHarness(db);

    const preview = await createImageryService(ctx).extractPrompt({ caller: await principal(db, owner), chatId: CHAT, mode: "character" });

    expect(extractInstructions).toHaveLength(1);
    expect(preview).toEqual({ prompt: "keyword one, keyword two", mode: "character", source: "extracted", costUsd: 0.005 });
  });

  test("a multimodal mode captions the avatar (source captioned)", async () => {
    const db = await freshDb();
    const owner = await seedOwner(db, castId<Handle>("owner"));
    const { ctx, captionInstructions } = makeHarness(db);

    const preview = await createImageryService(ctx).extractPrompt({
      caller: await principal(db, owner),
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
    const caller = await principal(db, owner);

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
      resolveRoomRunAs: async (caller, chatId) => {
        roomAsked.push({ caller: caller.userId, chatId });
        return Promise.resolve(await principal(db, host));
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

    await createImageryService(ctx).extractPrompt({ caller: await principal(db, member), chatId: CHAT, mode: "scenario" });

    expect(roomAsked).toEqual([{ caller: member, chatId: CHAT }]);
    expect(templateFor).toEqual([host]);
    expect(extraction).toEqual([{ viewer: member, funder: host }]);
  });

  // The reads are the character and assets domains' own owner-scoped verbs, the ones compose wires (a character
  // and its avatar belong to the host alone), so a read made as the member finds nothing.
  test("a member's caption reads the host's subject card and avatar as the host, and funds as the host", async () => {
    const db = await freshDb();
    const host = await seedOwner(db, castId<Handle>("host"));
    const member = await seedOwner(db, castId<Handle>("member"));
    const subject = castId<CharacterId>("character_aria");
    const assetsHarness = await makeAssetsHarness(db);
    onTestFinished(assetsHarness.cleanup);
    const assetsService = createAssetsService(assetsHarness.ctx);
    const characterService = createCharacterService(makeCharacterHarness(db).ctx);
    const avatar = await assetsService.store({ principal: await principal(db, host), bytes: PNG_BYTES, kind: "avatar", mime: "image/png" });
    await db.insert(characters).values(makeCharacter({ id: subject, ownerId: host, avatarAssetId: avatar.assetId }));
    const reads: { readonly card: UserId[]; readonly avatar: UserId[]; readonly instruction: UserId[]; readonly funder: UserId[] } = {
      card: [],
      avatar: [],
      instruction: [],
      funder: [],
    };
    const { ctx } = makeHarness(db, {
      resolveRoomRunAs: async () => Promise.resolve(await principal(db, host)),
      getCard: (caller, characterId) => {
        reads.card.push(caller.userId);
        return characterService.get({ principal: caller, characterId });
      },
      readAsset: (caller, assetId) => {
        reads.avatar.push(caller.userId);
        return assetsService.readOwnedAssetBytes(caller, assetId);
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
      caller: await principal(db, member),
      chatId: CHAT,
      mode: "face_multimodal",
      subjectCharacterId: subject,
    });

    expect(preview.source).toBe("captioned");
    expect(reads).toEqual({ card: [host], avatar: [host], instruction: [host], funder: [host] });
  });
});
