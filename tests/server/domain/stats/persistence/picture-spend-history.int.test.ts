// @subject packages/server/src/domain/stats/persistence/rebuild-from-canon.ts
// @subject packages/server/src/domain/stats/persistence/spend-ledger-portability.ts
// @subject packages/server/src/domain/imagery/persistence/prompt-spend.ts
// Picture spend is history: its prompt calls, its generation and its wall time read the same on the live rollups and on
// a rebuild, before and after the picture leaves the gallery and its asset is reaped; the spend ledger travels in the
// backup bundle; and an owner whose only activity is an unpriced picture is still healed at boot.
import type { Principal } from "@orb/contracts/identity";
import { PORTABILITY_ROUTES, PORTABLE_DIRECTORIES, WHOLE_LIBRARY_ONLY_KINDS } from "@orb/contracts/portability";
import type { ModelStatRow, OwnerStatsView } from "@orb/contracts/stats";
import { dailyStats, spendLedger } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { reconcileOwnersMissingTimeline } from "@orb/server/domain/stats";
import { createFrozenClock } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, exportLibrary, makeAssetBytes, readLibraryExport, restoreBundle, signedInBox } from "@orb/testkit/node/composed";
import { bootGrantFor } from "@orb/testkit/node/helpers";
import { eq } from "drizzle-orm";
import {
  allowCorpusEndpoint,
  CAPTION,
  CAPTION_MODE,
  HOST_KEY,
  IMAGE_MODEL,
  physicalExecution,
  policyRoom,
  seedImageBinding,
} from "../../imagery/verbs/imagery-policy-room.fixtures.ts";

// The scripted provider's usage (40 in, 15 out) at the room's Utility price (1 and 2 per million tokens).
const PROMPT_CALL_USD = (40 * 1 + 15 * 2) / 1_000_000;
// The wall time the image provider call takes on the injected clock.
const IMAGE_CALL_MS = 1234;
const SUMMARY = "The traveller stood beside the loom.";
const SECRET_BOX_KEY = Buffer.alloc(32, 3);
const HTTP_BAD_REQUEST = 400;

interface Shown {
  readonly overview: OwnerStatsView | null;
  readonly imageModel: ModelStatRow | undefined;
}

async function shown(root: ServerTestHarness, owner: Principal): Promise<Shown> {
  const byModel = await root.services.stats.byModel(owner.userId);
  return { overview: await root.services.stats.overview(owner.userId), imageModel: byModel.find((row) => row.model === IMAGE_MODEL) };
}

async function rebuilt(root: ServerTestHarness, owner: Principal): Promise<Shown> {
  await root.services.stats.reconcile(owner.userId);
  return await shown(root, owner);
}

test("a captioned picture and a preview keep their spend and image averages through a gallery removal, an asset reap and a rebuild", async () => {
  const clock = createFrozenClock();
  using wire = physicalExecution([CAPTION, CAPTION], () => clock.advance(IMAGE_CALL_MS));
  await using root = await createServerHarness({ startJobs: false, clock, providerFetch: wire.execute, secretBoxKey: SECRET_BOX_KEY });
  const room = await policyRoom(root);
  wire.images.push(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));

  await root.services.imagery.extractPrompt({ caller: room.host, chatId: room.chat.id, mode: "character", subjectCharacterId: room.character.id });
  const picture = await root.services.imagery.generatePicture({
    caller: room.host,
    mode: CAPTION_MODE,
    subjectCharacterId: room.character.id,
    gallery: { subjectCharacterId: room.character.id },
  });
  expect(picture.promptSource).toBe("captioned");

  const live = await shown(root, room.host);
  expect(live.overview?.costUsd).toBeCloseTo(2 * PROMPT_CALL_USD, 12);
  expect(live.imageModel).toMatchObject({ generations: 1, totalGenTimeMs: IMAGE_CALL_MS, costUsd: null });
  expect((await root.db.select().from(spendLedger).where(eq(spendLedger.ownerId, room.host.userId))).map((row) => row.kind).toSorted()).toEqual([
    "image-caption",
    "image-extraction",
  ]);
  expect(await rebuilt(root, room.host)).toEqual(live);

  const [item] = await root.services.assets.listGallery({ principal: room.host, limit: 10 });
  if (item === undefined) {
    throw new Error("the generated picture never reached the gallery");
  }
  await root.services.assets.removeFromGallery({ principal: room.host, galleryItemId: item.galleryItemId });
  expect(await root.services.assets.listGallery({ principal: room.host, limit: 10 })).toEqual([]);
  await root.services.assets.reapIfOrphan(picture.images.map((image) => image.assetId));
  expect(await shown(root, room.host)).toEqual(live);
  expect(await rebuilt(root, room.host)).toEqual(live);
});

