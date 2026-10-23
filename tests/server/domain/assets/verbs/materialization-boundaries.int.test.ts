// Background URLs and native inline images cross the actual production graph and per-owner CAS.
import { backgroundMaterializeMessage } from "@orb/contracts/theme";
import { assets } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, makeAsset, makeAssetBytes } from "@orb/testkit/node/composed";
import { IMAGE_PROSE, imageRoom, nativeText } from "../../chat/engine/inline-image-physical.ts";

const PUBLIC_URL = "https://public-image.test/image.png";
const PRIVATE_URL = "https://private-image.test/image.png";
const PUBLIC_ADDRESS = "93.184.215.14";
const PRIVATE_ADDRESS = "192.168.1.50";
const MIME = "image/png";
const LOW_CAP = 100_000;
const HIGH_CAP = 200_000;
const PAYLOAD_SIZE = 150_000;

function oversizedDimensions(bytes: Uint8Array): Uint8Array {
  const oversized = Buffer.from(bytes);
  oversized.writeUInt32BE(32_768, 16);
  return oversized;
}

test("public downloads sniff real bytes and store for the caller; a configured private host remains blocked", async () => {
  const requests: string[] = [];
  let payload: Uint8Array = new Uint8Array();
  await using root = await createServerHarness({
    startJobs: false,
    networkExecution: {
      resolver: (host) => Promise.resolve([host === new URL(PRIVATE_URL).hostname ? PRIVATE_ADDRESS : PUBLIC_ADDRESS]),
      fetch: (input, init) => {
        requests.push(new Request(input, init).url);
        return Promise.resolve(new Response(Buffer.from(payload), { headers: { "content-type": "text/html" } }));
      },
    },
  });
  const owner = await root.principalFor((await root.actor()).id);
  await root.services.settings.updateAppSettings({
    principal: await root.principalFor(root.ownerId),
    partial: { privateEndpointAllowlist: [`${new URL(PRIVATE_URL).hostname}:443`] },
  });
  const backgroundBytes = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  payload = backgroundBytes;
  const background = await root.services.settings.addExternalBackground({ principal: owner, url: PUBLIC_URL });
  const backgroundRead = await root.services.assets.readOwnedAssetBytes(owner, background.assetId);
  expect(backgroundRead.mime).toBe(MIME);
  expect(Buffer.from(backgroundRead.bytes).equals(Buffer.from(backgroundBytes))).toBe(true);
  expect(await root.services.assets.listOwned({ principal: owner, limit: 10 })).toMatchObject([
    { assetId: background.assetId, kind: "background", mime: MIME },
  ]);
  await expect(root.services.assets.readOwnedAssetBytes(await root.principalFor(root.ownerId), background.assetId)).rejects.toThrow();
  const before = await root.db.select().from(assets).orderBy(assets.id);
  await expect(root.services.settings.addExternalBackground({ principal: owner, url: PRIVATE_URL })).rejects.toMatchObject({
    code: "background_unavailable",
    message: backgroundMaterializeMessage("unreachable"),
  });
  expect(requests).toEqual([PUBLIC_URL]);
  expect(await root.db.select().from(assets).orderBy(assets.id)).toEqual(before);
});

test("live download caps and raster dimensions refuse without changing the actual asset index", async () => {
  let payload: Uint8Array = new Uint8Array();
  await using root = await createServerHarness({
    startJobs: false,
    networkExecution: {
      resolver: () => Promise.resolve([PUBLIC_ADDRESS]),
      fetch: () => Promise.resolve(new Response(Buffer.from(payload))),
    },
  });
  const principal = await root.principalFor(root.ownerId);
  const raster = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  payload = new Uint8Array(PAYLOAD_SIZE);
  payload.set(raster);
  await root.services.settings.updateAppSettings({ principal, partial: { maxImageBytes: HIGH_CAP } });
  const background = await root.services.settings.addExternalBackground({ principal, url: PUBLIC_URL });
  const stored = await root.services.assets.readOwnedAssetBytes(principal, background.assetId);
  expect(stored.mime).toBe(MIME);
  expect(Buffer.from(stored.bytes).equals(Buffer.from(payload))).toBe(true);
  const before = await root.db.select().from(assets).orderBy(assets.id);
  await root.services.settings.updateAppSettings({ principal, partial: { maxImageBytes: LOW_CAP } });
  await expect(root.services.settings.addExternalBackground({ principal, url: PUBLIC_URL })).rejects.toMatchObject({
    message: backgroundMaterializeMessage("too-large"),
  });
  for (const [bytes, reason] of [
    [new TextEncoder().encode("<svg></svg>"), "not-image"],
    [oversizedDimensions(raster), "too-large"],
  ] as const) {
    payload = bytes;
    await expect(root.services.settings.addExternalBackground({ principal, url: PUBLIC_URL })).rejects.toMatchObject({
      message: backgroundMaterializeMessage(reason),
    });
    expect(await root.db.select().from(assets).orderBy(assets.id)).toEqual(before);
  }
});

