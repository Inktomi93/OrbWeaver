// domain/import/substrate/group — the ST GROUP-DEFINITION parser: one `groups/<id>.json` in → the roster +
// transcript-file list out (or null when the object is not a group), never throws.
//
// ST's group file names its members by CARD FILENAME (`members: ["Bengal.png", "Lisa.png"]`) — the same key
// `settings.tag_map` uses and the same key the collector already carries on every `CollectedCard.filename`.
// That is deliberate here and load-bearing: member resolution goes filename → the collect-time characterId,
// NEVER display name. Two cards named "Emily" disambiguate to handles `emily`/`emily-2` while keeping distinct
// filenames, so a name-keyed roster would seat the wrong card in silence.
//
// The group's `chats: [...]` array names its transcripts by LEAF (no `.jsonl`), all of which live in the flat
// profile-level `group chats/` directory (ST does not sub-directory them per group the way solo chats are).
// A leaf that names a file two groups both claim is not our problem to arbitrate — the collector reads each
// group's own list, and the chat write op dedups by `importHash`, so the second claimant is a clean skip.

import { isPlainObject } from "@orb/kit/guards";
import type { ParsedStGroup } from "../contract/views.ts";

/** ST's own group-config numerals we can read. `generation_mode` 0 = swap (one speaker per turn), 1 = append
 *  (the whole cast is joined into ONE generation) — which is exactly orb's `per-speaker` vs `narrator` output
 *  axis, so the room lands configured the way its author left it instead of at the house default. */
const ST_GENERATION_MODE_APPEND = 1;

/** The non-blank strings of an unknown value that should be a string array; anything else yields []. */
function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.filter((e): e is string => typeof e === "string" && e.trim().length > 0);
}

/**
 * Parse an ST `groups/<id>.json` upload into the canonical group shape, or null when the bytes are not a group
 * definition (unparseable JSON, not an object, or no members at all — a memberless group has no room to make).
 * `fileStem` is the fallback name. Never throws: a malformed file is one skipped group, not an aborted import.
 */
export function parseStGroupFile(bytes: Uint8Array, fileStem: string): ParsedStGroup | null {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8").decode(bytes));
  } catch {
    return null;
  }
  if (!isPlainObject(raw)) {
    return null;
  }
  const memberFiles = stringList(raw["members"]);
  if (memberFiles.length === 0) {
    return null;
  }
  const rawName = raw["name"];
  const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName.trim() : fileStem;
  return {
    name,
    memberFiles,
    disabledMemberFiles: stringList(raw["disabled_members"]),
    chatLeaves: stringList(raw["chats"]),
    narratorOutput: raw["generation_mode"] === ST_GENERATION_MODE_APPEND,
    allowSelfResponses: raw["allow_self_responses"] === true,
  };
}
