// The dry run's ownership read: which collected items of every kind the owner already holds. Every lookup asks
// the owning domain's read-only twin of the write that would land the item, so a preview and a real run agree on
// what "already yours" means. Nothing here writes. A verdict belongs to the collected entry itself, never to its
// source string, because two profiles of one folder can share a path.

import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import type { CharacterId } from "@orb/kit/ids";
import { mapYielding } from "#primitives/abort";
import { sha256Hex } from "#primitives/content-hash";
import type { CollectedCard, CollectedChat } from "../contract/collection.ts";
import type { ImportOwnership, ProfileCollected, ProfileDirImportDeps } from "../contract/profile-directory.ts";
import { findImportedCharacter, importFileHash } from "../substrate/card.ts";
import { partitionGroups, resolveMembers } from "../substrate/group.ts";
import { orphanImportHash } from "../substrate/handle.ts";
import { presetBytes, themeBytes } from "../substrate/landing-bytes.ts";

/** The chats of one character the owner already holds, by the identities the chat write skips a transcript by. */
async function heldChats(deps: ProfileDirImportDeps, characterId: CharacterId | null, chats: readonly CollectedChat[]): Promise<readonly CollectedChat[]> {
  if (characterId === null || chats.length === 0) {
    return [];
  }
  const held = await deps.ownership.findChatHashes({
    ownerId: deps.principal.userId,
    characterId,
    hashes: chats.flatMap((chat) => (chat.fileHash === undefined ? [chat.importHash] : [chat.importHash, chat.fileHash])),
  });
  return chats.filter((chat) => held.has(chat.importHash) || (chat.fileHash !== undefined && held.has(chat.fileHash)));
}

/** What the card pass learned: the cards the owner holds, and the row each equal card already landed as. */
interface CardPass {
  readonly characters: Set<CollectedCard>;
  readonly identities: Map<string, CharacterId>;
  readonly heldChats: CollectedChat[];
}

/** A character is held when an equal card landed (the one lookup order every door uses) or its handle is taken. A
 *  text-only match counts: whether that row may take the PNG's art is decided by the write, not predicted here.
 *  Its chats are held only under the equal card's own row, since a handle collision lands a new character. */
async function passCards(deps: ProfileDirImportDeps, collected: ProfileCollected): Promise<CardPass> {
  const ownerId = deps.principal.userId;
  const { characterOps } = deps.contextFor(deps.principal, deps.storeAvatar);
  const pass: CardPass = { characters: new Set(), identities: new Map(), heldChats: [] };
  for (const bundle of collected.bundles) {
    if (deps.signal.aborted) {
      break;
    }
    const found = await findImportedCharacter(async (importHash) => await characterOps.findByImportHash({ ownerId, importHash }), {
      importHash: bundle.contentHash,
      textHash: bundle.textHash,
      fileHash: importFileHash(bundle.cardBytes),
    });
    if (found !== null) {
      pass.identities.set(bundle.filename, found.characterId);
    }
    if (found !== null || (await characterOps.findByHandle({ ownerId, handle: bundle.handle })) !== null) {
      pass.characters.add(bundle);
    }
    pass.heldChats.push(...(await heldChats(deps, found?.characterId ?? null, bundle.chats)));
    // These reads resolve on microtasks, so a large folder would otherwise hold the event loop for the whole pass.
    await yieldToEventLoop();
  }
  return pass;
}

/** An orphan directory is held when its placeholder character exists; its chats are held under that row. */
async function passOrphans(
  deps: ProfileDirImportDeps,
  collected: ProfileCollected,
): Promise<{ readonly orphans: Set<ProfileCollected["orphanBundles"][number]>; readonly heldChats: CollectedChat[] }> {
  const ownerId = deps.principal.userId;
  const { characterOps } = deps.contextFor(deps.principal, deps.storeAvatar);
  const orphans = new Set<ProfileCollected["orphanBundles"][number]>();
  const held: CollectedChat[] = [];
  for (const orphan of collected.orphanBundles) {
    if (deps.signal.aborted) {
      break;
    }
    const characterId = await characterOps.findByImportHash({ ownerId, importHash: orphanImportHash(orphan.handle) });
    if (characterId !== null) {
      orphans.add(orphan);
    }
    held.push(...(await heldChats(deps, characterId, orphan.chats)));
    await yieldToEventLoop();
  }
  return { orphans, heldChats: held };
}

