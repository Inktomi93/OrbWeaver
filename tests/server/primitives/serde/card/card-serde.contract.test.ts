// The character-card serde core: the tolerant reader, the strict V3 emitter, the lorebook entry mapping and both hashes.
// Wire cards are the JSON text a user drops in (the wire spells its keys in snake_case); canonical values come from production.

import type { CharacterCard, CharacterCardV3 } from "@orb/contracts/character";
import { characterCardV3Schema } from "@orb/contracts/character";
import { regexScriptCardSchema } from "@orb/contracts/regex";
import { isPlainObject } from "@orb/kit/guards";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { messageRoleToSt } from "@orb/kit/message-role";
import { matchEntryKeys } from "@orb/kit/world-info";
import type { CardImportIdentity, ExportCardFields, ExportWorldEntry } from "@orb/server/primitives/serde/card";
import {
  buildCardV3,
  cardContentHash,
  cardFromJson,
  cardImportHash,
  extractLorebook,
  loreEntryColumns,
  loreEntryMetadata,
  selectBestCharacterBook,
  UNTITLED_LORE_ENTRY_TITLE,
} from "@orb/server/primitives/serde/card";
import { expect, test } from "@orb/testkit/node";
import { describe } from "vitest";

const FALLBACK = "From the filename";

const json = (text: string): Record<string, unknown> => JSON.parse(text) as Record<string, unknown>;

/** A wire card around `dataJson`, spelled the way SillyTavern writes it. */
const wireCard = (dataJson: string, spec = "chara_card_v3", version = "3.0"): Record<string, unknown> =>
  json(`{"spec":"${spec}","spec_version":"${version}","data":${dataJson}}`);

/** A script as SillyTavern's client mints it, read by the production card-script parser. */
const SCRIPT = regexScriptCardSchema.parse({ id: "st-client-id", name: "trim", findRegex: "a", replaceString: "b", placement: ["AI_OUTPUT"] });

/** Fully populated emitter input; tests override the fields they are about. */
function exportFields(over: Partial<ExportCardFields> = {}): ExportCardFields {
  return {
    handle: castId<CharacterHandle>("aria"),
    name: "Aria",
    description: "A brave knight",
    personality: "bold",
    scenario: "a castle",
    greetings: [{ text: "Hello there" }, { text: "Hi again" }],
    exampleMessages: "<START>example",
    systemPrompt: "be brave",
    postHistoryInstructions: "stay in character",
    creatorNotes: "made with love",
    creator: "alex",
    cardVersion: "1.2",
    nickname: "Ari",
    source: ["https://example.test/aria", "chub:aria"],
    creationDate: 1_700_000_000,
    modificationDate: 1_700_100_000,
    starred: true,
    tags: ["fantasy", "knight"],
    extensions: { vendorExtra: "kept" },
    regexScripts: [SCRIPT],
    depthPrompt: { prompt: "remember the oath", depth: 3, role: "system" },
    ...over,
  };
}

function bookEntry(card: CharacterCardV3, index = 0): Record<string, unknown> {
  const entry = card.data.character_book?.entries[index];
  if (!isPlainObject(entry)) {
    throw new Error("the emitted card carries no book entry");
  }
  return entry;
}

const worldEntry = (over: Partial<ExportWorldEntry> = {}): ExportWorldEntry => ({
  keys: ["tide"],
  content: "The tide turns.",
  enabled: true,
  priority: 0,
  title: "Tide",
  ignoreBudget: false,
  metadata: null,
  ...over,
});

