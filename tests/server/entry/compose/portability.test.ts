// entry/compose/portability — the `PortabilityRegistry` the entity-agnostic delivery core iterates. The
// core knows nothing about any entity: it walks this array, writes each `exportAll` stream into the bundle
// under the descriptor's `dir`, and routes every file back to the matching `importFile`. So this seam owns
// three things nothing downstream can re-derive:
//
//   • OWNER SCOPE. The header's claim is "owner-scoped throughout — `ownerId` is the only owner any
//     exportAll/importFile ever sees". That is a TENANCY belt: a backup is one account's, and the ownerId
//     the core hands in is the only authority. Every descriptor that needs a Principal mints it from THAT
//     ownerId through `resolveOwnerPrincipal`, and hands that principal (never a cached/ambient one) to the
//     verb. Pinned per descriptor below.
//   • THE NEVER-THROW IMPORT CONTRACT. A malformed or hostile file in a bundle must degrade to
//     `{ok:false,error}` for that ONE file, never abort the restore. A descriptor that lost its try/catch
//     turns one bad entry into a dead import.
//   • THE ON-DISK LAYOUT (`kind`/`dir`/`ext`). These are the bundle format. A silently changed `dir` makes
//     every previously-exported backup un-restorable, with no error on either side.
//
// The descriptors whose halves are INJECTED here (regex/persona/character/chat) are driven end-to-end; the
// ones built from a domain ctx (assets/gallery/tag/theme/user-settings/preset/world-info/databank) are
// pinned at their layout + wiring, since their behaviour is the domain verb's and is tested there.

