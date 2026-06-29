// domain/chat/contract/regex — the host-tier regex RESOLUTION contract (D53). Homes the input shape of the
// `substrate/regex-tier` resolver here because the `types-in-contract` gate (§7.4) forbids an exported feature
// type living on a substrate/verb/engine file. The resolver itself (the pure union) stays in `substrate/`; the
// SEND (`USER_INPUT`) verb + the RECEIVE (`AI_OUTPUT`/`REASONING`) engine (next chunk) both reference this one
// named input when they resolve the three sources under the frozen `runAsUserId` (D19).

import type { CharacterCard } from "@orb/contracts/character";
import type { RegexScript } from "@orb/contracts/regex";

/**
 * The three host-tier regex sources, each ALREADY resolved under the frozen `runAsUserId` (D19 — the host,
 * never the calling member). A non-host member has no field on this surface, so it contributes NOTHING to the
 * shared prompt (D53); the member-exclusion is structural. Fed to `resolveHostTierRegexScripts`.
 */
export interface HostTierRegexSources {
  /** The host's owner-global set — `UserSettings.regexScripts` (the single-owned `fetchOwned` library). */
  readonly hostGlobal: readonly RegexScript[];
  /** The chat's active-preset set — `PromptConfig.regexScripts`. */
  readonly preset: readonly RegexScript[];
  /** The present cast — live cards (host-owned via `getCard`, D28); each card's `regexScripts` joins the set. */
  readonly cast: readonly CharacterCard[];
}
