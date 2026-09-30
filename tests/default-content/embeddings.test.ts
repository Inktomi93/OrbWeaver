import { createHash } from "node:crypto";
import { EMBED_SPACE_DIMS } from "@orb/contracts/inference";
import { findSeedEmbedding, readSeedAvatar } from "@orb/default-content";
import { DEFAULT_EMBED_MODEL, localLightEmbedSpaceTag } from "@orb/inference";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { buildCardEmbedText, DEFAULT_CHARACTER_CARDS } from "@orb/server/domain/character";
import { expect, test } from "../support/fixtures.ts";

const SPACE = localLightEmbedSpaceTag(DEFAULT_EMBED_MODEL, "q8");
const hash = (content: string | Uint8Array): string => createHash("sha256").update(content).digest("hex");

test("every shipped card projection and avatar has a complete normalized vector in the default space", async () => {
  const sources: { kind: string; content: string | Uint8Array }[] = DEFAULT_CHARACTER_CARDS.map(({ input }) => ({
    kind: "card-text",
    content: buildCardEmbedText({
      name: input.name,
      description: input.description ?? null,
      personality: input.personality ?? null,
      scenario: input.scenario ?? null,
      greetings: input.greetings ?? [],
    }),
  }));
  for (const handle of [...DEFAULT_CHARACTER_CARDS.map(({ input }) => input.handle), castId<CharacterHandle>("persona-you")]) {
    const avatar = await readSeedAvatar(handle);
    if (avatar === null) {
      throw new Error(`Missing avatar ${handle}`);
    }
    sources.push({ kind: "image-raw", content: avatar.bytes });
  }
  for (const source of sources) {
    const digest = hash(source.content);
    const found = findSeedEmbedding(digest, SPACE, source.kind);
    expect(found, `${source.kind}:${digest}`).not.toBeNull();
    expect(found?.vector.length).toBe(EMBED_SPACE_DIMS);
    expect(found?.vector.every(Number.isFinite)).toBe(true);
    expect(found?.vector.reduce((sum, value) => sum + value * value, 0)).toBeCloseTo(1);
    expect(findSeedEmbedding(`${digest}-edited`, SPACE, source.kind)).toBeNull();
    expect(findSeedEmbedding(digest, `${SPACE}-different`, source.kind)).toBeNull();
    expect(findSeedEmbedding(digest, SPACE, "image-captioned")).toBeNull();
  }
});
