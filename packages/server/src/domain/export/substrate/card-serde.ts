// domain/export/substrate/card-serde — the LOCAL STOPGAP card OUT-emitter (`buildCardV3`) + WI-entry
// OUT-mapper (`exportBookEntry`). Pure / server-only / zero I/O (substrate-eligible).
//
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// FLAG[PD-44] — THIS IS NOT THE PERMANENT HOME.
//   export.md's central design: export is the OUT half of ONE serde core that import SHARES. The canonical
//   homes are `@orb/server/kit/serde/card` (`buildCardV3` OUT + `cardFromJson` IN, co-located so the
//   round-trip is a one-file invariant) and `@orb/server/kit/serde/world-entry` (`exportBookEntry` OUT +
//   `loreEntryColumns`/`loreEntryMetadata` IN). Those modules are still an empty `.gitkeep` — the sibling
//   `domain/import` agent owns standing up `@orb/server/kit/serde` (we must NOT touch it). So this slice
//   rolls a thin local emitter to ship `exportCharacter`.
//   WHEN `@orb/server/kit/serde` lands: DELETE this file, import `buildCardV3` / `exportBookEntry` from the
//   shared core, move `ExportCardFields` / `ExportWorldEntry` (contract/params.ts) to the serde module, and
//   pin the `buildCardV3` → `cardFromJson` round-trip test there. A second card emitter must not survive.
// ════════════════════════════════════════════════════════════════════════════════════════════════════

import type { CharacterCardV3 } from "@orb/contracts/character";
import { CHARA_CARD_V3_SPEC, characterCardV3Schema } from "@orb/contracts/character";
import { isPlainObject } from "@orb/kit/guards";
import { messageRoleToSt } from "@orb/kit/message-role";
import { resolveEntryInjection, resolveEntryScope } from "@orb/kit/world-info";
import type { ExportCardFields, ExportWorldEntry } from "../contract/params";

// FLAG[bimap-home]: export.md names `@orb/kit/world-info` `injectionRoleToSt` for the at-depth role
// re-encode. The built bimap actually lives in `@orb/kit/message-role` (`messageRoleToSt`) — the role axis
// is the canonical `MessageRole` (D32), so the ST numeric bimap homed there with the rest of the axis.
// Following the built reality (the spine), flagged.

// ST's at-depth directive lives under `extensions.position = 4` with a sibling `depth`/`role` (the
// world-info-at-depth encoding). 4 is ST's WORLD_INFO_POSITION.atDepth.
const ST_POSITION_AT_DEPTH = 4;

// The ST card spec_version this emitter writes. V3 spec, version "3.0".
const SPEC_VERSION = "3.0";

/**
 * Map one live world-info entry → an ST V3 `character_book` entry (the OUT half). Preserves the entry's
 * metadata blob as the base (so unknown ST fields ride through a round-trip), then overrides the keys the
 * typed columns own. A depth-injecting entry is re-encoded into ST's `{position:4, depth, role}` (role
 * through the bimap); `constant` derives from the resolved scope (`always` ⇒ `true`, the keyless-always-on
 * heuristic vanilla ST needs to fire a keyless entry). This is the ONE place the at-depth encoding is
 * written (export.md Esoteric — preserve it).
 */
export function exportBookEntry(entry: ExportWorldEntry): Record<string, unknown> {
  const meta = isPlainObject(entry.metadata) ? entry.metadata : {};
  const scope = resolveEntryScope(meta, entry.keys.length > 0);
  const inject = resolveEntryInjection(meta);
  const baseExtensions = isPlainObject(meta["extensions"]) ? meta["extensions"] : {};
  // biome-ignore-start lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)
  const extensions = inject
    ? {
        ...baseExtensions,
        position: ST_POSITION_AT_DEPTH,
        depth: inject.depth,
        role: messageRoleToSt(inject.role),
      }
    : baseExtensions;
  return {
    ...meta,
    keys: entry.keys,
    content: entry.content,
    enabled: entry.enabled,
    insertion_order: entry.priority,
    comment: entry.title,
    constant: scope === "always",
    ...(entry.ignoreBudget ? { ignoreBudget: true } : {}),
    extensions,
  };
  // biome-ignore-end lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)
}

/**
 * Build the strict ST V3 character card (the OUT emitter). The typed columns OWN their `extensions` keys:
 * any stale `depth_prompt`/`regex_scripts` in the preserved blob is stripped first, then the columns'
 * values are written (a null `depthPrompt` therefore DROPS the key — the §7.3 lossiness fix). The result
 * is `characterCardV3Schema.parse`d so a malformed projection fails loud at the boundary, not silently on
 * the wire.
 */
export function buildCardV3(
  fields: ExportCardFields,
  entries: ExportWorldEntry[],
): CharacterCardV3 {
  // biome-ignore-start lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)
  const {
    depth_prompt: _staleDepthPrompt,
    regex_scripts: _staleRegexScripts,
    ...baseExtensions
  } = fields.extensions ?? {};
  const extensions: Record<string, unknown> = {
    ...baseExtensions,
    regex_scripts: fields.regexScripts,
    ...(fields.depthPrompt ? { depth_prompt: fields.depthPrompt } : {}),
  };
  const data: Record<string, unknown> = {
    name: fields.name,
    description: fields.description ?? "",
    personality: fields.personality ?? "",
    scenario: fields.scenario ?? "",
    first_mes: fields.greetings[0] ?? "",
    mes_example: fields.exampleMessages ?? "",
    system_prompt: fields.systemPrompt ?? "",
    post_history_instructions: fields.postHistoryInstructions ?? "",
    creator: fields.creator ?? "",
    creator_notes: fields.creatorNotes ?? "",
    character_version: fields.cardVersion ?? "",
    alternate_greetings: fields.greetings.slice(1),
    tags: fields.tags,
    extensions,
    ...(entries.length > 0 ? { character_book: { entries: entries.map(exportBookEntry) } } : {}),
  };
  return characterCardV3Schema.parse({
    spec: CHARA_CARD_V3_SPEC,
    spec_version: SPEC_VERSION,
    data,
  });
  // biome-ignore-end lint/style/useNamingConvention: ST Character-Card-V3 wire field names (snake_case)
}
