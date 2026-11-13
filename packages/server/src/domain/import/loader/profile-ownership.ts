// The dry run's ownership read: which collected items of every kind a run writes nothing for, because the owner
// already holds them or because an earlier item of the same upload lands them. Every library lookup asks the owning
// domain's read-only twin of the write that would land the item, and every in-upload lookup repeats the write's own
// equality rule over the items before it in the run's order, so a preview and a real run agree on what "already
// yours" means. Nothing here writes. A verdict belongs to the collected entry itself, never to its source string,
// because two profiles of one folder can share a path.

import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import type { ImportReuse } from "@orb/contracts/import";
import { narrowPersonaMetadata } from "@orb/contracts/persona";
import type { CharacterId } from "@orb/kit/ids";
import { mapYielding } from "#primitives/abort";
import { sha256Hex } from "#primitives/content-hash";
import type { CollectedCard, CollectedChat } from "../contract/collection.ts";
import type { ImportOwnership, ProfileCollected, ProfileDirImportDeps } from "../contract/profile-directory.ts";
import { findImportedCharacter, importFileHash } from "../substrate/card.ts";
import { partitionGroups, resolveMembers } from "../substrate/group.ts";
import { orphanImportHash } from "../substrate/handle.ts";
import { presetBytes, themeBytes } from "../substrate/landing-bytes.ts";

/** The row a character's chats land under: an owned character, or the one the upload itself creates. */
type RowKey = string;

const ownedRow = (characterId: CharacterId): RowKey => `owned:${characterId}`;
const newCardRow = (bundleIndex: number): RowKey => `card:${String(bundleIndex)}`;
const newOrphanRow = (handle: string): RowKey => `orphan:${handle}`;

/** The chats one character already holds, by the identities the chat write skips a transcript by. */
async function heldChats(deps: ProfileDirImportDeps, characterId: CharacterId | null, chats: readonly CollectedChat[]): Promise<ReadonlySet<CollectedChat>> {
  if (characterId === null || chats.length === 0) {
    return new Set();
  }
  const held = await deps.ownership.findChatHashes({
    ownerId: deps.principal.userId,
    characterId,
    hashes: chats.flatMap((chat) => (chat.fileHash === undefined ? [chat.importHash] : [chat.importHash, chat.fileHash])),
  });
  return new Set(chats.filter((chat) => held.has(chat.importHash) || (chat.fileHash !== undefined && held.has(chat.fileHash))));
}

/** What the chat write would skip, judged in the order a run lands the chats. A chat is skipped when its row holds
 *  its identity already, or when an earlier chat of the upload under the same row claimed it. */
interface ChatJudge {
  readonly verdicts: Map<CollectedChat, ImportReuse>;
  readonly claims: Map<RowKey, Set<string>>;
}

async function judgeChats(
  deps: ProfileDirImportDeps,
  judge: ChatJudge,
  row: { readonly key: RowKey; readonly characterId: CharacterId | null },
  chats: readonly CollectedChat[],
): Promise<void> {
  const held = await heldChats(deps, row.characterId, chats);
  const claimed = judge.claims.get(row.key) ?? new Set<string>();
  judge.claims.set(row.key, claimed);
  for (const chat of chats) {
    if (held.has(chat)) {
      judge.verdicts.set(chat, "library");
    } else if (claimed.has(chat.importHash) || (chat.fileHash !== undefined && claimed.has(chat.fileHash))) {
      judge.verdicts.set(chat, "upload");
    } else {
      claimed.add(chat.importHash);
    }
  }
}

/** What the card pass learned: the verdict of each card, the row each card filename resolves to (the group wave's
 *  member key, the last card under a filename winning as it does in the run), and the owned character behind a row. */
interface CardPass {
  readonly characters: Map<CollectedCard, ImportReuse>;
  readonly rowByFilename: Map<string, RowKey>;
  readonly ownedByRow: Map<RowKey, CharacterId>;
}

/** A character is reused when an equal card landed (the one lookup order every door uses), in the library or earlier
 *  in this upload. A taken handle is not a match: different content under it lands beside the owned character with
 *  a suffixed handle (D290). A text-only match counts: whether that row may take the PNG's art is decided by the
 *  write, not predicted here. Its chats are held only under the equal card's own row. */
