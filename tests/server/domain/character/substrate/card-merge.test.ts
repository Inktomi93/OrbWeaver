// substrate/card-merge — the edit-in-place merge. Load-bearing: `undefined` KEEPS, `null` CLEARS (the
// distinction is what makes a deliberate field-clear work), always-a-list columns clear to `[]`, and
// flagEdits only carries the identity flags actually present.

import type { CharacterCard, UpdateCharacterInput } from "@orb/contracts/character";
import { describe } from "vitest";
import {
  flagEdits,
  mergeCard,
} from "../../../../../packages/server/src/domain/character/substrate/card-merge.ts";
import { buildGroupCard } from "../../../../../packages/server/src/domain/character/substrate/group-character.ts";
import { expect, test } from "../../../../support/fixtures";

function base(): CharacterCard {
  return {
    ...buildGroupCard(),
    name: "Base",
    description: "before",
    personality: "stoic",
    greetings: ["hello"],
  };
}

describe("mergeCard", () => {
  test("an omitted field is kept; a provided value overrides", () => {
    const next = mergeCard(base(), { description: "after" } as UpdateCharacterInput);
    expect(next.description).toBe("after");
    expect(next.personality).toBe("stoic");
  });

  test("null clears a nullable field", () => {
    const next = mergeCard(base(), { personality: null } as UpdateCharacterInput);
    expect(next.personality).toBeNull();
  });

  test("null clears an always-a-list column to []", () => {
    const next = mergeCard(base(), { greetings: null } as UpdateCharacterInput);
    expect(next.greetings).toEqual([]);
  });
});

describe("flagEdits", () => {
  test("only carries the identity flags actually present", () => {
    expect(flagEdits({ starred: true } as UpdateCharacterInput)).toEqual({ starred: true });
    expect(flagEdits({} as UpdateCharacterInput)).toEqual({});
    expect(flagEdits({ forbidExternalMedia: null } as UpdateCharacterInput)).toEqual({
      forbidExternalMedia: null,
    });
  });
});
