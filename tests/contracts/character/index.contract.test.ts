import type { CharacterCard } from "@orb/contracts/character";
import {
  CHARA_CARD_V3_SPEC,
  cardDepthPromptWriteSchema,
  characterCardSchema,
  characterCardV3Schema,
  createCharacterSchema,
  updateCharacterSchema,
} from "@orb/contracts/character";
import type { RegexScript } from "@orb/contracts/regex";
import { SubstituteFindRegex } from "@orb/kit/regex";
import { expect, test } from "../../support/fixtures";

// A fully-specified regex script (every field present) so `parse` is an identity on the card → the card
// round-trips byte-for-byte. Mirrors the regex node's own FULL_SCRIPT fixture (no high-entropy literals).
const FULL_SCRIPT: RegexScript = {
  id: "script_brackets",
  name: "Wrap cat in asterisks",
  findRegex: "\\bcat\\b",
  replaceString: "*cat*",
  placement: ["AI_OUTPUT"],
  enabled: true,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: ["the "],
  substituteRegex: SubstituteFindRegex.none,
  minDepth: null,
  maxDepth: null,
};

// An APP-AUTHORED canonical card with NO `raw` blob — every promotion (creator / cardVersion / regexScripts /
// extensions) is a typed field. This is the §7.3 lossiness fix: an app-authored card carries the same typed
// columns an imported one would, so it round-trips identically. Every field is fully specified so `parse` is
// an identity (round-trip holds). Note: NO `character_version`, NO `currentVersionId`, NO `raw`.
const APP_CARD: CharacterCard = {
  name: "Aria the Archivist",
  description: "A meticulous keeper of records.",
  personality: "precise, dry-humoured, loyal",
  scenario: "The dusty stacks of a forgotten library.",
  greetings: ["Welcome to the archive.", "Back again? The stacks missed you."],
  exampleMessages: "{{user}}: hello\n{{char}}: Records indicate we have not met.",
  systemPrompt: "Stay in character as a librarian.",
  postHistoryInstructions: "Never break character.",
  depthPrompt: { prompt: "Aria adjusts her spectacles.", depth: 4, role: "system" },
  creatorNotes: "Built for the archive demo.",
  creator: "studio",
  cardVersion: "1.2",
  regexScripts: [FULL_SCRIPT],
  extensions: { favColor: "ink-black" },
  avatarAssetId: null,
  refinery: { score: 87, analysis: { tone: "consistent" } },
};

test("the canonical card round-trips an app-authored card byte-for-byte (no raw blob)", () => {
  const parsed = characterCardSchema.parse(APP_CARD);
  expect(parsed).toEqual(APP_CARD);
});

test("the canonical card carries no version provenance — no character_version / currentVersionId / raw", () => {
  const parsed = characterCardSchema.parse(APP_CARD);
  // The freeform version string lives on the typed `cardVersion` field …
  expect(parsed.cardVersion).toBe("1.2");
  // … and the retired version-table keys are absent from the shape (the §7.3 lossiness fix).
  expect("character_version" in parsed).toBe(false);
  expect("currentVersionId" in parsed).toBe(false);
  expect("raw" in parsed).toBe(false);
  // The promotions are typed fields, not stashed in a residual blob.
  expect(parsed.regexScripts[0]?.id).toBe(FULL_SCRIPT.id);
});

test("regexScripts accepts a RegexScript[] typed column", () => {
  const parsed = characterCardSchema.parse(APP_CARD);
  const scripts: RegexScript[] = parsed.regexScripts;
  expect(scripts).toHaveLength(1);
  expect(scripts[0]?.placement).toEqual(["AI_OUTPUT"]);
});

