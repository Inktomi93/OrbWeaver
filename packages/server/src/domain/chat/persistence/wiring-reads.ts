import type { BootDatabaseHandle, DatabaseHandle } from "@orb/db/wiring";
import { bootDatabaseForOwner, databaseForOwner } from "@orb/db/wiring-owner";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { hasRedeemableInvite as readRedeemableInvite } from "./invites.ts";
import { reclaimChatLocksOnBoot as reclaimLocks } from "./lock.ts";
import { migratePluginToolWireNames as migrateToolCallNames } from "./migrate-plugin-tool-wire-names.ts";
import { migrateSeededRoomBackgrounds as migrateBackgrounds } from "./migrate-seeded-backgrounds.ts";
import { migrateHandoffOfferVocab as migrateOfferVocab, repairStaleJoinSeq as repairJoinSeq } from "./participant.ts";
import { loadPresentCharacterSeats as readCharacterSeats, isCharacterSeated as readSeated } from "./participants-read.ts";
import { loadPluginCharacters as readPluginCharacters, loadPluginMessages as readPluginMessages } from "./plugin-reads.ts";
import { loadPresentHostUserId as readHost } from "./reactions.ts";

/** Reuse the private seat predicate without returning a query context to wiring. */
export function isCharacterSeated(db: DatabaseHandle, chatId: ChatId, characterId: CharacterId): ReturnType<typeof readSeated> {
  return readSeated(databaseForOwner(db), chatId, characterId);
}

/** Present-host identity retains its existing owner and presence predicate. */
export function loadPresentHostUserId(db: DatabaseHandle, chatId: ChatId): ReturnType<typeof readHost> {
  return readHost(databaseForOwner(db), chatId);
}

/** The present-seat classifier retains its private query and departure predicate. */
export function loadPresentCharacterSeats(db: DatabaseHandle, chatId: ChatId): ReturnType<typeof readCharacterSeats> {
  return readCharacterSeats(databaseForOwner(db), chatId);
}

/** The plugin's existing owner applies the history floor and hidden-content strip. */
export function loadPluginMessages(db: DatabaseHandle, chatId: ChatId, opts: Parameters<typeof readPluginMessages>[2]): ReturnType<typeof readPluginMessages> {
  return readPluginMessages(databaseForOwner(db), chatId, opts);
}

/** Reuse the reduced present-character projection, never expose the private query context. */
export function loadPluginCharacters(db: DatabaseHandle, chatId: ChatId): ReturnType<typeof readPluginCharacters> {
  return readPluginCharacters(databaseForOwner(db), chatId);
}

/** Seed retirement remains scoped to the actual host by its existing write owner. */
export function migrateSeededRoomBackgrounds(
  db: DatabaseHandle,
  hostUserId: UserId,
  resolve: Parameters<typeof migrateBackgrounds>[2],
  at: number,
): ReturnType<typeof migrateBackgrounds> {
  return migrateBackgrounds(databaseForOwner(db), hostUserId, resolve, at);
}

/** Boot's join-floor repair keeps the seat writer's own canon-head expression. */
export async function repairStaleJoinSeq(db: BootDatabaseHandle): ReturnType<typeof repairJoinSeq> {
  return await repairJoinSeq(bootDatabaseForOwner(db));
}

/** Boot's session-secret settlement asks the invite owner whether a peppered token is still redeemable. */
export async function hasRedeemableInvite(db: BootDatabaseHandle, now: number): ReturnType<typeof readRedeemableInvite> {
  return await readRedeemableInvite(bootDatabaseForOwner(db), now);
}

/** Boot's lock reclaim stays scoped to this replica's holder tag by the lock writer. */
export async function reclaimChatLocksOnBoot(db: BootDatabaseHandle, holder: string): ReturnType<typeof reclaimLocks> {
  return await reclaimLocks(bootDatabaseForOwner(db), holder);
}

/** Boot's handoff-offer key rewrite keeps the offer writer's own idempotent predicate. */
export async function migrateHandoffOfferVocab(db: BootDatabaseHandle): ReturnType<typeof migrateOfferVocab> {
  return await migrateOfferVocab(bootDatabaseForOwner(db));
}

/** Boot's tool-call rename applies the plugin domain's renames, handed down as plain data. */
export async function migratePluginToolWireNames(
  db: BootDatabaseHandle,
  renames: Parameters<typeof migrateToolCallNames>[1],
): ReturnType<typeof migrateToolCallNames> {
  return await migrateToolCallNames(bootDatabaseForOwner(db), renames);
}
