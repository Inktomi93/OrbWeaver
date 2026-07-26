// domain/chat/contract/metadata — the chats.metadata blob parser. This is the one file in the chat
// contract slice with runtime behavior.
//
// Fault isolation: the top level is loose (unknown future fields are preserved); each sub-blob (group /
// roomOverrides / opening / providerRouting) is lazy-parsed independently, so a malformed one falls back to
// its default without nuking its siblings.

import type { ChatMetadata, GroupConfig, RoomOverrides } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, DEFAULT_ROOM_OVERRIDES, groupConfigSchema, openingPolicySchema, roomOverridesSchema } from "@orb/contracts/chat";
import { openRouterProviderRoutingSchema } from "@orb/contracts/connection";
import { chatDocumentVisibilitySchema } from "@orb/contracts/databank";
import { chatRpgPointerSchema } from "@orb/contracts/rpg";

import { themeBackgroundSchema } from "@orb/contracts/theme";
import { stripUndefined } from "@orb/kit/objects";
import { z } from "zod";

export type { ChatMetadata } from "@orb/contracts/chat";

export const TOOL_RECURSE_LIMIT_DEFAULT = 5;
export const TOOL_RECURSE_LIMIT_MIN = 1;
export const TOOL_RECURSE_LIMIT_MAX = 20;
export const toolRecurseLimitSchema = z.number().int().min(TOOL_RECURSE_LIMIT_MIN).max(TOOL_RECURSE_LIMIT_MAX);

/** The declarative shape of the `chats.metadata` blob — every sub-blob independently fault-isolated
 *  (`.catch(undefined)`: a malformed one heals to absent without nuking its siblings) and the object
 *  itself `.loose()` (unknown future fields pass through unstripped). The runtime entry point is
 *  {@link parseChatMetadata}. */
const chatMetadataSchema = z
  .object({
    group: groupConfigSchema.optional().catch(undefined),
    roomOverrides: roomOverridesSchema.optional().catch(undefined),
    opening: openingPolicySchema.optional().catch(undefined),
    providerRouting: openRouterProviderRoutingSchema.optional().catch(undefined),
    toolRecurseLimit: toolRecurseLimitSchema.optional().catch(undefined),
    databankVisibility: chatDocumentVisibilitySchema.optional().catch(undefined),
    background: themeBackgroundSchema.optional().catch(undefined),
    rpg: chatRpgPointerSchema.optional().catch(undefined),
  })
  .loose();

function asRecord(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

/** Fault-isolated read of the `chats.metadata` column. Never throws on a corrupt blob — the hot send path
 *  heals to defaults (every sub-blob `.catch`es independently, so this can never reject). `stripUndefined`
 *  restores "absent ⇒ key missing" (zod's `.catch(undefined)` sets the key WITH value `undefined` instead
 *  of omitting it — {@link ChatMetadata}'s optional fields mean absent, not explicit `undefined`). The cast
 *  is sound but not TS-provable: `stripUndefined`'s `Partial<T>` return keeps each property's `| undefined`
 *  arm in its TYPE even though the runtime value can no longer hold it. */
export function parseChatMetadata(raw: unknown): ChatMetadata {
  return stripUndefined(chatMetadataSchema.parse(asRecord(raw))) as ChatMetadata;
}

/** The effective {@link GroupConfig} for a chat's raw `metadata` blob, or {@link DEFAULT_GROUP_CONFIG}. */
export function getGroupConfig(rawMetadata: unknown): GroupConfig {
  return parseChatMetadata(rawMetadata).group ?? DEFAULT_GROUP_CONFIG;
}

/** The effective {@link RoomOverrides} for a chat's raw `metadata` blob, or {@link DEFAULT_ROOM_OVERRIDES}. */
export function getRoomOverrides(rawMetadata: unknown): RoomOverrides {
  return parseChatMetadata(rawMetadata).roomOverrides ?? DEFAULT_ROOM_OVERRIDES;
}

/** The effective recurse-depth cap for a chat's raw `metadata` blob, or the seed default (5). */
export function getToolRecurseLimit(rawMetadata: unknown): number {
  return parseChatMetadata(rawMetadata).toolRecurseLimit ?? TOOL_RECURSE_LIMIT_DEFAULT;
}
