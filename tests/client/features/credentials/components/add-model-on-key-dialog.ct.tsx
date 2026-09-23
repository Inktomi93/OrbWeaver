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
//   • A PICK MOVES NOTHING. Recent is written when the connection is saved, the sections keep their order, and
//     the picked row is marked once.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { TrpcRecorder, TrpcResponder } from "../../../../support/node/route-trpc.ts";
import { trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import type { ConnectionRow } from "../_connection-fixtures.ts";
import {
  AUTHORING_ARMS,
  catalogEntry,
  catalogOf,
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
const OPENROUTER_MODELS = [
  catalogEntry("anthropic/claude-opus-5", "Claude Opus 5"),
  catalogEntry("anthropic/claude-sonnet-5", "Claude Sonnet 5"),
  catalogEntry("qwen/qwen3-32b"),
  // The row a fuzzy scorer matched to "gpt-6" (side-eye P1): "g…p…t" across "GPTQ".
  catalogEntry("meta-llama/llama-3-70b-gptq-4bit-v0.6", "Llama 3 70B GPTQ v0.6"),
];
const OPENROUTER_CATALOG = catalogOf(OPENROUTER_MODELS);
const LOCAL_ROW = connectionRow({
  id: "user_connection_ctauthor0002",
  label: "Built-in (this device) · jinaai/jina-clip-v2",
  providerId: "local-light",
  providerLabel: "Built-in (this device)",
  credentialId: null,
  model: "jinaai/jina-clip-v2",
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
  // The row's whole name, in any case: an exact match is the one Enter takes without a move to it.
  await search.fill("claude sonnet 5");
  await expect(dialog.locator('[role="option"][aria-selected="true"]')).toHaveText(/Claude Sonnet 5/);
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
    (input) => catalogOf(input.connectionId === LOCAL_ROW.id ? [catalogEntry("jinaai/jina-clip-v2"), catalogEntry("Xenova/ms-marco-MiniLM-L-6-v2")] : []),
    [LOCAL_ROW, emptyLocal],
  );
  await mount(<ConnectionsAuthoringStory width={870} />);

  const dialog = await openAddModel(page, LOCAL_ROW.label, /Add another built-in model/, "Add another built-in model");
  await dialog.getByRole("combobox", { name: "Search Built-in (this device) models" }).fill("not-a-real-model");
  await expect(dialog.getByText("No listed model matches “not-a-real-model”.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /as typed/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  const empty = await openAddModel(page, "Spare built-in · jinaai/jina-clip-v2", /Add another built-in model/, "Add another built-in model");
  await expect(
    empty.getByText(
      "Couldn't list Built-in (this device)'s models — the provider listed no models. This provider only runs models from its list, so there is nothing to type instead.",
    ),
  ).toBeVisible();
  await expect(empty.getByRole("textbox", { name: "Model" })).toHaveCount(0);
});

// A LIST THAT FAILS is not an empty list: the server answers `listed: false` with the fetch's own reason, and
// the retry re-reads it (side-eye P2: an HTTP 500 used to read "listed no models" with no way to try again).
// The retry button stays mounted and busy while the list reloads, so focus never falls to the document.
test("a saved row's failed list names the failure and retries into the list, keeping focus on the retry", async ({ mount, page }) => {
  let reads = 0;
  const reload = trpcHold();
  await stubWith(page, () => {
    reads += 1;
    return reads === 1 ? { listed: false, reason: "openrouter.ai answered 500." } : reload;
  });
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
  await expect(dialog.getByRole("textbox", { name: "Model" })).toHaveAccessibleDescription(
    "Couldn't list OpenRouter's models — openrouter.ai answered 500. Type the id; it'll be sent as-is.",
  );
  const retry = dialog.getByRole("button", { name: "Try the list again" });
  await retry.click();
  await reload.requested;
  await expect(retry).toHaveAttribute("aria-busy", "true");
  await expect(retry).toBeFocused();
  reload.release(OPENROUTER_CATALOG);
  await expect(dialog.getByRole("option")).toHaveCount(OPENROUTER_MODELS.length);
  await expect(dialog.getByRole("combobox", { name: "Search OpenRouter models" })).toBeFocused();
});

// ENTER NEVER SAVES A LOOSE MATCH (side-eye P1). The fuzzy search still SHOWS the "…gptq…v0.6" row for "gpt-6"
// — a typo should still find its model — but nothing is highlighted, so Enter takes the typed option instead
// of saving that row as listed. A row that merely CONTAINS the query is not highlighted either (side-eye N8:
// "32B" named two rows and Enter took whichever came first); only the row that IS the query is.
test("Enter on a loose or partial match takes the typed id; Enter on the exact id picks that row", async ({ mount, page }) => {
  const trpc = await stubWith(page, OPENROUTER_CATALOG);
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
  const search = dialog.getByRole("combobox", { name: "Search OpenRouter models" });
  await search.fill("gpt-6");
  await expect(dialog.getByRole("option", { name: /GPTQ/ })).toBeVisible();
  await expect(dialog.locator('[role="option"][aria-selected="true"]')).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("status").filter({ hasText: "Picked:" })).toHaveText(
    "Picked: gpt-6 — This model id wasn't in OpenRouter's list. It'll be sent as-is; if the server doesn't have it, turns will fail.",
  );
  await search.fill("claude");
  await expect(dialog.getByRole("option", { name: /Claude/ })).toHaveCount(2);
  await expect(dialog.locator('[role="option"][aria-selected="true"]')).toHaveCount(0);
  await search.fill("META-LLAMA/llama-3-70b-gptq-4bit-v0.6");
  await expect(dialog.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("status").filter({ hasText: "Picked:" })).toHaveText("Picked: Llama 3 70B GPTQ v0.6 (meta-llama/llama-3-70b-gptq-4bit-v0.6)");
  await expect.poll(() => trpc.count("connection.create")).toBe(0);
});

// A SEARCH OF SEVERAL WORDS IS NOT AN ID (side-eye N5: "qwen3 8b" was saved as a model). The words still find
// the row, but no typed option is offered for them, and Enter does nothing until a row is chosen.
test("a multi-word search finds its row but never offers the words as a typed id", async ({ mount, page }) => {
  await stubWith(page, OPENROUTER_CATALOG);
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
  const search = dialog.getByRole("combobox", { name: "Search OpenRouter models" });
  await search.fill("llama 70b");
  await expect(dialog.getByRole("option", { name: /GPTQ/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /as typed/ })).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("status").filter({ hasText: "No model picked yet." })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("status").filter({ hasText: "Picked:" })).toHaveText("Picked: Llama 3 70B GPTQ v0.6 (meta-llama/llama-3-70b-gptq-4bit-v0.6)");
});

// THE PORTED LIST: sectioned by provider, the device-local Recent group heads it once a connection was SAVED
// with a listed model, and the Vision/Tools chips narrow a catalog that states capabilities. A pick alone
// moves nothing (side-eye N4: it hoisted a Recent group over the row and marked it "Selected" twice).
test("the list is sectioned by provider, remembers saved models, and narrows by capability chips", async ({ mount, page }) => {
  await stubWith(
    page,
    catalogOf([
      catalogEntry("anthropic/claude-opus-5", "Claude Opus 5"),
      { ...catalogEntry("anthropic/claude-sonnet-5", "Claude Sonnet 5"), inputModalities: ["text", "image"], supportedParameters: ["tools"] },
      { ...catalogEntry("openai/gpt-5", "GPT-5"), supportedParameters: ["tools"] },
    ]),
  );
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
  await expect(dialog.getByText("Anthropic", { exact: true })).toBeVisible();
  await expect(dialog.getByText("OpenAI", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Vision" }).click();
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await expect(dialog.getByRole("option", { name: /Claude Sonnet 5/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Vision" }).click();

  const headings = dialog.locator('[data-slot="command-group-heading"]');
  await expect(headings).toHaveText(["Anthropic", "OpenAI"]);
  await dialog.getByRole("option", { name: /GPT-5/ }).click();
  await expect(headings).toHaveText(["Anthropic", "OpenAI"]);
  await expect(dialog.getByRole("option").filter({ hasText: "Selected" })).toHaveCount(1);
  await dialog.getByRole("button", { name: "Add connection" }).click();
  await expect(dialog).toBeHidden();

  const again = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
  await expect(again.locator('[data-slot="command-group-heading"]')).toHaveText(["Recent", "Anthropic"]);
  // A Recent row is not repeated in its own section.
  await expect(again.getByRole("option", { name: /GPT-5/ })).toHaveCount(1);
});

// NOTHING IS HIGHLIGHTED AT REST (side-eye P2): cmdk's first-row auto-select read as a pick nobody made.
// The dialog opens with the caret in the search box, the listbox named for whose list it is, and the saved
// row's own model marked.
test("the dialog opens on the search box with no row highlighted, and marks the saved row's own model", async ({ mount, page }) => {
  await stubWith(page, OPENROUTER_CATALOG);
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
  await expect(dialog.getByRole("combobox", { name: "Search OpenRouter models" })).toBeFocused();
  await expect(dialog.getByRole("listbox", { name: "Models on OpenRouter" })).toBeVisible();
  await expect(dialog.locator('[role="option"][aria-selected="true"]')).toHaveCount(0);
  await expect(dialog.getByRole("option", { name: /Claude Opus 5/ })).toContainText("Already added");
  // The first arrow key hands the highlight to cmdk.
  await page.keyboard.press("ArrowDown");
  await expect(dialog.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
});

// THE LIST HOLDS STILL (side-eye N1, N2). A one-line row is one control tall — the two-line cap reserves no
// height — and the list is a fixed viewport inside the dialog, so narrowing the search does not move it.
test("a one-line row is one control tall, and the list keeps its height while the search narrows it", async ({ mount, page }) => {
  await stubWith(page, OPENROUTER_CATALOG);
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
  const oneLine = dialog.getByRole("option", { name: /^qwen\/qwen3-32b/ });
  // The row's height less its min-height: 0 when the clamp reserves nothing.
  await expect
    .poll(() => oneLine.evaluate((element) => element.getBoundingClientRect().height - Number.parseFloat(getComputedStyle(element).minHeight)))
    .toBe(0);
  const list = dialog.getByRole("listbox", { name: "Models on OpenRouter" });
  const listHeight = async (): Promise<number> => (await list.boundingBox())?.height ?? 0;
  const before = await listHeight();
  await dialog.getByRole("combobox", { name: "Search OpenRouter models" }).fill("qwen");
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await expect.poll(listHeight).toBe(before);
});

test("an invalid submit leaves focus on the search box, marked invalid and described by the error", async ({ mount, page }) => {
  await stubWith(page, OPENROUTER_CATALOG);
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
  await dialog.getByRole("button", { name: "Add connection" }).click();
  const search = dialog.getByRole("combobox", { name: "Search OpenRouter models" });
  await expect(search).toHaveAttribute("aria-invalid", "true");
  await expect(search).toHaveAccessibleDescription("Pick a model or type its id.");
  await expect(search).toBeFocused();
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
      // The skeleton is really drawn (cmdk's wrapper once collapsed it to 0px), and no "0 results" is spoken.
      const skeleton = await dialog.locator('[data-slot="model-picker-skeleton"]').boundingBox();
      expect(skeleton?.width ?? 0).toBeGreaterThan(0);
      await expect(dialog.getByRole("status").filter({ hasText: /result/ })).toHaveCount(0);
      catalog.release(OPENROUTER_CATALOG);
      await expect(dialog.getByRole("option")).toHaveCount(OPENROUTER_MODELS.length);
    });

    test(`${arm}: empty — a provider that lists nothing is typed, with the consequence spelled out and a retry`, async ({ mount, page }) => {
      const trpc = await stubWith(page, catalogOf([]));
      await mount(<ConnectionsAuthoringStory width={width} />);
      const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
      const model = dialog.getByRole("textbox", { name: "Model" });
      await expect(model).toHaveAccessibleDescription("Couldn't list OpenRouter's models — the provider listed no models. Type the id; it'll be sent as-is.");
      await expect(model).toHaveAttribute("placeholder", "e.g. anthropic/claude-opus-5");
      await expect(dialog.getByRole("button", { name: "Try the list again" })).toBeVisible();
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
      await expect(dialog.getByRole("option")).toHaveCount(OPENROUTER_MODELS.length);
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

// THE LIST HOLDS STILL WHILE THE USER TYPES. The dialog is centered, so a row that mounted below the list on the
// first keystroke would grow it and move the search box under the caret.
test.describe("at the 486 width", () => {
  test.use({ viewport: { width: 486, height: 800 } });

  test("offering a typed id does not move the search box", async ({ mount, page }) => {
    await stubWith(page, OPENROUTER_CATALOG);
    await mount(<ConnectionsAuthoringStory width={486} />);
    const dialog = await openAddModel(page, OPENROUTER_NAME, /Add another model on this key/, KEY_TITLE);
    const search = dialog.getByRole("combobox", { name: "Search OpenRouter models" });
    await expect(search).toBeFocused();
    const before = (await search.boundingBox())?.y;
    await search.fill("vendor/not-listed");
    await expect(dialog.getByRole("button", { name: "Use “vendor/not-listed” as typed" })).toBeVisible();
    expect((await search.boundingBox())?.y).toBe(before);
  });
});