/** A group's founding character is its first member the import set carries; a member that is not yet in the
 *  library stands in as a new seat, so a held member after it never becomes the founder. */
function groupFounder(
  group: ProfileCollected["groups"][number],
  bundles: ProfileCollected["bundles"],
  identities: ReadonlyMap<string, CharacterId>,
): CharacterId | null {
  const seats = new Map(bundles.map((bundle) => [bundle.filename, identities.get(bundle.filename) ?? `new:${bundle.filename}`]));
  const founder = resolveMembers(group, seats).seated[0];
  return founder === undefined ? null : (identities.get(founder.file) ?? null);
}

/** A group is held when every transcript it brings is: the write counts a room only when it adds one. A group the
 *  run refuses is a skip in the preview, so it is never asked about. */
async function passGroups(
  deps: ProfileDirImportDeps,
  collected: ProfileCollected,
  identities: ReadonlyMap<string, CharacterId>,
): Promise<{ readonly groups: Set<ProfileCollected["groups"][number]>; readonly heldChats: CollectedChat[] }> {
  const groups = new Set<ProfileCollected["groups"][number]>();
  const held: CollectedChat[] = [];
  const { importable } = partitionGroups(
    collected.groups,
    collected.bundles.map((bundle) => bundle.filename),
  );
  for (const group of importable) {
    if (deps.signal.aborted) {
      break;
    }
    const mine = await heldChats(deps, groupFounder(group, collected.bundles, identities), group.chats);
    held.push(...mine);
    if (mine.length === group.chats.length) {
      groups.add(group);
    }
    await yieldToEventLoop();
  }
  return { groups, heldChats: held };
}

/** The items whose answer is `true`. An answer list shorter than the items (an aborted run) leaves the rest out. */
function heldOf<Item>(items: readonly Item[], answers: readonly boolean[]): Set<Item> {
  return new Set(items.filter((_, i) => answers[i] === true));
}

async function passPersonas(deps: ProfileDirImportDeps, collected: ProfileCollected): Promise<ImportOwnership["personas"]> {
  const personas = await mapYielding(collected.personas, deps.signal, ({ parsed, avatarBytes }) => ({
    name: parsed.name,
    description: parsed.description,
    metadata: parsed.metadata ?? null,
    artHash: avatarBytes === undefined ? null : sha256Hex(avatarBytes),
  }));
  return heldOf(collected.personas, await deps.ownership.findPersonas({ ownerId: deps.principal.userId, personas }));
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
  const backgroundHeld = await mapYielding(collected.backgrounds, deps.signal, ({ bytes }) => heldHashes.has(sha256Hex(bytes)));
  return {
    worlds: heldOf(collected.worlds, books),
    presets: heldOf(collected.presets, await ownership.findPresets({ ownerId, files: presetFiles, signal: deps.signal })),
    themes: heldOf(collected.themes, await ownership.findThemes(ownerId, themeFiles, deps.signal)),
    backgrounds: heldOf(collected.backgrounds, backgroundHeld),
  };
}

export async function findOwnership(deps: ProfileDirImportDeps, collected: ProfileCollected): Promise<ImportOwnership> {
  const cards = await passCards(deps, collected);
  const orphans = await passOrphans(deps, collected);
  const groups = await passGroups(deps, collected, cards.identities);
  return {
    characters: cards.characters,
    chats: new Set([...cards.heldChats, ...orphans.heldChats, ...groups.heldChats]),
    personas: await passPersonas(deps, collected),
    ...(await passLibrary(deps, collected)),
    groups: groups.groups,
    orphans: orphans.orphans,
  };
}
