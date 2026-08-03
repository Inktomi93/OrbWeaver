// The authored default-card pack is BORN VALID: every card in `DEFAULT_CHARACTER_CARDS` is parsed through
// the same schemas the tRPC boundary uses (createCharacterSchema for the card body, themeOverrideSchema +
// themeBackgroundSchema for the carried presentation), so a hand-authored pack edit can never ship a card
// the create verb would reject or a background/theme blob the boundary would silently degrade.
// Also pins the pack's own structural invariants: unique handles, the welcome-slot handle present,
// greetings[0] is NEVER groupOnly (the first message is always solo-eligible), tags present, and each card's
// seeded background slug EXISTS in the one seeded-background catalog (the card ↔ catalog coupling).

import { createCharacterSchema } from "@orb/contracts/character";
import { CARD_EMBEDDABLE_THEME_KEYS, listSeededBackgrounds, themeBackgroundSchema, themeOverrideSchema } from "@orb/contracts/theme";
import { DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "@orb/server/domain/character";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const CATALOG_IDS = new Set(listSeededBackgrounds().map((b) => b.id));
const EMBEDDABLE = new Set<string>(CARD_EMBEDDABLE_THEME_KEYS);

// Every palette field a card is expected to author. The pack's palettes used to be pinned byte-equal to the
// `@orb/ui` value-sets of the same name (seed-theme-pairing's "third copy"); those value-sets were retired
// with the picker curation (TD/O-9), so the CARD is now the only copy and there is nothing to pair against.
// What survives as a real invariant is COMPLETENESS: a palette missing a field is a hole the room takeover
// fills from the viewer's theme, which reads as a half-dressed character rather than an authored look.
const REQUIRED_PALETTE_FIELDS = [
  "accent",
  "speaker",
  "dialogueColor",
  "narrationColor",
  "bodyColor",
  "background",
  "userBubble",
  "aiBubble",
  "systemBubble",
  "font",
  "radius",
] as const;

describe("DEFAULT_CHARACTER_CARDS — the authored pack parses at the write boundary", () => {
  for (const card of DEFAULT_CHARACTER_CARDS) {
    const { handle } = card.input;

    test(`${handle}: the card body parses through createCharacterSchema`, () => {
      const parsed = createCharacterSchema.safeParse(card.input);
      expect(parsed.success ? null : parsed.error.issues, `${handle} create input`).toBeNull();
    });

    test(`${handle}: greetings[0] is never groupOnly + every greeting carries text`, () => {
      const greetings = card.input.greetings ?? [];
      expect(greetings.length, `${handle} has at least one greeting`).toBeGreaterThan(0);
      expect(greetings[0]?.groupOnly, `${handle} first message must be solo-eligible`).not.toBe(true);
      for (const [index, greeting] of greetings.entries()) {
        expect(greeting.text.trim().length, `${handle} greeting ${index} is non-empty`).toBeGreaterThan(0);
      }
    });

    test(`${handle}: the carried presentation parses + points at a real seeded background`, () => {
      const theme = themeOverrideSchema.safeParse(card.presentation.themeOverride);
      expect(theme.success, `${handle} themeOverride`).toBe(true);
      // A lenient schema degrades a bad field to undefined rather than failing — so assert the parsed
      // ROUND-TRIP still carries every authored value (a dropped colour would be a silent palette hole).
      expect(theme.success ? theme.data : null, `${handle} themeOverride survives the clamp`).toEqual(card.presentation.themeOverride);

      const background = themeBackgroundSchema.safeParse(card.presentation.backgroundOverride);
      expect(background.success, `${handle} backgroundOverride`).toBe(true);
      expect(background.success ? background.data.kind : null, `${handle} background kind`).toBe("seeded");
      const slug = background.success ? background.data.seededId : "";
      expect(slug, `${handle} background slug`).toBe(`${handle}-bg`);
      expect(CATALOG_IDS.has(slug), `${slug} exists in listSeededBackgrounds()`).toBe(true);
    });

    test(`${handle}: authors a COMPLETE palette, and only card-embeddable keys`, () => {
      const override = card.presentation.themeOverride ?? {};
      for (const field of REQUIRED_PALETTE_FIELDS) {
        expect(override[field], `${handle} palette carries ${field}`).toBeDefined();
      }
      // A card may not author a viewer-sacred key (TD §3): every consumption seam strips it, so a value
      // here would be a dead value the pack claims to set. The partition is the authority, not a list.
      for (const key of Object.keys(override)) {
        expect(EMBEDDABLE.has(key), `${handle} palette key ${key} is card-embeddable`).toBe(true);
      }
    });

    test(`${handle}: ships author tags + the pack's fixed provenance`, () => {
      expect(card.tags.length, `${handle} tags`).toBeGreaterThan(0);
      expect(card.input.creator).toBe("orbweaver");
      expect(card.input.cardVersion).toBe("1.0.0");
      // Prompt posture is preset-owned in orbweaver — an authored card never overrides the main prompt.
      expect(card.input.systemPrompt, `${handle} systemPrompt`).toBeNull();
    });
  }

  test("handles are unique and include the welcome slot", () => {
    const handles = DEFAULT_CHARACTER_CARDS.map((c) => c.input.handle);
    expect(new Set(handles).size).toBe(handles.length);
    expect(handles).toContain(WELCOME_ASSISTANT_HANDLE);
  });

  test("the purged CardRefinery meta-cards are gone from the pack", () => {
    const handles = DEFAULT_CHARACTER_CARDS.map((c) => c.input.handle);
    expect(handles).not.toContain("rev-card-refinery");
    expect(handles).not.toContain("mara-soul-check");
  });
});
