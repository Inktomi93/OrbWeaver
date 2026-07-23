// verb: captionAvatar (internal) — the multimodal caption step (imagery-design/02 §3). Captions the subject's
// avatar via the ONE vision op; returns null when there's nothing to caption (no subject / no avatar) so the
// caller falls back to text extraction. Empty caption after processReply → PromptExtractionFailedError.

import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createCaptionAvatar } from "../../../../../packages/server/src/domain/imagery/verbs/caption-avatar.ts";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { fakeCard, makeHarness, principal, seedOwner } from "../_support";

describe("createCaptionAvatar", () => {
  test("captions the subject's avatar (reads the avatar bytes, returns keywords + cost)", async () => {
    const db = await freshDb();
    const owner = await seedOwner(db, "owner");
    const h = makeHarness(db);

    const result = await createCaptionAvatar(h.ctx)({ caller: principal(owner), mode: "character_multimodal", subjectCharacterId: castId("character_aria") });

    expect(h.readAssetCalls).toHaveLength(1);
    expect(h.captionInstructions).toHaveLength(1);
    expect(result).toEqual({ prompt: "caption alpha, caption beta", costUsd: 0.003 });
  });

  test("returns null when there is no subject (caller falls back to text extraction)", async () => {
    const db = await freshDb();
    const owner = await seedOwner(db, "owner");
    const h = makeHarness(db);

    const result = await createCaptionAvatar(h.ctx)({ caller: principal(owner), mode: "face_multimodal", subjectCharacterId: undefined });

    expect(result).toBeNull();
    expect(h.captionInstructions).toHaveLength(0);
  });

  test("returns null when the subject has no avatar", async () => {
    const db = await freshDb();
    const owner = await seedOwner(db, "owner");
    const h = makeHarness(db, { getCard: () => Promise.resolve(fakeCard(null)) });

    const result = await createCaptionAvatar(h.ctx)({ caller: principal(owner), mode: "character_multimodal", subjectCharacterId: castId("character_aria") });

    expect(result).toBeNull();
    expect(h.readAssetCalls).toHaveLength(0);
  });

  test("an empty caption raises PromptExtractionFailedError", async () => {
    const db = await freshDb();
    const owner = await seedOwner(db, "owner");
    const h = makeHarness(db, { captionImage: () => Promise.resolve({ text: "()[]{}", costUsd: 0.001 }) });

    await expect(
      createCaptionAvatar(h.ctx)({ caller: principal(owner), mode: "face_multimodal", subjectCharacterId: castId("character_aria") }),
    ).rejects.toThrow();
  });
});
