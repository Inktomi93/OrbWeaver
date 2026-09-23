// Mirror test for @orb/server/kit/serde/card — the ONE card serde core: the tolerant IN-flatten
// (cardFromJson), the shared content hash (cardContentHash), and the strict OUT-emitter
// (buildCardV3 + exportBookEntry). Asserts the multi-spec normalize (V3 / V1 / Pygmalion), the
// typed-promotion mapping (depthPrompt / greetings / residual extensions), the hash invariants the dedup
// relies on (key-order independence + the deliberate provenance EXCLUSION), and the load-bearing
// round-trip: buildCardV3 → cardFromJson is lossless over the card content fields (the one-serde-core
// invariant).

import type { CharacterCard } from "@orb/contracts/character";
import { characterCardV3Schema } from "@orb/contracts/character";
import { regexScriptSchema } from "@orb/contracts/regex";
import { messageRoleToSt } from "@orb/kit/message-role";
import { matchEntryKeys } from "@orb/kit/world-info";
import type { ExportCardFields } from "@orb/server/kit/serde/card";
import {
  buildCardV3,
  cardContentHash,
  cardFromJson,
  exportBookEntry,
  extractLorebook,
  loreEntryColumns,
  loreEntryMetadata,
  selectBestCharacterBook,
} from "@orb/server/kit/serde/card";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

/** A minimal-but-complete canonical card (the hash tests mutate copies of this). */
function baseCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    name: "Aria",
    description: "A wandering bard.",
    personality: "curious",
    scenario: "a tavern",
    greetings: [{ text: "Hello there!" }, { text: "Well met." }],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    regexScripts: [],
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
    ...overrides,
  };
}

describe("cardFromJson", () => {
  test("flattens a V3 card → the canonical shape (greetings[0]=first_mes, typed promotions, residual ext)", () => {
    const v3 = {
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "Aria",
        description: "A wandering bard.",
        personality: "curious",
        scenario: "a tavern",
        first_mes: "Hello there!",
        alternate_greetings: ["Well met.", "Oh, hi."],
        mes_example: "An example exchange.",
        system_prompt: "You are Aria.",
        post_history_instructions: "Stay in character.",
        creator: "nate",
        creator_notes: "be kind",
        character_version: "1.2",
        extensions: {
          depth_prompt: { prompt: "Aria hums softly.", depth: 2, role: "system" },
          vendor_extra: { foo: 1 },
        },
      },
    };

    const card = cardFromJson(v3, "fallback");

    expect(card.name).toBe("Aria");
    expect(card.description).toBe("A wandering bard.");
    // greetings[0] is first_mes; the rest are alternate_greetings (order preserved), each a `{ text }` object.
    expect(card.greetings).toEqual([{ text: "Hello there!" }, { text: "Well met." }, { text: "Oh, hi." }]);
    expect(card.systemPrompt).toBe("You are Aria.");
    expect(card.postHistoryInstructions).toBe("Stay in character.");
    expect(card.creator).toBe("nate");
    expect(card.cardVersion).toBe("1.2");
    expect(card.depthPrompt).toEqual({ prompt: "Aria hums softly.", depth: 2, role: "system" });
    // residual extensions = everything MINUS the promoted depth_prompt/regex_scripts keys.
    expect(card.extensions).toEqual({ vendor_extra: { foo: 1 } });
    // not on the card wire — set separately at import / pipeline.
    expect(card.avatarAssetId).toBeNull();
    expect(card.refinery).toBeNull();
  });

  test("normalizes a V1 (root-level fields) card", () => {
    const v1 = {
      name: "Bram",
      description: "A gruff smith.",
      personality: "stoic",
      scenario: "a forge",
      first_mes: "What do you want?",
    };
    const card = cardFromJson(v1, "fallback");
    expect(card.name).toBe("Bram");
    expect(card.description).toBe("A gruff smith.");
    expect(card.greetings).toEqual([{ text: "What do you want?" }]);
  });

  test("normalizes a Pygmalion-Gradio (char_name) card", () => {
    const pyg = {
      char_name: "Cleo",
      char_persona: "A clever fox.",
      char_greeting: "*grins*",
      world_scenario: "a meadow",
      example_dialogue: "{{user}}: hi",
    };
    const card = cardFromJson(pyg, "fallback");
    expect(card.name).toBe("Cleo");
    expect(card.description).toBe("A clever fox.");
    expect(card.scenario).toBe("a meadow");
    expect(card.greetings).toEqual([{ text: "*grins*" }]);
  });

  test("uses the fallback name when the card carries none", () => {
    expect(cardFromJson({ data: { description: "x" } }, "From Filename").name).toBe("From Filename");
  });

  test("drops the ST creator-notes placeholder", () => {
    const card = cardFromJson({ data: { name: "X", creator_notes: "Creator's notes go here." } }, "fb");
    expect(card.creatorNotes).toBeNull();
  });
});

