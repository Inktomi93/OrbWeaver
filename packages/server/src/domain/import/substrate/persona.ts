// domain/import/substrate/persona — the ST persona parser (PD-77). PURE: a profile's `settings.json` object
// in → `ParsedPersonas` out (never throws — an empty list when there's no persona data), same zero-I/O,
// tolerant contract as `substrate/card.ts`/`substrate/chat.ts`. No DB, no fs.
//
// ST stores personas on `power_user`:
//   • `personas`             — { [avatarFile]: displayName }   (the avatar PNG filename is the KEY)
//   • `persona_descriptions` — { [avatarFile]: { description, position, depth, role, … } }
//   • `default_persona`      — the avatarFile of the active default (or absent)
// Without this, imported chats carry a `user_name` with no persona behind it — `{{user}}` falls back to the
// literal "User". This revives them, mapping ST's per-persona description PLACEMENT
// (`persona_description_position`) onto the persona `metadata` blob (`@orb/kit/persona`'s
// `PERSONA_DESCRIPTION_POSITIONS` + the shared `{depth, role}` inject directive, D32) so the description
// lands in the same spot on re-send. The role axis is `MessageRole` (`@orb/kit/message-role` — the ONE
// numeric bimap); the position normalization is import-local (a distinct axis, not the message-role union).

import { messageRoleFromSt } from "@orb/kit/message-role";
import type { PersonaDescriptionPosition } from "@orb/kit/persona";
import type { ParsedPersona, ParsedPersonas } from "../contract/views";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function nullIfEmpty(s: string): string | null {
  return s.trim().length > 0 ? s : null;
}
function asObj(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

// ST `persona_description_positions` (public/scripts/personas.js):
//   IN_PROMPT 0 · AFTER_CHAR 1 (deprecated alias of IN_PROMPT) · TOP_AN 2 · BOTTOM_AN 3 ·
//   AT_DEPTH 4 · NONE 9.
// orbweaver keeps three (none / in_prompt / at_depth) — TOP_AN/BOTTOM_AN are "inject at a position", which
// orbweaver expresses uniformly through depth-injection (persona kit header), so both collapse to at_depth
// at the default depth/role. AT_DEPTH carries the descriptor's own depth/role.
const ST_IN_PROMPT = 0;
const ST_AFTER_CHAR = 1;
const ST_TOP_AN = 2;
const ST_BOTTOM_AN = 3;
const ST_AT_DEPTH = 4;
const ST_NONE = 9;

/** ST numeric `persona_description_position` → the three-value placement (null = unknown/absent → the
 *  caller treats it as the `in_prompt` default). TOP_AN/BOTTOM_AN/AT_DEPTH all collapse to at_depth. */
function stPositionToPlacement(rawPos: number): PersonaDescriptionPosition | null {
  if (rawPos === ST_NONE) {
    return "none";
  }
  if (rawPos === ST_TOP_AN || rawPos === ST_BOTTOM_AN || rawPos === ST_AT_DEPTH) {
    return "at_depth";
  }
  if (rawPos === ST_IN_PROMPT || rawPos === ST_AFTER_CHAR) {
    return "in_prompt";
  }
  return null;
}

/** Translate one ST persona descriptor (`persona_descriptions[avatar]`) → the persona `metadata` blob.
 *  Returns null when there's no placement to record (absent descriptor or plain in_prompt — the default),
 *  so a vanilla persona stores a null blob rather than a noisy `{descriptionPosition:"in_prompt"}`. */
function metadataFromDescriptor(
  descriptor: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (descriptor === null) {
    return null;
  }
  const rawPos = Number(descriptor["position"]);
  const position = stPositionToPlacement(rawPos);
  if (position === null || position === "in_prompt") {
    return null;
  }
  if (position === "none") {
    return { descriptionPosition: "none" };
  }
  // at_depth — carry the descriptor's depth/role only for ST's real AT_DEPTH; TOP_AN/BOTTOM_AN have no
  // meaningful depth, so they take the persona at-depth defaults (`resolvePersonaDescriptionPlacement`).
  const meta: Record<string, unknown> = { descriptionPosition: "at_depth" };
  if (rawPos === ST_AT_DEPTH) {
    const depth = Number(descriptor["depth"]);
    const role = messageRoleFromSt(descriptor["role"]);
    if (Number.isInteger(depth) && depth >= 0) {
      meta["inject"] = { depth, ...(role !== null ? { role } : {}) };
    }
  }
  return meta;
}

/** Parse a profile's `settings.json` into the personas the user RP'd as. Tolerant of both the full ST
 *  settings object (personas under `power_user`) and a bare `power_user` slice (personas at the root).
 *  Returns an empty list — never throws — when the file has no persona data. */
export function parseStPersonas(settingsRaw: unknown): ParsedPersonas {
  const root = asObj(settingsRaw);
  if (root === null) {
    return { personas: [], defaultAvatarFile: null };
  }
  // personas live under `power_user` in a full export; some tools hand us the slice directly.
  const pu = asObj(root["power_user"]) ?? root;
  const personasMap = asObj(pu["personas"]);
  if (personasMap === null) {
    return { personas: [], defaultAvatarFile: null };
  }
  const descriptions = asObj(pu["persona_descriptions"]) ?? {};
  const defaultAvatarFile = nullIfEmpty(str(pu["default_persona"]));

  const personas: ParsedPersona[] = [];
  for (const [avatarFile, rawName] of Object.entries(personasMap)) {
    const name = nullIfEmpty(str(rawName));
    if (name === null) {
      continue; // a personas entry with no name is unusable as an authoring identity
    }
    const descriptor = asObj(descriptions[avatarFile]);
    personas.push({
      name,
      description: str(descriptor?.["description"]),
      avatarFile,
      isDefault: defaultAvatarFile !== null && avatarFile === defaultAvatarFile,
      metadata: metadataFromDescriptor(descriptor),
    });
  }
  return { personas, defaultAvatarFile };
}
