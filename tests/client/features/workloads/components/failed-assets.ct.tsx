import { rm } from "node:fs/promises";
import { CHARACTER_LIST_MAX_LIMIT, createCharacterSchema } from "@orb/contracts/character";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  makeAssetBytes,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import type { WorkloadActionGroupsStory } from "./_action-groups-stories.tsx";

const STORY = "tests/client/features/workloads/components/_action-groups-stories/WorkloadActionGroupsStory";
const WORKLOAD_DEADLINE_MS = 30_000;

test("a finished index run names the avatar whose stored file was gone, in a library past one list page", async ({ mount, page }) => {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A traveller repairs the loom.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({
    env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
    physicalPeer: () => "127.0.0.1",
    providerFetch: wire.execute,
    startJobs: false,
  });
  const runAdmittedWorkload = root.runAdmittedWorkload;
  if (runAdmittedWorkload === undefined) {
    throw new Error("the harness did not expose manual workload execution");
  }
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const avatars: AssetId[] = [];
  for (const [handle, name] of [
    ["loom-keeper", "Loom Keeper"],
    ["ledger-keeper", "Ledger Keeper"],
  ] as const) {
    const avatar = await root.services.assets.store({
      principal,
      bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
      kind: "avatar",
      mime: "image/png",
      enforceMagic: true,
    });
    await root.services.character.create({
      principal,
      input: createCharacterSchema.parse({ handle, name, description: "A keeper.", avatarAssetId: avatar.assetId }),
    });
    avatars.push(avatar.assetId);
  }
  // A library past one list page: the failed avatar's owner sits beyond the page a list lookup could read.
  for (let n = 0; n < CHARACTER_LIST_MAX_LIMIT; n += 1) {
    await root.services.character.create({
      principal,
      input: createCharacterSchema.parse({ handle: `filler-${String(n)}`, name: `Filler ${String(n)}`, description: "A bystander." }),
    });
  }
  await root.settleBackground();
  await seedCorpusConnections(root, principal);
  const [lost] = avatars;
  const ref = lost === undefined ? undefined : await root.services.assets.assetCasRefById(lost);
  if (ref === undefined) {
    throw new Error("the stored avatar must have a CAS reference");
  }
  await rm(root.app.cas.blobPath(ref.ownerId, ref.hash));
  const started = await caller.workloads.start({ input: { kind: "index", params: { source: "image" } } });
  await runAdmittedWorkload(started.id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const finished = await caller.workloads.get({ id: started.id });
  expect(finished).toMatchObject({ status: "succeeded", result: { failedAssets: [lost] } });

  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "settings.getUserSettings",
      "sessions.me",
      "workloads.list",
      "workloads.get",
      "admin.listUsers",
      "character.list",
      "character.namesByAvatarAssets",
      "connection.listBindings",
      "connection.list",
      "stream.attach",
      "stream.detach",
    ]),
  );
  await routeOrbSocket(page, { awaitAttaches: 0 });
  await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "workloads-jobs", width: 960, appearance: appearanceSettingsSchema.parse({}) });

  const row = page.locator('[data-slot="workload-row"]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Loom Keeper");
  // The avatar that read fine stays out of the failure line.
  await expect(row).not.toContainText("Ledger Keeper");
});