test("the spend ledger travels only in the whole-library bundle, and a restore adds only the entries a library lacks", async () => {
  using wire = physicalExecution([SUMMARY, CAPTION]);
  await using source = await signedInBox({ providerFetch: wire.execute, secretBoxKey: SECRET_BOX_KEY });
  const owner = await source.principalFor(source.ownerId);
  const room = await policyRoom(source, owner);
  await source.services.chat.compact({ principal: owner, chatId: room.chat.id });
  await source.services.imagery.extractPrompt({ caller: owner, chatId: room.chat.id, mode: "character", subjectCharacterId: room.character.id });
  const spent = await shown(source, owner);
  expect(spent.overview?.costUsd).toBeCloseTo(2 * PROMPT_CALL_USD, 12);
  // A partial pick never carries the ledger, and naming it in one is refused; the whole library carries it.
  const ledgerFile = (paths: Iterable<string>): boolean => [...paths].some((path) => path.startsWith(PORTABLE_DIRECTORIES.spend));
  expect(ledgerFile((await readLibraryExport(source, ["chat"])).files.keys())).toBe(false);
  expect((await source.http.request(`${PORTABILITY_ROUTES.exportLibrary}?kinds=${WHOLE_LIBRARY_ONLY_KINDS.join(",")}`)).status).toBe(HTTP_BAD_REQUEST);
  expect(ledgerFile((await readLibraryExport(source)).files.keys())).toBe(true);
  const bundle = await exportLibrary(source);
  // Restored onto the library that wrote it, every carried entry is already held, so the spend is unchanged on the live
  // rollups and on a rebuild; the bundle's character and chat restore beside the originals, which spend never counts.
  const sourceLedger = async (): Promise<readonly string[]> =>
    (await source.db.select().from(spendLedger).where(eq(spendLedger.ownerId, source.ownerId))).map((row) => row.id).toSorted();
  const heldBefore = await sourceLedger();
  expect(await restoreBundle(source, bundle)).toMatchObject({ status: "succeeded", failed: 0 });
  expect(await sourceLedger()).toEqual(heldBefore);
  const afterSelfRestore = await shown(source, owner);
  expect(afterSelfRestore.overview?.costUsd).toBe(spent.overview?.costUsd);
  expect(await rebuilt(source, owner)).toEqual(afterSelfRestore);

  await using target = await signedInBox();
  const restorer = await target.principalFor(target.ownerId);
  expect(await restoreBundle(target, bundle)).toMatchObject({ status: "succeeded", failed: 0 });
  const ledger = async (): Promise<readonly string[]> =>
    (await target.db.select().from(spendLedger).where(eq(spendLedger.ownerId, target.ownerId))).map((row) => row.kind).toSorted();
  expect(await ledger()).toEqual(["compaction", "image-extraction"]);
  const restored = await shown(target, restorer);
  expect(restored.overview?.costUsd).toBeCloseTo(2 * PROMPT_CALL_USD, 12);

  expect(await restoreBundle(target, bundle)).toMatchObject({ status: "succeeded", failed: 0 });
  expect(await ledger()).toEqual(["compaction", "image-extraction"]);
  expect(await shown(target, restorer)).toEqual(restored);
  expect(await rebuilt(target, restorer)).toEqual(restored);
});

test("an owner whose only activity is an unpriced picture is healed when the timeline is missing", async () => {
  using wire = physicalExecution([]);
  await using root = await createServerHarness({ startJobs: false, providerFetch: wire.execute, secretBoxKey: SECRET_BOX_KEY });
  // A fresh painter with only an image connection: no room, no turn, no priced call.
  const painter = await root.principalFor((await root.actor()).id);
  await allowCorpusEndpoint(root);
  const credential = await root.services.credentials.add({ principal: painter, provider: "custom-openai", key: HOST_KEY });
  await seedImageBinding(root, painter, credential.id);
  wire.images.push(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  await root.services.imagery.generatePicture({ caller: painter, mode: "free", prompt: "A loom at dusk." });
  const live = await shown(root, painter);
  expect(live.overview).toMatchObject({ costUsd: null, userTurns: 0, assistantTurns: 0 });
  expect(live.imageModel).toMatchObject({ generations: 1, costUsd: null });

  await root.db.delete(dailyStats).where(eq(dailyStats.ownerId, painter.userId));
  expect(await reconcileOwnersMissingTimeline(bootGrantFor(root.db), root.clock.now, root.idSource)).toBe(1);
  expect(await root.db.select().from(dailyStats).where(eq(dailyStats.ownerId, painter.userId))).not.toHaveLength(0);
  // The heal is idempotent: a timeline in place keeps the owner out of the next boot's sweep.
  expect(await reconcileOwnersMissingTimeline(bootGrantFor(root.db), root.clock.now, root.idSource)).toBe(0);
});