describe("cardFromJson reads each wire spec into the canonical card", () => {
  test("a V3 card flattens: first_mes leads the greetings, typed promotions land, residue keeps only unknown keys", () => {
    const card = cardFromJson(
      wireCard(
        `{"name":"Aria","description":"A wandering bard.","first_mes":"Hello there!","alternate_greetings":["Well met.","Oh, hi."],
          "mes_example":"An example exchange.","system_prompt":"You are Aria.","post_history_instructions":"Stay in character.",
          "creator":"alex","creator_notes":"be kind","character_version":"1.2",
          "extensions":{"depth_prompt":{"prompt":"Aria hums softly.","depth":2,"role":"system"},"vendor_extra":{"foo":1}}}`,
      ),
      FALLBACK,
    );
    expect(card).toMatchObject({
      name: "Aria",
      greetings: [{ text: "Hello there!" }, { text: "Well met." }, { text: "Oh, hi." }],
      exampleMessages: "An example exchange.",
      systemPrompt: "You are Aria.",
      postHistoryInstructions: "Stay in character.",
      creator: "alex",
      creatorNotes: "be kind",
      cardVersion: "1.2",
      depthPrompt: { prompt: "Aria hums softly.", depth: 2, role: "system" },
      residualData: null,
      avatarAssetId: null,
      refinery: null,
    });
    expect(card.extensions).toEqual(json('{"vendor_extra":{"foo":1}}'));
  });

  test("a V1 card with root-level fields and a Pygmalion card normalise to the same canonical fields", () => {
    expect(cardFromJson(json('{"name":"Bryn","description":"A gruff smith.","scenario":"a forge","first_mes":"What do you want?"}'), FALLBACK)).toMatchObject({
      name: "Bryn",
      description: "A gruff smith.",
      scenario: "a forge",
      greetings: [{ text: "What do you want?" }],
    });
    expect(
      cardFromJson(
        json('{"char_name":"Cleo","char_persona":"A clever fox.","char_greeting":"*grins*","world_scenario":"a meadow","example_dialogue":"{{user}}: hi"}'),
        FALLBACK,
      ),
    ).toMatchObject({ name: "Cleo", description: "A clever fox.", scenario: "a meadow", greetings: [{ text: "*grins*" }], exampleMessages: "{{user}}: hi" });
  });

  test("a card with no name takes the fallback, and the placeholder note is dropped", () => {
    expect(cardFromJson(json('{"data":{"description":"x"}}'), FALLBACK).name).toBe(FALLBACK);
    expect(cardFromJson(json('{"data":{"name":"X","creator_notes":"Creator\'s notes go here."}}'), FALLBACK).creatorNotes).toBeNull();
  });

  test("the source spec is captured for V2 and V3 and left unset for anything else", () => {
    const data = '{"name":"Aria","first_mes":"hi"}';
    expect(cardFromJson(wireCard(data, "chara_card_v2", "2.0"), FALLBACK).spec).toBe("chara_card_v2");
    expect(cardFromJson(wireCard(data), FALLBACK).spec).toBe("chara_card_v3");
    expect(cardFromJson(json('{"name":"Bryn","first_mes":"hi"}'), FALLBACK).spec).toBeUndefined();
    expect(cardFromJson(json('{"char_name":"Pyg","char_greeting":"hi"}'), FALLBACK).spec).toBeUndefined();
    const unknown = cardFromJson(wireCard(data, "chara_card_v9", "9.0"), FALLBACK);
    expect({ spec: unknown.spec, name: unknown.name }).toEqual({ spec: undefined, name: "Aria" });
  });

  test("V3 promotions land on typed fields, group-only greetings fold flagged, and the rest rides residue", () => {
    const card = cardFromJson(
      wireCard(
        `{"name":"Aria","source":["https://example.com/aria.png"],"creation_date":1700000000,"modification_date":1700100000,"nickname":"Ari",
          "creator_notes":"the default-language note","creator_notes_multilingual":{"en":"hi","fr":"salut"},
          "group_only_greetings":["*waves to the group*"],"vendor_unknown":{"foo":1}}`,
      ),
      FALLBACK,
    );
    expect(card).toMatchObject({
      nickname: "Ari",
      source: ["https://example.com/aria.png"],
      creationDate: 1_700_000_000,
      modificationDate: 1_700_100_000,
      creatorNotes: "the default-language note",
    });
    expect(card.residualData).toEqual(json('{"vendor_unknown":{"foo":1},"creator_notes_multilingual":{"en":"hi","fr":"salut"}}'));
    expect(card.greetings).toContainEqual({ text: "*waves to the group*", groupOnly: true });
  });

  test.each([
    {
      label: "english wins when notes are empty",
      data: '{"creator_notes":"","creator_notes_multilingual":{"fr":"la note","en":"the english note"}}',
      notes: "the english note",
    },
    {
      label: "the first non-empty value wins when there is no english",
      data: '{"creator_notes_multilingual":{"de":"","ja":"ノート","fr":"la note"}}',
      notes: "ノート",
    },
    {
      label: "creator_notes wins when present",
      data: '{"creator_notes":"the default note","creator_notes_multilingual":{"en":"hi"}}',
      notes: "the default note",
    },
    { label: "a non-map is ignored", data: '{"creator_notes_multilingual":"not a map"}', notes: null },
    { label: "a map of non-strings is ignored", data: '{"creator_notes_multilingual":{"en":7}}', notes: null },
  ])("multilingual notes: $label", ({ data, notes }) => {
    const card = cardFromJson(wireCard(`{"name":"Aria",${data.slice(1)}`), FALLBACK);
    expect(card.creatorNotes).toBe(notes);
    // The map is never consumed: it rides residue whole, so nothing is destroyed on import.
    expect(card.residualData?.["creator_notes_multilingual"]).toEqual(json(data)["creator_notes_multilingual"]);
  });

  test("ST's favourite flag reads only as the boolean true and is removed from the residue", () => {
    const starred = cardFromJson(wireCard('{"name":"Fay","extensions":{"fav":true,"vendorExtra":"kept"}}'), FALLBACK);
    expect({ starred: starred.starred, extensions: starred.extensions }).toEqual({ starred: true, extensions: { vendorExtra: "kept" } });
    for (const fav of ["false", '"true"', "null"]) {
      expect(cardFromJson(wireCard(`{"name":"A","extensions":{"fav":${fav}}}`), FALLBACK).starred).toBe(false);
    }
  });

  test("a plugin's per-card namespace stays inert data and cannot promote a typed field", () => {
    const evil = '{"depth_prompt":{"prompt":"INJECTED","depth":4},"regex_scripts":[{"scriptName":"x"}],"fav":true}';
    const card = cardFromJson(
      wireCard(
        `{"name":"Aria","extensions":{"plugin_alpha":{"note":"alpha state","n":1},"plugin_evil":${evil},"depth_prompt":{"prompt":"real-directive","depth":2}}}`,
      ),
      FALLBACK,
    );
    expect(card.extensions).toEqual(json(`{"plugin_alpha":{"note":"alpha state","n":1},"plugin_evil":${evil}}`));
    expect(card.depthPrompt?.prompt).toBe("real-directive");
    expect(card.regexScripts).toEqual([]);
    expect(card.starred).toBe(false);
    // Portable: the namespace leaves in the export verbatim, and a second import reads the same card.
    const exported = buildCardV3(exportFields({ extensions: card.extensions }), []);
    expect(exported.data.extensions["plugin_evil"]).toEqual(json(evil));
    expect(cardFromJson(exported, FALLBACK).extensions).toEqual(card.extensions);
  });

  test("a script the card marks disabled reads as switched off, and an unmarked one reads as on", () => {
    const base = '"id":"s","name":"trim","findRegex":"a","replaceString":"b","placement":["AI_OUTPUT"]';
    const enabledOf = (script: string): (boolean | undefined)[] | undefined =>
      cardFromJson(wireCard(`{"name":"A","extensions":{"regex_scripts":[${script}]}}`), FALLBACK).regexScripts?.map((s) => s.enabled);
    expect(enabledOf(`{${base},"disabled":true}`)).toEqual([false]);
    expect(enabledOf(`{${base}}`)).toEqual([true]);
  });
});

