// domain/import/loader/collect — the profile-dir COLLECTOR (PD-77). Walks a staged ST profile through the
// INJECTED `ImportFsPort` (no `node:fs` in the domain — `domain-no-node-fs`), reads + hashes + parses the PNG
// cards + chat JSONL + settings.json personas, and pairs them into per-character bundles ready for the entry
// driver. PURE over the injected port — fixture-testable with an in-memory tree.
//
// Layout (a single ST user profile):
//   <profileDir>/characters/*.png
//   <profileDir>/chats/<charDir>/*.jsonl
//   <profileDir>/settings.json  +  <profileDir>/User Avatars/*.png
// Cards and chat dirs pair by `slugifyHandle` (`@orb/kit/slug`) — which collapses ST's case-variant chat
// dirs ("Block of Cheese" / "Block Of Cheese") onto one character. Every non-happy path (orphan chats,
// unreadable cards, skip-listed characters, slug collisions, fuzzy pairings) is RECORDED in `CollectResult`
// (never silent — operator-auditable).

import { slugifyHandle } from "@orb/kit/slug";
import type {
  CollectedCard,
  CollectedChat,
  CollectedPersona,
  CollectResult,
  ImportFsPort,
} from "../contract/views";
import { importFileHash, parseCardPng } from "../substrate/card";
import { parseChatJsonl } from "../substrate/chat";
import { parseStPersonas } from "../substrate/persona";

// Per-directory entry ceiling: a real ST profile has a few hundred cards / a few thousand chats; a hostile
// staging dir with a million empty entries would otherwise pin the loop. Past the cap we stop reading that
// directory (the already-collected entries still flow through).
const MAX_DIR_ENTRIES = 100_000;
// Per-file ceiling on a chat `.jsonl` — 64 MiB (67_108_864 bytes). Beyond it the file is recorded in
// `skippedChats` (never silent). A real ST chat at hundreds of messages is well under this.
const MAX_JSONL_BYTES = 67_108_864;
const PNG_EXT = /\.png$/i;
const JSONL_EXT = /\.jsonl$/i;
// Fuzzy-pairing decorations: a trailing numeric suffix ("eva2" → "eva") and the spec-export wrapper.
const TRAILING_DIGITS = /\d+$/;
const TRAILING_HYPHENS = /-+$/;
const SPEC_WRAPPER = /^main-(.+)-spec-v\d+$/;

/** A working per-handle group during collection. */
interface Group {
  card?: CollectedCard;
  chats: CollectedChat[];
}

/** The mutable collection state threaded through the phase helpers. */
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

/** Cap + sort a directory listing by name (deterministic collision disambiguation — `readdir` order is
 *  filesystem-dependent). */
async function listDir(fs: ImportFsPort, dir: string): Promise<{ name: string; kind: string }[]> {
  const ents = await fs.readdir(dir);
  const capped = ents.length > MAX_DIR_ENTRIES ? ents.slice(0, MAX_DIR_ENTRIES) : ents;
  return [...capped].sort((a, b) => a.name.localeCompare(b.name));
}

/** Disambiguate a slug collision (two cards → one handle, e.g. two fully non-Latin names both slug to
 *  "unnamed") with a numeric suffix instead of silently overwriting the first card. */
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

async function collectCards(
  fs: ImportFsPort,
  profileDir: string,
  state: CollectState,
): Promise<void> {
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
      state.skippedHandles.add(slugifyHandle(stem)); // drops its chats too (handle match below)
      state.skippedCharacters.push(parsed.card.name);
      continue;
    }
    const handle = disambiguate(state, slugifyHandle(stem), ent.name);
    group(state, handle).card = { handle, cardBytes: bytes, filename: ent.name, chats: [] };
  }
}

async function collectChatsForDir(
  fs: ImportFsPort,
  chatsDir: string,
  dirName: string,
  state: CollectState,
): Promise<void> {
  const handle = slugifyHandle(dirName);
  if (state.skippedHandles.has(handle)) {
    return; // skip-listed character — drop its chats
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
    // biome-ignore lint/performance/noAwaitInLoops: see above — sequential per-file read during the collection scan.
    const bytes = await fs.readFile(filePath);
    const parsed = parseChatJsonl(new TextDecoder().decode(bytes), {
      fileName: fileEnt.name,
      charDirName: dirName,
    });
    if (parsed === null) {
      continue; // unparseable header — skip this file
    }
    group(state, handle).chats.push({
      parsed,
      importedFrom: fileEnt.name,
      importHash: importFileHash(bytes),
    });
  }
}

/** Second-chance pairing: a chat dir whose slug matched no card but whose slug MINUS an ST folder-name
 *  decoration UNIQUELY matches a card. Merges those chats into the card's group (never silent —
 *  `fuzzyPairedDirs`). First matching candidate wins. */
function fuzzyPair(state: CollectState): { chatDir: string; handle: string }[] {
  const fuzzyPairedDirs: { chatDir: string; handle: string }[] = [];
  for (const [handle, g] of state.byHandle) {
    if (g.card !== undefined || g.chats.length === 0) {
      continue; // has its own card, or nothing to rescue
    }
    const candidates = [
      handle.replace(TRAILING_DIGITS, "").replace(TRAILING_HYPHENS, ""),
      SPEC_WRAPPER.exec(handle)?.[1],
    ].filter((b): b is string => b !== undefined && b.length > 0 && b !== handle);
    for (const base of candidates) {
      const target = state.byHandle.get(base);
      if (target?.card !== undefined && !state.skippedHandles.has(base)) {
        target.chats.push(...g.chats);
        g.chats = []; // consumed — no longer an orphan
        fuzzyPairedDirs.push({ chatDir: handle, handle: base });
        break;
      }
    }
  }
  return fuzzyPairedDirs;
}

/** Read + parse `<profileDir>/settings.json` → personas, pairing each to its `User Avatars/<file>` bytes when
 *  present. Best-effort: a missing/corrupt settings.json yields []; a missing avatar yields an avatar-less
 *  persona. Never throws — persona import is additive to the character/chat import. */
async function collectPersonas(fs: ImportFsPort, profileDir: string): Promise<CollectedPersona[]> {
  let settingsRaw: unknown;
  try {
    const bytes = await fs.readFile(fs.join(profileDir, "settings.json"));
    settingsRaw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return []; // no settings.json (or unreadable / !JSON) — nothing to import
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
      avatarBytes = undefined; // avatar file absent — import the persona without an avatar
    }
    out.push(avatarBytes !== undefined ? { parsed, avatarBytes } : { parsed });
  }
  return out;
}

/**
 * Collect a staged ST profile dir into per-character bundles + personas. `skipCharacterNames` is the
 * `IMPORT_SKIP_CHARACTERS` list (a matched card AND all its chats are dropped). Cards are parsed BEFORE chats
 * so the skip set is complete before the chats loop reads it. `parseCardJson` is imported for a future bare-
 * JSON card path but the dir layout is PNG-only today (kept a named import so the surface is one home).
 */
export async function collectBundlesFromDir(
  fs: ImportFsPort,
  profileDir: string,
  skipCharacterNames: readonly string[] = [],
): Promise<CollectResult> {
  const state: CollectState = {
    byHandle: new Map<string, Group>(),
    skip: new Set(
      skipCharacterNames.map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0),
    ),
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
