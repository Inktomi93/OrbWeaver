// domain/character/substrate/group-character — the synthetic group-identity shape (pure, zero I/O). The
// `__group__${chatId}` handle namespace is owned HERE (no code outside this
// domain inserts into `characters`). Per-owner handle uniqueness (the `(ownerId, handle)` index) makes the
// mint find-or-mint idempotent and collision-free across rooms. The card is a minimal never-rendered memory
// bucket (§11.5 group-chat); `synthetic=true` filters it from every user-facing query + the embed pass.

import type { CharacterCard } from "@orb/contracts/character";

/** The reserved handle prefix for per-room synthetic group characters. */
const GROUP_HANDLE_PREFIX = "__group__";

/** The synthetic group character's handle for a room (`__group__<chatId>`). */
export function groupHandle(chatId: string): string {
  return `${GROUP_HANDLE_PREFIX}${chatId}`;
}

/** True when a handle falls in the reserved synthetic group namespace — `character.create`/`update` REFUSE
 *  these (a user card may never squat the `__group__${chatId}` bucket the mint owns). */
export function isReservedGroupHandle(handle: string): boolean {
  return handle.startsWith(GROUP_HANDLE_PREFIX);
}

/** The minimal card for a synthetic group identity (a memory bucket — never rendered to a user). */
export function buildGroupCard(): CharacterCard {
  return {
    name: "Group",
    description: "Synthetic group-room character (memory bucket; never rendered).",
    personality: null,
    scenario: null,
    greetings: [],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    nickname: null,
    source: null,
    creationDate: null,
    modificationDate: null,
    extensions: null,
    residualData: null,
    avatarAssetId: null,
    refinery: null,
  };
}
