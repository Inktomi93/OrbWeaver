// @subject packages/client/src/components/connection-role-slot.tsx
// @subject packages/client/src/lib/connection-refusal.ts
// A role binding the server refuses (the connection is gone, it cannot do the job, the plugin does not use the role) is
// said on the role's own row, naming the role, and the picker goes back to what is applied: it never keeps showing the
// refused pick under "Not applied yet", and no toast repeats the row. A failure with no code is said on the row too, and
// keeps the pick. Entry: the Model roles section's picker over a composed server, the refusal scripted at the wire as the
// server's formatter sends it. Layer: Playwright CT.
// Red: dropping the rollback or the row line leaves the refused pick in the picker; dropping the hook's inline declaration
// toasts the refusal a second time.
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
const UNCODED = "uncoded";

for (const reason of [...REFUSALS, UNCODED] as const) {
  test(`a ${reason} failure of a role pick is said on the role's row`, async ({ corpus, mount, page }) => {
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
        input.connectionId === added.id
          ? trpcError(
              reason === UNCODED ? { code: "INTERNAL_SERVER_ERROR", message: SERVER_SENTENCE } : { code: "BAD_REQUEST", reason, message: SERVER_SENTENCE },
            )
          : undefined,
      ),
    });
    await mount<typeof ModelRolesStory>(STORY, {});
    const role = ROLE_ROWS_ORDERED.find((candidate) => candidate.task === "chat");
    if (role === undefined) {
      throw new Error("Model roles carries no Chat row");
    }
    const group = page.getByRole("group", { name: role.heading, exact: true });
    const picker = group.getByRole("combobox", { name: connectionRolePickerName(role.label), exact: true });
    const unsetLabel = (await picker.textContent()) ?? "";
    await picker.click();
    await page.getByRole("option", { name: added.label, exact: true }).click();

    const said =
      reason === UNCODED
        ? `Couldn't change ${role.label}. Try again.`
        : connectionBindingRefusalOf({ data: { code: "BAD_REQUEST", reason } }, role.label, added.label);
    if (said === null) {
      throw new Error(`${reason} is a binding refusal, so the role slot reads it`);
    }
    // The line is on the role's own row, once, and the server's sentence is never what the person reads.
    await expect(group.getByRole("alert").getByText(said, { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: ALERTS_REGION_NAME }).getByRole("alert")).toHaveCount(0);
    await expect(page.getByText(SERVER_SENTENCE, { exact: true })).toHaveCount(0);
    // A failure that says nothing about the pick keeps it, and the row says it is not applied yet. A refusal means the pick
    // will never apply, so the picker is back on what is bound.
    const kept = reason === UNCODED;
    await expect(picker).toContainText(kept ? added.label : unsetLabel);
    await expect(picker).not.toContainText(kept ? unsetLabel : added.label);
  });
}
