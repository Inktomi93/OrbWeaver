// @orb/contracts/prose — the ONE registry of model-facing prose (PROSE-1 §4). Every string whose bytes reach
// a model is a SLOT: a shipped default + the metadata the edit surface and the gate need. A host override for
// a slot lives in exactly ONE storage (its `home`), and resolution is exactly two rungs deep — the override
// for this slot's home, else the shipped default (PROSE-1 §3.1: there is NO cascade, on purpose).
//
// Layout (PROSE-1 §4.1): the slot SHAPE + the closed id tuple live in `#prose-slot`; the per-domain slot
// TABLES live beside the vocabulary they teach —
//   • `#preset` (preset/prose.ts)     — per-PRESET voice/nudge prose (census 38-48)
//   • `#imagery`                      — per-USER image-prompt + negative-base prose (census 82-88)
//   • `#chat` (chat/prose.ts)         — per-USER app-tier side-generation prose (census 74-81) + the
//                                       group-round / injection FRAMING prose
//   • `#automation` (automation/prose.ts) — per-USER quiet-pick prose (census 91)
//   • `#discovery` (discovery/prose.ts)   — per-USER library-semantics system prompts
// …and THIS file composes them into `PROSE_SLOTS` and owns the resolver. Later stages graft the per-game
// teaches (`#rpg`) and the extraction templates onto the SAME tuple. This module re-exports `#prose-slot`,
// so a consumer imports `@orb/contracts/prose` and gets the whole vocabulary.
//
// `PROSE_SLOT_IDS` is the ONE closed id vocabulary (§5.5 string-union dispatch): `PROSE_SLOTS` is annotated
// `Record<ProseSlotId, ProseSlotDef>` so a missing row fails `tsc`, and each table `satisfies
// Partial<Record<ProseSlotId, ProseSlotDef>>` so an unlisted id fails `tsc`. Both directions, no drift.
//
// Default-identity discipline (the imagery posture): an ABSENT override MUST produce bytes identical to the
// pre-PROSE-1 constant. That is what makes every migration stage a no-op until a host actually types
// something, and it is asserted per-slot in `tests/contracts/prose/`.

import { AUTOMATION_PROSE_SLOTS } from "#automation";
import { CHAT_PROSE_SLOTS } from "#chat";
import { DISCOVERY_PROSE_SLOTS } from "#discovery";
import { IMAGERY_PROSE_SLOTS } from "#imagery";
import { PRESET_PROSE_SLOTS } from "#preset";
import type { ProseOverrides, ProseResolution, ProseSlotDef, ProseSlotId } from "#prose-slot";
import { proseOverrideFromLegacy } from "#prose-slot";

export * from "#prose-slot";

/** The composed registry — every slot, one row each. Annotated (not inferred) so an id without a row is a
 *  `tsc` error at THIS line. */
export const PROSE_SLOTS: Record<ProseSlotId, ProseSlotDef> = {
  ...PRESET_PROSE_SLOTS,
  ...IMAGERY_PROSE_SLOTS,
  ...CHAT_PROSE_SLOTS,
  ...AUTOMATION_PROSE_SLOTS,
  ...DISCOVERY_PROSE_SLOTS,
};

/** Host edit BEATS shipped default, two rungs, no cascade (PROSE-1 §4.3). The ONE place the precedence rule
 *  lives — every home's resolver funnels here so precedence and staleness can never drift apart. */
export function resolveProse(id: ProseSlotId, overrides: ProseOverrides): ProseResolution {
  const slot = PROSE_SLOTS[id];
  const override = overrides[id];
  if (override === undefined) {
    return { text: slot.text, source: "default", stale: false };
  }
  return { text: override.text, source: "override", stale: override.baseVersion < slot.version };
}

// The pre-substitution token regexes, memoized by token NAME (the assembler resolves a frame per roster
// member per turn, so a per-call `new RegExp` would recompile the same handful forever). Names are code
// constants from the slot table — never host or user input — so there is nothing to escape. The `useTopLevel
// Regex` lint's sanctioned shape: build once, cache, reuse (the `volatileMacroRe` precedent in assembly).
const tokenReByName = new Map<string, RegExp>();
function tokenRe(name: string): RegExp {
  const cached = tokenReByName.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const re = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, "gi");
  tokenReByName.set(name, re);
  return re;
}

/**
 * The bytes only — the hot-path caller shape (an assembler wants a string, not a verdict).
 *
 * `tokens` are the slot's caller-supplied PRE-SUBSTITUTION values: a `{{name}}`/`{{note}}` in the resolved
 * text (default OR host override) is replaced with the caller's string, as a plain replace — NOT the macro
 * engine (the `resolveGuidedInstruction` `{{person}}`/`{{base}}` precedent). Two reasons it must stay a
 * replace: these frames wrap text that is ALREADY macro-resolved (re-running the engine would resolve it
 * twice), and the value is per-render data the engine has no binding for. Absent ⇒ the text ships verbatim,
 * so every token-free slot and every existing caller is byte-identical.
 *
 * The replacement is a FUNCTION, so a `$&`/`$1` inside a member name or an injection body is a literal.
 */
export function resolveProseText(id: ProseSlotId, overrides: ProseOverrides, tokens?: Readonly<Record<string, string>>): string {
  const text = resolveProse(id, overrides).text;
  if (tokens === undefined) {
    return text;
  }
  let out = text;
  for (const [name, value] of Object.entries(tokens)) {
    out = out.replace(tokenRe(name), () => value);
  }
  return out;
}

/** Build a one-key override record from a legacy bare-string field, for the adapted slots (§4.6). */
export function legacyProseOverrides(id: ProseSlotId, text: string | undefined): ProseOverrides {
  const override = proseOverrideFromLegacy(text);
  return override === undefined ? {} : { [id]: override };
}
