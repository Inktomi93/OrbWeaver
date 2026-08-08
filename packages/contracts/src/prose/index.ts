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
import { IMAGERY_CAPTION_SLOT_IDS, IMAGERY_PROSE_SLOTS, IMAGERY_TEMPLATE_SLOT_IDS } from "#imagery";
import { PRESET_PROSE_SLOTS } from "#preset";
import type { ProseHome, ProseOverride, ProseOverrides, ProseResolution, ProseSlotDef, ProseSlotId } from "#prose-slot";
import { isProseSlotId, PROSE_SLOT_IDS, proseOverrideFromLegacy } from "#prose-slot";
import { RPG_PROSE_SLOTS } from "#rpg";

export * from "#prose-slot";

/** The composed registry — every slot, one row each. Annotated (not inferred) so an id without a row is a
 *  `tsc` error at THIS line. */
export const PROSE_SLOTS: Record<ProseSlotId, ProseSlotDef> = {
  ...PRESET_PROSE_SLOTS,
  ...IMAGERY_PROSE_SLOTS,
  ...CHAT_PROSE_SLOTS,
  ...AUTOMATION_PROSE_SLOTS,
  ...DISCOVERY_PROSE_SLOTS,
  ...RPG_PROSE_SLOTS,
};

/** The legacy-adapted user slots (§4.6): their override is the pre-PROSE-1 `UserSettings.imagery.*` string
 *  field, NOT a `UserSettings.prose` row, and their editor is the Image-prompts section. Adapted, never
 *  duplicated — so the prose editor must not offer them a second door into a storage they don't use. */
const LEGACY_ADAPTED_USER_SLOT_IDS: ReadonlySet<ProseSlotId> = new Set<ProseSlotId>([
  ...Object.values(IMAGERY_TEMPLATE_SLOT_IDS),
  ...Object.values(IMAGERY_CAPTION_SLOT_IDS),
]);

/** The slots a host edits in the Prose settings section — every `home:"user"` slot whose override is stored
 *  in `UserSettings.prose`. DERIVED from the registry, never hand-listed: a new user-home slot table row
 *  reaches the editor the same commit it lands, so the "authored but unreachable" class (the row-27 disease
 *  this program exists to kill) cannot re-form on the client side either. */
export const USER_PROSE_SLOT_IDS: readonly ProseSlotId[] = PROSE_SLOT_IDS.filter(
  (id) => PROSE_SLOTS[id].home === "user" && !LEGACY_ADAPTED_USER_SLOT_IDS.has(id),
);

/** The preset-home slots whose override is the pre-PROSE-1 `promptConfig.guidedActions.*.prompt` /
 *  `formatStrings.*` field (§4.6 again — adapted, never re-homed). They are edited in the preset Templates
 *  tab through those fields, so the `promptConfig.prose` blob must not offer them a second door. */
const LEGACY_ADAPTED_PRESET_SLOT_IDS: ReadonlySet<ProseSlotId> = new Set<ProseSlotId>(Object.keys(PRESET_PROSE_SLOTS) as ProseSlotId[]);

/** The slots a host edits as `promptConfig.prose` — every `home:"preset"` slot that is NOT one of the
 *  legacy-adapted preset fields. DERIVED for the same reason `USER_PROSE_SLOT_IDS` is: a new preset-home slot
 *  reaches its editor the commit it lands. `templateGroups` (client) walks this to build the framing rows. */
export const PRESET_PROSE_SLOT_IDS: readonly ProseSlotId[] = PROSE_SLOT_IDS.filter(
  (id) => PROSE_SLOTS[id].home === "preset" && !LEGACY_ADAPTED_PRESET_SLOT_IDS.has(id),
);

const PRESET_PROSE_SLOT_ID_SET: ReadonlySet<ProseSlotId> = new Set(PRESET_PROSE_SLOT_IDS);
export function isPresetProseSlotId(id: string): id is ProseSlotId {
  return PRESET_PROSE_SLOT_ID_SET.has(id as ProseSlotId);
}