describe("buildCardV3 emits the strict V3 wire", () => {
  test("greetings split into first_mes and alternates, group-only greetings re-split, tags pass through, and the output parses", () => {
    const card = buildCardV3(exportFields({ greetings: [{ text: "Hello there" }, { text: "Hi again" }, { text: "*waves*", groupOnly: true }] }), []);
    expect(card.spec).toBe("chara_card_v3");
    expect(card.data.first_mes).toBe("Hello there");
    expect(card.data.alternate_greetings).toEqual(["Hi again"]);
    expect(card.data["group_only_greetings"]).toEqual(["*waves*"]);
    expect(card.data.tags).toEqual(["fantasy", "knight"]);
    expect(characterCardV3Schema.parse(card)).toEqual(card);
  });

  test("a card with no promotions and no group-only greetings omits those keys", () => {
    const keys = ["nickname", "source", "creation_date", "modification_date", "group_only_greetings"] as const;
    const bare = buildCardV3(exportFields({ nickname: null, source: null, creationDate: null, modificationDate: null }), []);
    expect(keys.filter((key) => key in bare.data)).toEqual([]);
    // Positive control: the same emitter writes the promotions when the fields are set.
    const full = buildCardV3(exportFields({ greetings: [{ text: "a" }, { text: "b", groupOnly: true }] }), []);
    expect(keys.filter((key) => key in full.data)).toEqual([...keys]);
  });

  test("the spec round-trips: V2 emits as 2.0, V3 as 3.0, and no spec defaults to V3", () => {
    const versions = [
      buildCardV3(exportFields({ spec: "chara_card_v2" }), []),
      buildCardV3(exportFields({ spec: "chara_card_v3" }), []),
      buildCardV3(exportFields(), []),
    ];
    expect(versions.map((card) => [card.spec, card.spec_version])).toEqual([
      ["chara_card_v2", "2.0"],
      ["chara_card_v3", "3.0"],
      ["chara_card_v3", "3.0"],
    ]);
  });

  test("the typed columns own their extension keys: a null depth prompt drops the key and a stale residue never shadows a field", () => {
    const dropped = buildCardV3(exportFields({ depthPrompt: null, regexScripts: [] }), []);
    expect(dropped.data.extensions).not.toHaveProperty("depth_prompt");
    expect(dropped.data.extensions["regex_scripts"]).toEqual([]);
    const stale = buildCardV3(
      exportFields({
        extensions: json('{"depth_prompt":{"prompt":"stale"},"fav":false}'),
        residualData: { name: "Stale Name", description: "Stale desc" },
      }),
      [],
    );
    expect(stale.data.extensions["depth_prompt"]).toEqual({ prompt: "remember the oath", depth: 3, role: "system" });
    expect(stale.data.extensions["fav"]).toBe(true);
    expect({ name: stale.data.name, description: stale.data.description }).toEqual({ name: "Aria", description: "A brave knight" });
  });

  test("the favourite flag is written from the live star, not a stale residue byte", () => {
    expect(buildCardV3(exportFields({ starred: false, extensions: json('{"fav":true}') }), []).data.extensions["fav"]).toBe(false);
    expect(cardFromJson(buildCardV3(exportFields({ starred: true }), []), FALLBACK).starred).toBe(true);
  });

  test("a switched-off script leaves with ST's disabled flag and returns off, and an enabled one leaves enabled", () => {
    const off = { ...SCRIPT, enabled: false };
    const card = buildCardV3(exportFields({ regexScripts: [off] }), []);
    expect(card.data.extensions["regex_scripts"]).toEqual([expect.objectContaining({ enabled: false, disabled: true })]);
    expect(cardFromJson(card, FALLBACK).regexScripts).toEqual([off]);
    const on = buildCardV3(exportFields(), []);
    expect(on.data.extensions["regex_scripts"]).toEqual([expect.objectContaining({ enabled: true, disabled: false })]);
    expect(cardFromJson(on, FALLBACK).regexScripts).toEqual([SCRIPT]);
  });

  test("the embedded book appears only with entries, under its own name when it has one", () => {
    expect(buildCardV3(exportFields(), []).data).not.toHaveProperty("character_book");
    const named = buildCardV3(exportFields({ bookName: "Harbor Lore" }), [worldEntry()]);
    expect(named.data.character_book).toMatchObject({ name: "Harbor Lore" });
    expect(named.data.character_book?.entries).toHaveLength(1);
    expect(buildCardV3(exportFields(), [worldEntry()]).data.character_book).not.toHaveProperty("name");
  });
});

