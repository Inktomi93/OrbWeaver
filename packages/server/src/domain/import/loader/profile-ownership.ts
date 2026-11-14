// The dry run's ownership read: which collected items of every kind a run writes nothing for, because the owner
// already holds them or because an earlier item of the same upload lands them, and the content keys each item is
// compared by. Every library lookup asks the owning domain's read-only twin of the write that would land the item,
// and every in-upload lookup repeats the write's own equality rule over the items before it in the run's order, so a
// preview and a real run agree on what "already yours" means. Nothing here writes. A verdict belongs to the
// collected entry itself, never to its source string, because two profiles of one folder can share a path. A key
// is the owner's own key for the item (a card's import hash, a transcript's hash under the row it lands under), so
// the uploads of a split folder can tell, after the fact, which of their entries are one.

import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import type { ImportAnswer } from "@orb/contracts/import";
import { narrowPersonaMetadata } from "@orb/contracts/persona";
import { ASSET_UPLOAD_MAX_BYTES } from "@orb/contracts/uploads";
import type { CharacterId } from "@orb/kit/ids";
import { mapYielding } from "#primitives/abort";
import { sha256Hex } from "#primitives/content-hash";
import type { CollectedCard, CollectedChat, CollectedPersona } from "../contract/collection.ts";
import type { ImportOwnership, ProfileCollected, ProfileDirImportDeps } from "../contract/profile-directory.ts";
import { currentCardIdentity, findImportedCharacter, importFileHash } from "../substrate/card.ts";
import { partitionGroups, resolveMembers, seatsOf } from "../substrate/group.ts";
import { orphanImportHash } from "../substrate/handle.ts";
import { presetBytes, themeBytes } from "../substrate/landing-bytes.ts";

/** The row a character's chats land under: an owned character, or the one the upload itself creates. A row an upload
 *  creates is named by the content hash of the card that lands it, so a later upload names the same row alike. */
type RowKey = string;

const ownedRow = (characterId: CharacterId): RowKey => `owned:${characterId}`;
const newCardRow = (contentHash: string): RowKey => `card:${contentHash}`;
const newOrphanRow = (handle: string): RowKey => `orphan:${handle}`;

/** A transcript's key: its identity under the row it lands under, the pair the chat write skips a repeat by. */
const chatKey = (row: RowKey, chat: CollectedChat): string => JSON.stringify([row, chat.importHash]);

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
  readonly answers: Map<CollectedChat, ImportAnswer>;
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
    const keys = [chatKey(row.key, chat)];
    if (held.has(chat)) {
      judge.answers.set(chat, { reuse: "library", keys });
    } else if (claimed.has(chat.importHash) || (chat.fileHash !== undefined && claimed.has(chat.fileHash))) {
      judge.answers.set(chat, { reuse: "upload", keys });
    } else {
      claimed.add(chat.importHash);
      judge.answers.set(chat, { reuse: null, keys });
    }
  }
}

/** What the card pass learned: the answer for each card, the row each card resolves to (which a group of its profile
 *  seats by filename), and the owned character behind a row. */
interface CardPass {
  readonly characters: Map<CollectedCard, ImportAnswer>;
  readonly rowByCard: Map<CollectedCard, RowKey>;
  readonly ownedByRow: Map<RowKey, CharacterId>;
}

/** The owned match a card reuses. A card matched by its text alone reuses the row only by giving it its art, which the
 *  write does once (`resolveExisting` in import-character.ts): an earlier card of this upload that took the art leaves
 *  this one to land beside it. */
function takeArtOnce<Match extends { readonly characterId: CharacterId; readonly match: string }>(
  artTaken: Set<CharacterId>,
  owned: Match | null,
): Match | null {
  if (owned?.match !== "text") {
    return owned;
  }
  if (artTaken.has(owned.characterId)) {
    return null;
  }
  artTaken.add(owned.characterId);
  return owned;
}

/** A character is reused when an equal card landed (the one lookup order every door uses), in the library or earlier
 *  in this upload. A taken handle is not a match: different content under it lands beside the owned character with
 *  a suffixed handle (D290). A text-only match counts: whether that row may take the PNG's art is decided by the
 *  write, not predicted here. Its chats are held only under the equal card's own row. */
