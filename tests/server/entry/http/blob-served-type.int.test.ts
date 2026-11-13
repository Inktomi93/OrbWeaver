// @subject packages/server/src/entry/http/blob.ts
// `GET /api/blob/:hash` serves a stored file inline only when its stored type is exactly one of the types the app
// displays, under that exact type. Any other stored type, a type list or a type with a parameter included, downloads
// as an attachment under a generic type, so a stored type string never reaches a browser that may read it as a page.
import type { AssetKind, InlineServedMime } from "@orb/contracts/assets";
import { blobUrl, INLINE_SERVED_MIMES } from "@orb/contracts/assets";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import type { NativeServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { magicBytes } from "@orb/testkit/node/helpers";

/** The generic type the route sends a file it does not display. */
const DOWNLOAD = "application/octet-stream";
const text = new TextEncoder();

/** One file of each displayed type, stored through the upload door's own signature check. */
const DISPLAYED = {
  "image/png": { format: "png", kind: "gallery" },
  "image/jpeg": { format: "jpeg", kind: "gallery" },
  "image/gif": { format: "gif", kind: "gallery" },
  "image/webp": { format: "webp", kind: "gallery" },
  // An animated PNG carries the PNG signature.
  "image/apng": { format: "png", kind: "background" },
  "video/mp4": { format: "mp4", kind: "background" },
  "video/webm": { format: "webm", kind: "background" },
} as const satisfies Record<InlineServedMime, { readonly format: Parameters<typeof magicBytes>[0]; readonly kind: AssetKind }>;

/** Stored types the store's internal writers can record without the signature check, which the route never displays. */
const UNDISPLAYED = {
  // A type list whose first entry is a type the route used to display by its family.
  documentUnderTypeList: { bytes: text.encode("a harmless note, listed"), kind: "document", mime: "audio/mpeg, text/plain" },
  documentUnderAudio: { bytes: text.encode("a harmless note, as sound"), kind: "document", mime: "audio/mpeg" },
  pictureWithParameter: { bytes: magicBytes("png", 65), kind: "avatar", mime: "image/png; name=x" },
  pictureUnderTypeList: { bytes: magicBytes("png", 66), kind: "avatar", mime: "image/png, text/plain" },
} as const satisfies Record<string, { readonly bytes: Uint8Array; readonly kind: AssetKind; readonly mime: string }>;

async function ownerRoot(): Promise<NativeServerTestHarness> {
  return await createServerHarness({ env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" }, physicalPeer: () => "127.0.0.1" });
}

/** The headers that decide how a browser treats the served file. */
async function served(root: NativeServerTestHarness, hash: string): Promise<Readonly<Record<string, string | null>>> {
  const response = await root.http.request(blobUrl(hash));
  await response.arrayBuffer();
  return {
    status: String(response.status),
    type: response.headers.get("content-type"),
    disposition: response.headers.get("content-disposition"),
    sniffing: response.headers.get("x-content-type-options"),
  };
}

test("a stored type the route does not display exactly downloads under the generic type, and every displayed type serves inline", async () => {
  await using root = await ownerRoot();
  const principal = await root.principalFor(root.ownerId);
  const undisplayed = Object.fromEntries(
    await Promise.all(
      Object.entries(UNDISPLAYED).map(async ([name, { bytes, kind, mime }]) => {
        // The store verb without the signature check, as the restore, card and maintenance writers call it.
        const stored = await root.services.assets.store({ principal, bytes, kind, mime });
        return [name, await served(root, stored.hash)] as const;
      }),
    ),
  );
  const displayed = Object.fromEntries(
    await Promise.all(
      INLINE_SERVED_MIMES.map(async (mime, i) => {
        const { format, kind } = DISPLAYED[mime];
        const stored = await root.services.assets.store({ principal, bytes: magicBytes(format, 90 + i), kind, mime, enforceMagic: true });
        return [mime, await served(root, stored.hash)] as const;
      }),
    ),
  );

  expect({ undisplayed, displayed }).toEqual({
    undisplayed: Object.fromEntries(
      Object.keys(UNDISPLAYED).map((name) => [name, { status: "200", type: DOWNLOAD, disposition: "attachment", sniffing: "nosniff" }]),
    ),
    displayed: Object.fromEntries(INLINE_SERVED_MIMES.map((mime) => [mime, { status: "200", type: mime, disposition: null, sniffing: "nosniff" }])),
  });
});
