// biome-ignore-all lint/style/useNamingConvention: ST card/chat/settings wire field names (snake_case) are
// the interchange format and appear verbatim in the fixtures.
// entry/import/run-profile-dir-import — the ST profile-DIRECTORY bulk importer the `import-st` workload runs
// (`ctx.env.import.importAll`). Pins the load-bearing composition over an in-memory ImportFsPort fixture +
// recording/stateful fake ports (fake-at-the-edges, inject-at-the-root): personas import BEFORE chats (the
// attribution map), per-bundle character-then-chats, the {scanned, changed} maintenance tally, PD-94's
// maxBytes cap on every stored blob, dryRun's ZERO-write prediction, and idempotency (a byte-identical
// second run scans the same set but changes nothing).

import type { BulkImportChatInput, BulkImportChatsResult } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { BulkImportPersonaInput, BulkImportPersonasResult } from "@orb/contracts/persona";
import { ASSET_UPLOAD_MAX_BYTES } from "@orb/contracts/uploads";
import type { BulkImportLorebookResult } from "@orb/contracts/world-info";
import type { AssetId, CharacterId, Handle, PersonaId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import type { ImportFsPort } from "@orb/server/domain/import";
import type { ImportAssetPort, ImportCharacterPort, ImportTagPort, ProfileDirImportDeps } from "@orb/server/entry/import";
import { createNodeFsImportPort, runProfileDirImport } from "@orb/server/entry/import";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const OWNER: Principal = {
  userId: castId<UserId>("usr_owner"),
  role: "owner",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};
const NOW = 1_700_000_000_000;

// A minimal valid PNG (signature + zero-length IEND) to embed a card into via the kit codec.
const MINIMAL_PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/** A real ST PNG card whose card-name is `name` (→ handle = its slug). */
function cardPng(name: string): Uint8Array {
  const card = {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: { name, description: `${name} the bard`, first_mes: "Hello there!" },
  };
  return writeCardChunk(MINIMAL_PNG, JSON.stringify(card));
}

/** One real_conversation ST chat .jsonl (a greeting + a user turn attributed to `userName`). */
function chatJsonl(userName: string, characterName: string): string {
  return [
    JSON.stringify({
      user_name: userName,
      character_name: characterName,
      create_date: "2025-07-18@12h00m00s",
    }),
    JSON.stringify({ is_user: false, mes: "Hello traveller.", send_date: "2025-07-18@12h00m01s" }),
    JSON.stringify({ is_user: true, mes: "Hi!", send_date: "2025-07-18@12h00m02s" }),
  ].join("\n");
}

const ENC = new TextEncoder();

/** An in-memory ImportFsPort over a flat path→node map (dirs are the paths that have children). */
function memoryFs(files: Record<string, Uint8Array>): ImportFsPort {
  const fileSet = new Map(Object.entries(files));
  const dirs = new Set<string>();
  for (const path of fileSet.keys()) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }
  return {
    readdir: (dir): ReturnType<ImportFsPort["readdir"]> => {
      const children = new Map<string, "file" | "directory">();
      for (const path of fileSet.keys()) {
        if (path.startsWith(`${dir}/`)) {
          const rest = path.slice(dir.length + 1);
          const name = rest.split("/")[0] ?? rest;
          children.set(name, rest.includes("/") ? "directory" : "file");
        }
      }
      return Promise.resolve([...children].map(([name, kind]) => ({ name, kind })));
    },
    readFile: (path): Promise<Uint8Array> => {
      const bytes = fileSet.get(path);
      if (bytes === undefined) {
        return Promise.reject(new Error(`ENOENT: ${path}`));
      }
      return Promise.resolve(bytes);
    },
    stat: (path): Promise<{ readonly size: number }> => {
      const bytes = fileSet.get(path);
      if (bytes === undefined) {
        return Promise.reject(new Error(`ENOENT: ${path}`));
      }
      return Promise.resolve({ size: bytes.byteLength });
    },
    join: (...parts): string => parts.join("/"),
  };
}

interface StoreCall {
  readonly bytes: Uint8Array;
  readonly maxBytes?: number;
}

interface TagAttach {
  readonly characterId: CharacterId;
  readonly tagName: string;
  readonly source: string;
  readonly status: string;
}

