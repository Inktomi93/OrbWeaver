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

import type { CharacterRegexSlice, RegexTierAllow } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { ProcessMacroOptions } from "@orb/kit/macro";
import type { RegexScriptInput } from "@orb/kit/regex";
import type { ApplyRegexReplaceOp } from "./context.ts";

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
  /** The present characters' sets, PER SEAT and in ROSTER ORDER — the `character_regex_scripts` junction.
   *  Per seat rather than flat because each seated character is its OWN tier: its own per-chat allow flag and
   *  its own group in the room's Regex section (#1742/F3). Concatenating the slices in array order reproduces
   *  the flat list this used to be. */
  readonly character: readonly CharacterRegexSlice[];
  /** The ROOM's own set — the `chat_regex_scripts` junction (host-set room state, the `chat_books` twin).
   *  Last tier: a room quirk layers OVER the library/preset/character defaults rather than shadowing them. */
  readonly chat: readonly RegexScriptRow[];
  /** WHAT THIS ROOM PERMITS (#1742) — the per-chat master + the per-tier allows, read off `ChatMetadata`.
   *
   *  REQUIRED, not optional, and that is the point: every caller of the resolver must state the room's
   *  levers, so there is no "forgot to pass it" arm in which a tier the host switched off silently runs
   *  anyway. tsc forces both turn callers (`substrate/assemble-gather.ts`, `verbs/edit.ts`) and the read.
   *  Both members are ABSENT-⇒-ALLOWED (`isRegexEnabledInChat` / `isRegexTierAllowed`), so a room that never
   *  touched the section resolves byte-identically to before. */
  readonly allow: HostTierRegexAllow;
}

/**
 * WHAT THE TIERS ARE CALLED (#1754) — the names the resolver stamps onto `RegexTierGroupView.label`
 * (`@orb/contracts/chat`), for the tiers whose KEY does not carry its own identity. Today exactly one: `preset`.
 *
 * It is a SECOND PARAMETER of `resolveRegexTiers` rather than a member of {@link HostTierRegexSources},
 * because naming is the LISTING half's concern and the sources are the RUN ORDER's: every turn-path caller
 * reaches the resolver through `resolveHostTierRegexScripts`, which discards the listing entirely and would
 * otherwise have to carry a name it never renders. Required (not optional) at the one seam that does render
 * it, so a listing caller must state what it knows instead of silently drawing an unnamed tier.
 */
export interface RegexTierLabels {
  /** The name of the preset THIS ROOM assembles — the rpg GM redirect's when it fires, else the host's own
   *  default. `null` when no preset row resolved (the system `DEFAULT_PROMPT_CONFIG` stood in): the section
   *  then says the bare `From the preset`, which is the honest answer rather than a wrong name. */
  readonly preset: string | null;
}

/** The room's regex levers as the resolver consumes them — the two `ChatMetadata` keys, lifted out of the
 *  blob so the pure resolver never has to know what a chat row looks like. */
export interface HostTierRegexAllow {
  /** `ChatMetadata.regexEnabled` verbatim. Absent ⇒ the master is ON. */
  readonly enabled: boolean | undefined;
  /** `ChatMetadata.regexTiers` verbatim. Absent, or a key absent, ⇒ that tier runs. */
  readonly tiers: RegexTierAllow | undefined;
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
