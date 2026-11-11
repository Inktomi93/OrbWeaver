// A torn CAS entry (the asset row stands, its bytes are gone) answers the not-found every miss shares, on the blob
// route and on the plugin bundle read alike, and each read writes the fault to the log so it is not silent.
// @subject packages/server/src/domain/assets/substrate/torn-entry.ts
// @subject packages/server/src/domain/assets/verbs/plugin-reads.ts
// @subject packages/server/src/entry/http/blob.ts

import { ASSET_LIST_LIMIT_MAX, BLOB_ROUTE } from "@orb/contracts/assets";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { LogLevel } from "@orb/contracts/settings";
import { DomainNotFoundError } from "@orb/kit/errors";
import { FROZEN_AT_MS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { makePluginBundle, seedDistributedPlugin } from "@orb/testkit/node/composed";
import { z } from "zod";
import type { GcBox, StoredRef } from "../gc-box.ts";
import { openBox, store } from "../gc-box.ts";

const NOT_FOUND = 404;
const LOG_SCAN_LIMIT = 200;
const WARN_LEVEL = "warn" satisfies LogLevel;
const tornLogSchema = z.looseObject({ level: z.string(), err: z.looseObject({ code: z.string() }) });

/** The warn lines a torn read wrote, each carrying the errno of the read it answered. */
function tornLines(box: GcBox): readonly z.infer<typeof tornLogSchema>[] {
  return box.root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => tornLogSchema.safeParse(JSON.parse(line)))
    .flatMap((record) => (record.success && record.data.level === WARN_LEVEL ? [record.data] : []));
}

async function tear(box: GcBox, ref: StoredRef): Promise<void> {
  await box.cas.remove(box.root.ownerId, ref.hash);
}

test("a torn original on the blob route is the leak-free 404, and the fault is logged", async () => {
  const box = await openBox({ loopbackOwner: true, logLevel: WARN_LEVEL });
  const ref = await store(box, "gallery");
  await tear(box, ref);

  const response = await box.root.http.request(`${BLOB_ROUTE}/${ref.hash}`);
  await response.arrayBuffer();

  expect(response.status).toBe(NOT_FOUND);
  expect(tornLines(box)).toMatchObject([{ hash: ref.hash, err: { code: "ENOENT" } }]);
});

test("a torn published bundle is a not-found for the member it reaches, and the fault is logged", async () => {
  const box = await openBox({ logLevel: WARN_LEVEL });
  const { root, principal } = box;
  const listPlugins = async (): Promise<readonly StoredRef[]> =>
    await root.services.assets.listOwned({ principal, kind: "plugin", limit: ASSET_LIST_LIMIT_MAX });
  const manifest = pluginManifestSchema.parse({
    id: "torn-witness",
    name: "Torn witness",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Ships nothing but its bundle.",
    capabilities: [],
  });
  await seedDistributedPlugin(root, { caller: principal, bundle: makePluginBundle(manifest, "orb.host(1);", FROZEN_AT_MS) });
  const [bundle, ...extra] = await listPlugins();
  if (bundle === undefined || extra.length > 0) {
    throw new Error("publishing stored no single bundle");
  }
  await tear(box, bundle);
  const member = await root.principalFor((await root.actor()).id);

  await expect(root.services.plugin.applyDistributedPlugins({ caller: member })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(tornLines(box)).toMatchObject([{ assetId: bundle.assetId, err: { code: "ENOENT" } }]);
});
