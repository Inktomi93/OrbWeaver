// domain/regex/contract/resolve — the SCOPE-RESOLUTION op the chat turn consumes (D121-E). This is the seam
// that replaced the three embed-by-value carriers: instead of chat reading `us.regex.scripts` +
// `promptConfig.regexScripts` + `card.regexScripts` off three blobs, ONE injected op dereferences the four
// scope junctions and hands back the four ordered slices. Chat still owns the UNION (source order + the
// dedup is a chat-assembly decision, `substrate/regex-tier`) — this op resolves, it never unions.
//
// PRINCIPAL-LESS BY CONSTRUCTION (the standalone-factory class): every argument is already an id the CALLER
// gated. `ownerId` is the turn's frozen `runAsUserId` (D19 — the host, never the calling member), which is
// exactly why a non-host member cannot contribute: they have no parameter on this surface. The chat scope
// is not owner-filtered (a room's attached scripts are room-public prompt content, membership is the
// caller's gate) — the `listChatBooks` precedent.

import type { RegexScriptRow } from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, PresetId, UserId } from "@orb/kit/ids";

/** The DI bundle `createResolveRegexSources` closes over. Pure owner-scoped reads — no clock/id/audit. */
export interface RegexResolveContext {
  readonly db: Db;
}

/** Which scopes to dereference for one turn. Every field is already caller-gated (see the header). */
export interface ResolveRegexSourcesArgs {
  /** The turn's frozen `runAsUserId` — the host. Gates the global/preset/character slices. */
  readonly ownerId: UserId;
  /** The chat's resolved active preset, or null when the system `DEFAULT_PROMPT_CONFIG` stood in. */
  readonly presetId: PresetId | null;
  /** The present cast, IN ROSTER ORDER (the cast slice concatenates per character in this order). */
  readonly characterIds: readonly CharacterId[];
  /** The room. Room-public scope — not owner-filtered. */
  readonly chatId: ChatId;
}

/** The four resolved slices, each already ordered by its junction `position`. The consumer (chat's
 *  `resolveHostTierRegexScripts`) concatenates global → preset → cast → chat and dedupes by row id. */
export interface ResolvedRegexSources {
  readonly hostGlobal: readonly RegexScriptRow[];
  readonly preset: readonly RegexScriptRow[];
  readonly cast: readonly RegexScriptRow[];
  readonly chat: readonly RegexScriptRow[];
}

export type ResolveRegexSources = (args: ResolveRegexSourcesArgs) => Promise<ResolvedRegexSources>;