import type { Principal } from "@orb/contracts/identity";
import type { PortableEntity, PortableFile, PortableKind } from "@orb/contracts/portability";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Mock } from "vitest";
import { describe, vi } from "vitest";
import type { PortabilityDeps } from "../../../../packages/server/src/entry/compose/portability.ts";
import { buildPortabilityRegistry } from "../../../../packages/server/src/entry/compose/portability.ts";
import { CHAT_BUNDLE_EXT } from "../../../../packages/server/src/kit/serde/chat-bundle/index.ts";
import { principal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER = castId<UserId>("usr_owner");
const OWNER_PRINCIPAL = principal(OWNER);
const CHARACTER = castId<CharacterId>("chr_1");
const CHAT = castId<ChatId>("chat_1");
const PERSONA = castId<PersonaId>("per_1");

// Raw ST wire TEXT (snake_case by spec) — the format IS the fixture, and a string carries the wire's own
// spelling without a naming-convention suppression.
const CARD_WITH_BOOK =
  '{"spec":"chara_card_v3","spec_version":"3.0","data":{"name":"Aria","description":"a bard","character_book":{"name":"Aria\'s World","entries":[{"keys":["k"],"content":"c","comment":"C","insertion_order":1}]}}}';

// @orb-waive no-test-fabrication(unknown): never dereferenced — the ctx-built descriptors are pinned at layout only. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
const NO_DB = {} as unknown as Db;

/** The bundle's on-disk contract, in the array order the core receives. */
const LAYOUT: readonly (readonly [PortableKind, string, string])[] = [
  ["assets", "assets/", ""],
  ["gallery", "gallery/", ".json"],
  ["tag", "tags/", ".json"],
  ["theme", "themes/", ".json"],
  ["user-settings", "user-settings/", ".json"],
  ["preset", "presets/", ".json"],
  ["world-info", "world-info/", ".json"],
  ["regex", "regex/", ".json"],
  ["databank", "databank/", ".json"],
  ["persona", "personas/", ".json"],
  ["character", "characters/", ".png"],
  ["chat", "chats/", CHAT_BUNDLE_EXT],
];

interface Injected {
  readonly resolveOwnerPrincipal: Mock<(userId: UserId) => Promise<Principal>>;
  readonly exportRegexScripts: ReturnType<typeof vi.fn>;
  readonly importRegexScript: ReturnType<typeof vi.fn>;
  readonly personaList: ReturnType<typeof vi.fn>;
  readonly personaExport: ReturnType<typeof vi.fn>;
  readonly personaImport: ReturnType<typeof vi.fn>;
  readonly listOwnedCharacterIds: ReturnType<typeof vi.fn>;
  readonly exportCharacter: ReturnType<typeof vi.fn>;
  readonly listHostChats: ReturnType<typeof vi.fn>;
  readonly exportChatBundle: ReturnType<typeof vi.fn>;
  // The card-IMPORT half of the character descriptor (#1688/#1598 — the notes forward). Scripted rather than
  // bare `vi.fn()` because the descriptor drives the REAL import verb, which mints a character and consults
  // the primary-book seat oracle.
  readonly characterCreate: ReturnType<typeof vi.fn>;
  readonly findCharacterByImportHash: ReturnType<typeof vi.fn>;
  readonly hasPrimaryBook: ReturnType<typeof vi.fn>;
}

function injected(): Injected {
  return {
    resolveOwnerPrincipal: vi.fn<(userId: UserId) => Promise<Principal>>(() => Promise.resolve(OWNER_PRINCIPAL)),
    exportRegexScripts: vi.fn(() => Promise.resolve([{ filename: "s1.json", bytes: new Uint8Array([1]) }])),
    importRegexScript: vi.fn(() => Promise.resolve({ created: true })),
    personaList: vi.fn(() => Promise.resolve([{ id: PERSONA }])),
    personaExport: vi.fn(() => Promise.resolve({ filename: "me.json", bytes: new Uint8Array([2]) })),
    personaImport: vi.fn(() => Promise.resolve({ ok: true, created: true })),
    listOwnedCharacterIds: vi.fn(() => Promise.resolve([CHARACTER])),
    exportCharacter: vi.fn(() => Promise.resolve({ filename: "Aria.png", bytes: new Uint8Array([3]) })),
    listHostChats: vi.fn(() => Promise.resolve([{ chatId: CHAT, handle: "aria" }])),
    exportChatBundle: vi.fn(() => Promise.resolve({ bytes: new Uint8Array([4]) })),
    characterCreate: vi.fn(() => Promise.resolve({ id: CHARACTER })),
    findCharacterByImportHash: vi.fn(() => Promise.resolve(null)),
    hasPrimaryBook: vi.fn(() => Promise.resolve(false)),
  };
}

function registry(i: Injected): readonly PortableEntity[] {
  // @orb-waive no-test-fabrication(unknown): the domain CONTEXTS are inert stand-ins — the descriptors built from them are pinned Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // at layout only; every descriptor this file DRIVES is built from the injected ops above.
  const deps = {
    db: NO_DB,
    now: () => 1000,
    tagCtx: {},
    settingsCtx: {},
    presetCtx: {},
    worldInfoExportCtx: {},
    importStandaloneLorebook: vi.fn(),
    assetsCtx: {},
    databankCtx: {},
    persona: { list: i.personaList, export: i.personaExport, import: i.personaImport },
    exportService: { exportCharacter: i.exportCharacter, exportChatBundle: i.exportChatBundle, listHostChats: i.listHostChats },
    character: { create: i.characterCreate, update: vi.fn(), findByImportHash: i.findCharacterByImportHash, findByHandle: vi.fn(() => Promise.resolve(null)) },
    listOwnedCharacterIds: i.listOwnedCharacterIds,
    storeAvatar: vi.fn(),
    attachCardTag: vi.fn(),
    importLorebook: vi.fn(),
    hasPrimaryBook: i.hasPrimaryBook,
    importCardScripts: vi.fn(),
    exportRegexScripts: i.exportRegexScripts,
    importRegexScript: i.importRegexScript,
    linkCarriedBooks: vi.fn(),
    bulkImportChats: vi.fn(),
    bulkImportPersonas: vi.fn(),
    findPersonaByName: vi.fn(),
    attachChatTagByName: vi.fn(),
    importRpgGame: vi.fn(),
    enqueueBackfill: vi.fn(),
    reconcileImportStats: vi.fn(),
    resolveOwnerPrincipal: i.resolveOwnerPrincipal,
  } as unknown as PortabilityDeps;
  return buildPortabilityRegistry(deps);
}

function descriptor(i: Injected, kind: PortableKind): PortableEntity {
  const found = registry(i).find((e) => e.kind === kind);
  if (found === undefined) {
    throw new Error(`no descriptor for ${kind}`);
  }
  return found;
}

async function collect(stream: AsyncIterable<PortableFile>): Promise<PortableFile[]> {
  const out: PortableFile[] = [];
  for await (const file of stream) {
    out.push(file);
  }
  return out;
}

describe("buildPortabilityRegistry — the bundle's on-disk layout is the format contract", () => {
  test("every entity is present exactly once, in order, with its dir + extension", () => {
    const entities = registry(injected());

    expect(entities.map((e) => [e.kind, e.dir, e.ext])).toStrictEqual(LAYOUT.map((row) => [...row]));
  });

  test("every descriptor carries BOTH halves (a read-only entity would silently drop on restore)", () => {
    for (const entity of registry(injected())) {
      expect(typeof entity.exportAll).toBe("function");
      expect(typeof entity.importFile).toBe("function");
    }
  });
});

describe("buildPortabilityRegistry — ownerId is the ONLY owner any half ever sees", () => {
  test("persona export mints the principal from the passed ownerId and uses it for every read", async () => {
    const i = injected();

    const files = await collect(descriptor(i, "persona").exportAll(OWNER));

    expect(i.resolveOwnerPrincipal).toHaveBeenCalledWith(OWNER);
    expect(i.personaList).toHaveBeenCalledWith({ principal: OWNER_PRINCIPAL });
    expect(i.personaExport).toHaveBeenCalledWith({ principal: OWNER_PRINCIPAL, personaId: PERSONA });
    expect(files).toStrictEqual([{ filename: "me.json", bytes: new Uint8Array([2]) }]);
  });

  test("persona import re-mints from the ownerId of THAT file, not a principal cached at build", async () => {
    const i = injected();
    const persona = descriptor(i, "persona");
    const other = castId<UserId>("usr_other");
    const otherPrincipal = principal(other);
    i.resolveOwnerPrincipal.mockImplementation((userId) => Promise.resolve(userId === other ? otherPrincipal : OWNER_PRINCIPAL));

    await persona.importFile(OWNER, { filename: "me.json", bytes: new Uint8Array([2]) });
    await persona.importFile(other, { filename: "me.json", bytes: new Uint8Array([2]) });

    expect(i.personaImport.mock.calls.map((c) => (c[0] as { principal: { userId: UserId } }).principal.userId)).toStrictEqual([OWNER, other]);
  });

  test("character export walks only the owner's ids, under the owner's principal", async () => {
    const i = injected();

    const files = await collect(descriptor(i, "character").exportAll(OWNER));

    expect(i.listOwnedCharacterIds).toHaveBeenCalledWith(OWNER);
    expect(i.exportCharacter).toHaveBeenCalledWith({ principal: OWNER_PRINCIPAL, characterId: CHARACTER });
    expect(files).toStrictEqual([{ filename: "Aria.png", bytes: new Uint8Array([3]) }]);
  });

  test("chat export nests under the HOST HANDLE with the chat id as the leaf (the re-link fallback)", async () => {
    const i = injected();

    const files = await collect(descriptor(i, "chat").exportAll(OWNER));

    expect(i.listHostChats).toHaveBeenCalledWith({ principal: OWNER_PRINCIPAL });
    expect(files).toStrictEqual([{ filename: `aria/${CHAT}${CHAT_BUNDLE_EXT}`, bytes: new Uint8Array([4]) }]);
  });

  test("regex export/import stay owner-keyed with no principal mint at all (a library-row op)", async () => {
    const i = injected();
    const regex = descriptor(i, "regex");

    const files = await collect(regex.exportAll(OWNER));
    const outcome = await regex.importFile(OWNER, { filename: "s1.json", bytes: new Uint8Array([1]) });

    expect(i.exportRegexScripts).toHaveBeenCalledWith({ ownerId: OWNER });
    expect(i.importRegexScript).toHaveBeenCalledWith({ ownerId: OWNER, bytes: new Uint8Array([1]) });
    expect(files).toHaveLength(1);
    expect(outcome).toStrictEqual({ ok: true, created: true });
  });
});

describe("buildPortabilityRegistry — a bad file degrades to {ok:false}, it never aborts the restore", () => {
  test("a THROWING regex import becomes an error outcome carrying the message", async () => {
    const i = injected();
    i.importRegexScript.mockRejectedValue(new Error("script bytes are garbage"));

    expect(await descriptor(i, "regex").importFile(OWNER, { filename: "s.json", bytes: new Uint8Array([0]) })).toStrictEqual({
      ok: false,
      error: "script bytes are garbage",
    });
  });

  test("a THROWING persona import becomes an error outcome, and a refusal passes its own reason through", async () => {
    const i = injected();
    const persona = descriptor(i, "persona");
    i.personaImport.mockRejectedValueOnce(new Error("boom"));

    expect(await persona.importFile(OWNER, { filename: "p.json", bytes: new Uint8Array([0]) })).toStrictEqual({ ok: false, error: "boom" });

    i.personaImport.mockResolvedValueOnce({ ok: false, error: "not a persona file" });
    expect(await persona.importFile(OWNER, { filename: "p.json", bytes: new Uint8Array([0]) })).toStrictEqual({ ok: false, error: "not a persona file" });
  });

  test("a non-Error throw is still stringified rather than escaping the descriptor", async () => {
    const i = injected();
    i.importRegexScript.mockRejectedValue("plain string rejection");

    expect(await descriptor(i, "regex").importFile(OWNER, { filename: "s.json", bytes: new Uint8Array([0]) })).toStrictEqual({
      ok: false,
      error: "plain string rejection",
    });
  });

  test("the character and chat import halves catch a failure in the per-owner import build itself", async () => {
    const i = injected();
    i.resolveOwnerPrincipal.mockRejectedValue(new Error("owner row vanished"));

    expect(await descriptor(i, "character").importFile(OWNER, { filename: "Aria.png", bytes: new Uint8Array([0]) })).toStrictEqual({
      ok: false,
      error: "owner row vanished",
    });
    expect(await descriptor(i, "chat").importFile(OWNER, { filename: `aria/x${CHAT_BUNDLE_EXT}`, bytes: new Uint8Array([0]) })).toStrictEqual({
      ok: false,
      error: "owner row vanished",
    });
  });
});

describe("buildPortabilityRegistry — a plane a restore DROPPED rides back as notes (#1688)", () => {
  test("a card whose character already holds a primary book imports, and the outcome NAMES the kept book", async () => {
    const i = injected();
    // #1598: the owner has edited that book since, so the re-upload must not re-assert the card's version.
    i.hasPrimaryBook.mockResolvedValue(true);

    const outcome = await descriptor(i, "character").importFile(OWNER, {
      filename: "Aria.png",
      bytes: new TextEncoder().encode(CARD_WITH_BOOK),
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.notes?.[0]).toContain("was NOT re-asserted");
  });

  test("a card that landed WHOLE carries no notes key at all (silence means nothing was dropped)", async () => {
    const i = injected();

    const outcome = await descriptor(i, "character").importFile(OWNER, {
      filename: "Aria.png",
      bytes: new TextEncoder().encode(CARD_WITH_BOOK),
    });

    expect(outcome).toStrictEqual({ ok: true, created: true });
  });
});

describe("buildPortabilityRegistry — a gone row is SKIPPED, never yielded as an empty file", () => {
  test("a character whose export returns null contributes no bundle entry", async () => {
    const i = injected();
    i.exportCharacter.mockResolvedValue(null);

    expect(await collect(descriptor(i, "character").exportAll(OWNER))).toStrictEqual([]);
  });

  test("a chat whose bundle returns null contributes no bundle entry", async () => {
    const i = injected();
    i.exportChatBundle.mockResolvedValue(null);

    expect(await collect(descriptor(i, "chat").exportAll(OWNER))).toStrictEqual([]);
  });

  test("an owner with nothing exports an EMPTY stream rather than failing the bundle", async () => {
    const i = injected();
    i.listOwnedCharacterIds.mockResolvedValue([]);
    i.listHostChats.mockResolvedValue([]);
    i.personaList.mockResolvedValue([]);
    i.exportRegexScripts.mockResolvedValue([]);

    for (const kind of ["character", "chat", "persona", "regex"] as const) {
      expect(await collect(descriptor(i, kind).exportAll(OWNER))).toStrictEqual([]);
    }
  });
});