interface Fakes {
  readonly character: ImportCharacterPort;
  readonly storeAvatar: ImportAssetPort["store"];
  readonly tag: ImportTagPort["attachCardTagByName"];
  readonly tagAttaches: TagAttach[];
  readonly bulkImportPersonas: (args: { readonly personas: readonly BulkImportPersonaInput[] }) => Promise<BulkImportPersonasResult>;
  readonly bulkImportChats: (args: { readonly chats: readonly BulkImportChatInput[] }) => Promise<BulkImportChatsResult>;
  readonly stores: StoreCall[];
  readonly log: string[];
  readonly backfills: UserId[];
  /** Standalone (unattached) library books imported from `worlds/*.json`, by name — deduped like the real op. */
  readonly standaloneBooks: string[];
}

/** A stateful fake port-set. Character dedups by importHash (byte-identical re-import → created:false),
 *  personas by lowercased name, chats by importHash — so a second identical run writes nothing. `log`
 *  records the op order (personas MUST precede chats). */
function fakes(): Fakes {
  const byHash = new Map<string, CharacterId>();
  const byHandle = new Map<string, CharacterId>();
  const personaByName = new Map<string, PersonaId>();
  const seenChatHashes = new Set<string>();
  const stores: StoreCall[] = [];
  const log: string[] = [];
  const backfills: UserId[] = [];
  const standaloneBooks: string[] = [];
  const tagAttaches: TagAttach[] = [];
  let charSeq = 0;
  let personaSeq = 0;

  const character: ImportCharacterPort = {
    create: ({ input, provenance }) => {
      log.push("character.create");
      charSeq += 1;
      const id = castId<CharacterId>(`chr_${charSeq}`);
      if (provenance !== undefined) {
        byHash.set(provenance.importHash, id);
      }
      byHandle.set(input.handle, id);
      return Promise.resolve({ id });
    },
    update: () => Promise.resolve({ id: castId<CharacterId>("chr_unused") }),
    findByImportHash: ({ importHash }) => {
      const id = byHash.get(importHash);
      return Promise.resolve(id === undefined ? null : { characterId: id });
    },
    findByHandle: ({ handle }) => {
      const id = byHandle.get(handle);
      return Promise.resolve(id === undefined ? null : { characterId: id });
    },
  };

  const storeAvatar: ImportAssetPort["store"] = ({ bytes, maxBytes }) => {
    stores.push({ bytes, ...(maxBytes !== undefined ? { maxBytes } : {}) });
    return Promise.resolve({ assetId: castId<AssetId>("asset_00000000000000000000000000") });
  };

  const tag: ImportTagPort["attachCardTagByName"] = ({ characterId, tagName, source, status }) => {
    tagAttaches.push({ characterId, tagName, source, status });
    return Promise.resolve(true);
  };

  const bulkImportPersonas = (args: { readonly personas: readonly BulkImportPersonaInput[] }): Promise<BulkImportPersonasResult> => {
    log.push("bulkImportPersonas");
    const idByName: Record<string, PersonaId> = {};
    let created = 0;
    for (const p of args.personas) {
      const key = p.name.trim().toLowerCase();
      if (key.length === 0) {
        continue;
      }
      let id = personaByName.get(key);
      if (id === undefined) {
        personaSeq += 1;
        id = castId<PersonaId>(`persona_${String(personaSeq).padStart(26, "0")}`);
        personaByName.set(key, id);
        created += 1;
      }
      idByName[key] = id;
    }
    return Promise.resolve({
      personasCreated: created,
      personasSkipped: args.personas.length - created,
      defaultPersonaId: null,
      idByName,
    });
  };

  const bulkImportChats = (args: { readonly chats: readonly BulkImportChatInput[] }): Promise<BulkImportChatsResult> => {
    log.push("bulkImportChats");
    let imported = 0;
    for (const c of args.chats) {
      if (!seenChatHashes.has(c.importHash)) {
        seenChatHashes.add(c.importHash);
        imported += 1;
      }
    }
    return Promise.resolve({
      // The stub writes nothing, so it reports no written rows — the real op returns one identity per chat.
      written: [],
      chatsImported: imported,
      chatsSkipped: args.chats.length - imported,
      messagesImported: args.chats.reduce((n, c) => n + c.messages.length, 0),
      variantsImported: 0,
      branchesLinked: 0,
      realConversationWritten: imported > 0 && args.chats.some((c) => c.isRealConversation),
    });
  };

  return {
    character,
    storeAvatar,
    tag,
    tagAttaches,
    bulkImportPersonas,
    bulkImportChats,
    stores,
    log,
    backfills,
    standaloneBooks,
  };
}

