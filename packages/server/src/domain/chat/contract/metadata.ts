// domain/chat/contract/metadata — the `chats.metadata` blob parser (the "metadata strict/lazy-parse fault
// isolation" load-bearing rule). This is the ONE file in the chat
// contract slice with RUNTIME behavior (it gets a real test).
//
// THE FAULT-ISOLATION CONTRACT ("metadata strict/lazy-parse"):
//   • the TOP level is LOOSE — unknown future fields are preserved, never dropped.
//   • each sub-blob (`group` / `roomOverrides` / `opening` / `providerRouting`) is LAZY-parsed INDEPENDENTLY,
//     so a malformed one falls back to its default WITHOUT nuking its siblings (a corrupt `group` must not
//     also wipe a valid `roomOverrides`).
//
// ONE HOME / derive-don't-respell: the sub-blob schemas + their defaults are the canonical declarations in
// `@orb/contracts/chat` (`groupConfigSchema`/`DEFAULT_GROUP_CONFIG`, `roomOverridesSchema`/
// `DEFAULT_ROOM_OVERRIDES`, `openingPolicySchema`); this file COMPOSES them, never re-spells them. The
// `providerRouting` sub-parse LEAVES to `@orb/contracts/connection` (`parseProviderRouting` — provider
// routing is connection vocab, D-movement-table) and is NOT redefined here.

import type { GroupConfig, OpeningPolicy, RoomOverrides } from "@orb/contracts/chat";
import {
  DEFAULT_GROUP_CONFIG,
  DEFAULT_ROOM_OVERRIDES,
  groupConfigSchema,
  openingPolicySchema,
  roomOverridesSchema,
} from "@orb/contracts/chat";
import type { OpenRouterProviderRouting } from "@orb/contracts/connection";
import { parseProviderRouting } from "@orb/contracts/connection";
import { z } from "zod";

/**
 * The parsed `chats.metadata` blob. Every sub-blob is OPTIONAL — absent ⇒ the
 * consumer applies the canonical default (the off-path is byte-identical). The shape mirrors the db
 * `ChatMetadata` JSON column (`@orb/db/schema/chat.ts`) PLUS `providerRouting` (the connection
 * `RoutableChat` routing field — see FLAG in the handoff).
 */
export interface ChatMetadata {
  group?: GroupConfig;
  roomOverrides?: RoomOverrides;
  opening?: OpeningPolicy;
  providerRouting?: OpenRouterProviderRouting;
  /** The D48 recurse-depth cap (tool-use-design/03 §2.1): a CHAT-level knob (in a multi-human room the
   *  loop spends the HOST's money — D19 — so the funder tunes it), host-editable, seed 5. */
  toolRecurseLimit?: number;
}

// The D48 recurse-limit knob (03 §2.1): bounded so a fat-fingered edit can't authorize a runaway chain.
export const TOOL_RECURSE_LIMIT_DEFAULT = 5;
const TOOL_RECURSE_LIMIT_MAX = 20;
const toolRecurseLimitSchema = z.number().int().min(1).max(TOOL_RECURSE_LIMIT_MAX);

/**
 * The declarative shape of the `chats.metadata` blob. LOOSE at the top level (unknown future fields are
 * preserved). Each sub-blob is `.optional()` + `.catch(undefined)` so a malformed one is isolated to
 * `undefined` rather than failing the whole parse — but {@link parseChatMetadata} is the authoritative
 * fault-isolated reader (it also runs the `providerRouting` LEAF parse, which is not modelled inline so the
 * connection schema stays its one home). The schema is exported for type-inference / completeness; runtime
 * callers use {@link parseChatMetadata}.
 */
export const chatMetadataSchema = z
  .object({
    group: groupConfigSchema.optional().catch(undefined),
    roomOverrides: roomOverridesSchema.optional().catch(undefined),
    opening: openingPolicySchema.optional().catch(undefined),
    toolRecurseLimit: toolRecurseLimitSchema.optional().catch(undefined),
  })
  .loose();

// A non-null object guard for the raw column value (drizzle hands back whatever `JSON.parse` produced).
function asRecord(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

/**
 * Fault-isolated read of the `chats.metadata` column (the §8.4 parse-at-the-DB-seam). Each sub-blob is
 * parsed on its OWN — a malformed sub-blob degrades to `undefined` (the consumer then applies its default)
 * without poisoning its siblings. NEVER throws on a corrupt blob: the hot send path heals to defaults.
 */
export function parseChatMetadata(raw: unknown): ChatMetadata {
  const obj = asRecord(raw);
  const out: ChatMetadata = {};

  const group = groupConfigSchema.safeParse(obj["group"]);
  if (group.success) {
    out.group = group.data;
  }
  const room = roomOverridesSchema.safeParse(obj["roomOverrides"]);
  if (room.success) {
    out.roomOverrides = room.data;
  }
  const opening = openingPolicySchema.safeParse(obj["opening"]);
  if (opening.success) {
    out.opening = opening.data;
  }
  const recurse = toolRecurseLimitSchema.safeParse(obj["toolRecurseLimit"]);
  if (recurse.success) {
    out.toolRecurseLimit = recurse.data;
  }
  // The providerRouting LEAF parse lives in connection (its one home) — returns `undefined` on a corrupt /
  // non-object blob, so it self-heals the same way.
  const routing = parseProviderRouting(obj["providerRouting"]);
  if (routing !== undefined) {
    out.providerRouting = routing;
  }

  return out;
}

/**
 * The effective {@link GroupConfig} for a chat's raw `metadata` blob — the parsed `group` sub-blob, or the
 * canonical {@link DEFAULT_GROUP_CONFIG} (per-speaker × merged, natural arbitration; the solo/off path is
 * byte-identical). Accepts the RAW column value (fault-isolated internally).
 */
export function getGroupConfig(rawMetadata: unknown): GroupConfig {
  return parseChatMetadata(rawMetadata).group ?? DEFAULT_GROUP_CONFIG;
}

/**
 * The effective {@link RoomOverrides} for a chat's raw `metadata` blob — the parsed `roomOverrides` sub-blob,
 * or the empty {@link DEFAULT_ROOM_OVERRIDES} (inherit everything). Accepts the RAW
 * column value (fault-isolated internally).
 */
export function getRoomOverrides(rawMetadata: unknown): RoomOverrides {
  return parseChatMetadata(rawMetadata).roomOverrides ?? DEFAULT_ROOM_OVERRIDES;
}

/** The effective D48 recurse-depth cap for a chat's raw `metadata` blob — the parsed knob or the seed
 *  default (5). Accepts the RAW column value (fault-isolated internally). */
export function getToolRecurseLimit(rawMetadata: unknown): number {
  return parseChatMetadata(rawMetadata).toolRecurseLimit ?? TOOL_RECURSE_LIMIT_DEFAULT;
}