async function passCards(deps: ProfileDirImportDeps, collected: ProfileCollected, chats: ChatJudge): Promise<CardPass> {
  const ownerId = deps.principal.userId;
  const { characterOps, exportCurrentCard } = deps.contextFor(deps.principal, deps.storeAvatar);
  const pass: CardPass = { characters: new Map(), rowByCard: new Map(), ownedByRow: new Map() };
  // call-local: the row each landed card identity lands under, so a later equal card finds it. Ends if it outlives the pass.
  const landed = new Map<string, RowKey>();
  // call-local: the owned art-less rows an earlier card of this upload matched by its text alone. Ends if it outlives the pass.
  const artTaken = new Set<CharacterId>();
  for (const bundle of collected.bundles) {
    if (deps.signal.aborted) {
      break;
    }
    const hashes = { importHash: bundle.contentHash, textHash: bundle.textHash, fileHash: importFileHash(bundle.cardBytes) };
    const found = takeArtOnce(
      artTaken,
      await findImportedCharacter(
        async (importHash) => await characterOps.findByImportHash({ ownerId, importHash }),
        hashes,
        currentCardIdentity(exportCurrentCard, ownerId, bundle.carriedHandle),
      ),
    );
    const earlier = found === null ? await findImportedCharacter<RowKey>((importHash) => Promise.resolve(landed.get(importHash) ?? null), hashes) : null;
    const keys = [bundle.contentHash];
    let row = newCardRow(bundle.contentHash);
    if (found !== null) {
      row = ownedRow(found.characterId);
      pass.ownedByRow.set(row, found.characterId);
      pass.characters.set(bundle, { reuse: "library", keys });
    } else if (earlier !== null) {
      row = earlier.characterId;
      pass.characters.set(bundle, { reuse: "upload", keys });
    } else {
      landed.set(bundle.contentHash, row);
      pass.characters.set(bundle, { reuse: null, keys });
    }
    pass.rowByCard.set(bundle, row);
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
  const orphans = new Map<ProfileCollected["orphanBundles"][number], ImportAnswer>();
  // call-local: the placeholders the upload's earlier orphan directories name. Ends if it outlives the pass.
  const named = new Set<string>();
  for (const orphan of collected.orphanBundles) {
    if (deps.signal.aborted) {
      break;
    }
    const importHash = orphanImportHash(orphan.handle);
    const characterId = await characterOps.findByImportHash({ ownerId, importHash });
    const keys = [importHash];
    if (characterId !== null) {
      orphans.set(orphan, { reuse: "library", keys });
    } else {
      orphans.set(orphan, { reuse: named.has(orphan.handle) ? "upload" : null, keys });
    }
    named.add(orphan.handle);
    await judgeChats(deps, chats, { key: characterId === null ? newOrphanRow(orphan.handle) : ownedRow(characterId), characterId }, orphan.chats);
    await yieldToEventLoop();
  }
  return orphans;
}

/** A group's founding character is its first member its profile carries; a member that is not yet in the library
 *  stands in as the row the upload creates for it, so a held member after it never becomes the founder. */
function groupFounder(group: ProfileCollected["groups"][number], seats: ReadonlyMap<string, RowKey>): RowKey | null {
  return resolveMembers(group, seats).seated[0]?.characterId ?? null;
}

/** A group is reused when every transcript it brings is: the write counts a room only when it adds one. A group the
 *  run refuses is a skip in the preview, so it is never asked about. A group's one key is the set of its transcripts'
 *  keys, so a later upload that brings the same transcripts can tell. A transcript no founder seats has no key, and a
 *  group holding one cannot be compared. */
async function passGroups(deps: ProfileDirImportDeps, collected: ProfileCollected, cards: CardPass, chats: ChatJudge): Promise<ImportOwnership["groups"]> {
  const groups = new Map<ProfileCollected["groups"][number], ImportAnswer>();
  const seatsByGroup = new Map(
    collected.profiles.flatMap(({ result }) => {
      const seats = seatsOf(result.bundles, cards.rowByCard);
      return result.groups.map((group) => [group, seats] as const);
    }),
  );
  for (const group of partitionGroups(collected.profiles).importable) {
    if (deps.signal.aborted) {
      break;
    }
    const founder = groupFounder(group, seatsByGroup.get(group) ?? new Map());
    if (founder !== null) {
      await judgeChats(deps, chats, { key: founder, characterId: cards.ownedByRow.get(founder) ?? null }, group.chats);
    }
    const judged = group.chats.map((chat) => chats.answers.get(chat));
    const reuses = judged.map((answer) => answer?.reuse ?? null);
    let reuse: ImportAnswer["reuse"] = null;
    if (reuses.every((why) => why === "library")) {
      reuse = "library";
    } else if (reuses.every((why) => why !== null)) {
      reuse = "upload";
    }
    const answered = judged.filter((answer): answer is ImportAnswer => answer !== undefined);
    groups.set(group, { reuse, keys: answered.length === judged.length ? [JSON.stringify(answered.flatMap((answer) => answer.keys).toSorted())] : [] });
    await yieldToEventLoop();
  }
  return groups;
}

/** The items the twin answered, each with its answer. An answer list shorter than the items (an aborted run) leaves
 *  the rest out. */
function answersOf<Item>(items: readonly Item[], answers: readonly ImportAnswer[]): Map<Item, ImportAnswer> {
  const answered = new Map<Item, ImportAnswer>();
  for (const [i, item] of items.entries()) {
    const answer = answers[i];
    if (answer !== undefined) {
      answered.set(item, answer);
    }
  }
  return answered;
}

/** The personas the run lands without art. The run offers each avatar to the store under the upload cap and lands the
 *  persona art-less when the store refuses it (`toPersonaInput` in profile-directory.ts), so the store's own twin
 *  decides here. */
function personasWithoutArt(deps: ProfileDirImportDeps, collected: ProfileCollected): ReadonlySet<CollectedPersona> {
  return new Set(
    collected.personas.filter(
      ({ avatarBytes }) => avatarBytes === undefined || !deps.ownership.admitsAvatar({ bytes: avatarBytes, maxBytes: ASSET_UPLOAD_MAX_BYTES }),
    ),
  );
}

async function passPersonas(
  deps: ProfileDirImportDeps,
  collected: ProfileCollected,
  artless: ReadonlySet<CollectedPersona>,
): Promise<ImportOwnership["personas"]> {
  const personas = await mapYielding(collected.personas, deps.signal, (persona) => ({
    name: persona.parsed.name,
    description: persona.parsed.description,
    metadata: narrowPersonaMetadata(persona.parsed.metadata),
    artHash: persona.avatarBytes === undefined || artless.has(persona) ? null : sha256Hex(persona.avatarBytes),
  }));
  return answersOf(collected.personas, await deps.ownership.findPersonas({ ownerId: deps.principal.userId, personas, collisions: deps.personaCollisions }));
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
  const backgrounds = await mapYielding(collected.backgrounds, deps.signal, ({ bytes }): ImportAnswer => {
    const hash = sha256Hex(bytes);
    if (heldHashes.has(hash)) {
      return { reuse: "library", keys: [hash] };
    }
    if (landedHashes.has(hash)) {
      return { reuse: "upload", keys: [hash] };
    }
    landedHashes.add(hash);
    return { reuse: null, keys: [hash] };
  });
  return {
    worlds: answersOf(collected.worlds, books),
    presets: answersOf(collected.presets, await ownership.findPresets({ ownerId, files: presetFiles, signal: deps.signal })),
    themes: answersOf(collected.themes, await ownership.findThemes(ownerId, themeFiles, deps.signal)),
    backgrounds: answersOf(collected.backgrounds, backgrounds),
  };
}

export async function findOwnership(deps: ProfileDirImportDeps, collected: ProfileCollected): Promise<ImportOwnership> {
  // The run lands every card with its chats, then the orphan directories, then the groups; the chat claims follow that order.
  const chats: ChatJudge = { answers: new Map(), claims: new Map() };
  const cards = await passCards(deps, collected, chats);
  const orphans = await passOrphans(deps, collected, chats);
  const groups = await passGroups(deps, collected, cards, chats);
  const artless = personasWithoutArt(deps, collected);
  return {
    characters: cards.characters,
    chats: chats.answers,
    personas: await passPersonas(deps, collected, artless),
    ...(await passLibrary(deps, collected)),
    groups,
    orphans,
    personasWithoutArt: artless,
  };
}
