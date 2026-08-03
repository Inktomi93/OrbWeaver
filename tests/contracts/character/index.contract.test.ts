import type { CharacterCard } from "@orb/contracts/character";
import {
  CHARA_CARD_V3_SPEC,
  CHARACTER_LIST_SORTS,
  cardDepthPromptSchema,
  characterCardSchema,
  characterCardV3Schema,
  characterListCursorSchema,
  characterListSortSchema,
  createCharacterSchema,
  updateCharacterSchema,
} from "@orb/contracts/character";
import type { RegexScriptCard } from "@orb/contracts/regex";
import { SubstituteFindRegex } from "@orb/kit/regex";
import { expect, test } from "../../support/fixtures.ts";

// A fully-specified regex script (every field present) so `parse` is an identity on the card → the card
// round-trips byte-for-byte. Mirrors the regex node's own FULL_SCRIPT fixture (no high-entropy literals).
const FULL_SCRIPT: RegexScriptCard = {
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
};

// An APP-AUTHORED canonical card with NO `raw` blob — every promotion (creator / cardVersion / extensions)
// is a typed field, and `regexScripts` is the card-WIRE lift slot (D121-E — never a column). This is the §7.3 lossiness fix: an app-authored card carries the same typed
// columns an imported one would, so it round-trips identically. Every field is fully specified so `parse` is
// an identity (round-trip holds). Note: NO `character_version`, NO `currentVersionId`, NO `raw`.
const APP_CARD: CharacterCard = {
  name: "Aria the Archivist",
  description: "A meticulous keeper of records.",
  personality: "precise, dry-humoured, loyal",
  scenario: "The dusty stacks of a forgotten library.",
  greetings: [{ text: "Welcome to the archive." }, { text: "Back again? The stacks missed you." }],
  exampleMessages: "{{user}}: hello\n{{char}}: Records indicate we have not met.",
  systemPrompt: "Stay in character as a librarian.",
  postHistoryInstructions: "Never break character.",
  depthPrompt: { prompt: "Aria adjusts her spectacles.", depth: 4, role: "system" },
  creatorNotes: "Built for the archive demo.",
  creator: "studio",
  cardVersion: "1.2",
  nickname: "Aria",
  source: ["https://example.test/aria"],
  creationDate: 1_700_000_000,
  modificationDate: 1_700_100_000,
  // The ST card-WIRE lift slot (D121-E) — present because this fixture models a card as it arrives from /
  // leaves the serde boundary. The DOMAIN's projection of the same character omits it.
  regexScripts: [FULL_SCRIPT],
  extensions: { favColor: "ink-black" },
  residualData: null,
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
  expect(parsed.regexScripts?.[0]?.name).toBe(FULL_SCRIPT.name);
});

// D121-E: `regexScripts` is the OPTIONAL serde-boundary slot, not card content — a parsed card carries it
// when the wire did (import) and the DOMAIN's card projection omits it entirely (a character's scripts are
// `character_regex_scripts` junction rows). Both arms are pinned here.
test("regexScripts rides the card WIRE as an optional RegexScriptCard[]", () => {
  const parsed = characterCardSchema.parse(APP_CARD);
  const scripts: readonly RegexScriptCard[] | undefined = parsed.regexScripts;
  expect(scripts).toHaveLength(1);
  expect(scripts?.[0]?.placement).toEqual(FULL_SCRIPT.placement);
});

test("a card with NO regexScripts key parses — the field is the lift slot, never required content", () => {
  const { regexScripts: _omitted, ...withoutScripts } = APP_CARD;
  const parsed = characterCardSchema.parse(withoutScripts);
  expect(parsed.regexScripts).toBeUndefined();
});

// ── ONE schema for both front doors (§7.3 inv 3): the CRUD wire AND the import normalizer's output ──
test("createCharacterSchema validates an app-authored CRUD payload", () => {
  const created = createCharacterSchema.parse({
    handle: "aria-archivist",
    name: "Aria the Archivist",
    description: "A meticulous keeper of records.",
    greetings: [{ text: "Welcome to the archive." }],
    depthPrompt: { prompt: "Aria adjusts her spectacles.", depth: 4, role: "system" },
    creator: "studio",
    cardVersion: "1.2",
    extensions: { favColor: "ink-black" },
  });
  expect(created.handle).toBe("aria-archivist");
  // D121-E: the CREATE input has NO regexScripts slot — the import path reads them off the parsed CARD and
  // hands them to the regex domain's lift op, so a character is never created carrying scripts by value.
  expect("regexScripts" in created).toBe(false);
});