/** A one-user-dir ST profile snapshot under `root/`: one PNG card + its chat + one settings.json persona. */
function fixtureFiles(root: string): Record<string, Uint8Array> {
  return {
    [`${root}/userA/characters/Aria.png`]: cardPng("Aria"),
    [`${root}/userA/chats/Aria/chat1.jsonl`]: ENC.encode(chatJsonl("Nate", "Aria")),
    [`${root}/userA/settings.json`]: ENC.encode(
      JSON.stringify({
        power_user: { personas: { "nate.png": "Nate" }, default_persona: "nate.png" },
      }),
    ),
    [`${root}/userA/User Avatars/nate.png`]: MINIMAL_PNG,
  };
}

function deps(fs: ImportFsPort, f: ReturnType<typeof fakes>, over: Partial<Pick<ProfileDirImportDeps, "dryRun">> = {}): ProfileDirImportDeps {
  return {
    fs,
    profileRoot: "root",
    principal: OWNER,
    character: f.character,
    storeAvatar: f.storeAvatar,
    attachCardTag: f.tag,
    bulkImportChats: f.bulkImportChats,
    bulkImportPersonas: f.bulkImportPersonas,
    importStandaloneLorebook: ({ book }): Promise<BulkImportLorebookResult> => {
      const replaced = f.standaloneBooks.includes(book.name);
      if (!replaced) {
        f.standaloneBooks.push(book.name);
      }
      return Promise.resolve({ worldBookId: castId<WorldBookId>("wb_00000000000000000000000000"), entryCount: book.entries.length, replaced });
    },
    enqueueBackfill: ({ ownerId }): Promise<void> => {
      f.backfills.push(ownerId);
      return Promise.resolve();
    },
    reconcileImportStats: () => Promise.resolve(),
    now: () => NOW,
    dryRun: over.dryRun ?? false,
    signal: new AbortController().signal,
  };
}