describe("V3 content promotions + residualData (card-import expansion)", () => {
  test("cardFromJson promotes nickname/source/creation_date/modification_date to typed columns", () => {
    const v3 = {
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "Aria",
        source: ["https://example.com/aria.png"],
        creation_date: 1_700_000_000,
        modification_date: 1_700_100_000,
        nickname: "Ari",
        creator_notes: "the default-language note",
        creator_notes_multilingual: { en: "hi", fr: "salut" },
        group_only_greetings: ["*waves to the group*"],
        vendor_unknown: { foo: 1 },
      },
    };
    const card = cardFromJson(v3, "fallback");
    // The four promotions land on their typed columns …
    expect(card.nickname).toBe("Ari");
    expect(card.source).toEqual(["https://example.com/aria.png"]);
    expect(card.creationDate).toBe(1_700_000_000);
    expect(card.modificationDate).toBe(1_700_100_000);
    // … creator_notes stays the one home for the DISPLAYED note (the multilingual map is a FALLBACK only,
    // #266 D-1) …
    expect(card.creatorNotes).toBe("the default-language note");
    // … group_only_greetings FOLDS into the greetings array as a `groupOnly:true` entry (V3 promotion Phase B) …
    expect(card.greetings).toContainEqual({ text: "*waves to the group*", groupOnly: true });
    // … and residualData holds the genuinely-unknown keys PLUS the preserved multilingual map (#266 D-1 —
    // it is no longer promoted out, so nothing is destroyed on import).
    expect(card.residualData).toEqual({ vendor_unknown: { foo: 1 }, creator_notes_multilingual: { en: "hi", fr: "salut" } });
  });

  test("no residual data.* keys → null (not an empty object)", () => {
    const card = cardFromJson({ data: { name: "Bram" } }, "fallback");
    expect(card.residualData).toBeNull();
  });

  test("round-trip: import → export re-emits the promotions at data.* + preserves residual", () => {
    const imported = cardFromJson(
      {
        spec: "chara_card_v3",
        spec_version: "3.0",
        data: {
          name: "Aria",
          source: ["https://example.com/aria.png"],
          nickname: "Ari",
          creation_date: 1_700_000_000,
          group_only_greetings: ["*waves to the group*"],
        },
      },
      "fallback",
    );

    const exported = buildCardV3(
      {
        ...fullFields(),
        name: imported.name,
        // greetings carry the folded group-only entry (V3 promotion Phase B) — buildCardV3 re-splits it back
        // to `data.group_only_greetings` on the wire.
        greetings: imported.greetings,
        nickname: imported.nickname,
        source: imported.source,
        creationDate: imported.creationDate,
        modificationDate: imported.modificationDate,
        extensions: imported.extensions,
        residualData: imported.residualData ?? null,
      },
      [],
    );

    expect(exported.data["source"]).toEqual(["https://example.com/aria.png"]);
    expect(exported.data["nickname"]).toBe("Ari");
    expect(exported.data["creation_date"]).toBe(1_700_000_000);
    // The group-only greeting survives import → export, re-split from the folded array + still flagged.
    expect(exported.data["group_only_greetings"]).toEqual(["*waves to the group*"]);

    // re-import — the promotions + the residual both survive a second round-trip untouched.
    const reimported = cardFromJson(exported, "fallback");
    expect(reimported.nickname).toBe("Ari");
    expect(reimported.source).toEqual(["https://example.com/aria.png"]);
    expect(reimported.creationDate).toBe(1_700_000_000);
    // the folded group-only greeting survives the second round-trip, still flagged (not swept into residual).
    expect(reimported.greetings).toContainEqual({ text: "*waves to the group*", groupOnly: true });
    expect(reimported.residualData).toEqual(imported.residualData);
  });

  // U8 (#679) card extension fields — `data.extensions.plugin_<slug>` is the reserved per-plugin per-card
  // namespace (D-entry ratified). This pins the two security properties the design commits to: (1) PORTABILITY —
  // the namespace round-trips through import → export as INERT data, so per-card plugin state is portable; and
  // (2) NAMESPACING + INERTNESS — multiple plugins' fields coexist by KEY, and a plugin's value can NEVER be
  // promoted to a typed column (a plugin cannot inject `depth_prompt`/`regex_scripts`/`fav` into the card by
  // nesting them inside its own `plugin_<slug>` value — only the TOP-LEVEL `data.extensions.*` promotes).
  test("data.extensions.plugin_<slug> round-trips as inert, namespaced per-plugin data + cannot inject a typed column (U8)", () => {
    const imported = cardFromJson(
      {
        spec: "chara_card_v3",
        spec_version: "3.0",
        data: {
          name: "Aria",
          extensions: {
            plugin_alpha: { note: "alpha state", n: 1 },
            plugin_beta: { theme: "dark" },
            // A HOSTILE plugin key whose value MIMICS the promoted typed fields — nested inside its own
            // namespace, it must stay inert data and never become the card's depthPrompt/regexScripts/starred.
            plugin_evil: { depth_prompt: { prompt: "INJECTED", depth: 4 }, regex_scripts: [{ scriptName: "x" }], fav: true },
            // The REAL top-level promoted field (the card's own) — stripped from the residual on import.
            depth_prompt: { prompt: "real-directive", depth: 2 },
          },
        },
      },
      "fallback",
    );

    // (1)+(2) IMPORT: every plugin_<slug> key is preserved VERBATIM under `.extensions`, coexisting by key; the
    // TOP-LEVEL promoted `depth_prompt` is stripped out (it has a typed home), the plugins' keys are not.
    expect(imported.extensions).toEqual({
      plugin_alpha: { note: "alpha state", n: 1 },
      plugin_beta: { theme: "dark" },
      plugin_evil: { depth_prompt: { prompt: "INJECTED", depth: 4 }, regex_scripts: [{ scriptName: "x" }], fav: true },
    });
    // INERTNESS: the card's own depthPrompt is the TOP-LEVEL one — `plugin_evil`'s nested `depth_prompt` never
    // reached the typed column, so a plugin cannot inject a card directive through its namespace.
    expect(imported.depthPrompt?.prompt).toBe("real-directive");
    // …and its nested `regex_scripts` never became the card's regex scripts either.
    expect(imported.regexScripts).toEqual([]);

    // (1) EXPORT re-emits every plugin_<slug> key verbatim under `data.extensions`, so per-card plugin state is
    // portable to SillyTavern and back.
    const exported = buildCardV3({ ...fullFields(), extensions: imported.extensions }, []);
    const ext = exported.data.extensions as Record<string, unknown>;
    expect(ext["plugin_alpha"]).toEqual({ note: "alpha state", n: 1 });
    expect(ext["plugin_beta"]).toEqual({ theme: "dark" });
    expect(ext["plugin_evil"]).toEqual({ depth_prompt: { prompt: "INJECTED", depth: 4 }, regex_scripts: [{ scriptName: "x" }], fav: true });

    // A second round-trip is still lossless over the plugin namespace.
    expect(cardFromJson(exported, "fallback").extensions).toEqual(imported.extensions);
  });

  test("a V2 / app-authored card (no group-only greetings) omits group_only_greetings cleanly on export", () => {
    const card = buildCardV3({ ...fullFields(), nickname: null, source: null, creationDate: null, modificationDate: null }, []);
    expect("nickname" in card.data).toBe(false);
    expect("source" in card.data).toBe(false);
    expect("group_only_greetings" in card.data).toBe(false);
    expect("creation_date" in card.data).toBe(false);
    expect("modification_date" in card.data).toBe(false);
  });

  test("a multilingual-ONLY notes card keeps its notes and PRESERVES the map (#266 D-1)", () => {
    // Red-first: `creator_notes_multilingual` was stripped from the residual passthrough by the promotion
    // AND never folded, so a card whose notes live only in the map lost them outright on import.
    const card = cardFromJson(
      {
        spec: "chara_card_v3",
        spec_version: "3.0",
        data: { name: "Aria", creator_notes: "", creator_notes_multilingual: { fr: "la note", en: "the english note" } },
      },
      "fallback",
    );
    // The fold is a FALLBACK for an empty `creator_notes`: `en` first (the app's one language), else the
    // first non-empty value in insertion order.
    expect(card.creatorNotes).toBe("the english note");
    // …and the whole map still rides the residual passthrough — nothing is destroyed.
    expect(card.residualData).toEqual({ creator_notes_multilingual: { fr: "la note", en: "the english note" } });
  });

  test("creator_notes WINS when present; the multilingual map still rides residual", () => {
    const card = cardFromJson({ data: { name: "Aria", creator_notes: "the default-language note", creator_notes_multilingual: { en: "hi" } } }, "fallback");
    expect(card.creatorNotes).toBe("the default-language note");
    expect(card.residualData).toEqual({ creator_notes_multilingual: { en: "hi" } });
  });

  test("the multilingual fallback picks the first non-empty value when there is no `en` key", () => {
    const card = cardFromJson({ data: { name: "Aria", creator_notes_multilingual: { de: "", ja: "ノート", fr: "la note" } } }, "fallback");
    expect(card.creatorNotes).toBe("ノート");
  });

  test("a malformed multilingual map neither folds nor throws (tolerant IN)", () => {
    expect(cardFromJson({ data: { name: "Aria", creator_notes_multilingual: "not a map" } }, "fallback").creatorNotes).toBeNull();
    expect(cardFromJson({ data: { name: "Aria", creator_notes_multilingual: { en: 7 } } }, "fallback").creatorNotes).toBeNull();
  });

  test("round-trip: the multilingual map survives import → export → re-import", () => {
    const imported = cardFromJson({ data: { name: "Aria", creator_notes_multilingual: { en: "the english note" } } }, "fallback");
    const exported = buildCardV3({ ...fullFields(), creatorNotes: imported.creatorNotes, residualData: imported.residualData ?? null }, []);
    expect(exported.data["creator_notes_multilingual"]).toEqual({ en: "the english note" });
    const reimported = cardFromJson(exported, "fallback");
    expect(reimported.creatorNotes).toBe("the english note");
    expect(reimported.residualData).toEqual({ creator_notes_multilingual: { en: "the english note" } });
  });

  test("typed columns win on key collision (a stale residual can't shadow a real field)", () => {
    const card = buildCardV3({ ...fullFields(), residualData: { name: "Stale Name", description: "Stale desc" } }, []);
    expect(card.data.name).toBe(fullFields().name);
    expect(card.data.description).toBe(fullFields().description);
  });
});

