// A real guest's `net.fetchAsset` stores only a raster within the image caps: an image over the per-axis, pixel or
// byte cap is refused in the guest and leaves the installer's library unchanged.
// @subject packages/server/src/infra/plugin-host/net-egress.ts
// @subject packages/server/src/infra/network/image-guard.ts

import { spawn } from "node:child_process";
import { ID_PREFIX } from "@orb/kit/ids";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, guestRunner, installGuest, makeAssetBytes } from "@orb/testkit/node/composed";
import { PLUGIN_ASSET_MAX_BYTES } from "#server/infra/plugin-host/budgets.ts";

const NET_HOST = "art.example.test";
const IMAGE_AT = (name: string): string => `https://${NET_HOST}/${name}.png`;
// The PNG header's width and height fields; a raster header past a cap is the decompression-bomb input.
const PNG_WIDTH_AT = 16;
const PNG_HEIGHT_AT = 20;
const OVER_AXIS = 32_768;
// Under the per-axis cap on both sides, over the pixel cap as a product.
const OVER_PIXELS_SIDE = 8000;

function withDimensions(bytes: Uint8Array, width: number, height: number): Uint8Array {
  const out = Buffer.from(bytes);
  out.writeUInt32BE(width, PNG_WIDTH_AT);
  out.writeUInt32BE(height, PNG_HEIGHT_AT);
  return new Uint8Array(out);
}

test("fetchAsset stores a raster within the caps and refuses one over each cap", { tags: ["slow"] }, async () => {
  const served = new Map<string, Uint8Array>();
  await using root = await createServerHarness({
    pluginSpawn: spawn,
    networkExecution: {
      resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]),
      fetch: (input, init) => {
        const bytes = served.get(new Request(input, init).url);
        return Promise.resolve(bytes === undefined ? new Response(null, { status: 404 }) : new Response(Buffer.from(bytes)));
      },
    },
  });
  const owner = await root.principalFor(root.ownerId);
  const raster = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const heavy = new Uint8Array(PLUGIN_ASSET_MAX_BYTES + 1);
  heavy.set(raster);
  served.set(IMAGE_AT("within"), raster);
  served.set(IMAGE_AT("over-axis"), withDimensions(raster, OVER_AXIS, 1));
  served.set(IMAGE_AT("over-pixels"), withDimensions(raster, OVER_PIXELS_SIDE, OVER_PIXELS_SIDE));
  served.set(IMAGE_AT("over-bytes"), heavy);
  const pluginId = await installGuest(
    root,
    owner,
    { slug: "art-fetcher", capabilities: ["net.fetch_asset"], netHosts: [NET_HOST] },
    { fetch: "async (h, room, a) => (await h.net.fetchAsset(a.url)).assetId" },
  );
  const run = guestRunner({ root, caller: owner, pluginId, chatId: null });
  const library = async (): Promise<readonly string[]> => (await root.services.assets.listOwned({ principal: owner, limit: 50 })).map(({ assetId }) => assetId);

  const before = await library();
  // Positive control: the same door stores a raster within the caps into the installer's library.
  expect(await run("fetch", { url: IMAGE_AT("within") })).toMatchObject({ ok: true });
  const stored = await library();
  expect(stored).toHaveLength(before.length + 1);
  const outcomes: Record<string, boolean> = {};
  for (const name of ["over-axis", "over-pixels", "over-bytes"]) {
    outcomes[name] = (await run("fetch", { url: IMAGE_AT(name) })).ok;
  }

  expect(outcomes).toEqual({ "over-axis": false, "over-pixels": false, "over-bytes": false });
  expect(await library()).toEqual(stored);
});
