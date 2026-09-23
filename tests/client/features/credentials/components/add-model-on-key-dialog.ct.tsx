// CT: Settings → Connections → a saved row's "Add another model on this key" (inference program §5.3a, the
// second no-defaults survivability action; `docs/design/mocks/connections/list.html` Board B), and the model
// picker it lands on. Mounted through the production pane; the catalog is the SAVED row's own
// `connection.catalogModels`, stubbed at the network.
//
// WHAT THIS FILE PROVES:
//   • THE ACTION IS OFFERED ONLY WHERE IT CAN WORK, in the words of what the new row shares (key, server, or
//     only the built-in provider), and a hosted row whose key is gone does not offer it.
//   • THE NEW ROW COPIES provider, key, URL and api from the saved one; only the model is picked, and
//     `modelListed` says whether it came from the list.
//   • THE PICKER'S STATES at 870, 486 and a phone: skeleton rows while loading, the empty list, the failed read
//     with its retry, a keyboard pick, and the typed id where policy permits it — and none where it does not.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { TrpcRecorder, TrpcResponder } from "../../../../support/node/route-trpc.ts";
import { trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import type { ConnectionRow } from "../_connection-fixtures.ts";
import {
  AUTHORING_ARMS,
  catalogEntry,
  connectionRow,
  credentialRow,
  dialogNamed,
  expectInsideViewport,
  openRowMenu,
  stubConnectionsPane,
} from "../_connection-fixtures.ts";
import { ConnectionsAuthoringStory } from "../_ct-stories.tsx";

const KEY_TITLE = "Add another model on this key";
const OPENROUTER_ROW = connectionRow();
const OPENROUTER_NAME = "OpenRouter · Claude Opus 5 · anthropic/claude-opus-5";
const OPENROUTER_CATALOG = [
  catalogEntry("anthropic/claude-opus-5", "Claude Opus 5"),
  catalogEntry("anthropic/claude-sonnet-5", "Claude Sonnet 5"),
  catalogEntry("qwen/qwen3-32b"),
];
const LOCAL_ROW = connectionRow({
  id: "user_connection_ctauthor0002",
  label: "Built-in (this device) · Xenova/bge-small-en-v1.5",
  providerId: "local-light",
  providerLabel: "Built-in (this device)",
  credentialId: null,
  model: "Xenova/bge-small-en-v1.5",
  tasks: ["embed"],
});

async function openAddModel(page: Page, rowName: string, action: string | RegExp, title: string): Promise<Locator> {
  await openRowMenu(page, rowName);
  await page.getByRole("menuitem", { name: action }).click();
  const dialog = dialogNamed(page, title);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function stubWith(
  page: Page,
  catalogModels: TrpcResponder<"connection.catalogModels">,
  connections: readonly ConnectionRow[] = [OPENROUTER_ROW],
): Promise<TrpcRecorder> {
  return await stubConnectionsPane(page, { connections, credentials: [credentialRow()], catalogModels });
}

// ── which rows offer it, and in whose words ─────────────────────────────────────────────────────────────

test("a keyed row offers it by §5.3a's name; a keyless endpoint shares its server; a hosted row with no key offers nothing", async ({ mount, page }) => {
  await stubWith(page, OPENROUTER_CATALOG, [
    OPENROUTER_ROW,
    connectionRow({
      id: "user_connection_ctauthor0003",
      label: "Home vLLM",
      providerId: "vllm",
      providerLabel: "vLLM",
      credentialId: null,
      baseUrl: "http://127.0.0.1:8000/v1",
      model: "Qwen/Qwen3-32B",
    }),
    connectionRow({ id: "user_connection_ctauthor0004", label: "Orphaned", credentialId: null, model: "openai/gpt-5-mini" }),
  ]);
  await mount(<ConnectionsAuthoringStory width={870} />);

  await openRowMenu(page, OPENROUTER_NAME);
  await expect(page.getByRole("menuitem", { name: /Add another model on this key/ })).toContainText(
    "A new connection on OpenRouter with the same key — you only pick the model.",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem")).toHaveCount(0);

  await openRowMenu(page, "Home vLLM · Qwen/Qwen3-32B");
  await expect(page.getByRole("menuitem", { name: /Add another model on this server/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem")).toHaveCount(0);

  await openRowMenu(page, "Orphaned · openai/gpt-5-mini");
  await expect(page.getByRole("menuitem", { name: /Use this connection for everything/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Add another model/ })).toHaveCount(0);
});

test("the new row copies provider, key, URL and api from the saved one; a keyboard pick is saved as listed", async ({ mount, page }) => {
  const trpc = await stubWith(page, OPENROUTER_CATALOG);
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);

  const search = dialog.getByRole("combobox", { name: "Search OpenRouter models" });
  await search.fill("sonnet");
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("status").filter({ hasText: "Picked:" })).toHaveText("Picked: Claude Sonnet 5 (anthropic/claude-sonnet-5)");
  await expect(dialog.getByRole("option", { name: /Claude Sonnet 5/ })).toContainText("Selected");
  await dialog.getByRole("button", { name: "Add connection" }).click();

  await expect(dialog).toBeHidden();
  await expect.poll(() => trpc.lastInput("connection.catalogModels")).toEqual({ connectionId: OPENROUTER_ROW.id });
  await expect
    .poll(() => trpc.lastInput("connection.create"))
    .toEqual({
      providerId: "openrouter",
      credentialId: OPENROUTER_ROW.credentialId,
      baseUrl: null,
      api: "auto",
      transport: null,
      model: "anthropic/claude-sonnet-5",
      allowBackground: false,
      modelListed: true,
    });
  await expect.poll(() => trpc.count("credentials.add")).toBe(0);
});

test("submitting with nothing picked says so under the list and writes nothing", async ({ mount, page }) => {
  const trpc = await stubWith(page, OPENROUTER_CATALOG);
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
  await expect(dialog.getByRole("status").filter({ hasText: "No model picked yet." })).toBeVisible();
  await dialog.getByRole("button", { name: "Add connection" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Pick a model or type its id.");
  await expect.poll(() => trpc.count("connection.create")).toBe(0);
});

test("a built-in row's catalog is closed: no typed id is offered, and an empty list leaves nothing to type", async ({ mount, page }) => {
  const emptyLocal = connectionRow({ ...LOCAL_ROW, id: "user_connection_ctauthor0005", label: "Spare built-in" });
  await stubWith(
    page,
    (input) => (input.connectionId === LOCAL_ROW.id ? [catalogEntry("Xenova/bge-small-en-v1.5"), catalogEntry("Xenova/ms-marco-MiniLM-L-6-v2")] : []),
    [LOCAL_ROW, emptyLocal],
  );
  await mount(<ConnectionsAuthoringStory width={870} />);

  const dialog = await openAddModel(page, LOCAL_ROW.label, /Add another built-in model/, "Add another built-in model");
  await dialog.getByRole("combobox", { name: "Search Built-in (this device) models" }).fill("not-a-real-model");
  await expect(dialog.getByText("No listed model matches “not-a-real-model”.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /as typed/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  const empty = await openAddModel(page, "Spare built-in · Xenova/bge-small-en-v1.5", /Add another built-in model/, "Add another built-in model");
  await expect(
    empty.getByText("Built-in (this device) listed no models. This provider only runs models from its list, so there is nothing to type instead."),
  ).toBeVisible();
  await expect(empty.getByRole("textbox", { name: "Model" })).toHaveCount(0);
});

// ── the picker's states, at the two settings-body widths and a phone ──────────────────────────────────

for (const { arm, width, device } of AUTHORING_ARMS) {
  test.describe(`${arm}`, () => {
    test.use(device);

    test(`${arm}: loading — skeleton rows under a progressbar, then the list`, async ({ mount, page }) => {
      const catalog = trpcHold();
      await stubWith(page, catalog);
      await mount(<ConnectionsAuthoringStory width={width} />);
      const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
      await catalog.requested;
      await expect(dialog.getByRole("progressbar", { name: "Loading OpenRouter models…" })).toBeVisible();
      await expect(dialog.getByRole("combobox", { name: "Search OpenRouter models" })).toBeDisabled();
      // No "no match" line while nothing has arrived.
      await expect(dialog.getByText(/No listed model matches/)).toHaveCount(0);
      await expectInsideViewport(page, dialog);
      catalog.release(OPENROUTER_CATALOG);
      await expect(dialog.getByRole("option")).toHaveCount(OPENROUTER_CATALOG.length);
    });

    test(`${arm}: empty — a provider that lists nothing is typed, with the consequence spelled out`, async ({ mount, page }) => {
      const trpc = await stubWith(page, []);
      await mount(<ConnectionsAuthoringStory width={width} />);
      const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
      const model = dialog.getByRole("textbox", { name: "Model" });
      await expect(model).toHaveAccessibleDescription("OpenRouter listed no models. Type the id; it'll be sent as-is.");
      await expectInsideViewport(page, dialog);
      await model.fill("openai/gpt-6");
      await dialog.getByRole("button", { name: "Add connection" }).click();
      await expect(dialog).toBeHidden();
      await expect.poll(() => trpc.lastInput("connection.create")).toMatchObject({ model: "openai/gpt-6", modelListed: false });
    });

    test(`${arm}: error — a failed read names its cause and retries in place`, async ({ mount, page }) => {
      let reads = 0;
      await stubWith(page, () => {
        reads += 1;
        return reads === 1 ? trpcError({ code: "BAD_GATEWAY", message: "openrouter.ai answered 502" }) : OPENROUTER_CATALOG;
      });
      await mount(<ConnectionsAuthoringStory width={width} />);
      const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
      await expect(dialog.getByRole("textbox", { name: "Model" })).toHaveAccessibleDescription(
        "Couldn't list OpenRouter's models — openrouter.ai answered 502. Type the id; it'll be sent as-is.",
      );
      await expectInsideViewport(page, dialog);
      await dialog.getByRole("button", { name: "Try the list again" }).click();
      await expect(dialog.getByRole("option")).toHaveCount(OPENROUTER_CATALOG.length);
    });

    test(`${arm}: typed fallback — an id the list lacks is offered by name and saved unlisted, with §5.3a's sentence`, async ({ mount, page }) => {
      const trpc = await stubWith(page, OPENROUTER_CATALOG);
      await mount(<ConnectionsAuthoringStory width={width} />);
      const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
      await dialog.getByRole("combobox", { name: "Search OpenRouter models" }).fill("openai/gpt-6");
      await expect(dialog.getByText("No listed model matches “openai/gpt-6”.")).toBeVisible();
      const typed = dialog.getByRole("button", { name: "Use “openai/gpt-6” as typed" });
      await expectInsideViewport(page, dialog);
      await typed.click();
      await expect(dialog.getByRole("status").filter({ hasText: "Picked:" })).toHaveText(
        "Picked: openai/gpt-6 — This model id wasn't in OpenRouter's list. It'll be sent as-is; if the server doesn't have it, turns will fail.",
      );
      await dialog.getByRole("button", { name: "Add connection" }).click();
      await expect(dialog).toBeHidden();
      await expect.poll(() => trpc.lastInput("connection.create")).toMatchObject({ model: "openai/gpt-6", modelListed: false });
    });
  });
}
