// domain/import/substrate/persona — the ST persona parser. Pure: a profile's settings.json object in →
// ParsedPersonas out, never throws. ST stores personas on power_user (personas/persona_descriptions/
// default_persona, keyed by avatar filename); this maps their description placement onto our persona
// metadata blob so the description lands in the same spot on re-send.

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
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

// ST persona_description_positions: IN_PROMPT 0 · AFTER_CHAR 1 (alias) · TOP_AN 2 · BOTTOM_AN 3 ·
// AT_DEPTH 4 · NONE 9. orbweaver keeps three (none/in_prompt/at_depth); TOP_AN/BOTTOM_AN collapse to
// at_depth defaults, AT_DEPTH carries its own depth/role.
const ST_IN_PROMPT = 0;
const ST_AFTER_CHAR = 1;
const ST_TOP_AN = 2;
const ST_BOTTOM_AN = 3;
const ST_AT_DEPTH = 4;
const ST_NONE = 9;

/** null = unknown/absent → caller treats as the in_prompt default. */
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

/** Returns null when there's no placement to record (absent descriptor or plain in_prompt default). */
function metadataFromDescriptor(descriptor: Record<string, unknown> | null): Record<string, unknown> | null {
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
  // Only ST's real AT_DEPTH carries depth/role; TOP_AN/BOTTOM_AN take the at-depth defaults.
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

/** Tolerant of both a full ST settings object (personas under power_user) and a bare power_user slice. */
export function parseStPersonas(settingsRaw: unknown): ParsedPersonas {
  const root = asObj(settingsRaw);
  if (root === null) {
    return { personas: [], defaultAvatarFile: null };
  }
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