// ── ONE schema for both front doors (§7.3 inv 3): the CRUD wire AND the import normalizer's output ──
test("createCharacterSchema validates an app-authored CRUD payload", () => {
  const created = createCharacterSchema.parse({
    handle: "aria-archivist",
    name: "Aria the Archivist",
    description: "A meticulous keeper of records.",
    greetings: ["Welcome to the archive."],
    depthPrompt: { prompt: "Aria adjusts her spectacles.", depth: 4, role: "system" },
    creator: "studio",
    cardVersion: "1.2",
    regexScripts: [FULL_SCRIPT],
    extensions: { favColor: "ink-black" },
  });
  expect(created.handle).toBe("aria-archivist");
  expect(created.regexScripts?.[0]?.id).toBe(FULL_SCRIPT.id);
});

test("the SAME createCharacterSchema validates an import-normalized payload (no parallel card schema)", () => {
  // What the tolerant IN adapter produces after normalizing messy real-world JSON into the one shape.
  const normalized = {
    handle: "imported-card",
    name: "Imported Card",
    description: "",
    personality: null,
    greetings: ["hi"],
    creator: "someone-else",
    cardVersion: "0.9",
    regexScripts: [],
    extensions: null,
  };
  expect(createCharacterSchema.safeParse(normalized).success).toBe(true);
});

test("createCharacterSchema rejects a missing required name", () => {
  const bad = { handle: "no-name", description: "x" };
  expect(createCharacterSchema.safeParse(bad).success).toBe(false);
});

test("updateCharacterSchema makes content optional and adds the identity-only flags", () => {
  const parsed = updateCharacterSchema.parse({
    starred: true,
    archived: false,
    forbidExternalMedia: null,
  });
  expect(parsed.starred).toBe(true);
  expect(parsed.forbidExternalMedia).toBeNull();
  // Card content is omittable on update.
  expect(parsed.name).toBeUndefined();
});

// ── depthPrompt write guard (D32 prefill rejection) ──
test("cardDepthPromptWriteSchema rejects an assistant-role note at depth 0 (response prefill)", () => {
  const prefill = { prompt: "prefilled line", depth: 0, role: "assistant" };
  expect(cardDepthPromptWriteSchema.safeParse(prefill).success).toBe(false);
  // The same note at depth 1 is accepted.
  const ok = { prompt: "prefilled line", depth: 1, role: "assistant" };
  expect(cardDepthPromptWriteSchema.safeParse(ok).success).toBe(true);
  // system role at depth 0 is fine.
  const sys = { prompt: "a note", depth: 0, role: "system" };
  expect(cardDepthPromptWriteSchema.safeParse(sys).success).toBe(true);
});

// ── ST V3 wire schema (serde pivot) ──
test("characterCardV3Schema parses a valid V3 card with an embedded character_book", () => {
  // biome-ignore-start lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)
  const v3 = {
    spec: CHARA_CARD_V3_SPEC,
    spec_version: "3.0",
    data: {
      name: "Aria",
      description: "keeper of records",
      personality: "precise",
      scenario: "the stacks",
      first_mes: "Welcome.",
      mes_example: "",
      system_prompt: "",
      post_history_instructions: "",
      creator: "studio",
      creator_notes: "",
      character_version: "1.2",
      alternate_greetings: ["Back again?"],
      tags: ["library"],
      extensions: {},
      character_book: {
        entries: [
          {
            keys: ["archive"],
            content: "The archive holds every record.",
            enabled: true,
            insertion_order: 0,
          },
        ],
      },
    },
  };
  const parsed = characterCardV3Schema.parse(v3);
  expect(parsed.spec).toBe(CHARA_CARD_V3_SPEC);
  expect(parsed.data.character_book?.entries[0]?.keys).toEqual(["archive"]);
  // biome-ignore-end lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)
});

test("characterCardV3Schema rejects a wrong spec literal", () => {
  // biome-ignore lint/style/useNamingConvention: ST V3 wire field name (snake_case)
  const bad = { spec: "chara_card_v2", spec_version: "2.0", data: {} };
  expect(characterCardV3Schema.safeParse(bad).success).toBe(false);
});