/** Merge the per-home override blobs into the ONE home-agnostic bag `resolveProse` reads.
 *
 *  Each source is FILTERED TO THE SLOTS THAT ACTUALLY HOME THERE, which is what makes this a merge and not a
 *  cascade (§3.1): a key can only survive from its own storage, so two homes carrying the same id cannot
 *  produce a precedence question — the wrong one is dropped, never "loses". That also means a stale key left
 *  in a blob by a RE-HOME (the two injection frames moved user → preset on 2026-08-07) is inert rather than
 *  quietly authoritative from the storage it no longer belongs to.
 *
 *  Absent/`{}` sources contribute nothing, so a caller that threads none of them gets the shipped defaults
 *  byte-for-byte — the default-identity discipline, unchanged. */
export function composeProse(sources: Readonly<Partial<Record<ProseHome, ProseOverrides | undefined>>>): ProseOverrides {
  const out: Record<string, ProseOverride | undefined> = {};
  for (const [home, overrides] of Object.entries(sources)) {
    if (overrides === undefined) {
      continue;
    }
    for (const [id, override] of Object.entries(overrides)) {
      if (override !== undefined && isProseSlotId(id) && PROSE_SLOTS[id].home === home) {
        out[id] = override;
      }
    }
  }
  return out;
}

/** Host edit BEATS shipped default, two rungs, no cascade (PROSE-1 §4.3). The ONE place the precedence rule
 *  lives — every home's resolver funnels here so precedence and staleness can never drift apart. */
export function resolveProse(id: ProseSlotId, overrides: ProseOverrides): ProseResolution {
  const slot = PROSE_SLOTS[id];
  const override = overrides[id];
  // A BLANK override is treated as ABSENT — the same self-healing posture as `proseOverridesSchema`'s per-key
  // `.catch(undefined)`, applied to the one malformed shape a *valid* record can still carry. `{text:""}`
  // parses fine, so nothing upstream refuses it, and it can arrive from an imported preset file, a direct
  // API write, or a blob predating a normalizer; resolving it literally means EMPTY BYTES reach the wire —
  // a note frame that deletes the injection it was supposed to wrap, and a continuation cue that appends an
  // empty user row. Healed at the READ rather than refused at the WRITE for the reason `promptConfigWrite
  // Schema`'s own header gives: a read-side refusal would fail a whole preset to load over one empty string,
  // and "blank means the shipped default rides" is already this schema's storage semantic everywhere else
  // (`formatStrings`, `guidedActions`, the settings editor's clear-to-reset). The editors additionally DROP
  // the key on save (`normalizePresetProse` / `proseSlotPatch`), so this is the belt, not the only guard.
  if (override === undefined || override.text.trim() === "") {
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

/** One prose field's derived footer state — Default/Customized plus the two WARN-NEVER-BLOCK signals every
 *  prose editor owes its author (§4.4 staleness, §6.3 the required-macro/token lint).
 *
 *  It lives in `contracts` because TWO client features render it — the Prose settings section (chat) and the
 *  preset Templates drill-in (preset) — and a client feature may not import another (the five-tier law, D70).
 *  It is a pure derivation over a slot def plus two strings, so `contracts` is the home the cake gives it;
 *  the alternative was a second copy, which is how the two editors would drift into warning differently about
 *  the same slot. */
export interface ProseFooterState {
  readonly isDefault: boolean;
  /** The shipped default moved on since this override was authored (§4.4). */
  readonly stale: boolean;
  /** Declared `requiredMacros`/`requiredTokens` this text has dropped. A WARN — never a save block. */
  readonly missing: readonly string[];
}

/** `value` is the LIVE field text; `stored` is the persisted override (for the version the edit was authored
 *  against). A field the host has emptied reads as Default whatever is still stored — the next save clears it,
 *  and the placeholder already shows what will take over. */
export function proseFooterState(id: ProseSlotId, value: string, stored: ProseOverride | undefined): ProseFooterState {
  const slot = PROSE_SLOTS[id];
  const trimmed = value.trim();
  const isDefault = trimmed.length === 0;
  return {
    isDefault,
    stale: !isDefault && stored !== undefined && stored.text === trimmed && stored.baseVersion < slot.version,
    // A required macro/token is only meaningful against text the host actually wrote — the shipped default
    // carries them all by construction.
    missing: isDefault ? [] : [...slot.requiredMacros, ...slot.requiredTokens].filter((token) => !trimmed.includes(token)),
  };
}

/** Build a one-key override record from a legacy bare-string field, for the adapted slots (§4.6). */
export function legacyProseOverrides(id: ProseSlotId, text: string | undefined): ProseOverrides {
  const override = proseOverrideFromLegacy(text);
  return override === undefined ? {} : { [id]: override };
}