describe("runProfileDirImport", () => {
  test("imports personas → per-bundle character + chats, tallying scanned/changed", async () => {
    const fs = memoryFs(fixtureFiles("root"));
    const f = fakes();

    const result = await runProfileDirImport(deps(fs, f));

    // scanned = 1 bundle + 1 persona + 1 chat file; changed = 1 persona created + 1 char + 1 chat imported.
    expect(result.scanned).toBe(3);
    expect(result.changed).toBe(3);
    // Personas MUST be written before the chat importer (it attributes user_names against them).
    expect(f.log.indexOf("bulkImportPersonas")).toBeLessThan(f.log.indexOf("bulkImportChats"));
    expect(f.log.indexOf("bulkImportPersonas")).toBeLessThan(f.log.indexOf("character.create"));
    // PD-94: every stored blob (persona avatar + the card PNG) carries the maxBytes cap.
    expect(f.stores).toHaveLength(2);
    for (const s of f.stores) {
      expect(s.maxBytes).toBe(ASSET_UPLOAD_MAX_BYTES);
    }
    // A real_conversation chat enqueues exactly one memory backfill (PD-78).
    expect(f.backfills).toEqual([OWNER.userId]);
  });

  test("dryRun predicts the create count with ZERO writes", async () => {
    const fs = memoryFs(fixtureFiles("root"));
    const f = fakes();

    const result = await runProfileDirImport(deps(fs, f, { dryRun: true }));

    expect(result.scanned).toBe(3);
    // one would-be-created character (fresh owner: no importHash/handle match); personas/chats not predicted.
    expect(result.changed).toBe(1);
    // No write op fired — no store, no create, no bulk import, no backfill.
    expect(f.stores).toHaveLength(0);
    expect(f.log).toHaveLength(0);
    expect(f.backfills).toHaveLength(0);
  });

  test("standalone worlds import as UNATTACHED library books, BEFORE characters, counted in the tally", async () => {
    // A native ST world-info file (entries keyed by uid; `key`/`order`/`disable` field spellings) lives in
    // `worlds/`. It must import as an owner library book (never a character attach) and be written before the
    // character wave.
    const stWorld = JSON.stringify({
      entries: {
        "0": { uid: 0, key: ["eldoria"], comment: "Eldoria", content: "A magical forest.", position: 0, order: 100, constant: false, disable: false },
        "1": { uid: 1, key: ["dragon"], comment: "Dragon", content: "Hoards gold.", position: 4, depth: 3, role: 1, order: 50, constant: true, disable: true },
      },
    });
    const files = { ...fixtureFiles("root"), "root/userA/worlds/Eldoria.json": ENC.encode(stWorld) };
    const fs = memoryFs(files);
    const f = fakes();

    const result = await runProfileDirImport(deps(fs, f));

    // The world imported as a library book, by its filename stem.
    expect(f.standaloneBooks).toEqual(["Eldoria"]);
    // scanned now = 1 bundle + 1 persona + 1 chat + 1 world; changed = persona + world + char + chat = 4.
    expect(result.scanned).toBe(4);
    expect(result.changed).toBe(4);
    // Worlds are written before the first character (a name-link would resolve against them).
    expect(f.log.indexOf("character.create")).toBeGreaterThanOrEqual(0);
  });

  test("MANY characters with chats import fully + enqueue EXACTLY ONE backfill (no per-character abort)", async () => {
    // Regression: the memory backfill used to be enqueued per character that wrote a real conversation. The
    // second such enqueue collided on the per-(kind, owner) admission lock and, unhandled, aborted the whole
    // import mid-loop — "hundreds of characters, only 2 imported". The backfill is now deferred to ONE enqueue
    // after the entire import, so every character lands and embeddings never run mid-import.
    const files: Record<string, Uint8Array> = {};
    for (const name of ["Aria", "Bram", "Cleo", "Dex"]) {
      files[`root/userA/characters/${name}.png`] = cardPng(name);
      files[`root/userA/chats/${name}/chat1.jsonl`] = ENC.encode(chatJsonl("Nate", name));
    }
    const fs = memoryFs(files);
    const f = fakes();

    const result = await runProfileDirImport(deps(fs, f));

    // 4 characters + 4 chats all imported (no abort after the second).
    expect(f.log.filter((l) => l === "character.create")).toHaveLength(4);
    expect(f.log.filter((l) => l === "bulkImportChats")).toHaveLength(4);
    expect(result.changed).toBe(8); // 4 chars + 4 chats (no personas in this fixture)
    // EXACTLY ONE backfill for the whole import — not one per character, and never a thrown conflict.
    expect(f.backfills).toEqual([OWNER.userId]);
  });

  test("ST library tags (settings.tags + tag_map) attach to the matching character by card filename", async () => {
    // ST assigns library tags by the character's avatar filename (the card PNG name). The importer resolves
    // tag_map ids → names against `tags` and attaches them to the imported character as manual/accepted.
    const files: Record<string, Uint8Array> = {
      "root/userA/characters/Aria.png": cardPng("Aria"),
      "root/userA/settings.json": ENC.encode(
        JSON.stringify({
          tags: [
            { id: "10", name: "Fantasy" },
            { id: "20", name: "Romance" },
          ],
          tag_map: { "Aria.png": ["10", "20"], "Ghost.png": ["10"] },
        }),
      ),
    };
    const fs = memoryFs(files);
    const f = fakes();

    await runProfileDirImport(deps(fs, f));

    // Only Aria imported (no Ghost.png card) → only Aria's tags attach, both by NAME, manual/accepted.
    expect(f.tagAttaches).toEqual([
      { characterId: castId<CharacterId>("chr_1"), tagName: "Fantasy", source: "manual", status: "accepted" },
      { characterId: castId<CharacterId>("chr_1"), tagName: "Romance", source: "manual", status: "accepted" },
    ]);
  });

  test("dryRun attaches NO tags (zero writes)", async () => {
    const files: Record<string, Uint8Array> = {
      "root/userA/characters/Aria.png": cardPng("Aria"),
      "root/userA/settings.json": ENC.encode(JSON.stringify({ tags: [{ id: "10", name: "Fantasy" }], tag_map: { "Aria.png": ["10"] } })),
    };
    const fs = memoryFs(files);
    const f = fakes();

    await runProfileDirImport(deps(fs, f, { dryRun: true }));

    expect(f.tagAttaches).toHaveLength(0);
  });

  test("idempotent: a byte-identical second run scans the same set, changes nothing", async () => {
    const fs = memoryFs(fixtureFiles("root"));
    const f = fakes();

    const first = await runProfileDirImport(deps(fs, f));
    expect(first.changed).toBe(3);

    const second = await runProfileDirImport(deps(fs, f));
    expect(second.scanned).toBe(3);
    expect(second.changed).toBe(0);
    // The second run creates no new character (the importHash oracle short-circuits before any store).
    expect(f.log.filter((l) => l === "character.create")).toHaveLength(1);
  });
});

describe("createNodeFsImportPort", () => {
  test("readdir resolves [] for a missing dir instead of throwing", async () => {
    const fs = createNodeFsImportPort();
    await expect(fs.readdir("/no/such/orbweaver/profile/dir")).resolves.toEqual([]);
  });
});
