// entry/import/run-profile-dir-import — the ST profile-DIRECTORY bulk importer the `import-st` workload runs
// (`ctx.env.import.importAll`). Pins the load-bearing composition over an in-memory ImportFsPort fixture +
// recording/stateful fake ports (fake-at-the-edges, inject-at-the-root): personas import BEFORE chats (the
// attribution map), per-bundle character-then-chats, the {scanned, changed} maintenance tally, PD-94's
// maxBytes cap on every stored blob, dryRun's ZERO-write prediction, and idempotency (a byte-identical
// second run scans the same set but changes nothing).

import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BulkImportChatInput, BulkImportChatsResult } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { BulkImportPersonaInput, BulkImportPersonasResult } from "@orb/contracts/persona";
import { ASSET_UPLOAD_MAX_BYTES } from "@orb/contracts/uploads";
import type { BulkImportLorebookResult } from "@orb/contracts/world-info";
import type { AssetId, CharacterId, Handle, PersonaId, PresetId, UserId, WorldBookId } from "@orb/kit/ids";
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

// The zone the fixtures' ST wall clocks were "written" on. ST's `2025-07-18@12h00m00s` form is ZONE-LESS
// LOCAL, so the importer must resolve it in the snapshot's own zone — Denver is MDT (UTC-6) on that date.
const ST_ZONE_DENVER = "America/Denver";
/** `2025-07-18@12h00m00s` resolved in America/Denver. Six hours LATER than the UTC misreading it replaced. */
const DENVER_CREATE_MS = Date.UTC(2025, 6, 18, 18, 0, 0);
const ONE_SECOND_MS = 1000;

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

/** One real_conversation ST chat .jsonl (a greeting + a user turn attributed to `userName`). `meta` is the
 *  header's `chat_metadata` — omitted entirely when empty, so the default fixture stays byte-identical. */
function chatJsonl(userName: string, characterName: string, meta: Record<string, unknown> = {}): string {
  return [
    JSON.stringify({
      user_name: userName,
      character_name: characterName,
      create_date: "2025-07-18@12h00m00s",
      ...(Object.keys(meta).length > 0 ? { chat_metadata: meta } : {}),
    }),
    JSON.stringify({ is_user: false, mes: "Hello traveller.", send_date: "2025-07-18@12h00m01s" }),
    JSON.stringify({ is_user: true, mes: "Hi!", send_date: "2025-07-18@12h00m02s" }),
  ].join("\n");
}

/** A real-shaped ST GROUP-CHAT `.jsonl`: the per-line `original_avatar` (the SPEAKING CARD'S FILENAME) is the
 *  identity key an ST group export actually carries — verbatim from a real `group chats/*.jsonl` in the corpus,
 *  where every assistant line stamps `original_avatar: "Rowan.png"` beside the display `name`. */
function groupChatJsonl(userName: string): string {
  return [
    JSON.stringify({ user_name: userName, character_name: "unused", create_date: "2025-07-18@12h00m00s" }),
    JSON.stringify({ name: "Aria", is_user: false, original_avatar: "Aria.png", mes: "Aria speaks.", send_date: "2025-07-18@12h00m01s" }),
    JSON.stringify({ name: userName, is_user: true, mes: "Hi both!", send_date: "2025-07-18@12h00m02s" }),
    // No `original_avatar` — the pre-group-era shape; resolves by the roster-SCOPED display name instead.
    JSON.stringify({ name: "Bram", is_user: false, mes: "Bram answers.", send_date: "2025-07-18@12h00m03s" }),
    // A speaker that is NEITHER seated NOR named in the roster → falls through to the room's primary.
    JSON.stringify({ name: "Ghost", is_user: false, original_avatar: "Ghost.png", mes: "A stranger.", send_date: "2025-07-18@12h00m04s" }),
  ].join("\n");
}

/** A real-shaped ST `groups/<id>.json`: members are CARD FILENAMES and `chats` names transcript leaves (no
 *  extension), both verbatim from the corpus's own group definition. */
function groupJson(members: readonly string[], chats: readonly string[], over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "1773514134935",
    name: "Group: Aria + Bram",
    members,
    avatar_url: "/thumbnail?type=avatar&file=Aria.png",
    allow_self_responses: false,
    activation_strategy: 0,
    generation_mode: 0,
    disabled_members: [],
    chat_id: chats[0],
    chats,
    ...over,
  });
}

/** A real-shaped ST chat-completion preset (`OpenAI Settings/*.json`) — the marker/custom prompt + prompt_order
 *  structure and the sampler/behaviour scalars, trimmed from a real corpus preset. `wrap_in_quotes` is a real
 *  ST field with NO orb seat, so it exercises the unmapped-field reporting. */
