// The personas an uploaded profile tree would import, read from its `settings.json` and `User Avatars/`
// parts without staging anything. Mirrors the collector's pairing (`<profile>/User Avatars/<avatarFile>`) so
// the review hashes the same bytes the real run stores.

import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import type { PersonaMetadata } from "@orb/contracts/persona";
import { sha256Hex } from "#kit/content-hash";
import { decodePortableObject } from "#kit/serde/lib";
import type { IncomingPersona, UploadedFile } from "../contract/views.ts";
import { parseStPersonas } from "./persona.ts";

const AVATARS_DIR = "User Avatars";

/** Every persona of every `settings.json` among `files`, art-hashed from its sibling `User Avatars/`. A
 *  settings file that does not parse yields none: the real run reports it, the review has nothing to ask. */
export function incomingPersonasOf(files: readonly UploadedFile[]): IncomingPersona[] {
  const byPath = new Map(files.map((f) => [f.relPath, f.bytes]));
  const out: IncomingPersona[] = [];
  for (const [path, bytes] of byPath) {
    if (path !== ST_SETTINGS_FILE && !path.endsWith(`/${ST_SETTINGS_FILE}`)) {
      continue;
    }
    const settings = decodePortableObject(bytes);
    if (!settings.ok) {
      continue;
    }
    const profilePrefix = path.slice(0, path.length - ST_SETTINGS_FILE.length);
    for (const parsed of parseStPersonas(settings.value).personas) {
      const avatar = byPath.get(`${profilePrefix}${AVATARS_DIR}/${parsed.avatarFile}`);
      out.push({
        name: parsed.name,
        description: parsed.description,
        metadata: parsed.metadata as PersonaMetadata | null,
        artHash: avatar === undefined ? null : sha256Hex(avatar),
      });
    }
  }
  return out;
}