test("native inline images read the live cap and refuse excessive dimensions while preserving prose and existing storage", async () => {
  const raster = makeAssetBytes(makeAsset().id);
  const padded = new Uint8Array(PAYLOAD_SIZE);
  padded.set(raster);
  const image = (bytes: Uint8Array, claimedMime = MIME): JsonValue => ({ inlineData: { mimeType: claimedMime, data: Buffer.from(bytes).toString("base64") } });
  await using fixture = await imageRoom([
    [nativeText(IMAGE_PROSE), image(padded, "image/svg+xml")],
    [nativeText(IMAGE_PROSE), image(padded)],
    [nativeText(IMAGE_PROSE), image(oversizedDimensions(raster))],
  ]);
  const root = fixture.h.root;
  await root.services.settings.updateAppSettings({ principal: fixture.h.owner, partial: { maxImageBytes: HIGH_CAP } });
  expect((await fixture.turn()).aborted).toBe(false);
  const before = await fixture.generated();
  expect(before).toMatchObject([{ ownerId: fixture.h.owner.userId, kind: "generated", size: PAYLOAD_SIZE, mime: MIME }]);
  await root.services.settings.updateAppSettings({ principal: fixture.h.owner, partial: { maxImageBytes: LOW_CAP } });
  for (let remaining = 2; remaining > 0; remaining -= 1) {
    expect((await fixture.turn()).messages).toMatchObject([{ content: IMAGE_PROSE }]);
    expect(await fixture.generated()).toEqual(before);
  }
  expect((await fixture.links()).map(({ assetId }) => assetId)).toEqual(before.map(({ id }) => id));
  expect((await fixture.events()).filter(({ payload }) => payload.type === "warning" && payload.code === "reply_image_failed")).toHaveLength(2);
});

test("failed downloads cancel unread bodies and conceal physical errors without persisting another asset", async () => {
  let mode = "success";
  let reads = 0;
  let cancellations = 0;
  let raster: Uint8Array = new Uint8Array();
  await using root = await createServerHarness({
    startJobs: false,
    networkExecution: {
      resolver: () => Promise.resolve([PUBLIC_ADDRESS]),
      fetch: () => {
        if (mode === "throw") {
          return Promise.reject(new Error("private physical address detail"));
        }
        if (mode === "success") {
          return Promise.resolve(new Response(Buffer.from(raster)));
        }
        return Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>(
              {
                pull: (controller) => {
                  reads += 1;
                  controller.enqueue(raster);
                  controller.close();
                },
                cancel: () => {
                  cancellations += 1;
                },
              },
              { highWaterMark: 0 },
            ),
            { status: 503 },
          ),
        );
      },
    },
  });
  const principal = await root.principalFor(root.ownerId);
  raster = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const background = await root.services.settings.addExternalBackground({ principal, url: PUBLIC_URL });
  expect((await root.services.assets.readOwnedAssetBytes(principal, background.assetId)).mime).toBe(MIME);
  const before = await root.db.select().from(assets).orderBy(assets.id);
  for (const failure of ["non-success", "throw"]) {
    mode = failure;
    await expect(root.services.settings.addExternalBackground({ principal, url: PUBLIC_URL })).rejects.toMatchObject({
      code: "background_unavailable",
      message: backgroundMaterializeMessage("unreachable"),
    });
    expect(await root.db.select().from(assets).orderBy(assets.id)).toEqual(before);
  }
  expect(reads).toBe(0);
  expect(cancellations).toBe(1);
});