describe("spec dispatch + round-trip (Character-Card V2 / V3)", () => {
  const v2Data = {
    name: "Aria",
    description: "A wandering bard.",
    personality: "curious",
    scenario: "a tavern",
    first_mes: "Hello there!",
    mes_example: "",
    alternate_greetings: ["Well met."],
    creator: "nate",
    creator_notes: "",
    character_version: "1.0",
    tags: ["bard"],
    extensions: {},
  };

  test("a V2 card parses into the canonical model and captures spec=chara_card_v2", () => {
    const card = cardFromJson({ spec: "chara_card_v2", spec_version: "2.0", data: v2Data }, "fallback");
    expect(card.spec).toBe("chara_card_v2");
    expect(card.name).toBe("Aria");
    expect(card.greetings).toEqual([{ text: "Hello there!" }, { text: "Well met." }]);
    expect(card.creator).toBe("nate");
  });

  test("a V3 card captures spec=chara_card_v3", () => {
    const card = cardFromJson({ spec: "chara_card_v3", spec_version: "3.0", data: { ...v2Data } }, "fallback");
    expect(card.spec).toBe("chara_card_v3");
  });

  test("a specless card (V1 / Pygmalion / app-authored) leaves spec undefined", () => {
    expect(cardFromJson({ name: "Bram", description: "d", personality: "", scenario: "", first_mes: "hi", mes_example: "" }, "fallback").spec).toBeUndefined();
    expect(cardFromJson({ char_name: "Pyg", char_greeting: "hi" }, "fallback").spec).toBeUndefined();
  });

  test("an unknown spec string is tolerated (spec undefined, content still parses)", () => {
    const card = cardFromJson({ spec: "chara_card_v9", spec_version: "9.0", data: v2Data }, "fallback");
    expect(card.spec).toBeUndefined();
    expect(card.name).toBe("Aria");
  });

  test("round-trip preserves the source spec — a V2 card exports as V2, a V3 as V3", () => {
    const v2 = cardFromJson({ spec: "chara_card_v2", spec_version: "2.0", data: v2Data }, "fallback");
    const v3 = cardFromJson({ spec: "chara_card_v3", spec_version: "3.0", data: { ...v2Data } }, "fallback");

    const emitV2 = buildCardV3({ ...fullFields(), ...(v2.spec ? { spec: v2.spec } : {}) }, []);
    const emitV3 = buildCardV3({ ...fullFields(), ...(v3.spec ? { spec: v3.spec } : {}) }, []);

    expect(emitV2.spec).toBe("chara_card_v2");
    expect(emitV2.spec_version).toBe("2.0");
    expect(emitV3.spec).toBe("chara_card_v3");
    expect(emitV3.spec_version).toBe("3.0");
  });

  test("no spec on ExportCardFields ⇒ export defaults to V3", () => {
    const card = buildCardV3(fullFields(), []);
    expect(card.spec).toBe("chara_card_v3");
    expect(card.spec_version).toBe("3.0");
  });

  test("the V3 assets[] manifest is PARSED + PRESERVED through import → export (not fetched)", () => {
    const assets = [
      { type: "icon", uri: "ccdefault:", name: "main", ext: "png" },
      { type: "emotion", uri: "embeded://assets/happy.png", name: "happy", ext: "png" },
    ];
    const imported = cardFromJson({ spec: "chara_card_v3", spec_version: "3.0", data: { ...v2Data, assets } }, "fallback");
    // assets ride the residualData passthrough (no typed column yet) — preserved verbatim, no URI resolved.
    expect(imported.residualData?.["assets"]).toEqual(assets);

    const exported = buildCardV3({ ...fullFields(), ...(imported.spec ? { spec: imported.spec } : {}), residualData: imported.residualData ?? null }, []);
    expect(exported.data["assets"]).toEqual(assets);
    // a second round-trip is idempotent — assets survive untouched.
    expect(cardFromJson(exported, "fallback").residualData?.["assets"]).toEqual(assets);
  });
});

