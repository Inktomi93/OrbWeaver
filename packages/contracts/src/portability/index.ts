// @orb/contracts/portability — the entity-agnostic export/import REGISTRY contract. The delivery core
// streams a zip of every entity's files and, on upload, routes each file back to the owning entity via
// a registry of descriptors it iterates — it knows nothing about any specific entity. Types-only: no
// zod, since `exportAll`/`importFile` are server-side functions, not a wire payload to validate.

import type { UserId } from "@orb/kit/ids";

/** The closed set of portable entity kinds. New entity = one member here + the union widens everywhere.
 *  Declaration order is the design's list; import order is a separate concern (below). */
export const PORTABLE_KINDS = [
  "character",
  "chat",
  "persona",
  "world-info",
  "preset",
  "theme",
  "user-settings",
  "tag",
  // Curated media rows; blobs travel via `assets`, this carries the curation. Re-links the character
  // by handle (ids aren't preserved), assetId by the preserved id.
  "gallery",
  // The CAS blob bundle. Heterogeneous mime, so `ext: ""` + self-describing filenames (`assets/<hash>`).
  "assets",
] as const;

/** A portable entity kind — the routing key that ties a bundle subdirectory to its owning descriptor. */
export type PortableKind = (typeof PORTABLE_KINDS)[number];

/** Fixed dependency order the core imports a full bundle in — personas/world-info/tags land before
 *  characters, characters+personas before chats — so foreign-key-style attachments resolve. */
export const PORTABLE_IMPORT_ORDER = [
  // assets FIRST: blobs restore under their original ids before anything references them.
  "assets",
  "user-settings",
  "tag",
  "persona",
  "world-info",
  "character",
  // gallery after character + assets; an unresolvable character handle survives un-charactered.
  "gallery",
  "preset",
  "theme",
  "chat",
] as const satisfies readonly PortableKind[];

/** One portable file inside a bundle: its path relative to the entity's dir, plus the raw bytes. */
export interface PortableFile {
  /** Relative to the descriptor's dir, e.g. "Aria.png" or "my-preset.json". */
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** The per-file import result the core aggregates into the bundle report. `importFile` never throws for
 *  one malformed file — it returns ok:false with an error string, so one bad entry can't abort the bundle. */
export interface PortableImportOutcome {
  readonly ok: boolean;
  /** false = the file deduped against an existing row (idempotent re-import), true = a new row was written. */
  readonly created?: boolean;
  /** Set when ok is false: the operator-facing reason the file was skipped. */
  readonly error?: string;
}

// A server-side descriptor, composed from each domain's export + import verbs and its serde. The
// delivery core iterates a list of these — the only seam between the entity-agnostic core and per-entity logic.
export interface PortableEntity {
  readonly kind: PortableKind;
  /** The bundle subdirectory (e.g. "characters/", "presets/") — the only per-entity routing key on upload. */
  readonly dir: string;
  /** The file extension the core round-trips (".png", ".jsonl", ".json"). */
  readonly ext: string;
  /** Stream the owner's rows as portable files, lazily. Abort is owned by the core's iteration loop, not
   *  the descriptor — AbortSignal cannot live in this isomorphic, DOM/node-free contract. */
  readonly exportAll: (ownerId: UserId) => AsyncIterable<PortableFile>;
  /** Import ONE file into the owner's library (idempotent). Never throws for a malformed file. */
  readonly importFile: (ownerId: UserId, file: PortableFile) => Promise<PortableImportOutcome>;
}

/** The registry the delivery core iterates. Assembled ONCE at entry/compose; adding an entity appends its
 *  descriptor. The core imports a full bundle in PORTABLE_IMPORT_ORDER, independent of this array's order. */
export type PortabilityRegistry = readonly PortableEntity[];
