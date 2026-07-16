// domain/import/loader/collect — profile-dir collector. Walks a staged ST profile through the injected
// ImportFsPort (domain-no-node-fs), reads/hashes/parses PNG cards + chat JSONL + settings.json personas,
// and pairs them into per-character bundles. Pure over the injected port — fixture-testable.
//
// Layout: <profileDir>/characters/*.png, /chats/<charDir>/*.jsonl, /settings.json, /User Avatars/*.png.
// Cards and chat dirs pair by slugifyHandle. Every non-happy path is recorded in CollectResult, never silent.

import { slugifyHandle } from "@orb/kit/slug";
import { parseChatJsonl } from "#kit/serde/chat";
import type { CollectedCard, CollectedChat, CollectedPersona, CollectResult, ImportFsPort } from "../contract/views";
import { importFileHash, parseCardPng } from "../substrate/card";
import { parseStPersonas } from "../substrate/persona";

// Ceiling so a hostile staging dir with a million empty entries can't pin the loop.
const MAX_DIR_ENTRIES = 100_000;
// Beyond this a chat file is recorded in skippedChats, never silent.
const MAX_JSONL_BYTES = 67_108_864;
const PNG_EXT = /\.png$/i;
const JSONL_EXT = /\.jsonl$/i;
const TRAILING_DIGITS = /\d+$/;
const TRAILING_HYPHENS = /-+$/;
const SPEC_WRAPPER = /^main-(.+)-spec-v\d+$/;

interface Group {
  card?: CollectedCard;
  chats: CollectedChat[];
}

interface CollectState {
  readonly byHandle: Map<string, Group>;
  readonly skip: ReadonlySet<string>;
  readonly skippedHandles: Set<string>;
  readonly unreadableCards: string[];
  readonly skippedChats: string[];
  readonly skippedCharacters: string[];
  readonly collidedCards: { file: string; handle: string }[];
}

function group(state: CollectState, handle: string): Group {
  const existing = state.byHandle.get(handle);
  if (existing !== undefined) {
    return existing;
  }
  const fresh: Group = { chats: [] };
  state.byHandle.set(handle, fresh);
  return fresh;
}

// Sorted so collision disambiguation is deterministic — readdir order is filesystem-dependent.
async function listDir(fs: ImportFsPort, dir: string): Promise<{ name: string; kind: string }[]> {
  const ents = await fs.readdir(dir);
  const capped = ents.length > MAX_DIR_ENTRIES ? ents.slice(0, MAX_DIR_ENTRIES) : ents;
  return [...capped].sort((a, b) => a.name.localeCompare(b.name));
}

// Numeric suffix instead of silently overwriting the first card on a slug collision.
function disambiguate(state: CollectState, base: string, file: string): string {
  let handle = base;
  let n = 2;
  while (state.byHandle.get(handle)?.card !== undefined) {
    handle = `${base}-${n}`;
    n += 1;
  }
  if (handle !== base) {
    state.collidedCards.push({ file, handle });
  }
  return handle;
}