function openAiPresetJson(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    temperature: 1,
    top_p: 1,
    openai_max_tokens: 1200,
    names_behavior: 2,
    wrap_in_quotes: true,
    impersonation_prompt: "Write as the user.",
    prompt_order: [
      {
        character_id: 100_001,
        order: [
          { identifier: "charDescription", enabled: true },
          { identifier: "main", enabled: false },
          { identifier: "chatHistory", enabled: true },
        ],
      },
    ],
    prompts: [
      { identifier: "charDescription", name: "|| Description", system_prompt: true, marker: true, role: "system", content: "" },
      { identifier: "main", name: "| Prompt", system_prompt: true, role: "system", content: "You are a storyteller." },
      { identifier: "chatHistory", name: "Chat History", system_prompt: true, marker: true },
    ],
    ...over,
  });
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
  readonly bulkImportChats: (args: { readonly characterId: CharacterId; readonly chats: readonly BulkImportChatInput[] }) => Promise<BulkImportChatsResult>;
  /** Every bulk-chat write this run made, in order — the group wave's roster + per-slot speaker land here. */
  readonly chatWrites: { readonly characterId: CharacterId; readonly chats: readonly BulkImportChatInput[] }[];
  /** The preset domain's import op, faked: records the NAMES it was handed and dedups them like the real
   *  (ownerId, name)-idempotent verb, so a second run reports `created:false` instead of a second preset. */
  readonly importPreset: (args: { readonly ownerId: UserId; readonly bytes: Uint8Array }) => Promise<{ ok: boolean; created?: boolean; error?: string }>;
  readonly presetWrites: string[];
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

  const chatWrites: { characterId: CharacterId; chats: readonly BulkImportChatInput[] }[] = [];
  const presetWrites: string[] = [];
  const presetNames = new Set<string>();

  // The preset domain's real verb is idempotent on (ownerId, name): a same-named preset MERGES in place and
  // reports created:false. The fake mirrors that so the double-run test proves a clean no-op, not a duplicate.
  const importPreset = (args: {
    readonly ownerId: UserId;
    readonly bytes: Uint8Array;
  }): Promise<{ ok: boolean; created?: boolean; error?: string; presetId?: PresetId }> => {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(args.bytes));
    const name = (parsed as { name?: unknown }).name;
    if (typeof name !== "string") {
      return Promise.resolve({ ok: false, error: "no name" });
    }
    presetWrites.push(name);
    const created = !presetNames.has(name);
    presetNames.add(name);
    // The row id the real verb reports (create OR merge) — the preset-scripts lift attaches to exactly it.
    return Promise.resolve({ ok: true, created, presetId: castId<PresetId>(`preset_${name.replaceAll(/\W/g, "")}`) });
  };

  const bulkImportChats = (args: { readonly characterId: CharacterId; readonly chats: readonly BulkImportChatInput[] }): Promise<BulkImportChatsResult> => {
    log.push("bulkImportChats");
    chatWrites.push({ characterId: args.characterId, chats: args.chats });
    let imported = 0;
    for (const c of args.chats) {
      if (!seenChatHashes.has(c.importHash)) {
        seenChatHashes.add(c.importHash);
        imported += 1;
      }
    }
    return Promise.resolve({
      // The stub writes nothing, so it reports no written rows — the real op returns one identity per chat.
      identities: [],
      written: [],
      chatsImported: imported,
      chatsSkipped: args.chats.length - imported,
      messagesImported: args.chats.reduce((n, c) => n + c.messages.length, 0),
      variantsImported: 0,
      branchesLinked: 0,
      realConversationWritten: imported > 0 && args.chats.some((c) => c.isRealConversation),
      chatsPersonaHealed: 0,
    });
  };

  return {
    character,
    storeAvatar,
    tag,
    tagAttaches,
    bulkImportPersonas,
    bulkImportChats,
    chatWrites,
    importPreset,
    presetWrites,
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
    [`${root}/userA/chats/Aria/chat1.jsonl`]: ENC.encode(chatJsonl("Alex", "Aria")),
    [`${root}/userA/settings.json`]: ENC.encode(
      JSON.stringify({
        power_user: { personas: { "alex.png": "Alex" }, default_persona: "alex.png" },
      }),
    ),
    [`${root}/userA/User Avatars/alex.png`]: MINIMAL_PNG,
  };
}

function deps(
  fs: ImportFsPort,
  f: ReturnType<typeof fakes>,
  over: Partial<Pick<ProfileDirImportDeps, "dryRun" | "stWallClockZone">> = {},
): ProfileDirImportDeps {
  return {
    ...(over.stWallClockZone === undefined ? {} : { stWallClockZone: over.stWallClockZone }),
    fs,
    profileRoot: "root",
    principal: OWNER,
    character: f.character,
    storeAvatar: f.storeAvatar,
    attachCardTag: f.tag,
    bulkImportChats: f.bulkImportChats,
    bulkImportPersonas: f.bulkImportPersonas,
    importPreset: f.importPreset,
    importStandaloneLorebook: ({ book }): Promise<BulkImportLorebookResult> => {
      const replaced = f.standaloneBooks.includes(book.name);
      if (!replaced) {
        f.standaloneBooks.push(book.name);
      }
      return Promise.resolve({ worldBookId: castId<WorldBookId>("wb_00000000000000000000000000"), entryCount: book.entries.length, replaced });
    },
    enqueueBackfill: ({ ownerId }): Promise<boolean> => {
      f.backfills.push(ownerId);
      return Promise.resolve(true);
    },
    reconcileImportStats: () => Promise.resolve(),
    now: () => NOW,
    dryRun: over.dryRun ?? false,
    signal: new AbortController().signal,
  };
}

