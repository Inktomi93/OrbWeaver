// @subject packages/client/src/components/connection-role-slot.tsx
// A role whose bound connection can no longer do the job (its model now states image output only) keeps that connection
// in the picker under its own name, disabled with the reason, so the picker never falls back to the raw connection id.
import { connectionSummary, ROLE_ROWS_ORDERED } from "@orb/client/lib";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { present } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL, createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { connectionRolePickerName } from "#client/components/shared-control-names.ts";
import type { ModelRolesStory } from "./_model-roles-stories.tsx";

const STORY = "tests/client/features/credentials/components/_model-roles-stories/ModelRolesStory";
const PROVIDER = "custom-openai";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

/** A declared generation model whose output is `output`: text serves Chat, images only does not. */
function declaredOutput(output: readonly ("text" | "image")[]): NonNullable<Parameters<Caller["connection"]["create"]>[0]["declared"]> {
  return {
    kind: "generation",
    generation: { input: ["text"], context: { window: 32_000 }, output: { modalities: [...output] } },
    features: { detectServer: false },
  };
}

async function serveRoles(page: Page, corpus: CorpusPlayback, root: ServerTestHarness, caller: Caller): Promise<void> {
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "search.spaceStatus",
      "workloads.list",
      "connection.list",
      "connection.listBindings",
      "connection.providersAvailable",
      "preset.list",
    ]),
  });
}

function chatRole(): (typeof ROLE_ROWS_ORDERED)[number] {
  const row = ROLE_ROWS_ORDERED.find((candidate) => candidate.task === "chat");
  if (row === undefined) {
    throw new Error("Model roles carries no Chat row");
  }
  return row;
}

test("a Chat binding whose model now makes only images shows the connection's name, disabled with its reason", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const created = await caller.connection.create({
    providerId: PROVIDER,
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    allowBackground: true,
    declared: declaredOutput(["text"]),
  });
  await caller.connection.setBinding({ task: "chat", connectionId: created.id });
  await caller.connection.update({ connectionId: created.id, patch: { declared: declaredOutput(["image"]) } });
  const stale = present((await caller.connection.list()).find((connection) => connection.id === created.id));
  // The control: the row no longer serves Chat, and the binding still names it.
  expect(stale.tasks).not.toContain("chat");
  expect((await caller.connection.listBindings()).find((view) => view.task === "chat")?.binding?.connectionId).toBe(created.id);
  await serveRoles(page, corpus, root, caller);
  await mount<typeof ModelRolesStory>(STORY, {});
  const role = chatRole();
  const picker = page
    .getByRole("group", { name: role.heading, exact: true })
    .getByRole("combobox", { name: connectionRolePickerName(role.label), exact: true });
  await expect(picker).toHaveText(connectionSummary(stale));
  await expect(picker).not.toContainText(created.id);
  await picker.click();
  const option = page.getByRole("option", { name: connectionSummary(stale) });
  await expect(option).toBeDisabled();
  // The reason rides the option as its description, beside the name.
  await expect(option).toHaveAccessibleDescription(/\S/u);
});
