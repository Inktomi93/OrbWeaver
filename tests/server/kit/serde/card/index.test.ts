// biome-ignore-all lint/style/useNamingConvention: ST Character-Card wire field names (snake_case) appear
// verbatim in these card fixtures — they ARE the format.
// Mirror test for @orb/server/kit/serde/card — the ONE card serde core: the tolerant IN-flatten
// (cardFromJson), the shared content hash (cardContentHash, PD-33), and the strict OUT-emitter
// (buildCardV3 + exportBookEntry, PD-44). Asserts the multi-spec normalize (V3 / V1 / Pygmalion), the
// typed-promotion mapping (depthPrompt / greetings / residual extensions), the hash invariants the dedup
// relies on (key-order independence + the deliberate provenance EXCLUSION), and the load-bearing
// round-trip: buildCardV3 → cardFromJson is lossless over the card content fields (the one-serde-core
// invariant).

import type { CharacterCard } from "@orb/contracts/character";
import { characterCardV3Schema } from "@orb/contracts/character";
import { regexScriptSchema } from "@orb/contracts/regex";
import { messageRoleToSt } from "@orb/kit/message-role";
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
import { expect, test } from "../../../../support/fixtures";

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

describe("V3 content promotions + residualData (card-import expansion / PD-127)", () => {
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
    // … creator_notes_multilingual FOLDS into creator_notes (default-language note is the one home; the map
    // is intentionally not stored) …
    expect(card.creatorNotes).toBe("the default-language note");
    // … group_only_greetings FOLDS into the greetings array as a `groupOnly:true` entry (V3 promotion Phase B) …
    expect(card.greetings).toContainEqual({ text: "*waves to the group*", groupOnly: true });
    // … and residualData holds ONLY genuinely-unknown / deferred keys — never a promoted or folded field.
    expect(card.residualData).toEqual({ vendor_unknown: { foo: 1 } });
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

  test("a V2 / app-authored card (no group-only greetings) omits group_only_greetings cleanly on export", () => {
    const card = buildCardV3({ ...fullFields(), nickname: null, source: null, creationDate: null, modificationDate: null }, []);
    expect("nickname" in card.data).toBe(false);
    expect("source" in card.data).toBe(false);
    expect("group_only_greetings" in card.data).toBe(false);
    expect("creation_date" in card.data).toBe(false);
    expect("modification_date" in card.data).toBe(false);
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

// ── the OUT half: buildCardV3 + exportBookEntry (PD-44) ────────────────────────────────────────────────

const REGEX_SCRIPT = regexScriptSchema.parse({
  // A real `regex_script_…` TypeID: the schema's id became prefix-STRICT with the D121-E library lift, so
  // the old bare "r1" fixture stopped parsing (this file was red on the standing tree before this lane).
  id: "regex_script_00000000000000000000000001",
  name: "trim",
  findRegex: "a",
  replaceString: "b",
  placement: [],
});

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
    tags: ["fantasy", "knight"],
    extensions: { vendorExtra: "kept" },
    regexScripts: [REGEX_SCRIPT],
    depthPrompt: { prompt: "remember the oath", depth: 3, role: "system" },
  };
}

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
    expect(back.regexScripts).toEqual([REGEX_SCRIPT]);
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

// ── the lorebook IN half: extractLorebook / selectBestCharacterBook / loreEntryColumns/Metadata (PD-77) ──

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
});
