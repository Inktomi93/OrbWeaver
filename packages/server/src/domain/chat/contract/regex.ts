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
import type { ProcessMacroOptions } from "@orb/kit/macro";
import type { RegexScriptInput } from "@orb/kit/regex";
import type { ApplyRegexReplaceOp } from "./context";

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

/**
 * The per-turn execution seams the EPHEMERAL `PROMPT_HISTORY` leg runs under (`assembly/history-regex`).
 * Homed here, beside the sources it consumes, for the same reason `HostTierRegexSources` is: the leg is
 * driven from BOTH named subsystems — `engine/pipeline` (a real turn) and `verbs/read` (the host's
 * `previewAssembly`/`getShapeTrace`/`previewContextFit`) — and a cross-subsystem type must come from
 * `contract/`, never from the assembly file that implements it.
 */
export interface PromptHistoryRegexEnv {
  /** The resolved host-tier union (`substrate/regex-tier`) — the SAME set every other shared leg runs. The
   *  executor drops what does not apply; the leg never pre-filters by scope. */
  readonly scripts: readonly RegexScriptInput[];
  /** The turn-stage macro context for the find/replace TEMPLATE passes (`buildTurnMacroContext`). */
  readonly macroCtx: ProcessMacroOptions;
  /** The injected node:vm ReDoS watchdog (D53) — every `text.replace` on this leg runs under it. */
  readonly applyReplace: ApplyRegexReplaceOp;
  /** Per-failure report. The caller logs it; the leg additionally EVICTS the script for the rest of the
   *  pass (its header states why history length must never multiply a watchdog trip). */
  readonly onScriptFailure: (err: unknown, script: RegexScriptInput) => void;
}
