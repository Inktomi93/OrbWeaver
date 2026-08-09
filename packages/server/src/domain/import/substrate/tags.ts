// domain/import/substrate/tags — the ST library-tag parser. Pure: a profile's settings.json object in →
// a per-entity-key → tag-NAMES map out, never throws. ST stores library tags on `settings.tags`
// (`[{ id, name, color }]`) and their assignments on `settings.tag_map` (`{ <entityKey>: [tagId] }`); for a
// character the entityKey is the card/avatar filename (ST's `tag_map[character.avatar]`). Ids are resolved to
// NAMES here so the importer attaches by name (`attachCardTagByName` resolve-or-create) and never carries
// ST's per-profile tag ids across the box.

import { isPlainObject } from "@orb/kit/guards";
import type { ParsedStTags } from "../contract/views.ts";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Build the `tagId → name` lookup from the `tags` array; a tag missing an id or a non-blank name is skipped. */
function tagNamesById(raw: unknown): Map<string, string> {
  const byId = new Map<string, string>();
  if (!Array.isArray(raw)) {
    return byId;
  }
  for (const entry of raw) {
    if (!isPlainObject(entry)) {
      continue;
    }
    const id = str(entry["id"]).trim();
    const name = str(entry["name"]).trim();
    if (id.length === 0 || name.length === 0) {
      continue;
    }
    byId.set(id, name);
  }
  return byId;
}

/** Parse the ST `tags` + `tag_map` sections into a per-entity resolved-name map. Tolerant of a full settings
 *  object or a bare slice; a missing/corrupt section yields an empty map (the caller reports nothing). */
export function parseStTags(settingsRaw: unknown): ParsedStTags {
  const root = isPlainObject(settingsRaw) ? settingsRaw : null;
  const byEntityKey = new Map<string, readonly string[]>();
  if (root === null) {
    return { byEntityKey };
  }
  const namesById = tagNamesById(root["tags"]);
  const tagMap = root["tag_map"];
  if (namesById.size === 0 || !isPlainObject(tagMap)) {
    return { byEntityKey };
  }
  for (const [entityKey, rawIds] of Object.entries(tagMap)) {
    if (!Array.isArray(rawIds)) {
      continue;
    }
    // Preserve tag order, drop unknown/blank ids, and de-dupe (ST can list a tag twice).
    const names: string[] = [];
    for (const rawId of rawIds) {
      const name = namesById.get(str(rawId).trim());
      if (name !== undefined && !names.includes(name)) {
        names.push(name);
      }
    }
    if (names.length > 0) {
      byEntityKey.set(entityKey, names);
    }
  }
  return { byEntityKey };
}