test("the SAME createCharacterSchema validates an import-normalized payload (no parallel card schema)", () => {
  // What the tolerant IN adapter produces after normalizing messy real-world JSON into the one shape.
  const normalized = {
    handle: "imported-card",
    name: "Imported Card",
    description: "",
    personality: null,
    greetings: [{ text: "hi" }],
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
    trustHtml: null,
  });
  expect(parsed.starred).toBe(true);
  expect(parsed.forbidExternalMedia).toBeNull();
  // D44 §12.0 — the render-trust override is the same tri-state (null = inherit the deployment default).
  expect(parsed.trustHtml).toBeNull();
  // Card content is omittable on update.
  expect(parsed.name).toBeUndefined();
});

// ── depthPrompt write guard (D66-B, W5 ruling A: prefill-reject REMOVED) ──
// The assistant@depth-0 WRITE-reject is gone — authored prefill is persistable; SHAPE normalizes it at
// delivery on a `assistantPrefill:false` model. The write schema keeps only shape validation.
test("cardDepthPromptSchema ACCEPTS an assistant-role note at depth 0 (normalized at SHAPE delivery, D66-B)", () => {
  const prefill = { prompt: "prefilled line", depth: 0, role: "assistant" };
  expect(cardDepthPromptSchema.safeParse(prefill).success).toBe(true);
  // The same note at depth 1 stays valid.
  const ok = { prompt: "prefilled line", depth: 1, role: "assistant" };
  expect(cardDepthPromptSchema.safeParse(ok).success).toBe(true);
  // system role at depth 0 stays valid.
  const sys = { prompt: "a note", depth: 0, role: "system" };
  expect(cardDepthPromptSchema.safeParse(sys).success).toBe(true);
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

test("characterCardV3Schema is a V2/V3 superset — accepts BOTH spec markers, rejects an unknown one", () => {
  // biome-ignore-start lint/style/useNamingConvention: ST Character-Card wire field names (snake_case)
  const data = {
    name: "Aria",
    description: "",
    personality: "",
    scenario: "",
    first_mes: "",
    mes_example: "",
    system_prompt: "",
    post_history_instructions: "",
    creator: "",
    creator_notes: "",
    character_version: "",
    alternate_greetings: [],
    tags: [],
    extensions: {},
  };
  // A V2-spec card validates against the (superset) wire schema — V2 IS V3 with the extras absent.
  expect(characterCardV3Schema.safeParse({ spec: "chara_card_v2", spec_version: "2.0", data }).success).toBe(true);
  expect(characterCardV3Schema.safeParse({ spec: "chara_card_v3", spec_version: "3.0", data }).success).toBe(true);
  // A genuinely-unknown spec marker is still rejected at the boundary.
  expect(characterCardV3Schema.safeParse({ spec: "chara_card_v9", spec_version: "9.0", data }).success).toBe(false);
  // biome-ignore-end lint/style/useNamingConvention: ST Character-Card wire field names (snake_case)
});

test("characterCardV3DataSchema carries the V3-additive fields (a V2 card omits them cleanly)", () => {
  // biome-ignore-start lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)
  const parsed = characterCardV3Schema.parse({
    spec: CHARA_CARD_V3_SPEC,
    spec_version: "3.0",
    data: {
      name: "Aria",
      description: "",
      personality: "",
      scenario: "",
      first_mes: "",
      mes_example: "",
      system_prompt: "",
      post_history_instructions: "",
      creator: "",
      creator_notes: "",
      character_version: "",
      alternate_greetings: [],
      tags: [],
      extensions: {},
      nickname: "Ari",
      source: ["https://example.com/aria"],
      group_only_greetings: ["*waves to the group*"],
      creator_notes_multilingual: { en: "hi", fr: "salut" },
      creation_date: 1_700_000_000,
      modification_date: 1_700_000_100,
      assets: [{ type: "icon", uri: "ccdefault:", name: "main", ext: "png" }],
    },
  });
  expect(parsed.data.nickname).toBe("Ari");
  expect(parsed.data.assets).toEqual([{ type: "icon", uri: "ccdefault:", name: "main", ext: "png" }]);
  expect(parsed.data.group_only_greetings).toEqual(["*waves to the group*"]);
  // biome-ignore-end lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)
});

// ── the library-list sort axis + its sort-discriminated keyset cursor (FIX #2 / §4.5) ──
test("characterListSortSchema accepts every sort and rejects an unknown one", () => {
  for (const sort of CHARACTER_LIST_SORTS) {
    expect(characterListSortSchema.safeParse(sort).success).toBe(true);
  }
  expect(characterListSortSchema.safeParse("bogus").success).toBe(false);
  // Largest/Smallest cards ARE on the axis now — backed by the `characters.token_size` denorm column (a
  // keyset ORDER BY needs a persisted column, not the post-query estimate).
  expect(characterListSortSchema.safeParse("largestCards").success).toBe(true);
  // The tuple IS the axis (no drift): the owner-ruled 9 (§4.5).
  expect([...CHARACTER_LIST_SORTS]).toEqual(["recent", "alpha", "starred", "newest", "oldest", "mostChats", "fewestChats", "largestCards", "smallestCards"]);
});

// A well-formed character TypeID (26-char Crockford-base32 suffix) — the cursor `id` is `typeIdSchema`-gated.

const CHAR_ID = "character_01h455vb4pex5vsknk084sn02q";

test("characterListCursorSchema parses each sort variant (recent carries a nullable lastChattedAt)", () => {
  const recent = characterListCursorSchema.parse({
    sort: "recent",
    lastChattedAt: null, // never-chatted boundary (the NULLS-LAST tail)
    createdAt: 1_750_000_000_000,
    id: CHAR_ID,
  });
  expect(recent.sort).toBe("recent");
  const alpha = characterListCursorSchema.parse({ sort: "alpha", name: "Ada", id: CHAR_ID });
  expect(alpha.sort).toBe("alpha");
  const starred = characterListCursorSchema.parse({
    sort: "starred",
    starred: true,
    name: "Ada",
    id: CHAR_ID,
  });
  expect(starred.sort).toBe("starred");
  const newest = characterListCursorSchema.parse({
    sort: "newest",
    createdAt: 1_750_000_000_000,
    id: CHAR_ID,
  });
  expect(newest.sort).toBe("newest");
  const oldest = characterListCursorSchema.parse({
    sort: "oldest",
    createdAt: 1_700_000_000_000,
    id: CHAR_ID,
  });
  expect(oldest.sort).toBe("oldest");
  // most/fewestChats carry a NULLABLE chatCount (null = the never-chatted NULLS-LAST tail).
  const mostChats = characterListCursorSchema.parse({
    sort: "mostChats",
    chatCount: 12,
    id: CHAR_ID,
  });
  expect(mostChats.sort).toBe("mostChats");
  const fewestChats = characterListCursorSchema.parse({
    sort: "fewestChats",
    chatCount: null,
    id: CHAR_ID,
  });
  expect(fewestChats.sort).toBe("fewestChats");
  // largest/smallestCards carry a NON-null tokenSize (the notNull `characters.token_size` denorm column).
  const largest = characterListCursorSchema.parse({
    sort: "largestCards",
    tokenSize: 2048,
    id: CHAR_ID,
  });
  expect(largest.sort).toBe("largestCards");
  const smallest = characterListCursorSchema.parse({
    sort: "smallestCards",
    tokenSize: 0,
    id: CHAR_ID,
  });
  expect(smallest.sort).toBe("smallestCards");
});

test("characterListCursorSchema rejects a cross-sort shape (an alpha cursor missing recent's keys)", () => {
  // `sort:"recent"` demands lastChattedAt + createdAt — an alpha-shaped payload can't satisfy it.
  expect(characterListCursorSchema.safeParse({ sort: "recent", name: "Ada", id: CHAR_ID }).success).toBe(false);
  // `mostChats` demands `chatCount` — a bare id can't satisfy it.
  expect(characterListCursorSchema.safeParse({ sort: "mostChats", id: CHAR_ID }).success).toBe(false);
  // An unknown discriminant is rejected outright.
  expect(characterListCursorSchema.safeParse({ sort: "bogus", id: CHAR_ID }).success).toBe(false);
});
