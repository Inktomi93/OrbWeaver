// substrate: imagery/identity-hash — the deterministic reuse key (imagery-design/03 §4.3). Proves the hash
// is stable for identical inputs and separates on each component (mode / characterId / contentHash), so an
// edited card (new contentHash) misses and an unchanged one hits.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { identityHashFor } from "../../../../../packages/server/src/domain/imagery/substrate/identity-hash";
import { expect, test } from "../../../../support/fixtures";

const HEX_64 = /^[0-9a-f]{64}$/;

describe("identityHashFor", () => {
  test("is a stable 64-char sha-256 hex for identical inputs", () => {
    const a = identityHashFor("character", castId<CharacterId>("character_aria"), "hash_v1");
    const b = identityHashFor("character", castId<CharacterId>("character_aria"), "hash_v1");
    expect(a).toBe(b);
    expect(a).toMatch(HEX_64);
  });

  test("a changed contentHash changes the key (edited card → miss → regenerate)", () => {
    const v1 = identityHashFor("character", castId<CharacterId>("character_aria"), "hash_v1");
    const v2 = identityHashFor("character", castId<CharacterId>("character_aria"), "hash_v2");
    expect(v1).not.toBe(v2);
  });

  test("the mode and the characterId are part of the key", () => {
    const base = identityHashFor("character", castId<CharacterId>("character_aria"), "hash_v1");
    expect(identityHashFor("face", castId<CharacterId>("character_aria"), "hash_v1")).not.toBe(base);
    expect(identityHashFor("character", castId<CharacterId>("character_bob"), "hash_v1")).not.toBe(base);
  });
});
