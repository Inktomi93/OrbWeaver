// The first-model step through the real Add connection dialog on a fresh root: what the step says about Allow background
// work is what Finish does and what a dismissal leaves, read back from the root that saved the connection.
import { DIALOG_VERBS } from "@orb/client/lib";
import type { ProviderId } from "@orb/contracts/inference";
import { builtinProvider, providerIdSchema } from "@orb/contracts/inference";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { ADD_CONNECTION_NAME, CONNECTION_PROVIDER_FIELD_NAME } from "#client/features/credentials/lib/connections-copy.ts";
import { API_KEY_FIELD_NAME, FIRST_MODEL_FINISH_NAME, LIST_MODELS_NAME } from "#client/features/credentials/lib/credentials-names.ts";
import type { ConnectionsListStory } from "./_connections-list-stories.tsx";

const STORY = "tests/client/features/credentials/components/_connections-list-stories/ConnectionsListStory";
const PROVIDER: ProviderId = providerIdSchema.parse("openrouter");
const MODEL = "vendor/first-chat-model";
const ADD = { name: ADD_CONNECTION_NAME, exact: true } as const;
const SERVED = [
  "sessions.me",
  "connection.list",
  "connection.listBindings",
  "connection.providersAvailable",
  "connection.draftCatalogModels",
  "connection.create",
  "connection.update",
  "connection.setBinding",
  "credentials.list",
  "credentials.storageStatus",
  "credentials.add",
] as const;

interface SetupRoot extends AsyncDisposable {
  readonly caller: Awaited<ReturnType<Awaited<ReturnType<typeof createServerHarness>>["internalCallerFor"]>>;
}

/** A fresh root with no connections, so the first chat-capable add opens the step; only OpenRouter's catalog bytes are scripted. */
async function setupRoot(): Promise<SetupRoot> {
  const baseUrl = builtinProvider(PROVIDER)?.baseUrl;
  if (baseUrl === undefined) {
    throw new Error("The first-model step needs a canonical hosted provider");
  }
  const catalogFetch: typeof fetch = (input, init) => {
    const url = new URL(new Request(input, init).url);
    const rows = url.searchParams.has("output_modalities")
      ? []
      : [{ id: MODEL, architecture: { ["input_modalities"]: ["text"], ["output_modalities"]: ["text"] }, ["supported_parameters"]: [] }];
    return Promise.resolve(Response.json({ data: rows }));
  };
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({
      secretBoxKey: Buffer.alloc(32, 23),
      startJobs: false,
      providerFetch: catalogFetch,
      networkExecution: {
        fetch: catalogFetch,
        resolver: (hostname) => {
          if (hostname !== new URL(baseUrl).hostname) {
            throw new Error("Unexpected first-model catalog hostname");
          }
          return Promise.resolve(["93.184.215.14"]);
        },
      },
    }),
  );
  const caller = await root.internalCallerFor(root.ownerId);
  const lifetime = construction.move();
  return { caller, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

/** Add the first connection through the dialog and land on the first-model step. */
async function openSetupStep(page: Page): Promise<Locator> {
  await page.getByRole("button", ADD).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: CONNECTION_PROVIDER_FIELD_NAME, exact: true }).click();
  const provider = builtinProvider(PROVIDER);
  if (provider === undefined) {
    throw new Error(`no built-in provider is registered as ${PROVIDER}`);
  }
  await page.getByRole("option", { name: provider.label }).first().click();
  await dialog.getByRole("textbox", { name: API_KEY_FIELD_NAME, exact: true }).fill("synthetic-first-model-key");
  await dialog.getByRole("button", { name: LIST_MODELS_NAME, exact: true }).click();
  await dialog.getByRole("option", { name: new RegExp(MODEL, "u") }).click();
  await dialog.getByRole("button", ADD).click();
  await expect(dialog.locator('[data-slot="first-model-setup"]')).toBeVisible();
  return dialog;
}

/** The Utility role and the saved connection's switch, as the root holds them. */
async function savedUtility(caller: SetupRoot["caller"]): Promise<{ readonly boundToNew: boolean; readonly allowBackground: boolean }> {
  const created = (await caller.connection.list()).find((row) => row.providerId === PROVIDER);
  const bindings = await caller.connection.listBindings({});
  return {
    boundToNew: bindings.some((view) => view.task === "summarize" && view.binding?.connectionId === created?.id),
    allowBackground: created?.allowBackground ?? false,
  };
}

/** The step's choice is described by its own note, and the note names the control that applies it. */
async function expectNoteNamesFinish(dialog: Locator): Promise<Locator> {
  const finish = dialog.getByRole("button", { name: FIRST_MODEL_FINISH_NAME, exact: true });
  await expect(finish).toBeEnabled();
  await expect(dialog.getByRole("radiogroup")).toHaveAccessibleDescription(new RegExp(`\\b${(await finish.textContent()) ?? ""}\\b`, "u"));
  return finish;
}

test("Finish turns on Allow background work and binds Utility to the new connection", async ({ mount, page }) => {
  await using root = await setupRoot();
  await routeTrpc(page, serveCorpusProcedures(root.caller, SERVED));
  await mount<typeof ConnectionsListStory>(STORY, {});
  const dialog = await openSetupStep(page);
  const finish = await expectNoteNamesFinish(dialog);
  await finish.click();
  await expect(dialog).toHaveCount(0);
  expect(await savedUtility(root.caller)).toEqual({ boundToNew: true, allowBackground: true });
});

test("dismissing the step leaves Utility unset and background work off, as its note says", async ({ mount, page }) => {
  await using root = await setupRoot();
  await routeTrpc(page, serveCorpusProcedures(root.caller, SERVED));
  await mount<typeof ConnectionsListStory>(STORY, {});
  const dialog = await openSetupStep(page);
  await expectNoteNamesFinish(dialog);
  await dialog.getByRole("button", { name: DIALOG_VERBS.close, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await savedUtility(root.caller)).toEqual({ boundToNew: false, allowBackground: false });
});
