// @orb/contracts/portability — the entity-agnostic export/import REGISTRY contract.
//
// The uniform portability subsystem (export-import-portability.md §2): the delivery core streams a zip of
// every entity's files and, on upload, routes each file back to the owning entity. The core knows NOTHING
// about any specific entity — it iterates a registry of descriptors. This node fixes the CONTRACT the two
// sides plug into:
//   - the delivery core (security-executor's impl) consumes PortableEntity + PortableFile + PortableImportOutcome
//   - each entity, as it lands, supplies ONE PortableEntity descriptor composed at entry/compose
// Adding an entity appends a descriptor; it never edits the core. This is intentionally types-only — no zod,
// no runtime logic — because the descriptor's members (exportAll / importFile) are server-side functions
// composed from each domain's verbs + serde, not a wire payload to validate here.
//
// The one piece of cross-entity knowledge lives here as DATA (not branching): PORTABLE_IMPORT_ORDER, the
// fixed dependency order the core imports a full bundle in (personas + characters before chats, tags +
// world-info before characters) so foreign-key-style attachments resolve.

import type { UserId } from "@orb/kit/ids";

// ── Kind axis ─────────────────────────────────────────────────────────────────────────────────────────
// The closed set of portable entity kinds. One home; PortableKind derives from it (no inline re-spell), so a
// new entity adds ONE member here and the union widens everywhere. Declaration order is the design's §2 list;
// the IMPORT order is a separate concern (PORTABLE_IMPORT_ORDER below).
export const PORTABLE_KINDS = [
  "character",
  "chat",
  "persona",
  "world-info",
  "preset",
  "theme",
  "user-settings",
  "tag",
  // Per-owner curated media rows (gallery_items): assetId + optional subjectCharacterId. Blobs travel via
  // `assets`; this carries the CURATION. Re-links the character by HANDLE (ids aren't preserved), assetId by
  // the Option-A preserved id.
  "gallery",
  // The CAS blob bundle. Heterogeneous mime (png/jpeg/webp/pdf/…) so its descriptor uses `ext: ""` +
  // self-describing filenames (`assets/<hash>`). Files carry the ORIGINAL asset id + kind + mime in a
  // manifest so FK re-link needs no id-remap (blobs restore under their original id — content hash-verified).
  "assets",
] as const;

/** A portable entity kind — the routing key that ties a bundle subdirectory to its owning descriptor. */
export type PortableKind = (typeof PORTABLE_KINDS)[number];

// ── Fixed dependency import order (the ONE cross-entity rule, expressed as DATA) ─────────────────────────
// On a full-bundle import the core imports kinds in THIS order, because some entities reference others:
// chats seat characters + personas; characters carry embedded books + tags. So personas / world-info / tags
// land before characters, and characters + personas before chats. This is a permutation of PORTABLE_KINDS
// (every kind exactly once) and is pure data — the core reads array position, it never branches on kind.
export const PORTABLE_IMPORT_ORDER = [
  // assets FIRST: blobs restore (under their original ids) before ANY entity that references them, so every
  // FK / inline `asset:<id>` re-links against a live row.
  "assets",
  "user-settings",
  "tag",
  "persona",
  "world-info",
  "character",
  // gallery after character + assets (it references both); un-resolvable character handle → item survives
  // un-charactered (mirrors the schema's subject_character_id SET NULL).
  "gallery",
  "preset",
  "theme",
  "chat",
] as const satisfies readonly PortableKind[];

// ── Per-file envelope ────────────────────────────────────────────────────────────────────────────────
// Every portable file carries this envelope (the PresetFile precedent, design R8): the schemaKind lets the
// parser confirm the file is what the directory claimed, and schemaVersion drives per-entity forward-compat
// lift-walks. Each entity narrows schemaKind to its own literal in its serde; the contract keeps it a string
// so this node stays entity-agnostic.
export interface PortableEnvelope {
  readonly schemaKind: string;
  /** The entity serde's schema version at export time — the start point for the importer's lift-walk. */
  readonly schemaVersion: number;
}

// ── The bytes on the wire ──────────────────────────────────────────────────────────────────────────────
/** One portable file inside a bundle: its path relative to the entity's dir, plus the raw bytes. */
export interface PortableFile {
  /** Relative to the descriptor's dir, e.g. "Aria.png" or "my-preset.json". */
  readonly filename: string;
  readonly bytes: Uint8Array;
}

/** The per-file import result the core aggregates into the bundle report. An importFile NEVER throws for one
 *  malformed file — it returns ok:false with an error string, so one bad entry cannot abort the whole bundle
 *  (the isolated, operator-auditable failures[] precedent from the card importer). */
export interface PortableImportOutcome {
  readonly ok: boolean;
  /** false = the file deduped against an existing row (idempotent re-import), true = a new row was written. */
  readonly created?: boolean;
  /** Set when ok is false: the operator-facing reason the file was skipped. */
  readonly error?: string;
}

// ── The descriptor the registry is made of ──────────────────────────────────────────────────────────────
// A server-side descriptor, composed at entry/compose from each domain's export + import verbs and its serde.
// The delivery core iterates a list of these; it is the ONLY seam between the entity-agnostic core and the
// per-entity logic.
export interface PortableEntity {
  readonly kind: PortableKind;
  /** The bundle subdirectory (e.g. "characters/", "presets/") — the only per-entity routing key on upload. */
  readonly dir: string;
  /** The file extension the core round-trips (".png", ".jsonl", ".json"). */
  readonly ext: string;
  /** Stream the owner's rows as portable files, lazily — the core zips each file as it is pulled, so a large
   *  library stays within bounded memory. Abort is owned by the delivery core's iteration loop (it stops
   *  pulling), NOT the descriptor: AbortSignal cannot live in this isomorphic, DOM/node-free contract — the
   *  same reason the provider / role-client infra request shapes keep it server-side. */
  readonly exportAll: (ownerId: UserId) => AsyncIterable<PortableFile>;
  /** Import ONE file into the owner's library (idempotent — the domain's import verb + serde). Never throws
   *  for a malformed file: it resolves to an outcome so a single bad entry cannot abort the bundle. */
  readonly importFile: (ownerId: UserId, file: PortableFile) => Promise<PortableImportOutcome>;
}

/** The registry the delivery core iterates. Assembled ONCE at entry/compose; adding an entity appends its
 *  descriptor. The core imports a full bundle in PORTABLE_IMPORT_ORDER, independent of this array's order. */
export type PortabilityRegistry = readonly PortableEntity[];