describe("cardContentHash", () => {
  test("is deterministic + independent of key insertion order", () => {
    const a = baseCard();
    // a logically-identical card built with a different field order hashes the same (stable-stringify).
    const b = baseCard({ scenario: "a tavern", description: "A wandering bard." });
    expect(cardContentHash(a)).toBe(cardContentHash(b));
  });

  test("EXCLUDES provenance fields (re-attribution must not change identity)", () => {
    const base = baseCard();
    const hash = cardContentHash(base);
    // creator / creatorNotes / cardVersion / extensions / refinery / avatarAssetId are NOT hashed.
    expect(cardContentHash(baseCard({ creator: "someone" }))).toBe(hash);
    expect(cardContentHash(baseCard({ creatorNotes: "notes" }))).toBe(hash);
    expect(cardContentHash(baseCard({ cardVersion: "9.9" }))).toBe(hash);
    expect(cardContentHash(baseCard({ extensions: { x: 1 } }))).toBe(hash);
  });

  test("CHANGES when a semantic field changes", () => {
    const hash = cardContentHash(baseCard());
    expect(cardContentHash(baseCard({ name: "Different" }))).not.toBe(hash);
    expect(cardContentHash(baseCard({ greetings: [{ text: "new" }] }))).not.toBe(hash);
  });
});