describe("a card survives import, export and re-import", () => {
  test("every content field comes back from the emitter's own output, and nothing is left in residue", () => {
    const fields = exportFields();
    const back = cardFromJson(buildCardV3(fields, []), FALLBACK);
    expect(back).toMatchObject({
      name: fields.name,
      description: fields.description,
      personality: fields.personality,
      scenario: fields.scenario,
      greetings: fields.greetings,
      exampleMessages: fields.exampleMessages,
      systemPrompt: fields.systemPrompt,
      postHistoryInstructions: fields.postHistoryInstructions,
      creatorNotes: fields.creatorNotes,
      creator: fields.creator,
      cardVersion: fields.cardVersion,
      depthPrompt: fields.depthPrompt,
      regexScripts: fields.regexScripts,
      extensions: fields.extensions,
      nickname: fields.nickname,
      source: fields.source,
      creationDate: fields.creationDate,
      modificationDate: fields.modificationDate,
      residualData: null,
    });
  });

  test("null and empty fields come back as null", () => {
    const back = cardFromJson(
      buildCardV3(
        exportFields({
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
        }),
        [],
      ),
      FALLBACK,
    );
    expect(back).toMatchObject({ description: null, creator: null, depthPrompt: null, extensions: null, regexScripts: [] });
  });

  test("promotions, group-only greetings, multilingual notes, assets and residue survive two round trips", () => {
    const assets =
      '[{"type":"icon","uri":"ccdefault:","name":"main","ext":"png"},{"type":"emotion","uri":"embeded://assets/happy.png","name":"happy","ext":"png"}]';
    const imported = cardFromJson(
      wireCard(
        `{"name":"Aria","source":["https://example.com/aria.png"],"nickname":"Ari","creation_date":1700000000,
          "group_only_greetings":["*waves to the group*"],"vendor_unknown":{"foo":1},
          "creator_notes_multilingual":{"en":"the english note"},"assets":${assets}}`,
      ),
      FALLBACK,
    );
    const emit = (card: CharacterCard): CharacterCardV3 =>
      buildCardV3(
        exportFields({
          name: card.name,
          creatorNotes: card.creatorNotes,
          greetings: card.greetings,
          nickname: card.nickname,
          source: card.source,
          creationDate: card.creationDate,
          modificationDate: card.modificationDate,
          extensions: card.extensions,
          residualData: card.residualData,
        }),
        [],
      );
    const exported = emit(imported);
    expect(exported.data["group_only_greetings"]).toEqual(["*waves to the group*"]);
    expect(exported.data["creator_notes_multilingual"]).toEqual({ en: "the english note" });
    expect(exported.data["assets"]).toEqual(JSON.parse(assets));
    const reimported = cardFromJson(exported, FALLBACK);
    expect(reimported).toMatchObject({
      nickname: "Ari",
      source: ["https://example.com/aria.png"],
      creationDate: 1_700_000_000,
      creatorNotes: "the english note",
    });
    expect(reimported.greetings).toContainEqual({ text: "*waves to the group*", groupOnly: true });
    expect(reimported.residualData).toEqual(imported.residualData);
    expect(emit(reimported).data).toEqual(exported.data);
  });
});

