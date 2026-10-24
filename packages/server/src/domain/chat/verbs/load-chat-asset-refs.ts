// The chat-scoped render resolver assets consumes (`AssetsContext.loadChatAssetRefs`): a pair is returned only
// when the asset has a `message_assets` row for a message in the room at or above the caller's history floor, and
// both its owner and the caller are present members. Membership alone is not sufficient; the `message_assets` FK is the reference.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { AssetsContext } from "#domain/assets";
import type { ChatContext } from "../contract/context.ts";
import { loadChatAssetRefRows } from "../persistence/co-participant-assets.ts";

export function createLoadChatAssetRefs(input: DbAssemblyInput<Pick<ChatContext, "db">>): NonNullable<AssetsContext["loadChatAssetRefs"]> {
  const ctx = { db: databaseForOwner(input.db) };
  return async (callerId, forChatId, assetIds) => (assetIds.length === 0 ? [] : await loadChatAssetRefRows(ctx.db, callerId, forChatId, assetIds));
}
