// The authored default-card pack is BORN VALID: every card in `DEFAULT_CHARACTER_CARDS` is parsed through
// the same schemas the tRPC boundary uses (createCharacterSchema for the card body, themeOverrideSchema +
// themeBackgroundSchema for the carried presentation), so a hand-authored pack edit can never ship a card
// the create verb would reject or a background/theme blob the boundary would silently degrade.
// Also pins the pack's own structural invariants: unique handles, the welcome-slot handle present,
// greetings[0] is NEVER groupOnly (the first message is always solo-eligible) with at least one alternate
// beside it, tags present, lore that parses as a world book (D263 seeds it with the card), and each card's
// seeded background slug EXISTS in the one seeded-background catalog (the card ↔ catalog coupling).
//
// AND, SINCE #900, THE PACK'S DERIVED-FIELD PARITY. A seed row is a shape a REAL user receives, so any field
// it hand-authors that some derivation also answers gets pinned against THAT derivation, never against a
// second copy of the expected value:
//   · `characterProvenanceOf` over the row this pack produces must answer `shipped` — the Origin readout's
//     whole verdict, and the #843 defect ("Made here" on all ten shipped cards) re-armed as a per-card pin.
//     Its input `source` must stay null: an upstream provenance-URL list on a card reading `shipped` is the
//     impossible pair #893 found in the client fixture, one layer down.
//   · The carried background must be CANONICAL — `canonicalBackgroundSource` is idempotent on it and the
//     parse drops nothing — so the pack ships the byte-shape the write boundary produces and cannot smuggle
//     an asset reference onto a non-asset kind (the GC-root hazard).
// THESE PASS ON THE UNMODIFIED PACK and are therefore FENCES, not defect proofs: today's pack is correct and
// the pins are what keep the next hand-edit from quietly minting a row the server cannot.

import { AUTHORED_CARD_CREATOR, characterProvenanceOf, createCharacterSchema } from "@orb/contracts/character";
import { CARD_EMBEDDABLE_THEME_KEYS, themeOverrideSchema } from "@orb/contracts/theme";
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import { SEED_BACKGROUND_PLATES } from "@orb/default-content";
import { DEFAULT_CHARACTER_CARDS, WELCOME_ASSISTANT_HANDLE } from "@orb/server/domain/character";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const SHIPPED_PLATE_SLUGS = new Set(SEED_BACKGROUND_PLATES.map((plate) => plate.slug));
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
      // The first message plus at least one alternate: a new user's swipe on the opening always has somewhere to go.
      expect(greetings.length, `${handle} has at least two greetings`).toBeGreaterThanOrEqual(2);
      expect(greetings[0]?.groupOnly, `${handle} first message must be solo-eligible`).not.toBe(true);
      for (const [index, greeting] of greetings.entries()) {
        expect(greeting.text.trim().length, `${handle} greeting ${index} is non-empty`).toBeGreaterThan(0);
      }
    });

    test(`${handle}: ships lore that parses as a world book, with keyed, uniquely titled entries`, () => {
      const book = createBookSchema.safeParse({ name: card.lore.name, description: card.lore.description ?? undefined });
      expect(book.success ? null : book.error.issues, `${handle} lore book`).toBeNull();
      expect(card.lore.entries.length, `${handle} ships at least one lore entry`).toBeGreaterThan(0);
      for (const entry of card.lore.entries) {
        const parsed = createEntrySchema.safeParse(entry);
        expect(parsed.success ? null : parsed.error.issues, `${handle} lore entry ${entry.title}`).toBeNull();
        // A keyless entry fires on every turn; seeded lore fires only when the chat names what it concerns.
        expect(entry.keys.length, `${handle} lore entry ${entry.title} is keyed`).toBeGreaterThan(0);
      }
      // The lorebook import refuses duplicate titles, so a duplicate would fail the whole card's seed.
      const titles = card.lore.entries.map((entry) => entry.title);
      expect(new Set(titles).size, `${handle} lore entry titles are unique`).toBe(titles.length);
    });

    test(`${handle}: the carried presentation parses + points at a real seeded background`, () => {
      const theme = themeOverrideSchema.safeParse(card.presentation.themeOverride);
      expect(theme.success, `${handle} themeOverride`).toBe(true);
      // A lenient schema degrades a bad field to undefined rather than failing — so assert the parsed
      // ROUND-TRIP still carries every authored value (a dropped colour would be a silent palette hole).
      expect(theme.success ? theme.data : null, `${handle} themeOverride survives the clamp`).toEqual(card.presentation.themeOverride);

      // #900, RESTATED FOR OWNED PLATES (2026-09-18). The pack used to spell a whole `kind:"seeded"`
      // background here and this pin compared it against the static catalog. A plate is an OWNED asset now,
      // minted per user, so the pack CANNOT name the reference — only which plate — and the derivation the
      // pin protects is `<handle>-bg`. The reference itself is built by the seeder through
      // `canonicalBackgroundSource`, which is where the GC-smuggle guard moved with it.
      expect(card.backgroundSlug, `${handle} background slug`).toBe(`${handle}-bg`);
      expect(SHIPPED_PLATE_SLUGS.has(card.backgroundSlug ?? ""), `${handle}-bg is a plate @orb/default-content ships`).toBe(true);
      // The pack must NOT carry a background of its own: a hand-typed one would be a per-install asset
      // reference the pack has no way to own, which is exactly the shape this retirement removed.
      expect(Object.hasOwn(card.presentation, "backgroundOverride"), `${handle} presentation carries no background`).toBe(false);
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
      expect(card.input.creator).toBe(AUTHORED_CARD_CREATOR);
      expect(card.input.cardVersion).toBe("1.0.0");
      // Prompt posture is preset-owned in orbweaver — an authored card never overrides the main prompt.
      expect(card.input.systemPrompt, `${handle} systemPrompt`).toBeNull();
    });

    test(`${handle}: the ROW this card produces reads as \`shipped\` through the one derivation (#900/#843)`, () => {
      // The seeder creates through `characters.create`, which stores the input's `creator` verbatim and
      // leaves `importedFrom` null (no import path is involved) — so this IS the row the read seam sees.
      // Asserting the derivation rather than the literal is the point: `AUTHORED_CARD_CREATOR` could be
      // re-spelled and this pin would follow it, while a card that quietly dropped `creator` reds here.
      expect(characterProvenanceOf({ importedFrom: null, creator: card.input.creator ?? null }), `${handle} provenance`).toBe("shipped");
      // `source` is the V3 UPSTREAM provenance-URL list. A shipped card carrying one claims two different
      // origins at once — the impossible-pair class #893 found on the client's own provenance fixture.
      expect(card.input.source ?? null, `${handle} authors no upstream source`).toBeNull();
      expect(card.input.creationDate ?? null, `${handle} authors no creation date`).toBeNull();
      expect(card.input.modificationDate ?? null, `${handle} authors no modification date`).toBeNull();
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