describe("runProfileDirImport", () => {
  test("sorts a directory before applying the collector entry ceiling", async () => {
    const cardPath = "root/userA/characters/a.png";
    const base = memoryFs({ [cardPath]: cardPng("A") });
    const filesystemOrder: { name: string; kind: "file" | "other" }[] = Array.from({ length: 100_000 }, (_unused, i) => ({
      name: `z-${String(i).padStart(6, "0")}`,
      kind: "other",
    }));
    filesystemOrder.push({ name: "a.png", kind: "file" });
    const fs: ImportFsPort = {
      ...base,
      readdir: (dir) => (dir === "root/userA/characters" ? Promise.resolve(filesystemOrder) : base.readdir(dir)),
    };
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.changed).toBe(1);
    expect(f.log).toContain("character.create");
  });

  test("rejects an oversized non-chat candidate from stat before reading it", async () => {
    const cardPath = "root/userA/characters/Aria.png";
    const base = memoryFs({ [cardPath]: cardPng("Aria") });
    const reads: string[] = [];
    const fs: ImportFsPort = {
      ...base,
      readFile: (path) => {
        reads.push(path);
        return base.readFile(path);
      },
      stat: (path) => (path === cardPath ? Promise.resolve({ size: ASSET_UPLOAD_MAX_BYTES + 1 }) : base.stat(path)),
    };

    await expect(runProfileDirImport(deps(fs, fakes()))).rejects.toMatchObject({
      name: "ProfileImportLimitError",
      code: "profile_file_too_large",
    });
    expect(reads).not.toContain(cardPath);
  });

  test("rejects before reading the candidate that would exceed the direct-profile aggregate budget", async () => {
    const files: Record<string, Uint8Array> = {};
    const cardPaths: string[] = [];
    for (let i = 0; i < 17; i += 1) {
      const path = `root/user-${String(i).padStart(2, "0")}/characters/Card-${i}.png`;
      files[path] = cardPng(`Card ${i}`);
      cardPaths.push(path);
    }
    const base = memoryFs(files);
    const reads: string[] = [];
    const fs: ImportFsPort = {
      ...base,
      readFile: (path) => {
        reads.push(path);
        return base.readFile(path);
      },
      stat: (path) => (cardPaths.includes(path) ? Promise.resolve({ size: ASSET_UPLOAD_MAX_BYTES }) : base.stat(path)),
    };

    await expect(runProfileDirImport(deps(fs, fakes()))).rejects.toMatchObject({
      name: "ProfileImportLimitError",
      code: "profile_total_too_large",
    });
    expect(reads.filter((path) => cardPaths.includes(path))).toHaveLength(16);
    expect(reads).not.toContain(cardPaths[16]);
  });

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
      files[`root/userA/chats/${name}/chat1.jsonl`] = ENC.encode(chatJsonl("Alex", name));
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

  // §5.7 — ST's chat-bound persona pick, at the WHOLE-RUN tier: the persona wave must have populated the
  // name map before the chat wave reads the pin, and an unresolvable pick has to reach the operator's report
  // rather than dying in the mapper. (The column-level resolution proof lives in st-chat-fidelity.suite.)
  test("a chat's ST pinnedPersona resolves against the personas this run imported", async () => {
    const files = {
      ...fixtureFiles("root"),
      // ST's real shape on a pinned chat: the header user_name is the `unused` sentinel, so the PIN is the
      // only signal of who the user was.
      "root/userA/chats/Aria/pinned.jsonl": ENC.encode(chatJsonl("unused", "Aria", { pinnedPersona: "Alex" })),
    };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    const written = f.chatWrites.flatMap((w) => w.chats);
    const pinned = written.find((c) => c.importedFrom === "pinned.jsonl");
    // The persona wave minted exactly one persona ("Alex"), and the pin resolved onto it.
    expect(pinned?.anchorPersonaId).toBe(castId<PersonaId>(`persona_${"1".padStart(26, "0")}`));
    expect(report.unresolvedPinnedPersonas).toEqual([]);
  });

  test("an UNRESOLVABLE pinnedPersona is reported, never guessed, and never blocks the chat", async () => {
    const files = {
      ...fixtureFiles("root"),
      "root/userA/chats/Aria/orphan-pin.jsonl": ENC.encode(chatJsonl("unused", "Aria", { pinnedPersona: "Ghost" })),
    };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.unresolvedPinnedPersonas).toEqual([{ chat: "orphan-pin.jsonl", persona: "Ghost" }]);
    // The chat still imported — an unresolved pick costs the pick, never the transcript. And no near-match:
    // "Ghost" did NOT quietly land on the run's only persona.
    const orphan = f.chatWrites.flatMap((w) => w.chats).find((c) => c.importedFrom === "orphan-pin.jsonl");
    expect(orphan).toBeDefined();
    expect(orphan?.anchorPersonaId).toBeNull();
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

/** A profile carrying BOTH new planes: two cards, an ST chat-completion preset (file + the live blob), and one
 *  group whose members are those two cards with a single group transcript. */
function presetAndGroupFiles(root: string): Record<string, Uint8Array> {
  return {
    [`${root}/userA/characters/Aria.png`]: cardPng("Aria"),
    [`${root}/userA/characters/Bram.png`]: cardPng("Bram"),
    [`${root}/userA/OpenAI Settings/Marinara.json`]: ENC.encode(openAiPresetJson()),
    [`${root}/userA/settings.json`]: ENC.encode(JSON.stringify({ oai_settings: JSON.parse(openAiPresetJson({ temperature: 0.7 })) })),
    [`${root}/userA/groups/1773514134935.json`]: ENC.encode(groupJson(["Aria.png", "Bram.png"], ["party-night"])),
    [`${root}/userA/group chats/party-night.jsonl`]: ENC.encode(groupChatJsonl("Alex")),
  };
}

describe("runProfileDirImport — ST chat-completion presets", () => {
  test("the four preset planes leave the unhandled lists, and the saved file + live blob both import", async () => {
    const fs = memoryFs(presetAndGroupFiles("root"));
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    // The affordance a user reads: the report no longer says these planes were left behind.
    expect(report.unhandled).not.toContain("OpenAI Settings/");
    expect(report.unhandledSettings).not.toContain("oai_settings");
    // The saved preset is FAMILY-QUALIFIED (ST ships a `Default.json`; an unqualified name would merge onto an
    // owner's own preset of that name), and the live blob lands under its own distinct name.
    expect(f.presetWrites).toEqual(["Marinara (OpenAI)", "OpenAI (active)"]);
    expect(report.presetsImported).toBe(2);
    expect(report.skippedPresets).toEqual([]);
  });

  test("the TEXT-completion families stay unhandled, with the owner's ruling as the reason", async () => {
    // Owner ruling 2026-08-08: orb has no text-completion mode, so these are a deliberate refusal, not a gap.
    const files: Record<string, Uint8Array> = {
      "root/userA/characters/Aria.png": cardPng("Aria"),
      "root/userA/TextGen Settings/Universal-Creative.json": ENC.encode(JSON.stringify({ temp: 1.5, top_p: 1, min_p: 0.1, rep_pen: 1 })),
      "root/userA/KoboldAI Settings/Universal-Creative.json": ENC.encode(JSON.stringify({ temp: 1.5, top_a: 0, typical: 1 })),
      "root/userA/NovelAI Settings/Carefree-Kayra.json": ENC.encode(JSON.stringify({ temperature: 1.35, repetition_penalty: 2.8 })),
      "root/userA/settings.json": ENC.encode(JSON.stringify({ textgenerationwebui_settings: {}, kai_settings: {}, nai_settings: {} })),
    };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.unhandled).toEqual(expect.arrayContaining(["TextGen Settings/", "KoboldAI Settings/", "NovelAI Settings/"]));
    expect(report.unhandledSettings).toEqual(expect.arrayContaining(["textgenerationwebui_settings", "kai_settings", "nai_settings"]));
    // Not one of them was written as a preset.
    expect(f.presetWrites).toEqual([]);
  });

  test("a preset's ST fields with no orb seat are REPORTED, per preset", async () => {
    const files: Record<string, Uint8Array> = { "root/userA/OpenAI Settings/Marinara.json": ENC.encode(openAiPresetJson()) };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    const note = report.presetNotes.find((n) => n.name === "Marinara (OpenAI)");
    expect(note?.sourceFile).toBe("OpenAI Settings/Marinara.json");
    // `wrap_in_quotes: true` is a real ST field orb has no knob for — it must appear with its reason.
    expect(note?.fields.map((x) => x.field)).toContain("wrap_in_quotes");
  });

  test("an unparseable preset file is recorded, never silent, and never aborts the run", async () => {
    const files: Record<string, Uint8Array> = {
      "root/userA/characters/Aria.png": cardPng("Aria"),
      "root/userA/OpenAI Settings/broken.json": ENC.encode("{not json"),
      "root/userA/OpenAI Settings/Marinara.json": ENC.encode(openAiPresetJson()),
    };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.unreadablePresets).toEqual(["OpenAI Settings/broken.json"]);
    expect(f.presetWrites).toEqual(["Marinara (OpenAI)"]);
    // The good card still imported — one bad preset is not an aborted profile.
    expect(f.log.filter((l) => l === "character.create")).toHaveLength(1);
  });
});

