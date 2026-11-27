// @subject packages/client/src/components/connection-role-mutations.ts
// @subject packages/client/src/lib/connection-refusal.ts
// A role binding the server refuses (the connection is gone, it cannot do the job, the plugin does not use the role) says
// why in words of its own, never the generic "Couldn't change that role." Entry: the Model roles section's picker over a
// composed server, the refusal scripted at the wire as the server's formatter sends it. Layer: Playwright CT.
// Red: dropping a branch of `connectionBindingRefusalOf` leaves the generic line for that code.
import { connectionBindingRefusalOf, ROLE_ROWS_ORDERED } from "@orb/client/lib";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { ALERTS_REGION_NAME, createShellAmbientReads, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL, createCorpusHarness } from "@orb/testkit/node/composed";
import { connectionRolePickerName } from "#client/components/shared-control-names.ts";
import type { ModelRolesStory } from "./_model-roles-stories.tsx";

const STORY = "tests/client/features/credentials/components/_model-roles-stories/ModelRolesStory";
const SERVER_SENTENCE = "The server's own sentence.";
const REFUSALS = [CONNECTION_OP_CODES.notFound, CONNECTION_OP_CODES.taskUnservable, CONNECTION_OP_CODES.actorTaskUnrouted] as const;

for (const reason of REFUSALS) {
  test(`a ${reason} refusal of a role pick is said in words of its own`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const added = await caller.connection.create({
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: CORPUS_PROVIDER_ENDPOINT,
      model: CORPUS_TEXT_MODEL,
      allowBackground: true,
      declared: {
        kind: "generation",
        generation: { input: ["text"], context: { window: 32_000 }, output: {}, tools: { parallel: true, silencesProse: false, requiredChoice: true } },
        features: { detectServer: false },
      },
    });
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
      ...serveCorpusProcedures(caller, ["connection.setBinding"], (input) =>
        input.connectionId === added.id ? trpcError({ code: "BAD_REQUEST", reason, message: SERVER_SENTENCE }) : undefined,
      ),
    });
    await mount<typeof ModelRolesStory>(STORY, {});
    const role = ROLE_ROWS_ORDERED.find((candidate) => candidate.task === "chat");
    if (role === undefined) {
      throw new Error("Model roles carries no Chat row");
    }
    await page
      .getByRole("group", { name: role.heading, exact: true })
      .getByRole("combobox", { name: connectionRolePickerName(role.label), exact: true })
      .click();
    await page.getByRole("option", { name: added.label, exact: true }).click();

    const said = connectionBindingRefusalOf({ data: { code: "BAD_REQUEST", reason } });
    if (said === null) {
      throw new Error(`${reason} is a binding refusal, so the role slot reads it`);
    }
    const toasts = page.getByRole("region", { name: ALERTS_REGION_NAME });
    await expect(toasts.getByText(said, { exact: true })).toBeVisible();
    await expect(toasts.getByText(SERVER_SENTENCE, { exact: true })).toHaveCount(0);
  });
}