describe("cardContentHash identifies what the card says, not who it is attributed to", () => {
  const base = cardFromJson(wireCard('{"name":"Aria","description":"A wandering bard.","scenario":"a tavern","first_mes":"Hello there!"}'), FALLBACK);

  test("a card hashes the same under any wire key order and with provenance changed", () => {
    const hash = cardContentHash(base);
    const reordered = wireCard('{"first_mes":"Hello there!","scenario":"a tavern","description":"A wandering bard.","name":"Aria"}');
    expect(cardContentHash(cardFromJson(reordered, FALLBACK))).toBe(hash);
    for (const provenance of [{ creator: "someone" }, { creatorNotes: "notes" }, { cardVersion: "9.9" }, { extensions: { x: 1 } }, { starred: true }]) {
      expect(cardContentHash({ ...base, ...provenance })).toBe(hash);
    }
  });

  test("a change to what the card says changes the hash", () => {
    const hash = cardContentHash(base);
    expect(cardContentHash({ ...base, name: "Different" })).not.toBe(hash);
    expect(cardContentHash({ ...base, greetings: [{ text: "new" }] })).not.toBe(hash);
  });
});

describe("cardImportHash is the import identity", () => {
  const harbor = (extraJson = "", spec = "chara_card_v3", version = "3.0"): CharacterCard =>
    cardFromJson(wireCard(`{"name":"Harbor","description":"a port","creator_notes":"v1"${extraJson}}`, spec, version), "Harbor");
  const identity = (over: Partial<CardImportIdentity> = {}): CardImportIdentity => ({ card: harbor(), book: null, artHash: null, ...over });
  const entry = { title: "Tide", description: null, content: "x", keys: ["tide"], enabled: true, priority: 1, ignoreBudget: false };
  const bookOf = (metadata: Record<string, unknown> | null): CardImportIdentity["book"] => ({
    name: "Harbor Lore",
    description: null,
    entries: [{ ...entry, metadata }],
  });
  const scripted = (id: string): CharacterCard => harbor(`,"extensions":{"regex_scripts":[${JSON.stringify({ ...SCRIPT, id })}]}`);

  test("an export's normalised entry spellings are the import's book, and a semantic metadata key is identity", () => {
    const imported = cardImportHash(identity({ book: bookOf(json('{"keys":["tide"],"content":"x","comment":"Tide","insertion_order":1}')) }));
    const exported = cardImportHash(
      identity({
        book: bookOf(
          json('{"keys":["tide"],"content":"x","comment":"Tide","insertion_order":1,"enabled":true,"constant":false,"use_regex":false,"extensions":{}}'),
        ),
      }),
    );
    expect(exported).toBe(imported);
    expect(cardImportHash(identity({ book: bookOf({ scopeMode: "always" }) }))).not.toBe(imported);
  });

  test("a kept ST activation field is identity when set, and its default spelling is not", () => {
    const base = cardImportHash(identity({ book: bookOf(null) }));
    for (const changed of [{ probability: 50, useProbability: true }, { sticky: 3 }, { keysecondary: ["moon"] }]) {
      expect(cardImportHash(identity({ book: bookOf(changed) }))).not.toBe(base);
    }
    const defaults = { probability: 100, useProbability: true, sticky: 0, cooldown: 0, excludeRecursion: false, keysecondary: [] };
    expect(cardImportHash(identity({ book: bookOf(defaults) }))).toBe(base);
  });

  test("art is identity, but the wire spec and key order are not", () => {
    const base = cardImportHash(identity());
    const painted = cardImportHash(identity({ artHash: "a".repeat(64) }));
    expect(painted).not.toBe(base);
    expect(cardImportHash(identity({ artHash: "b".repeat(64) }))).not.toBe(painted);
    expect(cardImportHash(identity({ card: harbor("", "chara_card_v2", "2.0") }))).toBe(base);
    const reordered = cardFromJson(
      json('{"data":{"creator_notes":"v1","description":"a port","name":"Harbor"},"spec_version":"3.0","spec":"chara_card_v3"}'),
      "Harbor",
    );
    expect(cardImportHash(identity({ card: reordered }))).toBe(base);
  });

  test("a note, an embedded book or a script changes the identity even under one name", () => {
    const base = cardImportHash(identity());
    const renoted = cardFromJson(wireCard('{"name":"Harbor","description":"a port","creator_notes":"v2"}'), "Harbor");
    expect(cardImportHash(identity({ card: renoted }))).not.toBe(base);
    expect(
      cardImportHash(identity({ book: { name: "Harbor Lore", description: null, entries: [{ ...entry, keys: [], priority: 0, metadata: null }] } })),
    ).not.toBe(base);
    expect(cardImportHash(identity({ card: scripted("st-client-id") }))).not.toBe(base);
  });

  test("a script's id is provenance: the same script under another id is the same character", ({ ids }) => {
    expect(cardImportHash(identity({ card: scripted("st-client-id") }))).toBe(cardImportHash(identity({ card: scripted(ids.typeId(ID_PREFIX.regexScript)) })));
  });
});

