// Startup adopts persisted autoindex as its baseline; later settings and account seeds reach live sweep ports.
import { EMBEDDER_REBUILD_KINDS } from "@orb/contracts/workloads";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, freshDb } from "@orb/testkit/node/composed";

for (const enabled of [false, true]) {
  test(`persisted corpusAutoindex=${enabled} boots without catch-up and a later off-to-on save queues exactly one run`, async () => {
    using fresh = await freshDb();
    const db = fresh.db;
    await using resources = new AsyncDisposableStack();
    const first = resources.use(await createServerHarness({ db, startJobs: false }));
    const { ownerId, ids } = first;
    const firstPrincipal = await first.principalFor(ownerId);
    await first.services.settings.updateAppSettings({ principal: firstPrincipal, partial: { corpusAutoindex: enabled } });
    await first.settleBackground();
    for (const run of await first.services.workloads.list({ caller: firstPrincipal, kind: "index", status: "queued" })) {
      await first.services.workloads.cancel({ caller: firstPrincipal, id: run.id });
    }
    await first[Symbol.asyncDispose]();

    const root = resources.use(await createServerHarness({ db, ownerId, ids, startJobs: false }));
    const principal = await root.principalFor(ownerId);
    const runs = (): ReturnType<typeof root.services.workloads.list> => root.services.workloads.list({ caller: principal, kind: "index" });
    expect(root.app.effectiveConfig.getEffectiveConfig().corpusAutoindex).toBe(enabled);
    const initial = await runs();
    await root.settleBackground();
    expect(await runs()).toEqual(initial);
    expect(initial.filter(({ status }) => status === "queued")).toEqual([]);

    await root.services.settings.updateAppSettings({ principal, partial: { corpusAutoindex: false } });
    await root.settleBackground();
    expect(await runs()).toEqual(initial);
    await root.services.settings.updateAppSettings({ principal, partial: { corpusAutoindex: true } });
    await root.settleBackground();
    const existingIds = new Set(initial.map(({ id }) => id));
    const catchup = (await runs()).filter(({ id }) => !existingIds.has(id));
    expect(catchup).toMatchObject([{ kind: "index", mode: "bulk", ownerId: null, status: "queued", params: { source: "all" } }]);
    expect(catchup).toHaveLength(1);
    await root.services.settings.updateAppSettings({ principal, partial: { corpusAutoindex: true } });
    await root.settleBackground();
    expect((await runs()).filter(({ id }) => !existingIds.has(id))).toEqual(catchup);
  });
}

test("a post-compose account seed and returned sweep ports enqueue real owner and bulk workloads", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const owner = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal: owner, partial: { corpusAutoindex: true } });
  await root.settleBackground();
  for (const run of await root.services.workloads.list({ caller: owner, status: "queued" })) {
    await root.services.workloads.cancel({ caller: owner, id: run.id });
  }
  const actor = await root.actor();
  const principal = await root.principalFor(actor.id);
  await root.settleBackground();
  const bindings = await root.services.connection.listBindings({ principal });
  expect(
    bindings
      .filter(({ binding }) => binding !== null)
      .map(({ task }) => task)
      .toSorted(),
  ).toEqual(["embed", "imageEmbed", "rerank"]);
  const ownRuns = await root.services.workloads.list({ caller: owner, ownerId: actor.id });
  for (const kind of ["index", "databank-reindex"] as const) {
    expect(ownRuns).toContainEqual(expect.objectContaining({ kind, mode: "singular", ownerId: actor.id, status: "queued" }));
  }
  root.app.detachEmbedReindex(null);
  root.app.detachStaleSpaceReindex();
  await root.settleBackground();
  const bulkRuns = await root.services.workloads.list({ caller: owner, ownerId: null, status: "queued" });
  for (const kind of EMBEDDER_REBUILD_KINDS) {
    expect(bulkRuns).toContainEqual(expect.objectContaining({ kind, mode: "bulk", ownerId: null }));
  }
});
