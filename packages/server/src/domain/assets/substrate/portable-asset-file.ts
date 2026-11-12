// The PURE (zero-I/O) codec for the assets-portability bundle: the self-describing blob-file NAME
// (`<hash>__<id>__<kind[+kind]>__<mimeHex>.<ext>`, no sidecar manifest) + the chat-inline `asset:<id>` extractor +
// the content-hash helper. `<id>` restores the blob under its ORIGINAL id so every FK/inline ref resolves
// with no remap; `<hash>` is re-verified on import (poison defense); `.<ext>` is cosmetic, ignored on import.

import { assetKindSchema } from "@orb/contracts/assets";
import { isAssetHash } from "@orb/kit/assets";
import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { sha256Hex } from "#primitives/content-hash";
import type { PortableAssetIdentity } from "../contract/portability.ts";

const PART_SEPARATOR = "__";
const KIND_SEPARATOR = "+";
const EXPECTED_PARTS = 4;
const HEX_ONLY = /^(?:[0-9a-f]{2})+$/;
// Every capture is re-validated as a real AssetId before use, so a stray `asset:` in prose can't smuggle a bad id.
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

/** sha-256 hex of the bytes — the CAS key; re-computed on import and compared to the filename's `<hash>`. */
export function hashAssetBytes(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}

/** Build the self-describing bundle filename for one blob (dir-relative; no leading `assets/`). */
export function buildPortableAssetFilename(identity: PortableAssetIdentity): string {
  const mimeHex = Buffer.from(identity.mime, "utf8").toString("hex");
  const ext = EXT_BY_MIME[identity.mime] ?? DEFAULT_EXT;
  return `${identity.hash}${PART_SEPARATOR}${identity.id}${PART_SEPARATOR}${identity.kinds.join(KIND_SEPARATOR)}${PART_SEPARATOR}${mimeHex}.${ext}`;
}

/** Parse a bundle filename back to its identity, or `undefined` when malformed — the name is untrusted. */
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
  // One kind per use, joined by `+`. A file written before an asset could hold several names one kind and reads the same.
  const kindsParsed = z.array(assetKindSchema).min(1).safeParse(rawKind.split(KIND_SEPARATOR));
  if (!kindsParsed.success) {
    return;
  }
  if (mimeHex.length === 0 || !HEX_ONLY.test(mimeHex)) {
    return;
  }
  const mime = Buffer.from(mimeHex, "hex").toString("utf8");
  if (mime.length === 0) {
    return;
  }
  return { hash, id: idParsed.data, kinds: [...new Set(kindsParsed.data)], mime };
}

/** Extract the distinct, valid `asset:<id>` references embedded in one message body; junk is dropped. */
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