describe("runProfileDirImport — ST groups", () => {
  test("a group becomes ONE room per transcript: host + every member seated, speakers attributed per turn", async () => {
    const fs = memoryFs(presetAndGroupFiles("root"));
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.unhandled).not.toContain("groups/");
    expect(report.unhandled).not.toContain("group chats/");
    expect(report.groupsImported).toBe(1);
    expect(report.groupChatsImported).toBe(1);

    // The group write is the LAST chat write (the wave runs after the character wave, which is what makes the
    // card-filename → characterId map exist at all).
    const groupWrite = f.chatWrites.at(-1);
    const chat = groupWrite?.chats[0];
    // Aria is the room's PRIMARY (ST's first member); Bram is the extra roster seat.
    expect(groupWrite?.characterId).toBe(castId<CharacterId>("chr_1"));
    expect(chat?.characterIds).toEqual([castId<CharacterId>("chr_2")]);
    // Per-turn attribution: `original_avatar` resolves Aria BY CARD FILENAME; Bram's line carries none, so the
    // roster-scoped display name resolves it; the user turn is never character-attributed; and an off-roster
    // speaker falls through to the primary by carrying NO characterId (absent ⇒ primary, per the op's contract).
    expect(chat?.messages.map((m) => m.characterId)).toEqual([castId<CharacterId>("chr_1"), undefined, castId<CharacterId>("chr_2"), undefined]);
    // The room is born with the group's own behaviour blob (ST generation_mode 0 = one speaker per turn).
    expect((chat?.metadata as { group?: { output?: string } } | undefined)?.group?.output).toBe("per-speaker");
  });

  test("ST generation_mode 1 (append) becomes a NARRATOR room", async () => {
    const files = {
      ...presetAndGroupFiles("root"),
      "root/userA/groups/g.json": ENC.encode(groupJson(["Aria.png", "Bram.png"], ["party-night"], { generation_mode: 1 })),
    };
    const fs = memoryFs(files);
    const f = fakes();

    await runProfileDirImport(deps(fs, f));

    const outputs = f.chatWrites
      .flatMap((w) => w.chats.map((c) => (c.metadata as { group?: { output?: string } } | undefined)?.group?.output))
      .filter((o) => o !== undefined);
    expect(outputs).toContain("narrator");
  });

  test("an ORPHAN member is skipped with a note; the room still imports around the members that resolved", async () => {
    const files = {
      ...presetAndGroupFiles("root"),
      "root/userA/groups/1773514134935.json": ENC.encode(groupJson(["Aria.png", "Nobody.png"], ["party-night"])),
    };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.groupsImported).toBe(1);
    expect(report.skippedGroupMembers).toEqual([
      { group: "Group: Aria + Bram", member: "Nobody.png", reason: "no character with that card filename in the import set or the library" },
    ]);
    // One seat only — the room formed around the member that did resolve.
    expect(f.chatWrites.at(-1)?.chats[0]?.characterIds).toEqual([]);
  });

  test("a group whose members ALL fail to resolve is skipped with a reason, never aborting the wave", async () => {
    const files = { ...presetAndGroupFiles("root"), "root/userA/groups/1773514134935.json": ENC.encode(groupJson(["Nobody.png"], ["party-night"])) };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.groupsImported).toBe(0);
    expect(report.skippedGroups).toEqual([{ group: "Group: Aria + Bram", reason: "none of its member cards resolved to an imported or existing character" }]);
    // The character wave still landed both cards.
    expect(f.log.filter((l) => l === "character.create")).toHaveLength(2);
  });

  test("a transcript leaf the group claims but that has no file is recorded, never silent", async () => {
    const files = {
      ...presetAndGroupFiles("root"),
      "root/userA/groups/1773514134935.json": ENC.encode(groupJson(["Aria.png", "Bram.png"], ["party-night", "gone"])),
    };
    const fs = memoryFs(files);
    const f = fakes();

    const report = await runProfileDirImport(deps(fs, f));

    expect(report.missingGroupChats).toEqual(["gone.jsonl"]);
    expect(report.groupChatsImported).toBe(1);
  });

  test("a group transcript's DATES resolve in the ST wall-clock zone, exactly like a solo one", async () => {
    // The group wave used to read its transcripts as UTC while the solo wave threaded the injected zone: the
    // collector forwarded `wallClockZone` to `collectChatsForDir` and NOT to `collectGroups`, so every
    // imported ST group room (and every one of its messages) landed at the writing box's UTC offset — 6h
    // early for this Denver snapshot. Counts alone never saw it; only the instants do.
    const fs = memoryFs(presetAndGroupFiles("root"));
    const f = fakes();

    await runProfileDirImport(deps(fs, f, { stWallClockZone: ST_ZONE_DENVER }));

    const groupChat = f.chatWrites.at(-1)?.chats[0];
    expect(groupChat?.createdAt).toBe(DENVER_CREATE_MS);
    // Every message instant rides the same parse, so the first line's `send_date` (+1s) must shift with it.
    expect(groupChat?.messages[0]?.createdAt).toBe(DENVER_CREATE_MS + ONE_SECOND_MS);
    // The title's date is rendered from the SAME instant in the SAME zone — it was already zone-correct
    // (the group verb threads the zone to the mapper), which is exactly why the drift stayed invisible.
    expect(groupChat?.title).toBe("Group: Aria + Bram — Jul 18, 2025");
  });

  test("a byte-identical second run is a clean idempotent no-op across BOTH new planes", async () => {
    // The owner's pre-commit check: family-qualified names must not double-qualify, and nothing may duplicate.
    const fs = memoryFs(presetAndGroupFiles("root"));
    const f = fakes();

    const first = await runProfileDirImport(deps(fs, f));
    expect(first.presetsImported).toBe(2);
    expect(first.groupsImported).toBe(1);
    expect(first.groupChatsImported).toBe(1);

    const second = await runProfileDirImport(deps(fs, f));

    // Same names both runs — no `(OpenAI) (OpenAI)`, and the (ownerId, name) merge means no second preset row.
    expect(f.presetWrites).toEqual(["Marinara (OpenAI)", "OpenAI (active)", "Marinara (OpenAI)", "OpenAI (active)"]);
    // The chat write op deduped by importHash, so the group transcript is NOT written a second time — and the
    // room therefore reports as NOT imported (net-new canon, not "processed").
    expect(second.groupChatsImported).toBe(0);
    expect(second.groupsImported).toBe(0);
    // The presets were ACCEPTED again (merged in place) but none is net-new canon.
    expect(second.presetsImported).toBe(2);
    expect(second.changed).toBe(0);
    // The same set was examined; no new character canon.
    expect(second.scanned).toBe(first.scanned);
    expect(f.log.filter((l) => l === "character.create")).toHaveLength(2);
  });

  // ── THE SILENT-GAP SWEEP (2026-08-15): regex (card · preset · global), world name-links, user planes ────
  // Every plane below vanished with NO report line before this wave. The fixture values are the GENUINE ST
  // dialect (scriptName + integer placements — verbatim corpus shapes), because the schema-level dialect gap
  // was exactly how the card lift stayed silently empty even where it was wired.
  test("regex scripts lift from cards, presets and settings; world names link; user planes are counted", async () => {
    const stScript = (scriptName: string): Record<string, unknown> => ({
      id: `st-${scriptName}`,
      scriptName,
      findRegex: "/\\.{3}/g",
      replaceString: "…",
      trimStrings: [],
      placement: [1, 2],
      disabled: false,
      markdownOnly: false,
      promptOnly: false,
      runOnEdit: true,
      substituteRegex: 0,
      minDepth: null,
      maxDepth: null,
    });
    // A card carrying BOTH its own scripts AND a world NAME-LINK (`extensions.world` — the ST primary-book
    // binding; "Eldoria" resolves against `worlds/`, so the attach op must see it as primary).
    const cardWithExtras = writeCardChunk(
      MINIMAL_PNG,
      JSON.stringify({
        spec: "chara_card_v3",
        spec_version: "3.0",
        data: {
          name: "Aria",
          description: "Aria the bard",
          first_mes: "Hello there!",
          extensions: { world: "Eldoria", regex_scripts: [stScript("Card Script")] },
        },
      }),
    );
    const stWorld = JSON.stringify({ entries: { "0": { uid: 0, key: ["eldoria"], comment: "Eldoria", content: "A forest.", order: 100 } } });
    const files: Record<string, Uint8Array> = {
      "root/userA/characters/Aria.png": cardWithExtras,
      "root/userA/chats/Aria/chat1.jsonl": ENC.encode(chatJsonl("Alex", "Aria")),
      "root/userA/worlds/Eldoria.json": ENC.encode(stWorld),
      "root/userA/OpenAI Settings/Marinara.json": ENC.encode(openAiPresetJson({ extensions: { regex_scripts: [stScript("Preset Script")] } })),
      "root/userA/settings.json": ENC.encode(
        JSON.stringify({
          power_user: { personas: { "alex.png": "Alex" }, default_persona: "alex.png" },
          extension_settings: { regex: [stScript("Global Script"), { scriptName: "malformed, no findRegex" }] },
          // charLore keys by the CARD FILENAME STEM; "Test World Lore 2" is deliberately NOT in worlds/ —
          // the corpus's dominant case (28 of 30 world names dangle) must come back as a report row.
          world_info_settings: { world_info: { charLore: [{ name: "Aria", extraBooks: ["Eldoria", "Test World Lore 2"] }] } },
        }),
      ),
      "root/userA/User Avatars/alex.png": MINIMAL_PNG,
      // The Data Bank + character-gallery planes — counted, never silent (EMPTY on the real corpus).
      "root/userA/user/files/notes.txt": ENC.encode("databank doc"),
      "root/userA/user/images/Aria/pose1.png": MINIMAL_PNG,
      "root/userA/user/images/Aria/pose2.png": MINIMAL_PNG,
    };
    const fs = memoryFs(files);
    const f = fakes();

    const cardLifts: { characterId: CharacterId; names: string[] }[] = [];
    const presetLifts: { presetId: PresetId; names: string[] }[] = [];
    const globalLifts: string[][] = [];
    const bookAttaches: { characterId: CharacterId; names: readonly string[]; role: string }[] = [];

    const report = await runProfileDirImport({
      ...deps(fs, f),
      importCardScripts: ({ characterId, scripts }) => {
        cardLifts.push({ characterId, names: scripts.map((s) => s.name) });
        return Promise.resolve({ created: scripts.length, reused: 0 });
      },
      importPresetScripts: ({ presetId, scripts }) => {
        presetLifts.push({ presetId, names: scripts.map((s) => s.name) });
        return Promise.resolve({ created: scripts.length, reused: 0 });
      },
      importGlobalScripts: ({ scripts }) => {
        globalLifts.push(scripts.map((s) => s.name));
        return Promise.resolve({ created: scripts.length, reused: 0 });
      },
      attachBooksByName: ({ characterId, names, role }) => {
        bookAttaches.push({ characterId, names, role });
        const missing = names.filter((n) => !f.standaloneBooks.includes(n));
        return Promise.resolve({ linked: names.length - missing.length, missing });
      },
    });

    // CARD scripts: the ST dialect normalized (scriptName → name) and lifted onto the created character.
    expect(cardLifts).toEqual([{ characterId: castId<CharacterId>("chr_1"), names: ["Card Script"] }]);
    expect(report.cardRegexScriptsLifted).toBe(1);

    // PRESET scripts: attached to exactly the row the (faked, presetId-reporting) import op wrote.
    expect(presetLifts).toEqual([{ presetId: "preset_MarinaraOpenAI", names: ["Preset Script"] }]);
    expect(report.presetNotes.find((n) => n.name === "Marinara (OpenAI)")).toMatchObject({ scriptsLifted: 1, scriptsReused: 0 });

    // GLOBAL scripts: found 2 (1 malformed — counted, dropped), lifted 1.
    expect(globalLifts).toEqual([["Global Script"]]);
    expect(report.globalRegexScriptsFound).toBe(1);
    expect(report.malformedGlobalRegexScripts).toBe(1);
    expect(report.globalRegexScriptsLifted).toBe(1);
    expect(report.globalRegexSkippedReason).toBeNull();

    // WORLD LINKS: the card's own world attaches PRIMARY; the charLore extras attach AUXILIARY; the name the
    // profile never downloaded comes back as a per-character report row, verbatim, never near-matched.
    expect(bookAttaches).toEqual([
      { characterId: castId<CharacterId>("chr_1"), names: ["Eldoria"], role: "primary" },
      { characterId: castId<CharacterId>("chr_1"), names: ["Eldoria", "Test World Lore 2"], role: "auxiliary" },
    ]);
    expect(report.worldLinksAttached).toBe(2);
    expect(report.worldLinksMissing).toEqual([{ character: "Aria", book: "Test World Lore 2" }]);

    // USER PLANES: counted so a future profile carrying data can never again lose it silently.
    expect(report.databankFileCount).toBe(1);
    expect(report.galleryImageCount).toBe(2);
  });

  // ── THE ORPHAN WAVE (2026-08-15): transcripts whose card is absent import via a minted placeholder ──────
  test("an orphan chats/ dir mints a placeholder (evidence-only), imports its chats, and is tagged for the owner", async () => {
    const files: Record<string, Uint8Array> = {
      ...fixtureFiles("root"),
      // A REAL corpus shape: `Bonnie_Cow/` has no `Bonnie_Cow.png` card; its header carries the `"unused"`
      // sentinel, so the DIR NAME is the mint's evidence.
      "root/userA/chats/Bonnie_Cow/Bonnie Cow - 2025-07-18@12h00m00s.jsonl": ENC.encode(chatJsonl("Alex", "unused")),
    };
    const f = fakes();

    const report = await runProfileDirImport(deps(memoryFs(files), f));

    // The FOUND list still names the dir (the honesty line), and the new section says what happened to it.
    expect(report.orphanChatDirs).toEqual(["bonnie-cow"]);
    expect(report.orphanImports).toEqual([{ dir: "Bonnie_Cow", characterName: "Bonnie Cow", created: true, chatsImported: 1 }]);
    expect(report.orphanSkipped).toEqual([]);
    // The mint is discoverable: ONE library tag, manual/accepted, on the minted character (chr_2 — the card
    // character chr_1 minted first).
    expect(f.tagAttaches).toEqual([{ characterId: castId<CharacterId>("chr_2"), tagName: "orphan import", source: "manual", status: "accepted" }]);
    // The transcripts imported through the ORDINARY chats verb against the mint.
    expect(f.chatWrites.some((w) => w.characterId === castId<CharacterId>("chr_2") && w.chats.length === 1)).toBe(true);
    // changed counts the mint + its chat (persona + card char + card chat + mint + orphan chat = 5).
    expect(report.changed).toBe(5);

    // The RE-RUN: the synthetic dir-keyed hash resolves the same mint; the chat dedups by its byte hash.
    const second = await runProfileDirImport(deps(memoryFs(files), f));
    expect(second.orphanImports).toEqual([{ dir: "Bonnie_Cow", characterName: "Bonnie Cow", created: false, chatsImported: 0 }]);
    expect(second.changed).toBe(0);
    // No second tag — the tag attaches only on a CREATE.
    expect(f.tagAttaches).toHaveLength(1);
  });

  test("dryRun leaves orphan dirs reported-only (zero mints, zero writes)", async () => {
    const files: Record<string, Uint8Array> = {
      ...fixtureFiles("root"),
      "root/userA/chats/Bonnie_Cow/Bonnie Cow - 2025-07-18@12h00m00s.jsonl": ENC.encode(chatJsonl("Alex", "unused")),
    };
    const f = fakes();

    const report = await runProfileDirImport(deps(memoryFs(files), f, { dryRun: true }));

    expect(report.orphanChatDirs).toEqual(["bonnie-cow"]);
    expect(report.orphanImports).toEqual([]);
    expect(f.log).toHaveLength(0);
  });

  test("found-but-unwired regex/world ops are RECORDED reasons, never silence", async () => {
    const files: Record<string, Uint8Array> = {
      ...fixtureFiles("root"),
      "root/userA/settings.json": ENC.encode(
        JSON.stringify({
          power_user: { personas: { "alex.png": "Alex" }, default_persona: "alex.png" },
          extension_settings: {
            regex: [
              {
                id: "st-g",
                scriptName: "Global Script",
                findRegex: "a",
                replaceString: "b",
                trimStrings: [],
                placement: [2],
                disabled: false,
                markdownOnly: false,
                promptOnly: false,
                runOnEdit: false,
                substituteRegex: 0,
                minDepth: null,
                maxDepth: null,
              },
            ],
          },
        }),
      ),
    };
    const f = fakes();

    const report = await runProfileDirImport(deps(memoryFs(files), f));

    expect(report.globalRegexScriptsFound).toBe(1);
    expect(report.globalRegexScriptsLifted).toBe(0);
    expect(report.globalRegexSkippedReason).toBe("global regex-script import is not wired into this composition");
  });
});