// ── the OUT half: buildCardV3 + exportBookEntry ────────────────────────────────────────────────────────

const REGEX_SCRIPT = regexScriptSchema.parse({
  // A real `regex_script_…` TypeID: the schema's id became prefix-STRICT with the D121-E library lift, so
  // the old bare "r1" fixture stopped parsing (this file was red on the standing tree before this lane).
  id: "regex_script_00000000000000000000000001",
  name: "trim",
  // X-16: `updatedAt` is REQUIRED on the row (the edited stamp) — a fixed instant keeps the double honest.
  updatedAt: 1_700_000_000_000,
  findRegex: "a",
  replaceString: "b",
  placement: [],
});

// The card-wire shape (`RegexScriptCard`) carries no `updatedAt` — it is a library-row-only stamp
// (X-16), never part of the ST card format — so a round-tripped script compares against the row
// minus that field.
const { updatedAt: _regexScriptUpdatedAt, ...REGEX_SCRIPT_CARD } = REGEX_SCRIPT;

/** A fully-populated flat card (the typed-column source the export verb projects from). */
function fullFields(): ExportCardFields {
  return {
    name: "Aria",
    description: "A brave knight",
    personality: "bold",
    scenario: "a castle",
    greetings: [{ text: "Hello there" }, { text: "Hi again" }],
    exampleMessages: "<START>example",
    systemPrompt: "be brave",
    postHistoryInstructions: "stay in character",
    creatorNotes: "made with love",
    creator: "nate",
    cardVersion: "1.2",
    nickname: "Ari",
    source: ["https://example.test/aria", "chub:aria"],
    creationDate: 1_700_000_000,
    modificationDate: 1_700_100_000,
    starred: true,
    tags: ["fantasy", "knight"],
    extensions: { vendorExtra: "kept" },
    regexScripts: [REGEX_SCRIPT],
    depthPrompt: { prompt: "remember the oath", depth: 3, role: "system" },
  };
}

// ── ST's favorite flag → `characters.starred` (the silent-gap sweep, 2026-08-15) ────────────────────────
// `data.extensions.fav` is promoted out of the residue like `depth_prompt`/`regex_scripts` (D28); the OUT
// emitter writes it back FROM THE LIVE ROW, so a star toggled in orb exports truthfully. Corpus: 313/313
// cards carry the key (1 true, 312 false), so it was riding the residual blob unread.
describe("starred (ST extensions.fav)", () => {
  test("cardFromJson reads fav:true → starred:true and DROPS the key from the residue", () => {
    const card = cardFromJson({ spec: "chara_card_v3", data: { name: "Fay", extensions: { fav: true, vendorExtra: "kept" } } }, "fb");
    expect(card.starred).toBe(true);
    expect(card.extensions).toEqual({ vendorExtra: "kept" });
  });

  test("fav:false and an absent key both read starred:false; a truthy STRING is not a star", () => {
    expect(cardFromJson({ data: { name: "A", extensions: { fav: false } } }, "fb").starred).toBe(false);
    expect(cardFromJson({ data: { name: "B" } }, "fb").starred).toBe(false);
    expect(cardFromJson({ data: { name: "C", extensions: { fav: "true" } } }, "fb").starred).toBe(false);
  });

  test("buildCardV3 emits extensions.fav from the LIVE starred, never a stale residual byte", () => {
    const card = buildCardV3({ ...fullFields(), starred: false, extensions: { fav: true, vendorExtra: "kept" } }, []);
    const data = card.data as Record<string, unknown>;
    expect((data["extensions"] as Record<string, unknown>)["fav"]).toBe(false);
  });

  test("fav round-trips: import → export → reimport preserves the star", () => {
    const back = cardFromJson(buildCardV3({ ...fullFields(), starred: true }, []), "fb");
    expect(back.starred).toBe(true);
  });

  test("starred does NOT participate in the content hash (a star is face state, not identity)", () => {
    const a = cardFromJson({ data: { name: "Same", extensions: { fav: true } } }, "fb");
    const b = cardFromJson({ data: { name: "Same", extensions: { fav: false } } }, "fb");
    expect(cardContentHash(a)).toBe(cardContentHash(b));
  });
});

