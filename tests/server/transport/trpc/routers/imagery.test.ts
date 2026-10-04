// The imagery router's extractPrompt wire mapping, driven through the real ladder via `createCaller` with a
// fake imagery service. The cross-tenant sweep proves the owner join; this file proves what the verb receives.

import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { parseIanaTimeZone, UTC_TIME_ZONE } from "@orb/kit/time";
import type { ImageryService } from "@orb/server/domain/imagery";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

const HOST = castId<UserId>("user_host");
const CHAT = mintTypeId(ID_PREFIX.chat);
const SUBJECT = mintTypeId(ID_PREFIX.character);
const EXTRACTED = { prompt: "a lighthouse at dusk", mode: "scenario", source: "extracted", costUsd: null } as const;

function extractingContext(extractPrompt: ImageryService["extractPrompt"]): ReturnType<typeof makeContext> {
  return makeContext({ auth: principal("user", { userId: HOST }), services: { imagery: { extractPrompt } } });
}

describe("imagery.extractPrompt — the preview-before-spend wire", () => {
  test("the caller, chat, mode, subject and the viewer's parsed zone reach the verb", async () => {
    const extractPrompt = vi.fn<ImageryService["extractPrompt"]>(async () => EXTRACTED);
    const kathmandu = parseIanaTimeZone("Asia/Kathmandu");

    const result = await caller(extractingContext(extractPrompt)).imagery.extractPrompt({
      chatId: CHAT,
      mode: "character",
      subjectCharacterId: SUBJECT,
      timeZone: "Asia/Kathmandu",
    });

    expect(kathmandu).not.toBeNull();
    expect(extractPrompt).toHaveBeenCalledWith({
      caller: expect.objectContaining({ userId: HOST }),
      chatId: CHAT,
      mode: "character",
      subjectCharacterId: SUBJECT,
      timeZone: kathmandu,
    });
    expect(result).toEqual(EXTRACTED);
  });

  test("an absent subject is omitted and an unknown zone reads as UTC", async () => {
    const extractPrompt = vi.fn<ImageryService["extractPrompt"]>(async () => EXTRACTED);

    await caller(extractingContext(extractPrompt)).imagery.extractPrompt({ chatId: CHAT, mode: "scenario", timeZone: "Mars/Olympus_Mons" });

    expect(extractPrompt).toHaveBeenCalledWith({ caller: expect.objectContaining({ userId: HOST }), chatId: CHAT, mode: "scenario", timeZone: UTC_TIME_ZONE });
  });

  test("free mode has nothing to extract: BAD_REQUEST, and the verb never runs", async () => {
    const extractPrompt = vi.fn<ImageryService["extractPrompt"]>(async () => EXTRACTED);

    await expect(
      caller(extractingContext(extractPrompt)).imagery.extractPrompt({
        chatId: CHAT,
        // biome-ignore lint/suspicious/noExplicitAny: deliberately off-schema — free is the one mode the wire excludes.
        // @orb-waive no-test-fabrication(any): deliberate excluded mode proves the wire schema refuses it before the verb; ends when the caller accepts unknown input directly.
        mode: "free" as any,
        timeZone: UTC_TIME_ZONE,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(extractPrompt).not.toHaveBeenCalled();
  });
});