// ── #1469, the ENTRY half of the silent-loss sweep ───────────────────────────────────────────────────────
describe("runProfileDirImport — a partial run says so", () => {
  test("dryRun NAMES every wave it would run, instead of reporting zeroes indistinguishable from `nothing there`", async () => {
    // A profile carrying one card, one persona, one chat, one world, one preset and one group: a dry run
    // that answers `presetsImported: 0, groupsImported: 0` reads exactly like an empty profile.
    const files: Record<string, Uint8Array> = {
      ...fixtureFiles("root"),
      "root/userA/worlds/Eldoria.json": ENC.encode(JSON.stringify({ entries: { "0": { uid: 0, key: ["e"], content: "A forest." } } })),
      "root/userA/OpenAI Settings/Marinara.json": ENC.encode(openAiPresetJson()),
      "root/userA/groups/g1.json": ENC.encode(JSON.stringify({ id: "g1", name: "The Party", members: ["Aria.png"], chats: ["party"] })),
      "root/userA/group chats/party.jsonl": ENC.encode(chatJsonl("Alex", "unused")),
    };
    const f = fakes();

    const report = await runProfileDirImport(deps(memoryFs(files), f, { dryRun: true }));

    expect(report.dryRun).toBe(true);
    expect(report.dryRunWouldImport).toEqual({
      characters: 1,
      personas: 1,
      chats: 1,
      worlds: 1,
      presets: 1,
      themes: 0,
      backgrounds: 0,
      groups: 1,
      groupChats: 1,
      orphanChatDirs: 0,
    });
    // Still ZERO writes — the census is collect-time arithmetic, not a rehearsal.
    expect(f.log).toHaveLength(0);
    expect(f.stores).toHaveLength(0);
  });

  test("a REAL run carries no dry-run census (the flag says which report you are reading)", async () => {
    const f = fakes();

    const report = await runProfileDirImport(deps(memoryFs(fixtureFiles("root")), f));

    expect(report.dryRun).toBe(false);
    expect(report.dryRunWouldImport).toBeNull();
  });

  test("a card TAG that fails to attach is reported — the allSettled result used to be thrown away", async () => {
    const files: Record<string, Uint8Array> = {
      ...fixtureFiles("root"),
      "root/userA/settings.json": ENC.encode(
        JSON.stringify({
          power_user: { personas: { "alex.png": "Alex" }, default_persona: "alex.png" },
          tags: [{ id: "t1", name: "bard" }],
          tag_map: { "Aria.png": ["t1"] },
        }),
      ),
    };
    const f = fakes();

    const report = await runProfileDirImport({
      ...deps(memoryFs(files), f),
      attachCardTag: () => Promise.reject(new Error("tag write failed\nUNIQUE constraint failed: tags.name")),
    });

    // The character still imported (per-tag isolation); the tag that did not attach is NAMED.
    expect(report.changed).toBeGreaterThan(0);
    expect(report.skippedCardTags).toEqual([{ character: "Aria.png", tag: "bard", reason: "UNIQUE constraint failed: tags.name" }]);
  });

  test("backgrounds stored with NO appearance applier wired are reported as unattached, not counted as imported", async () => {
    const files: Record<string, Uint8Array> = {
      ...fixtureFiles("root"),
      "root/userA/backgrounds/dungeon.png": MINIMAL_PNG,
    };
    const f = fakes();

    // The store IS wired (the blob lands in the CAS) but the settings-side applier is NOT — so nothing ever
    // references the asset, and before this it was neither imported nor reported.
    const report = await runProfileDirImport({
      ...deps(memoryFs(files), f),
      storeBackground: () => Promise.resolve({ assetId: castId<AssetId>("asset_bg"), hash: "deadbeef" }),
      newBackgroundEntryId: () => "entry_1",
    });

    expect(report.backgroundsImported).toBe(0);
    expect(report.skippedBackgrounds).toEqual([
      {
        file: "backgrounds/dungeon.png",
        reason: "stored in your media library but NOT attached to the background picker — the appearance applier is not wired into this composition",
      },
    ]);
  });
});