describe("buildCardV3 → cardFromJson round-trip", () => {
  test("the strict OUT emitter re-parses cleanly through the tolerant IN adapter (content fields)", () => {
    const fields = fullFields();
    const card = buildCardV3(fields, []);
    const back: CharacterCard = cardFromJson(card, "fallback");

    expect(back.name).toBe("Aria");
    expect(back.description).toBe("A brave knight");
    expect(back.personality).toBe("bold");
    expect(back.scenario).toBe("a castle");
    expect(back.greetings).toEqual([{ text: "Hello there" }, { text: "Hi again" }]);
    expect(back.exampleMessages).toBe("<START>example");
    expect(back.systemPrompt).toBe("be brave");
    expect(back.postHistoryInstructions).toBe("stay in character");
    expect(back.creatorNotes).toBe("made with love");
    expect(back.creator).toBe("nate");
    expect(back.cardVersion).toBe("1.2");
    expect(back.depthPrompt).toEqual({ prompt: "remember the oath", depth: 3, role: "system" });
    expect(back.regexScripts).toEqual([REGEX_SCRIPT_CARD]);
    // residual vendor extras survive; the promoted keys are NOT left behind in `extensions`.
    expect(back.extensions).toEqual({ vendorExtra: "kept" });
    // The V3 content promotions round-trip through their typed columns (not the residual blob).
    expect(back.nickname).toBe("Ari");
    expect(back.source).toEqual(["https://example.test/aria", "chub:aria"]);
    expect(back.creationDate).toBe(1_700_000_000);
    expect(back.modificationDate).toBe(1_700_100_000);
    // The promoted keys are emitted at the `data.*` root (not swept into residualData).
    expect(back.residualData).toBeNull();
  });

  test('null/empty card fields round-trip to null (emit `""` → re-parse null)', () => {
    const fields: ExportCardFields = {
      ...fullFields(),
      description: null,
      personality: null,
      scenario: null,
      exampleMessages: null,
      systemPrompt: null,
      postHistoryInstructions: null,
      creatorNotes: null,
      creator: null,
      cardVersion: null,
      depthPrompt: null,
      extensions: null,
      regexScripts: [],
    };
    const back = cardFromJson(buildCardV3(fields, []), "fallback");
    expect(back.description).toBeNull();
    expect(back.creator).toBeNull();
    expect(back.depthPrompt).toBeNull();
    expect(back.extensions).toBeNull();
    expect(back.regexScripts).toEqual([]);
  });
});

describe("buildCardV3 wire shape", () => {
  test("emits a valid V3 card; greetings split into first_mes + alternate_greetings; tags passthrough", () => {
    const card = buildCardV3(fullFields(), []);
    expect(card.spec).toBe("chara_card_v3");
    expect(card.data.first_mes).toBe("Hello there");
    expect(card.data.alternate_greetings).toEqual(["Hi again"]);
    expect(card.data.tags).toEqual(["fantasy", "knight"]);
    // parsing its own output is idempotent (the emitter already `.parse`s, but pin the shape).
    expect(() => characterCardV3Schema.parse(card)).not.toThrow();
  });

  test("a null depthPrompt DROPS extensions.depth_prompt; regex_scripts is always written", () => {
    const card = buildCardV3({ ...fullFields(), depthPrompt: null, regexScripts: [] }, []);
    expect(card.data.extensions).not.toHaveProperty("depth_prompt");
    expect(card.data.extensions["regex_scripts"]).toEqual([]);
  });

  // THE ST ENABLED/DISABLED POLARITY, both directions at the card wire. ST has no `enabled` key: it writes
  // `disabled` and skips on it. An export that emitted only `enabled` handed SillyTavern a card whose parked
  // scripts all ran; an import that read only `enabled` did the same to us.
  test("a switched-off script is emitted with ST's `disabled` and comes back off", () => {
    const off = { ...REGEX_SCRIPT, enabled: false };
    const card = buildCardV3({ ...fullFields(), regexScripts: [off] }, []);
    expect(card.data.extensions["regex_scripts"]).toEqual([expect.objectContaining({ enabled: false, disabled: true })]);
    expect(cardFromJson(card, "fallback").regexScripts).toEqual([{ ...REGEX_SCRIPT_CARD, enabled: false }]);
  });

  test("a foreign ST card's `disabled` script is read as switched off", () => {
    const card = buildCardV3(fullFields(), []);
    const foreign = { ...REGEX_SCRIPT, enabled: undefined, disabled: true };
    card.data.extensions["regex_scripts"] = [foreign];
    expect(cardFromJson(card, "fallback").regexScripts).toEqual([{ ...REGEX_SCRIPT_CARD, enabled: false }]);
  });

  test("character_book is emitted only when there are entries", () => {
    const without = buildCardV3(fullFields(), []);
    expect(without.data).not.toHaveProperty("character_book");
    const withBook = buildCardV3(fullFields(), [
      {
        keys: ["k"],
        content: "c",
        enabled: true,
        priority: 0,
        title: "t",
        ignoreBudget: false,
        metadata: null,
      },
    ]);
    expect(withBook.data.character_book?.entries).toHaveLength(1);
  });
});

