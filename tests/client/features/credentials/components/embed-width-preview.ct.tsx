// @subject packages/client/src/components/reindex-confirm.tsx
import { connectionSummary, REINDEX_CONFIRM_COPY, ROLE_ROWS_ORDERED } from "@orb/client/lib";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import {
  CORPUS_ALTERNATE_EMBED_MODEL,
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import { VECTOR_WIDTH_FACT_NAME } from "#client/features/credentials/lib/credentials-names.ts";
import type { ModelRolesStory } from "./_model-roles-stories.tsx";

test("a width the new embedder cannot make is refused before a destructive confirmation", async ({ mount, page }) => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_ALTERNATE_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: new Map(),
    chatText: (): never => {
      throw new Error("The embedding width preview must not request a chat completion");
    },
    images: [],
  });
  let atWidthProbe: (() => Promise<void>) | undefined;
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (atWidthProbe !== undefined && new URL(request.url).pathname.endsWith("/embeddings")) {
      await atWidthProbe();
    }
    return await provider.execute(request);
  };
  await using root = await createCorpusHarness(undefined, { providerFetch, startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const next = await caller.connection.create({
    label: "Width probe target",
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_ALTERNATE_EMBED_MODEL,
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: CORPUS_EMBEDDING_VECTOR.length + 1, mrl: false }, features: { detectServer: false } },
  });
  const previous = await caller.connection.listBindings();
  const routes = await routeTrpc(page, {
    ...createShellAmbientReads(root.corpus.wire, root.ownerId),
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "search.spaceStatus",
      "workloads.list",
      "connection.list",
      "connection.listBindings",
      "connection.providersAvailable",
      "preset.list",
      "connection.embedSpaceChangePreview",
      "connection.setBinding",
    ]),
  });
  await mount<typeof ModelRolesStory>("tests/client/features/credentials/components/_model-roles-stories/ModelRolesStory", {});
  const role = ROLE_ROWS_ORDERED.find((row) => row.task === "embed");
  if (role === undefined) {
    throw new Error("The role picker has no text embedding role");
  }
  await page.getByRole("group", { name: role.heading, exact: true }).getByRole("combobox").click();
  await page.getByRole("option", { name: connectionSummary(next), exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: REINDEX_CONFIRM_COPY.title });
  const refusal = page.getByRole("alert").filter({ hasText: "nothing changed" });
  await expect(confirm.or(refusal)).toBeVisible();
  await expect(confirm).toHaveCount(0);
  await expect(refusal).toContainText(VECTOR_WIDTH_FACT_NAME);
  expect(routes.count("connection.setBinding")).toBe(0);
  expect(await caller.connection.listBindings()).toEqual(previous);

  const boundId = previous.find((binding) => binding.task === "embed")?.binding?.connectionId;
  if (boundId === null || boundId === undefined) {
    throw new Error("The corpus has no bound text encoder to preview");
  }
  const stored = await caller.connection.get({ connectionId: boundId });
  const observed: (typeof stored.declared)[] = [];
  atWidthProbe = async (): Promise<void> => {
    observed.push((await caller.connection.get({ connectionId: boundId })).declared);
  };
  const update = await caller.connection.embedSpaceChangePreview({
    change: { kind: "update", connectionId: boundId, patch: { declared: next.declared } },
  });
  expect(update.refusal).toMatchObject({ kind: "width", stated: CORPUS_EMBEDDING_VECTOR.length + 1, measured: CORPUS_EMBEDDING_VECTOR.length });
  expect(observed.length).toBeGreaterThan(0);
  for (const declared of observed) {
    expect(declared).toEqual(stored.declared);
  }
  expect(await caller.connection.get({ connectionId: boundId })).toEqual(stored);
});
