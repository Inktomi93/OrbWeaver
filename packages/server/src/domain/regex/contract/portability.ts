// domain/regex/contract/portability — the four PORTABILITY ops of the script library, in ONE contract file
// because they share one DI bundle and one dedup rule:
//
//   • `ImportCardScripts` — the card LIFT (the `importLorebook` twin): a card's by-value ST scripts become
//     library rows + `character_regex_scripts` attachments. Carried orbweaver REFERENCES win over cloning
//     (a same-install re-import re-links); a foreign card content-dedups against the owner's existing rows.

//   • `ExportCardScripts` — the card RE-EMBED: walk the character's junction back out to the ST card-wire
//     shape so `extensions.regex_scripts` is byte-shape-identical to what ST reads.
//   • `ExportRegexScripts` / `ImportRegexScript` — the backup-bundle descriptor's two halves (the `regex/`
//     dir, one `*.json` per script). The GLOBAL attachment rides in the file (it is a property of the
//     script); character/preset/chat attachments do NOT (they point at rows the bundle can't guarantee).
//   • `ExportRegexScript` — the SINGLE-ENTITY export door (REGX2), a thin arm sharing the bundle half's own
//     file projection. Its import twin is `ImportRegexScript` ITSELF, unwrapped: the bundle descriptor
//     already parses exactly one `regex/*.json`, so the door reuses that verb rather than minting a second
//     parse path (D121-D: "a single-entity door is a THIN ARM over the family's bundle verbs").
//
// THE DEDUP RULE (one home, both import paths): a candidate matches an existing owned row when its
// BEHAVIOR BODY is content-equal (canonical JSON of the behavior blob) AND its name matches. Re-importing
// a card pack is the norm, and always-new would breed hundreds of identical rows.

import type { PortableFile } from "@orb/contracts/portability";
import type {
  ExportedCardScripts,
  ImportCardScriptsArgs,
  ImportCardScriptsResult,
  ImportGlobalScriptsArgs,
  ImportPresetScriptsArgs,
} from "@orb/contracts/regex";
import type { Db } from "@orb/db";
import type { CharacterId, RegexScriptId, UserId } from "@orb/kit/ids";
import type { Clock } from "@orb/kit/time";

/** The DI bundle every portability op closes over (assembled at the entry composition root). */
export interface RegexPortabilityContext {
  readonly db: Db;
  readonly now: Clock;
  readonly newScriptId: () => RegexScriptId;
}

export type ImportCardScripts = (args: ImportCardScriptsArgs) => Promise<ImportCardScriptsResult>;

export type ImportPresetScripts = (args: ImportPresetScriptsArgs) => Promise<ImportCardScriptsResult>;

export type ImportGlobalScripts = (args: ImportGlobalScriptsArgs) => Promise<ImportCardScriptsResult>;

export type ExportCardScripts = (args: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<ExportedCardScripts>;

/** Every script the owner owns, one portable file each (the descriptor streams them). */
export type ExportRegexScripts = (args: { readonly ownerId: UserId }) => Promise<readonly PortableFile[]>;

/** ONE owned script as its portable file — the single-entity EXPORT door (REGX2 · D121-D `kebab=Export`).
 *  A THIN ARM, not a second serialization path: it shares `toPortableFile` with {@link ExportRegexScripts}
 *  above, so the file a user shares and the file a backup carries are the same bytes by construction.
 *  A foreign/absent id answers `null` — "not yours" and "doesn't exist" are one answer. */
export type ExportRegexScript = (args: { readonly ownerId: UserId; readonly scriptId: RegexScriptId }) => Promise<PortableFile | null>;

/** Import ONE `regex/*.json`. Dedups by the shared rule; `created:false` ⇒ it matched an existing row. */
export type ImportRegexScript = (args: { readonly ownerId: UserId; readonly bytes: Uint8Array }) => Promise<{ readonly created: boolean }>;