describe("exportBookEntry", () => {
  test("a keyword entry: constant=false, insertion_order=priority, comment=title", () => {
    const out = exportBookEntry({
      keys: ["dragon"],
      content: "lore",
      enabled: true,
      priority: 7,
      title: "Dragons",
      ignoreBudget: false,
      metadata: null,
    });
    expect(out["constant"]).toBe(false);
    expect(out["insertion_order"]).toBe(7);
    expect(out["comment"]).toBe("Dragons");
    expect(out["keys"]).toEqual(["dragon"]);
  });

  test("a keyless entry derives constant=true (the keyless-always-on heuristic)", () => {
    const out = exportBookEntry({
      keys: [],
      content: "always",
      enabled: true,
      priority: 0,
      title: "Setting",
      ignoreBudget: false,
      metadata: null,
    });
    expect(out["constant"]).toBe(true);
  });

  test("a depth-inject entry re-encodes extensions.{position:4, depth, role-via-bimap} + preserves extras", () => {
    const out = exportBookEntry({
      keys: ["k"],
      content: "c",
      enabled: true,
      priority: 0,
      title: "t",
      ignoreBudget: true,
      metadata: { inject: { depth: 4, role: "assistant" }, extensions: { custom: 1 } },
    });
    const ext = out["extensions"] as Record<string, unknown>;
    expect(ext["position"]).toBe(4);
    expect(ext["depth"]).toBe(4);
    expect(ext["role"]).toBe(messageRoleToSt("assistant"));
    expect(ext["custom"]).toBe(1);
    expect(out["ignoreBudget"]).toBe(true);
  });
});

// ── the lorebook IN half: extractLorebook / selectBestCharacterBook / loreEntryColumns/Metadata ──────────

describe("extractLorebook", () => {
  test("accepts entries as a LIST or a keyed DICT, dropping non-objects", () => {
    const asList = extractLorebook({ entries: [{ content: "a" }, 7, { content: "b" }] });
    expect(asList.map((e) => e["content"])).toEqual(["a", "b"]);
    const asDict = extractLorebook({ entries: { "0": { content: "a" }, "1": { content: "b" } } });
    expect(asDict.map((e) => e["content"])).toEqual(["a", "b"]);
    expect(extractLorebook(null)).toEqual([]);
    expect(extractLorebook({})).toEqual([]);
  });
});

describe("selectBestCharacterBook", () => {
  test("picks the candidate with the most NAMED entries over an empty stub", () => {
    const stub = { entries: [{ content: "x" }] };
    const real = {
      entries: [
        { name: "Dragons", content: "lore" },
        { name: "Elves", content: "e" },
      ],
    };
    expect(selectBestCharacterBook(stub, real)).toBe(real);
    expect(selectBestCharacterBook(undefined, null)).toBeUndefined();
  });
});

