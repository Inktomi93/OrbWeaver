// substrate/card-merge — the edit-in-place merge. Load-bearing: `undefined` KEEPS, `null` CLEARS (the
// distinction is what makes a deliberate field-clear work), always-a-list columns clear to `[]`, and
// flagEdits only carries the identity flags actually present.

import type { CharacterCard, UpdateCharacterInput } from "@orb/contracts/character";
import { describe } from "vitest";
import { flagEdits, mergeCard } from "../../../../../packages/server/src/domain/character/substrate/card-merge.ts";
import { buildGroupCard } from "../../../../../packages/server/src/domain/character/substrate/group-character.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function base(): CharacterCard {
  return {
    ...buildGroupCard(),
    name: "Base",
    description: "before",
    personality: "stoic",
    greetings: [{ text: "hello" }],
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
    // D44 §12.0 — the render-trust flag rides the SAME present-only carry (null clears, not dropped).
    expect(flagEdits({ trustHtml: null } as UpdateCharacterInput)).toEqual({ trustHtml: null });
    expect(flagEdits({ trustHtml: true } as UpdateCharacterInput)).toEqual({ trustHtml: true });
    // D44 §12.1/§12.5 — the per-character theme override rides the SAME present-only carry.
    expect(flagEdits({ themeOverride: null } as UpdateCharacterInput)).toEqual({
      themeOverride: null,
    });
    expect(flagEdits({ themeOverride: { accent: "oklch(0.7 0.14 250)" } } as UpdateCharacterInput)).toEqual({
      themeOverride: { accent: "oklch(0.7 0.14 250)" },
    });
    expect(flagEdits({} as UpdateCharacterInput)).not.toHaveProperty("themeOverride");
  });
});