async function collectCards(fs: ImportFsPort, profileDir: string, state: CollectState): Promise<void> {
  const charsDir = fs.join(profileDir, "characters");
  for (const ent of await listDir(fs, charsDir)) {
    if (ent.kind !== "file" || !PNG_EXT.test(ent.name)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: cards are read + hashed sequentially — a bounded, one-time collection scan, not a hot path.
    const bytes = await fs.readFile(fs.join(charsDir, ent.name));
    const stem = ent.name.replace(PNG_EXT, "");
    const parsed = parseCardPng(bytes, stem);
    if (parsed === null) {
      state.unreadableCards.push(ent.name);
      continue;
    }
    if (state.skip.has(parsed.card.name.trim().toLowerCase())) {
      state.skippedHandles.add(slugifyHandle(stem));
      state.skippedCharacters.push(parsed.card.name);
      continue;
    }
    const handle = disambiguate(state, slugifyHandle(stem), ent.name);
    group(state, handle).card = { handle, cardBytes: bytes, filename: ent.name, chats: [] };
  }
}

async function collectChatsForDir(fs: ImportFsPort, chatsDir: string, dirName: string, state: CollectState): Promise<void> {
  const handle = slugifyHandle(dirName);
  if (state.skippedHandles.has(handle)) {
    return;
  }
  const dirPath = fs.join(chatsDir, dirName);
  for (const fileEnt of await listDir(fs, dirPath)) {
    if (fileEnt.kind !== "file" || !JSONL_EXT.test(fileEnt.name)) {
      continue;
    }
    const filePath = fs.join(dirPath, fileEnt.name);
    // biome-ignore lint/performance/noAwaitInLoops: chats are stat+read+parsed sequentially — a one-time collection scan bounded by the dir cap, not a hot path.
    const sz = await fs.stat(filePath);
    if (sz.size > MAX_JSONL_BYTES) {
      state.skippedChats.push(fs.join(dirName, fileEnt.name));
      continue;
    }
    const bytes = await fs.readFile(filePath);
    const parsed = parseChatJsonl(new TextDecoder().decode(bytes), {
      fileName: fileEnt.name,
      charDirName: dirName,
    });
    if (parsed === null) {
      continue;
    }
    group(state, handle).chats.push({
      parsed,
      importedFrom: fileEnt.name,
      importHash: importFileHash(bytes),
    });
  }
}

// A chat dir whose slug minus an ST folder-name decoration uniquely matches a card. First candidate wins.
function fuzzyPair(state: CollectState): { chatDir: string; handle: string }[] {
  const fuzzyPairedDirs: { chatDir: string; handle: string }[] = [];
  for (const [handle, g] of state.byHandle) {
    if (g.card !== undefined || g.chats.length === 0) {
      continue;
    }
    const candidates = [handle.replace(TRAILING_DIGITS, "").replace(TRAILING_HYPHENS, ""), SPEC_WRAPPER.exec(handle)?.[1]].filter(
      (b): b is string => b !== undefined && b.length > 0 && b !== handle,
    );
    for (const base of candidates) {
      const target = state.byHandle.get(base);
      if (target?.card !== undefined && !state.skippedHandles.has(base)) {
        target.chats.push(...g.chats);
        g.chats = [];
        fuzzyPairedDirs.push({ chatDir: handle, handle: base });
        break;
      }
    }
  }
  return fuzzyPairedDirs;
}

// Best-effort: a missing/corrupt settings.json yields []; a missing avatar yields an avatar-less persona.
async function collectPersonas(fs: ImportFsPort, profileDir: string): Promise<CollectedPersona[]> {
  let settingsRaw: unknown;
  try {
    const bytes = await fs.readFile(fs.join(profileDir, "settings.json"));
    settingsRaw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return [];
  }
  const { personas } = parseStPersonas(settingsRaw);
  const avatarsDir = fs.join(profileDir, "User Avatars");
  const out: CollectedPersona[] = [];
  for (const parsed of personas) {
    let avatarBytes: Uint8Array | undefined;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: avatar bytes are read sequentially during the one-time collection scan (a short persona list), not a hot path.
      avatarBytes = await fs.readFile(fs.join(avatarsDir, parsed.avatarFile));
    } catch {
      avatarBytes = undefined;
    }
    out.push(avatarBytes !== undefined ? { parsed, avatarBytes } : { parsed });
  }
  return out;
}

export async function collectBundlesFromDir(fs: ImportFsPort, profileDir: string, skipCharacterNames: readonly string[] = []): Promise<CollectResult> {
  const state: CollectState = {
    byHandle: new Map<string, Group>(),
    skip: new Set(skipCharacterNames.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0)),
    skippedHandles: new Set<string>(),
    unreadableCards: [],
    skippedChats: [],
    skippedCharacters: [],
    collidedCards: [],
  };

  await collectCards(fs, profileDir, state);

  const chatsDir = fs.join(profileDir, "chats");
  for (const dirEnt of await listDir(fs, chatsDir)) {
    if (dirEnt.kind === "directory") {
      // biome-ignore lint/performance/noAwaitInLoops: chat dirs are scanned sequentially (one-time collection), each its own bounded read loop.
      await collectChatsForDir(fs, chatsDir, dirEnt.name, state);
    }
  }

  const fuzzyPairedDirs = fuzzyPair(state);
  const personas = await collectPersonas(fs, profileDir);

  const bundles: CollectedCard[] = [];
  const orphanChatDirs: string[] = [];
  for (const [handle, g] of state.byHandle) {
    if (g.card !== undefined) {
      bundles.push({ ...g.card, chats: g.chats });
    } else if (g.chats.length > 0) {
      orphanChatDirs.push(handle);
    }
  }

  return {
    bundles,
    personas,
    orphanChatDirs,
    unreadableCards: state.unreadableCards,
    skippedChats: state.skippedChats,
    skippedCharacters: state.skippedCharacters,
    collidedCards: state.collidedCards,
    fuzzyPairedDirs,
  };
}
