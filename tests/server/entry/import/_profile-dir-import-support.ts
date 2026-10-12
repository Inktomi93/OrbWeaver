// @orb-waive-file no-test-fabrication({ name?: unknown }): baselined when the gate widened to value casts; burn-down item 906.

import type { BulkImportChatInput, BulkImportChatsResult } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { BulkImportPersonaInput, BulkImportPersonasResult } from "@orb/contracts/persona";
import type { BulkImportLorebookResult } from "@orb/contracts/world-info";
import type { AssetId, CharacterId, ChatId, Handle, PersonaId, PresetId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import type { ImportFsPort } from "@orb/server/domain/import";
import type { ImportAssetPort, ImportCharacterPort, ImportTagPort, ProfileDirImportDeps } from "@orb/server/entry/import";

export const OWNER: Principal = {
  userId: castId<UserId>("usr_owner"),
  role: "owner",
  handle: castId<Handle>("owner"),
  externalId: null,
  via: "fallback",
};
const NOW = 1_700_000_000_000;

// A minimal valid PNG (signature + zero-length IEND) to embed a card into via the kit codec.
export const MINIMAL_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

/** A real ST PNG card whose card-name is `name` (→ handle = its slug). */
export function cardPng(name: string): Uint8Array {
  const card = {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: { name, description: `${name} the bard`, first_mes: "Hello there!" },
  };
  return writeCardChunk(MINIMAL_PNG, JSON.stringify(card));
}

/** One real_conversation ST chat .jsonl (a greeting + a user turn attributed to `userName`). `meta` is the
 *  header's `chat_metadata` — omitted entirely when empty, so the default fixture stays byte-identical. */
export function chatJsonl(userName: string, characterName: string, meta: Record<string, unknown> = {}): string {
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
 *  where every assistant line stamps `original_avatar: "Briar.png"` beside the display `name`. */
function groupChatJsonl(userName: string): string {
  return [
    JSON.stringify({ user_name: userName, character_name: "unused", create_date: "2025-07-18@12h00m00s" }),
    JSON.stringify({ name: "Aria", is_user: false, original_avatar: "Aria.png", mes: "Aria speaks.", send_date: "2025-07-18@12h00m01s" }),
    JSON.stringify({ name: userName, is_user: true, mes: "Hi both!", send_date: "2025-07-18@12h00m02s" }),
    // No `original_avatar` — the pre-group-era shape; resolves by the roster-SCOPED display name instead.
    JSON.stringify({ name: "Bryn", is_user: false, mes: "Bryn answers.", send_date: "2025-07-18@12h00m03s" }),
    // A speaker that is NEITHER seated NOR named in the roster → falls through to the room's primary.
    JSON.stringify({ name: "Ghost", is_user: false, original_avatar: "Ghost.png", mes: "A stranger.", send_date: "2025-07-18@12h00m04s" }),
  ].join("\n");
}

/** A real-shaped ST `groups/<id>.json`: members are CARD FILENAMES and `chats` names transcript leaves (no
 *  extension), both verbatim from the corpus's own group definition. */
export function groupJson(members: readonly string[], chats: readonly string[], over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: "1773514134935",
    name: "Group: Aria + Bryn",
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
export function openAiPresetJson(over: Record<string, unknown> = {}): string {
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

export const ENC = new TextEncoder();

/** An in-memory ImportFsPort over a flat path→node map (dirs are the paths that have children). */
export function memoryFs(files: Record<string, Uint8Array>): ImportFsPort {
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
  /** Every post-import index enqueue (the driver's one enqueue). */
  readonly indexEnqueues: UserId[];
  /** Every real conversation the fake chat write reported written, in write order. */
  readonly memoryChatIds: ChatId[];
  /** Standalone (unattached) library books imported from `worlds/*.json`, by name — deduped like the real op. */
  readonly standaloneBooks: string[];
}

/** A stateful fake port-set. Character dedups by importHash (byte-identical re-import → created:false),
 *  personas by lowercased name, chats by importHash — so a second identical run writes nothing. `log`
 *  records the op order (personas MUST precede chats). */
export function fakes(): Fakes {
  const byHash = new Map<string, CharacterId>();
  const byHandle = new Map<string, CharacterId>();
  const personaByName = new Map<string, PersonaId>();
  const seenChatHashes = new Set<string>();
  const stores: StoreCall[] = [];
  const log: string[] = [];
  const indexEnqueues: UserId[] = [];
  const memoryChatIds: ChatId[] = [];
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
    findByName: () => Promise.resolve([]),
    attachImportedArt: () => Promise.resolve(false),
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
      personasMerged: 0,
      mergedKeys: [],
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
    const realConversationsWritten: ChatId[] = [];
    for (const c of args.chats) {
      if (!seenChatHashes.has(c.importHash)) {
        seenChatHashes.add(c.importHash);
        imported += 1;
        if (c.isRealConversation) {
          realConversationsWritten.push(mintTypeId(ID_PREFIX.chat));
        }
      }
    }
    memoryChatIds.push(...realConversationsWritten);
    return Promise.resolve({
      // The stub writes nothing, so it reports no written rows — the real op returns one identity per chat.
      identities: [],
      written: [],
      chatsImported: imported,
      chatsSkipped: args.chats.length - imported,
      messagesImported: args.chats.reduce((n, c) => n + c.messages.length, 0),
      variantsImported: 0,
      branchesLinked: 0,
      realConversationsWritten,
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
    indexEnqueues,
    memoryChatIds,
    standaloneBooks,
  };
}

/** A one-user-dir ST profile snapshot under `root/`: one PNG card + its chat + one settings.json persona. */
export function fixtureFiles(root: string): Record<string, Uint8Array> {
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

export function deps(
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
      return Promise.resolve({
        worldBookId: castId<WorldBookId>("wb_00000000000000000000000000"),
        entryCount: book.entries.length,
        replaced: false,
        created: !replaced,
        name: book.name,
        renamedFrom: null,
      });
    },
    enqueueImportIndex: ({ ownerId }): Promise<void> => {
      f.indexEnqueues.push(ownerId);
      return Promise.resolve();
    },
    reconcileImportStats: () => Promise.resolve(),
    now: () => NOW,
    dryRun: over.dryRun ?? false,
    signal: new AbortController().signal,
  };
}

/** A profile carrying BOTH new planes: two cards, an ST chat-completion preset (file + the live blob), and one
 *  group whose members are those two cards with a single group transcript. */
export function presetAndGroupFiles(root: string): Record<string, Uint8Array> {
  return {
    [`${root}/userA/characters/Aria.png`]: cardPng("Aria"),
    [`${root}/userA/characters/Bryn.png`]: cardPng("Bryn"),
    [`${root}/userA/OpenAI Settings/Marinara.json`]: ENC.encode(openAiPresetJson()),
    [`${root}/userA/settings.json`]: ENC.encode(JSON.stringify({ oai_settings: JSON.parse(openAiPresetJson({ temperature: 0.7 })) })),
    [`${root}/userA/groups/1773514134935.json`]: ENC.encode(groupJson(["Aria.png", "Bryn.png"], ["party-night"])),
    [`${root}/userA/group chats/party-night.jsonl`]: ENC.encode(groupChatJsonl("Alex")),
  };
}