async function passCards(deps: ProfileDirImportDeps, collected: ProfileCollected, chats: ChatJudge): Promise<CardPass> {
  const ownerId = deps.principal.userId;
  const { characterOps } = deps.contextFor(deps.principal, deps.storeAvatar);
  const pass: CardPass = { characters: new Map(), rowByFilename: new Map(), ownedByRow: new Map() };
  // call-local: the bundle each landed card identity belongs to, so a later equal card finds it. Ends if it outlives the pass.
  const landed = new Map<string, number>();
  for (const [index, bundle] of collected.bundles.entries()) {
    if (deps.signal.aborted) {
      break;
    }
    const hashes = { importHash: bundle.contentHash, textHash: bundle.textHash, fileHash: importFileHash(bundle.cardBytes) };
    const found = await findImportedCharacter(async (importHash) => await characterOps.findByImportHash({ ownerId, importHash }), hashes);
    const earlier = found === null ? await findImportedCharacter<number>((importHash) => Promise.resolve(landed.get(importHash) ?? null), hashes) : null;
    let row = newCardRow(index);
    if (found !== null) {
      row = ownedRow(found.characterId);
      pass.ownedByRow.set(row, found.characterId);
      pass.characters.set(bundle, "library");
    } else if (earlier !== null) {
      row = newCardRow(earlier.characterId);
      pass.characters.set(bundle, "upload");
    } else {
      landed.set(bundle.contentHash, index);
    }
    pass.rowByFilename.set(bundle.filename, row);
    await judgeChats(deps, chats, { key: row, characterId: pass.ownedByRow.get(row) ?? null }, bundle.chats);
    // These reads resolve on microtasks, so a large folder would otherwise hold the event loop for the whole pass.
    await yieldToEventLoop();
  }
  return pass;
}

/** An orphan directory is reused when its placeholder character exists, or an earlier orphan directory of the upload
 *  names the same placeholder; its chats are judged under that row. */
async function passOrphans(deps: ProfileDirImportDeps, collected: ProfileCollected, chats: ChatJudge): Promise<ImportOwnership["orphans"]> {
  const ownerId = deps.principal.userId;
  const { characterOps } = deps.contextFor(deps.principal, deps.storeAvatar);
  const orphans = new Map<ProfileCollected["orphanBundles"][number], ImportReuse>();
  // call-local: the placeholders the upload's earlier orphan directories name. Ends if it outlives the pass.
  const named = new Set<string>();
  for (const orphan of collected.orphanBundles) {
    if (deps.signal.aborted) {
      break;
    }
    const characterId = await characterOps.findByImportHash({ ownerId, importHash: orphanImportHash(orphan.handle) });
    if (characterId !== null) {
      orphans.set(orphan, "library");
    } else if (named.has(orphan.handle)) {
      orphans.set(orphan, "upload");
    }
    named.add(orphan.handle);
    await judgeChats(deps, chats, { key: characterId === null ? newOrphanRow(orphan.handle) : ownedRow(characterId), characterId }, orphan.chats);
    await yieldToEventLoop();
  }
  return orphans;
}

/** A group's founding character is its first member the import set carries; a member that is not yet in
 *  the library stands in as the row the upload creates for it, so a held member after it never becomes the founder. */
function groupFounder(group: ProfileCollected["groups"][number], rowByFilename: ReadonlyMap<string, RowKey>): RowKey | null {
  return resolveMembers(group, rowByFilename).seated[0]?.characterId ?? null;
}

/** A group is reused when every transcript it brings is: the write counts a room only when it adds one. A group the
 *  run refuses is a skip in the preview, so it is never asked about. */