describe("lorebook entries cross the wire in both directions", () => {
  test("a keyword entry emits constant=false, insertion_order from priority and the title as comment", () => {
    const entry = bookEntry(buildCardV3(exportFields(), [worldEntry({ keys: ["dragon"], priority: 7, title: "Dragons", content: "lore" })]));
    expect([entry["constant"], entry["insertion_order"], entry["comment"], entry["keys"]]).toEqual([false, 7, "Dragons", ["dragon"]]);
  });

  test("a keyless entry derives constant=true", () => {
    expect(bookEntry(buildCardV3(exportFields(), [worldEntry({ keys: [], content: "always", title: "Setting" })]))["constant"]).toBe(true);
  });

  test("a depth-injecting entry re-encodes position 4 with depth and the ST role, and keeps vendor extras", () => {
    const entry = bookEntry(
      buildCardV3(exportFields(), [worldEntry({ ignoreBudget: true, metadata: { inject: { depth: 4, role: "assistant" }, extensions: { custom: 1 } } })]),
    );
    expect(entry["extensions"]).toEqual({ custom: 1, position: 4, depth: 4, role: messageRoleToSt("assistant") });
    expect(entry["ignoreBudget"]).toBe(true);
  });

  test("a constant at-depth ST entry maps to engine fields and re-emits unchanged through the emitter", () => {
    const st = json(
      `{"keys":["dragon","wyrm"],"content":"Dragons hoard gold.","comment":"Dragons","insertion_order":5,"enabled":true,"constant":true,
        "extensions":{"position":4,"depth":2,"role":1,"vendor":"kept"}}`,
    );
    const columns = loreEntryColumns(st);
    const metadata = loreEntryMetadata(st);
    expect(columns).toEqual({
      title: "Dragons",
      description: null,
      content: "Dragons hoard gold.",
      keys: ["dragon", "wyrm"],
      enabled: true,
      priority: 5,
      ignoreBudget: false,
    });
    // A keyed constant entry must not demote to keyword scope: the runtime reads scopeMode, not constant.
    expect(metadata).toMatchObject({ scopeMode: "always", inject: { depth: 2, role: "user" }, constant: true });
    const out = bookEntry(buildCardV3(exportFields(), [{ ...columns, metadata }]));
    expect([out["constant"], out["insertion_order"], out["comment"]]).toEqual([true, 5, "Dragons"]);
    expect(out["extensions"]).toEqual({ position: 4, depth: 2, role: messageRoleToSt("user"), vendor: "kept" });
    expect(loreEntryColumns(out)).toEqual(columns);
    expect(loreEntryMetadata(out)).toMatchObject({ scopeMode: "always", inject: { depth: 2, role: "user" } });
  });

  test("a plain entry has no scope or inject, and its title falls back through comment, name and first key", () => {
    expect(loreEntryColumns({ keys: ["k"], content: "c" }).title).toBe("k");
    expect(loreEntryColumns({ content: "c", name: "Named" }).title).toBe("Named");
    expect(loreEntryColumns({ content: "c" }).title).toBe(UNTITLED_LORE_ENTRY_TITLE);
    expect(loreEntryColumns({ content: "c", comment: "Memo", name: "Named" })).toMatchObject({ title: "Memo", description: null });
    const meta = loreEntryMetadata({ keys: ["k"], content: "c" });
    expect(meta).not.toHaveProperty("scopeMode");
    expect(meta).not.toHaveProperty("inject");
  });

  test.each([
    { position: "before_char", expected: "before" },
    { position: "after_char", expected: "after" },
    { position: 0, expected: "before" },
    { position: 1, expected: "after" },
    { position: 2, expected: "before" },
    { position: 6, expected: "after" },
    { position: "after", expected: "after" },
  ])("ST position $position normalises to $expected, so the raw spelling never reaches the write seam", ({ position, expected }) => {
    expect(loreEntryMetadata({ content: "c", position })["position"]).toBe(expected);
  });

  test.each(["", "garbage"])("an empty or unknown ST position %j drops the key and leaves the entry its default", (position) => {
    expect(loreEntryMetadata({ content: "c", position })).not.toHaveProperty("position");
  });

  test("a native world-info at-depth entry carries position, depth and role at the top level and maps to inject alone", () => {
    const meta = loreEntryMetadata({ content: "c", keys: ["k"], position: 4, depth: 3, role: 0 });
    expect(meta["inject"]).toEqual({ depth: 3, role: "system" });
    expect(meta).not.toHaveProperty("position");
  });

  test("use_regex makes the entry's keys patterns, the matcher honours it, and the flag re-emits from the resolved mode", () => {
    const st = json('{"keys":["he(llo|y)"],"content":"A greeting.","comment":"Greetings","insertion_order":0,"enabled":true,"use_regex":true}');
    const columns = loreEntryColumns(st);
    const metadata = loreEntryMetadata(st);
    expect(metadata["keyMode"]).toBe("regex");
    expect(metadata["use_regex"]).toBe(true);
    // The pattern matches "hey" only under regex semantics; escaped it is an unmatchable literal.
    expect(matchEntryKeys(columns.keys, "hey there", { keyMode: "regex" })).toEqual(["he(llo|y)"]);
    expect(matchEntryKeys(columns.keys, "hey there")).toEqual([]);
    const out = bookEntry(buildCardV3(exportFields(), [{ ...columns, metadata }]));
    expect(out["use_regex"]).toBe(true);
    expect(loreEntryMetadata(out)["keyMode"]).toBe("regex");
  });

  test("an entry without use_regex stays literal on both halves, even when its key looks delimited", () => {
    expect(loreEntryMetadata({ keys: ["/he(llo|y)/i"], content: "c" })).not.toHaveProperty("keyMode");
    const meta = loreEntryMetadata({ keys: ["dr."], content: "c" });
    expect(meta).not.toHaveProperty("keyMode");
    expect(matchEntryKeys(["dr."], "the dru walked in")).toEqual([]);
    expect(bookEntry(buildCardV3(exportFields(), [worldEntry({ keys: ["dr."], metadata: meta })]))["use_regex"]).toBe(false);
  });

  test("a book's entries read from a list or a keyed dict, and the book with the most named entries wins over a stub", () => {
    expect(extractLorebook({ entries: [{ content: "a" }, 7, { content: "b" }] }).map((e) => e["content"])).toEqual(["a", "b"]);
    expect(extractLorebook({ entries: { "0": { content: "a" }, "1": { content: "b" } } }).map((e) => e["content"])).toEqual(["a", "b"]);
    expect(extractLorebook(null)).toEqual([]);
    expect(extractLorebook({})).toEqual([]);
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