describe("createNodeFsImportPort", () => {
  test("readdir resolves [] for a missing dir instead of throwing", async () => {
    const fs = createNodeFsImportPort();
    await expect(fs.readdir("/no/such/orbweaver/profile/dir")).resolves.toEqual([]);
  });

  // #1469 — EVERY readdir error folded into `[]`, so an infrastructure fault (a symlink loop, an EACCES on a
  // staged profile whose permissions did not survive the copy, EIO on a failing mount) read as "that plane is
  // empty" and the import reported success over a truncated profile. ABSENT stays absent; BROKEN now rejects,
  // and the collector turns the rejection into `ImportInfraFailureError` naming the dir.
  test("readdir REJECTS on an INFRASTRUCTURE fault (a symlink loop) instead of reporting the plane empty", async () => {
    const fs = createNodeFsImportPort();
    const base = await mkdtemp(join(tmpdir(), "pib-loop-"));
    // A two-link cycle: reading either resolves forever → ELOOP, the documented infra class, reproducible
    // regardless of which uid the suite runs as (a chmod-000 dir is still readable as root).
    await symlink(join(base, "b"), join(base, "a"));
    await symlink(join(base, "a"), join(base, "b"));
    try {
      await expect(fs.readdir(join(base, "a"))).rejects.toMatchObject({ code: "ELOOP" });
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test("a path that is a FILE, not a dir, stays the documented ABSENT case (ENOTDIR ⇒ [])", async () => {
    const fs = createNodeFsImportPort();
    const base = await mkdtemp(join(tmpdir(), "pib-file-"));
    const notADir = join(base, "worlds");
    await writeFile(notADir, "x");
    try {
      // A profile that carries a FILE where a plane's directory would be has no such plane — the same
      // "absent, not broken" reading the reports-ring reader had to learn.
      await expect(fs.readdir(notADir)).resolves.toEqual([]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
