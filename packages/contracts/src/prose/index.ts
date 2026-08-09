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
//                                       per-PRESET group-round / injection FRAMING prose (the framings home on
//                                       the preset — the 2026-08-07 injection frames + the F4 group re-home)
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
import { hasProseToken, isProseSlotId, PROSE_SLOT_IDS, proseOverBy, proseOverrideFromLegacy, resolveProseFrom, spliceProseTokens } from "#prose-slot";
import { REFINERY_PROSE_SLOTS } from "#refinery";
import { RPG_PROSE_SLOTS } from "#rpg";

export type { ProseHome, ProseMacroMode, ProseOverride, ProseOverrides, ProseResolution, ProseSlotDef, ProseSlotId } from "#prose-slot";
export {
  isProseSlotId,
  LEGACY_PROSE_BASE_VERSION,
  PROSE_COUNTER_AT,
  PROSE_HOMES,
  PROSE_MACRO_MODES,
  PROSE_MAX_CHARS,
  PROSE_SLOT_IDS,
  proseOverBy,
  proseOverrideFromLegacy,
  proseOverrideSchema,
  proseOverridesSchema,
  proseSlotIdSchema,
  resolveProseFrom,
  spliceProseTokens,
} from "#prose-slot";

/** The composed registry — every slot, one row each. Annotated (not inferred) so an id without a row is a
 *  `tsc` error at THIS line. */
export const PROSE_SLOTS: Record<ProseSlotId, ProseSlotDef> = {
  ...PRESET_PROSE_SLOTS,
  ...IMAGERY_PROSE_SLOTS,
  ...CHAT_PROSE_SLOTS,
  ...AUTOMATION_PROSE_SLOTS,
  ...DISCOVERY_PROSE_SLOTS,
  ...REFINERY_PROSE_SLOTS,
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

/** Host edit BEATS shipped default, two rungs, no cascade (PROSE-1 §4.3) — the REGISTRY-KEYED door onto the
 *  primitive in `#prose-slot`. The precedence rule itself moved down there when the rpg extraction templates
 *  landed: a domain TABLE resolving its own slots cannot import this module without closing the
 *  `#prose → #<domain> → #prose` cycle. This adds the id lookup and NOTHING else, so there is still exactly
 *  one place "which text wins" (and the blank-override heal, and staleness) is decided. */
export function resolveProse(id: ProseSlotId, overrides: ProseOverrides): ProseResolution {
  return resolveProseFrom(PROSE_SLOTS[id], overrides[id]);
}

/**
 * The bytes only — the hot-path caller shape (an assembler wants a string, not a verdict).
 *
 * `tokens` are the slot's caller-supplied PRE-SUBSTITUTION values, spliced by {@link spliceProseTokens} (a
 * plain replace, never the macro engine — see its header). Absent ⇒ the text ships verbatim, so every
 * token-free slot and every existing caller is byte-identical.
 */
export function resolveProseText(id: ProseSlotId, overrides: ProseOverrides, tokens?: Readonly<Record<string, string>>): string {
  return spliceProseTokens(resolveProse(id, overrides).text, tokens);
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
  /**
   * Characters OVER {@link PROSE_MAX_CHARS}; `0` when the text fits. **The one BLOCKING signal in this
   * shape** — deliberately unlike `missing`/`stale`, whose warn-never-block posture is a ruled §6.3
   * decision about advice. This is not advice: `proseOverridesSchema`'s per-key `.catch(undefined)` heals
   * an over-cap override to ABSENT, so a save at `over > 0` does not fail loudly, it silently deletes the
   * host's text and lets the shipped default ride. The editors cap typing at the limit, so `over > 0` is
   * reachable only from text that predates the cap (an import, a direct API write, a blob from before this
   * fix) — which is exactly why it must be SHOWN rather than truncated away, and why the save is refused
   * until the author trims it themselves.
   */
  readonly over: number;
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
    // carries them all by construction. `{{name}}`-shaped entries are recognised by `hasProseToken` (the
    // SAME whitespace-tolerant, case-insensitive splice `spliceProseTokens` fills) — a raw `.includes` here
    // would report `{{ note }}`/`{{Note}}` as missing when the splice fills them fine (the borrowed-recognizer
    // bug, see `hasProseToken`'s header). Bare literal tokens (no braces) stay a plain substring check.
    missing: isDefault ? [] : [...slot.requiredMacros, ...slot.requiredTokens].filter((token) => !tokenPresent(trimmed, token)),
    // NOT gated on `isDefault`: an empty field is under the cap by construction, so the guard would be
    // decoration — and `proseOverBy` already measures the trimmed bytes that actually get stored.
    over: proseOverBy(value),
  };
}

const BRACED_TOKEN = /^\{\{(.+)\}\}$/;

/** Is `token` present in `text`? `{{name}}`-shaped tokens defer to `hasProseToken` (the splice's own
 *  recognizer); everything else is a plain substring check (JSON/XML-shaped `requiredTokens` carry no
 *  macro semantics to tolerate whitespace in). */
function tokenPresent(text: string, token: string): boolean {
  const braced = BRACED_TOKEN.exec(token);
  const name = braced?.[1];
  return name !== undefined ? hasProseToken(text, name) : text.includes(token);
}

/** Build a one-key override record from a legacy bare-string field, for the adapted slots (§4.6). */
export function legacyProseOverrides(id: ProseSlotId, text: string | undefined): ProseOverrides {
  const override = proseOverrideFromLegacy(text);
  return override === undefined ? {} : { [id]: override };
}
