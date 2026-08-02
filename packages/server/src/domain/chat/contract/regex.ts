// domain/chat/contract/regex — the host-tier regex RESOLUTION contract (D53 as amended by D121-E). Homes the
// input shape of the `substrate/regex-tier` resolver here because the `types-in-contract` gate forbids an
// exported feature type living on a substrate/verb/engine file. The resolver itself (the pure union) stays in
// `substrate/`; the SEND (`USER_INPUT`) verb + the RECEIVE (`AI_OUTPUT`/`REASONING`) engine both reference
// this one named input when they resolve the scopes under the frozen `runAsUserId` (D19).
//
// WHAT D121-E CHANGED: the CONTENT of each slice. It used to be three blob copies (`UserSettings.regex.
// scripts`, `PromptConfig.regexScripts`, `characters.regexScripts`); it is now library ROWS dereferenced
// from the four scope junctions by the injected `ResolveRegexSources` op (`domain/regex`). The AUTHORITY
// model is untouched: every slice is pre-resolved under the host, and a non-host member has no parameter on
// this surface, so the member-exclusion stays STRUCTURAL rather than a runtime check.

import type { RegexScriptRow } from "@orb/contracts/regex";

/**
 * The four host-tier regex sources, each ALREADY resolved under the frozen `runAsUserId` (D19 — the host,
 * never the calling member). Fed to `resolveHostTierRegexScripts`, whose concatenation order IS the
 * execution order.
 */
export interface HostTierRegexSources {
  /** The host's owner-global set — the `global_regex_scripts` junction. */
  readonly hostGlobal: readonly RegexScriptRow[];
  /** The chat's active-preset set — the `preset_regex_scripts` junction. */
  readonly preset: readonly RegexScriptRow[];
  /** The present cast's sets, concatenated IN ROSTER ORDER — the `character_regex_scripts` junction. */
  readonly cast: readonly RegexScriptRow[];
  /** The ROOM's own set — the `chat_regex_scripts` junction (host-set room state, the `chat_books` twin).
   *  Last tier: a room quirk layers OVER the library/preset/cast defaults rather than shadowing them. */
  readonly chat: readonly RegexScriptRow[];
}
