import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { ConnectionsListStory } from "./_connections-list-stories.tsx";

const PROVIDER = "custom-openai";
const MODEL_COUNT = 30;
const PICKED_INDEX = Math.floor(MODEL_COUNT / 2);
const models = Array.from({ length: MODEL_COUNT }, (_, index) => ({
  id: `vendor/model-${String(index).padStart(2, "0")}`,
}));

async function expectRecentAtStart(list: Locator, picked: Locator): Promise<void> {
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(picked).toBeInViewport();
}

async function expectCentred(list: Locator, picked: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const [listBox, rowBox] = await Promise.all([list.boundingBox(), picked.boundingBox()]);
      return listBox === null || rowBox === null ? Number.POSITIVE_INFINITY : Math.abs(rowBox.y + rowBox.height / 2 - (listBox.y + listBox.height / 2));
    })
    .toBeLessThan(2);
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => list.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeGreaterThan(0);
}

for (const recent of [true, false]) {
  test(`a picked ${recent ? "Recent" : "provider-group"} model is unique and ${recent ? "clamps at the list start" : "is centred in the list"}`, async ({
    page,
    mount,
  }, testInfo) => {
    const fetchCatalog: typeof fetch = (input, init) => {
      const request = new Request(input, init);
      if (request.method !== "GET" || new URL(request.url).pathname !== "/v1/models") {
        throw new Error(`Unexpected catalog request ${request.url}`);
      }
      return Promise.resolve(Response.json({ data: models }));
    };
    await using root = await createServerHarness({
      providerFetch: fetchCatalog,
      networkExecution: { fetch: fetchCatalog, resolver: () => Promise.resolve(["93.184.215.14"]) },
    });
    const caller = await root.internalCallerFor(root.ownerId);
    const selected = models[PICKED_INDEX];
    if (selected === undefined) {
      throw new Error("The external model catalog has no picked model");
    }
    const connection = await caller.connection.create({
      providerId: PROVIDER,
      credentialId: null,
      label: "Recent route",
      model: selected.id,
      baseUrl: "https://models.example.test/v1",
    });
    await routeTrpc(
      page,
      serveCorpusProcedures(caller, [
        "sessions.me",
        "settings.getUserSettings",
        "connection.list",
        "connection.listBindings",
        "credentials.list",
        "credentials.storageStatus",
        "connection.providersAvailable",
        "connection.get",
        "connection.catalogModels",
        "connection.capabilities",
        "connection.update",
        "connection.embedSpaceChangePreview",
      ]),
    );
    await mount<typeof ConnectionsListStory>("tests/client/features/credentials/components/_connections-list-stories/ConnectionsListStory", {
      ...(recent ? { recent: { source: PROVIDER, ids: [selected.id, ...models.slice(0, 4).map((model) => model.id)] } } : {}),
    });
    await page.getByRole("button", { name: new RegExp(`^${connection.label} · `, "u") }).click();
    const list = page.locator('[data-slot="command-list"]');
    await expect(list.getByRole("option")).toHaveCount(models.length);
    const picked = list.getByRole("option", { name: new RegExp(selected.id, "u") });
    await expect(picked).toHaveCount(1);
    await expect(
      list
        .getByRole("group")
        .first()
        .getByRole("option", { name: new RegExp(selected.id, "u") }),
    ).toBeVisible();
    const geometry = async (): Promise<string> =>
      JSON.stringify({
        list: await list.evaluate((element) => ({
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          scrollTop: element.scrollTop,
          box: element.getBoundingClientRect().toJSON(),
        })),
        row: await picked.evaluate((element: HTMLElement) => ({ offsetHeight: element.offsetHeight, box: element.getBoundingClientRect().toJSON() })),
      });
    await testInfo.attach("model-recent-geometry-initial", { body: await geometry(), contentType: "application/json" });
    try {
      const assertPosition = recent ? expectRecentAtStart : expectCentred;
      await assertPosition(list, picked);
    } finally {
      await testInfo.attach("model-recent-geometry-settled", { body: await geometry(), contentType: "application/json" });
    }
  });
}
