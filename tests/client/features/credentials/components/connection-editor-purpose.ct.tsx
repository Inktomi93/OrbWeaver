// @subject packages/client/src/features/credentials/components/connection-editor-purpose.tsx
import { connectionSummary, ROLE_ROWS_ORDERED } from "@orb/client/lib";
import type { RoutableTask } from "@orb/contracts/inference";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_TEXT_MODEL, createCorpusHarness, createCorpusProviderExecution } from "@orb/testkit/node/composed";
import type { ConnectionsListStory } from "./_connections-list-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connections-list-stories/ConnectionsListStory";
const SERVED = [
  "sessions.me",
  "settings.getUserSettings",
  "connection.list",
  "connection.listBindings",
  "connection.providersAvailable",
  "connection.catalogModels",
  "connection.get",
  "connection.capabilities",
  "connection.embedSpaceChangePreview",
  // The editor records its own model check once the catalog answers.
  "connection.update",
  "credentials.list",
  "credentials.storageStatus",
] as const;

function roleLabel(task: RoutableTask): string {
  const row = ROLE_ROWS_ORDERED.find((candidate) => candidate.task === task);
  if (row === undefined) {
    throw new Error(`Model roles has no ${task} row`);
  }
  return row.label;
}

// Each case opens the connection the corpus binds to `serves` and names a role of another kind it must not list.
const CASES = [
  { model: "a chat model", serves: "chat", foreign: "embed" },
  { model: "an embedding model", serves: "embed", foreign: "chat" },
] as const satisfies readonly { readonly model: string; readonly serves: RoutableTask; readonly foreign: RoutableTask }[];

for (const { model, serves, foreign } of CASES) {
  test(`the Purpose section of ${model} states its kind and lists only the roles it can serve`, async ({ corpus, mount, page }) => {
    const provider = createCorpusProviderExecution({
      modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      structuredReplies: new Map(),
      chatText: (): never => {
        throw new Error("The Purpose section must not request a chat completion");
      },
      images: [],
    });
    await using root = await createCorpusHarness(undefined, { providerFetch: provider.execute, startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    const bindings = await caller.connection.listBindings();
    const connectionId = bindings.find((binding) => binding.task === serves)?.binding?.connectionId;
    if (connectionId === null || connectionId === undefined) {
      throw new Error(`The corpus binds no connection to ${serves}`);
    }
    const connection = await caller.connection.get({ connectionId });
    const view = await caller.connection.capabilities({ connectionId });
    const servable = ROLE_ROWS_ORDERED.filter((row) => view.tasks.includes(row.task)).map((row) => row.label);
    expect(servable).toContain(roleLabel(serves));
    expect(servable).not.toContain(roleLabel(foreign));

    await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SERVED) });
    await mount<typeof ConnectionsListStory>(STORY, {});
    // The list is taller than the story's column, so the row opens from the keyboard, where its place on screen does not matter.
    const listRow = page.getByRole("button", { name: connectionSummary(connection), exact: true });
    await listRow.focus();
    await listRow.press("Enter");

    await expect(page.locator('[data-slot="connection-kind-verdict"]').getByRole("combobox")).toBeVisible();
    await expect(page.locator('[data-slot="connection-capability-rail"] [data-slot="badge"]')).toHaveText(servable);
  });
}