async function passGroups(deps: ProfileDirImportDeps, collected: ProfileCollected, cards: CardPass, chats: ChatJudge): Promise<ImportOwnership["groups"]> {
  const groups = new Map<ProfileCollected["groups"][number], ImportReuse>();
  const { importable } = partitionGroups(
    collected.groups,
    collected.bundles.map((bundle) => bundle.filename),
  );
  for (const group of importable) {
    if (deps.signal.aborted) {
      break;
    }
    const founder = groupFounder(group, cards.rowByFilename);
    if (founder !== null) {
      await judgeChats(deps, chats, { key: founder, characterId: cards.ownedByRow.get(founder) ?? null }, group.chats);
    }
    const judged = group.chats.map((chat) => chats.verdicts.get(chat));
    if (judged.every((verdict) => verdict === "library")) {
      groups.set(group, "library");
    } else if (judged.every((verdict) => verdict !== undefined)) {
      groups.set(group, "upload");
    }
    await yieldToEventLoop();
  }
  return groups;
}

/** The items whose answer is a reuse. An answer list shorter than the items (an aborted run) leaves the rest out. */
function reusedOf<Item>(items: readonly Item[], answers: readonly (ImportReuse | null)[]): Map<Item, ImportReuse> {
  const reused = new Map<Item, ImportReuse>();
  for (const [i, item] of items.entries()) {
    const answer = answers[i];
    if (answer !== null && answer !== undefined) {
      reused.set(item, answer);
    }
  }
  return reused;
}

async function passPersonas(deps: ProfileDirImportDeps, collected: ProfileCollected): Promise<ImportOwnership["personas"]> {
  const personas = await mapYielding(collected.personas, deps.signal, ({ parsed, avatarBytes }) => ({
    name: parsed.name,
    description: parsed.description,
    metadata: narrowPersonaMetadata(parsed.metadata),
    artHash: avatarBytes === undefined ? null : sha256Hex(avatarBytes),
  }));
  return reusedOf(collected.personas, await deps.ownership.findPersonas({ ownerId: deps.principal.userId, personas, collisions: deps.personaCollisions }));
}

/** The planes whose items another domain keeps in the owner's library: books, presets, themes and backgrounds. Each
 *  owner reads its library once for the whole folder. */
async function passLibrary(
  deps: ProfileDirImportDeps,
  collected: ProfileCollected,
): Promise<Pick<ImportOwnership, "worlds" | "presets" | "themes" | "backgrounds">> {
  const { ownership, principal } = deps;
  const ownerId = principal.userId;
  const books = await ownership.findBooks({ ownerId, books: collected.worlds.map(({ book }) => book), signal: deps.signal });
  const presetFiles = await mapYielding(collected.presets, deps.signal, presetBytes);
  const themeFiles = await mapYielding(collected.themes, deps.signal, themeBytes);
  const heldHashes = collected.backgrounds.length === 0 ? new Set<string>() : await ownership.backgroundHashes(ownerId);
  // call-local: the images the earlier backgrounds of the upload store; identical bytes share one stored image. Ends if it outlives the pass.
  const landedHashes = new Set<string>();
  const backgrounds = await mapYielding(collected.backgrounds, deps.signal, ({ bytes }): ImportReuse | null => {
    const hash = sha256Hex(bytes);
    if (heldHashes.has(hash)) {
      return "library";
    }
    if (landedHashes.has(hash)) {
      return "upload";
    }
    landedHashes.add(hash);
    return null;
  });
  return {
    worlds: reusedOf(collected.worlds, books),
    presets: reusedOf(collected.presets, await ownership.findPresets({ ownerId, files: presetFiles, signal: deps.signal })),
    themes: reusedOf(collected.themes, await ownership.findThemes(ownerId, themeFiles, deps.signal)),
    backgrounds: reusedOf(collected.backgrounds, backgrounds),
  };
}

export async function findOwnership(deps: ProfileDirImportDeps, collected: ProfileCollected): Promise<ImportOwnership> {
  // The run lands every card with its chats, then the orphan directories, then the groups; the chat claims follow that order.
  const chats: ChatJudge = { verdicts: new Map(), claims: new Map() };
  const cards = await passCards(deps, collected, chats);
  const orphans = await passOrphans(deps, collected, chats);
  const groups = await passGroups(deps, collected, cards, chats);
  return {
    characters: cards.characters,
    chats: chats.verdicts,
    personas: await passPersonas(deps, collected),
    ...(await passLibrary(deps, collected)),
    groups,
    orphans,
  };
}