describe("the WI-entry round-trip (IN ∘ OUT is the exact inverse — byte-identical after normalization)", () => {
  test("constant:true → scopeMode:always; extensions.{position:4,depth,role} → inject; OUT re-emits both", () => {
    // A keyed, CONSTANT, at-depth ST entry (the two derivations that would otherwise silently drop).
    const stEntry: Record<string, unknown> = {
      keys: ["dragon", "wyrm"],
      content: "Dragons hoard gold.",
      comment: "Dragons",
      insertion_order: 5,
      enabled: true,
      constant: true,
      extensions: { position: 4, depth: 2, role: 1, vendor: "kept" },
    };
    const columns = loreEntryColumns(stEntry);
    const metadata = loreEntryMetadata(stEntry);

    expect(columns).toEqual({
      title: "Dragons",
      description: null,
      content: "Dragons hoard gold.",
      keys: ["dragon", "wyrm"],
      enabled: true,
      priority: 5,
      ignoreBudget: false,
    });
    // constant → scopeMode:always (else a KEYED constant would demote to keyword scope at runtime).
    expect(metadata["scopeMode"]).toBe("always");
    // ST role 1 → "user" (the @orb/kit/message-role bimap).
    expect(metadata["inject"]).toEqual({ depth: 2, role: "user" });
    // lossless: the whole original ST entry rides through (constant + the raw extensions blob preserved).
    expect(metadata["constant"]).toBe(true);
    expect((metadata["extensions"] as Record<string, unknown>)["vendor"]).toBe("kept");

    // OUT: the exported ST entry re-derives constant + the at-depth extensions from the stored metadata.
    const out = exportBookEntry({
      keys: columns.keys,
      content: columns.content,
      enabled: columns.enabled,
      priority: columns.priority,
      title: columns.title,
      ignoreBudget: columns.ignoreBudget,
      metadata,
    });
    expect(out["constant"]).toBe(true);
    expect(out["insertion_order"]).toBe(5);
    expect(out["comment"]).toBe("Dragons");
    const ext = out["extensions"] as Record<string, unknown>;
    expect(ext["position"]).toBe(4);
    expect(ext["depth"]).toBe(2);
    expect(ext["role"]).toBe(messageRoleToSt("user"));
    expect(ext["vendor"]).toBe("kept");

    // IN again on the OUT — idempotent (the second normalization changes nothing load-bearing).
    const cols2 = loreEntryColumns(out);
    const meta2 = loreEntryMetadata(out);
    expect(cols2).toEqual(columns);
    expect(meta2["scopeMode"]).toBe("always");
    expect(meta2["inject"]).toEqual({ depth: 2, role: "user" });
  });

  test("a plain keyword entry: no constant, no inject, title falls back through comment→name→key", () => {
    expect(loreEntryColumns({ keys: ["k"], content: "c" }).title).toBe("k");
    expect(loreEntryColumns({ content: "c", name: "Named" }).title).toBe("Named");
    expect(loreEntryColumns({ content: "c" }).title).toBe("Untitled");
    const meta = loreEntryMetadata({ keys: ["k"], content: "c" });
    expect(meta["scopeMode"]).toBeUndefined();
    expect(meta["inject"]).toBeUndefined();
  });

  test("ST `position` is normalized to orb's before/after enum — the raw value never reaches the write seam", () => {
    // Regression: a real ST card book carries `position` as the chara_card_v2 STRING enum
    // (`before_char`/`after_char`), a NATIVE numeric WORLD_INFO_POSITION (0-6), or an empty string — all of
    // which collide with orb's `metadata.position` `before`/`after` enum and used to abort the whole book
    // import with `invalid_value path:['position']`. Each form maps to a valid orb value (or is dropped).
    expect(loreEntryMetadata({ content: "c", position: "before_char" })["position"]).toBe("before");
    expect(loreEntryMetadata({ content: "c", position: "after_char" })["position"]).toBe("after");
    expect(loreEntryMetadata({ content: "c", position: 0 })["position"]).toBe("before"); // before-char
    expect(loreEntryMetadata({ content: "c", position: 1 })["position"]).toBe("after"); // after-char
    expect(loreEntryMetadata({ content: "c", position: 2 })["position"]).toBe("before"); // AN-top
    expect(loreEntryMetadata({ content: "c", position: 6 })["position"]).toBe("after"); // EM-bottom
    // orb's own value is the fixpoint; empty/unknown drops the key entirely (the entry takes the default).
    expect(loreEntryMetadata({ content: "c", position: "after" })["position"]).toBe("after");
    expect(loreEntryMetadata({ content: "c", position: "" })).not.toHaveProperty("position");
    expect(loreEntryMetadata({ content: "c", position: "garbage" })).not.toHaveProperty("position");
  });

  test("a NATIVE ST world-info at-depth entry (top-level position:4 + depth/role) → inject, no position", () => {
    // The standalone `worlds/*.json` encoding puts position/depth/role at the TOP LEVEL (no `extensions`),
    // unlike an embedded card book (`extensions.position:4`). Both must yield the same orb `inject`.
    const meta = loreEntryMetadata({ content: "c", keys: ["k"], position: 4, depth: 3, role: 0 });
    expect(meta["inject"]).toEqual({ depth: 3, role: "system" }); // ST role 0 → "system"
    expect(meta).not.toHaveProperty("position"); // at-depth is not an anchor bucket
  });

  test("V3 `use_regex:true` normalizes to metadata.keyMode='regex' and the matcher honors it (#266 D-2)", () => {
    // Red-first: `use_regex` used to ride through as an inert unknown metadata key — the entry imported
    // enabled with a genuine pattern key and could never fire, because the matcher escapes every key.
    const stEntry: Record<string, unknown> = {
      keys: ["he(llo|y)"],
      content: "A greeting.",
      comment: "Greetings",
      insertion_order: 0,
      enabled: true,
      use_regex: true,
    };
    const columns = loreEntryColumns(stEntry);
    const metadata = loreEntryMetadata(stEntry);
    expect(metadata["keyMode"]).toBe("regex");
    // lossless: the source ST flag rides through beside the normalized orb key.
    expect(metadata["use_regex"]).toBe(true);

    // The stored columns + metadata are exactly what the per-turn pool feeds the matcher. `he(llo|y)` matches
    // "hey" ONLY under regex semantics — escaped, it is an unmatchable literal.
    expect(matchEntryKeys(columns.keys, "hey there", { keyMode: "regex" })).toEqual(["he(llo|y)"]);

    // OUT re-emits the ST flag from the RESOLVED mode (the `constant` precedent), so a re-import is a fixpoint.
    const out = exportBookEntry({
      keys: columns.keys,
      content: columns.content,
      enabled: columns.enabled,
      priority: columns.priority,
      title: columns.title,
      ignoreBudget: columns.ignoreBudget,
      metadata,
    });
    expect(out["use_regex"]).toBe(true);
    expect(loreEntryMetadata(out)["keyMode"]).toBe("regex");
  });

  test("a CARD-EMBEDDED book keeps FLAG-ONLY semantics: a delimited-looking key without use_regex stays literal", () => {
    // The scope fence for #268 arm (a) (owner, 2026-08-19): delimited-form detection is native-ST-world-file
    // ONLY (`domain/import/substrate/world`) — that format has no flag to carry the intent. The SHARED entry
    // mapper, which every embedded chara_card book runs through, must NOT derive a mode, or existing imported
    // literal keys that happen to look delimited would change meaning.
    expect(loreEntryMetadata({ keys: ["/he(llo|y)/i"], content: "c" })).not.toHaveProperty("keyMode");
  });

  test("an entry WITHOUT use_regex stays literal-keyed on both halves", () => {
    const meta = loreEntryMetadata({ keys: ["dr."], content: "c" });
    expect(meta).not.toHaveProperty("keyMode");
    expect(matchEntryKeys(["dr."], "the dru walked in")).toEqual([]);
    const out = exportBookEntry({ keys: ["dr."], content: "c", enabled: true, priority: 0, title: "t", ignoreBudget: false, metadata: meta });
    expect(out["use_regex"]).toBe(false);
  });
});
