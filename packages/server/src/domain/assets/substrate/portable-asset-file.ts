// substrate/portable-asset-file — the PURE (zero-I/O) codec for the assets-portability bundle: the ONE home
// for the self-describing blob-file NAME + the chat-inline `asset:<id>` extractor + the content-hash helper.
// Both halves of the format live here so export (build) and import (parse) can never drift.
//
// THE FILENAME FORMAT (self-describing, no sidecar manifest — so a bundle has no within-dir ordering
// dependency): `<hash>__<id>__<kind>__<mimeHex>.<ext>`
//   • `<hash>`   sha-256 hex of the bytes (the CAS key). On import this is the POISON DEFENSE: the importer
//     re-hashes the bytes and REJECTS unless `sha256(bytes) === <hash>`, so a malicious bundle cannot land
//     content that doesn't match its claimed content-address.
//   • `<id>`     the ORIGINAL `assets.id` (a random TypeID — NOT content-derived; verified in the store path).
//     The blob is restored UNDER this id (Option-A re-link, owner ruling), so every entity FK (`avatarAssetId`
//     …) and every chat-inline `asset:<id>` text ref resolves on the target box with NO id remap and NO
//     message-body rewrite.
//   • `<kind>`   the `AssetKind` — carried so the restored `assets` row is lossless (the column is NOT NULL).
//   • `<mimeHex>` hex(utf8(mime)) — the mime carried losslessly. Raw mime holds `/` (illegal in a path
//     segment) and sniffing can't recover a document's mime (PDF sniffs to octet-stream), so it travels as
//     hex: safe chars only, fully reversible.
//   • `.<ext>`   COSMETIC (so third-party zip tools show a recognizable type). Import IGNORES it — the mime
//     comes from `<mimeHex>`.
// The separator is `__` (double underscore): the hash + mimeHex are hex, `<kind>` is a single lowercase word,
// and a TypeID carries exactly ONE single `_` — so `__` never occurs inside a component and the split is
// unambiguous (exactly 4 parts). Every part is `[a-z0-9_]` + the one `.`, so the name never contains `/`,
// `\`, `..`, or NUL and passes the zip-slip guard unchanged.

import { createHash } from "node:crypto";
import { assetKindSchema } from "@orb/contracts/assets";
import { isAssetHash } from "@orb/kit/assets";
import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { PortableAssetIdentity } from "../contract/portability";

const PART_SEPARATOR = "__";
const EXPECTED_PARTS = 4;
const HEX_ONLY = /^(?:[0-9a-f]{2})+$/;
// A chat-canon image reference is `![alt](asset:<AssetId>)` (D51 — the body is a STRING; blocks are parsed
// at render). We capture every `asset:asset_…` token; each capture is then re-validated as a real AssetId
// before use, so a stray `asset:` in prose can't smuggle a bad id.
const INLINE_ASSET_REF = /asset:(?<id>asset_[a-z0-9]+)/g;

const assetIdSchema = typeIdSchema(ID_PREFIX.asset);

// Cosmetic extension per mime (import ignores it; `<mimeHex>` is authoritative). Unknown ⇒ `bin`.
const EXT_BY_MIME: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const DEFAULT_EXT = "bin";

/** sha-256 hex of the bytes — the CAS key. The import poison-defense re-computes this and compares it to the
 *  `<hash>` in the filename. Pure (CPU, not I/O — the `import/substrate/card` `importFileHash` precedent). */
export function hashAssetBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Build the self-describing bundle filename for one blob (dir-relative — the descriptor's `dir: "assets/"`
 *  is prepended by the delivery core, so this yields NO leading `assets/`). */
export function buildPortableAssetFilename(identity: PortableAssetIdentity): string {
  const mimeHex = Buffer.from(identity.mime, "utf8").toString("hex");
  const ext = EXT_BY_MIME[identity.mime] ?? DEFAULT_EXT;
  return `${identity.hash}${PART_SEPARATOR}${identity.id}${PART_SEPARATOR}${identity.kind}${PART_SEPARATOR}${mimeHex}.${ext}`;
}

/** Parse a bundle filename back to its identity, or `undefined` when it is not a well-formed assets file
 *  (wrong shape, bad hash, bad id/kind, or non-hex mime). Every field is validated against a boundary
 *  primitive (the name is UNTRUSTED — it came off an uploaded bundle); a reject is a caller `ok:false`. */
export function parsePortableAssetFilename(filename: string): PortableAssetIdentity | undefined {
  const dot = filename.lastIndexOf(".");
  const stem = dot === -1 ? filename : filename.slice(0, dot);
  const parts = stem.split(PART_SEPARATOR);
  if (parts.length !== EXPECTED_PARTS) {
    return;
  }
  const [hash, rawId, rawKind, mimeHex] = parts as [string, string, string, string];

  if (!isAssetHash(hash)) {
    return;
  }
  const idParsed = assetIdSchema.safeParse(rawId);
  if (!idParsed.success) {
    return;
  }
  const kindParsed = assetKindSchema.safeParse(rawKind);
  if (!kindParsed.success) {
    return;
  }
  if (mimeHex.length === 0 || !HEX_ONLY.test(mimeHex)) {
    return;
  }
  const mime = Buffer.from(mimeHex, "hex").toString("utf8");
  if (mime.length === 0) {
    return;
  }
  return { hash, id: idParsed.data, kind: kindParsed.data, mime };
}

/** Extract the DISTINCT, VALID `asset:<id>` references embedded in one message body (the chat-canon inline
 *  image refs the FK registry cannot see). Each candidate is re-validated as an AssetId; junk is dropped. */
export function extractInlineAssetIds(content: string): AssetId[] {
  const seen = new Set<string>();
  const out: AssetId[] = [];
  for (const match of content.matchAll(INLINE_ASSET_REF)) {
    const candidate = match.groups?.["id"];
    if (candidate === undefined || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    const parsed = assetIdSchema.safeParse(candidate);
    if (parsed.success) {
      out.push(parsed.data);
    }
  }
  return out;
}
