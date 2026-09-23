// CT: Settings → Connections → "Add a connection" (inference program §5.3a, the step-9 acceptance matrix).
// Mounted through the production pane (`CtConfigGroupBody`), every read and write stubbed at the network by a
// STATEFUL stub, so an add is followed by the rows the server would then return.
//
// WHAT THIS FILE PROVES:
//   • A FULL ADD IS TWO WRITES IN ORDER — `credentials.add`, then `connection.create` naming the key by id — and
//     nothing holds the secret afterwards: not the DOM, not the form, not the mutation cache.
//   • A PARTIAL FAILURE IS HONEST. The key was saved and the connection was not: the dialog says both, clears the
//     secret, locks the provider, and the retry writes only the connection. The statement takes focus, is on
//     screen on a phone, and is withdrawn at the first edit.
//   • EVERY BUILT-IN PROVIDER gets the fields its auth kind needs and a complete add.
//   • THE SUBSCRIPTION STEP'S COMMAND is copyable by keyboard, with an accessible name and a spoken result.
//   • THE PERSONAS: OpenRouter in one pass then "use for everything"; the subscription row refused inline by
//     a background role; the endpoint listed or typed; the built-in keyless add.
//   • THE STATE MATRIX at 870, 486 and a phone: loading, empty, refusal, error, unavailable provider, and the
//     typed fallback — each asserted as what the user sees, with the dialog inside the viewport.

import type { ProviderAuth } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS } from "@orb/contracts/inference";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { TrpcResponder } from "../../../../support/node/route-trpc.ts";
import { trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import {
  ALL_AVAILABLE,
  AUTHORING_ARMS,
  catalogEntry,
  catalogOf,
  connectionRow,
  dialogNamed,
  expectInsideViewport,
  openRowMenu,
  pickProvider,
  SUBSCRIPTION_RUNTIME_MISSING,
  stubConnectionsPane,
} from "../_connection-fixtures.ts";
import { ConnectionsAuthoringStory } from "../_ct-stories.tsx";

const ADD_TITLE = "Add a connection";
const SECRET = "sk-or-ct-0123456789abcdef";
const OPUS = "anthropic/claude-opus-5";
const VLLM_URL = "http://127.0.0.1:8000/v1";
// Type steps are authored in rem; computed font-size resolves to px at the 16px root.
const ROOT_PX = 16;
const pxOf = (token: "text.label" | "text.code"): string => `${Number.parseFloat(TOKENS[token].value) * ROOT_PX}px`;

async function openAddDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Add connection" }).first().click();
  const dialog = dialogNamed(page, ADD_TITLE);
  await expect(dialog).toBeVisible();
  return dialog;
}

function submit(dialog: Locator): Promise<void> {
  return dialog.getByRole("button", { name: "Add connection" }).click();
}

// ── the full add ────────────────────────────────────────────────────────────────────────────────────────

test("a full add mints the key, then creates the connection BY ID, and nothing holds the secret afterwards", async ({ mount, page }) => {
  const trpc = await stubConnectionsPane(page);
  const component = await mount(<ConnectionsAuthoringStory width={870} />);

  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "OpenRouter");
  await dialog.getByLabel("API key", { exact: true }).fill(SECRET);
  await dialog.getByRole("textbox", { name: "Model" }).fill(OPUS);
  await submit(dialog);

  await expect(dialog).toBeHidden();
  await expect.poll(() => trpc.inputs("credentials.add")).toEqual([{ provider: "openrouter", key: SECRET }]);
  await expect
    .poll(() => trpc.inputs("connection.create"))
    .toEqual([
      { providerId: "openrouter", credentialId: "user_credential_ctminted001", baseUrl: null, model: OPUS, allowBackground: false, modelListed: false },
    ]);
  // The new row is on the pane, and no copy of the secret survives anywhere the page can reach.
  await expect(component.getByRole("button", { name: `OpenRouter · ${OPUS}`, exact: true })).toBeVisible();
  await expect(component.getByTestId("held-secrets")).toHaveText("0");
  await expect.poll(() => page.content()).not.toContain(SECRET);

  // A fresh open starts empty: the dialog remounts, it never re-seeds a key.
  const again = await openAddDialog(page);
  await pickProvider(page, again, "OpenRouter");
  await expect(again.getByLabel("API key", { exact: true })).toHaveValue("");
  await expect.poll(() => trpc.unstubbed()).toEqual([]);
});

/** A `connection.create` that refuses its first call and stores the second — the partial-failure script. */
function failFirstCreate(): TrpcResponder<"connection.create"> {
  let creates = 0;
  return (input) => {
    creates += 1;
    return creates === 1
      ? trpcError({ code: "BAD_REQUEST", message: "the provider refused the model id" })
      : connectionRow({
          id: "user_connection_ctcreated01",
          providerId: input.providerId,
          credentialId: input.credentialId,
          baseUrl: input.baseUrl,
          model: input.model,
          modelListed: input.modelListed ?? true,
        });
  };
}

test("a partial failure says the key IS saved and the connection is NOT, and the retry does not mint again", async ({ mount, page }) => {
  const trpc = await stubConnectionsPane(page, { createConnection: failFirstCreate() });
  const component = await mount(<ConnectionsAuthoringStory width={870} />);

  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "OpenRouter");
  await dialog.getByLabel("API key", { exact: true }).fill(SECRET);
  await dialog.getByRole("textbox", { name: "Model" }).fill(OPUS);
  await submit(dialog);

  const notice = dialog.getByRole("alert").filter({ hasText: "was saved in Saved keys" });
  // No label was typed, so the key is unnamed — whatever default the server files it under.
  await expect(notice).toHaveText(
    "Your key (unnamed) was saved in Saved keys, but the connection wasn't created — the provider refused the model id. Adding again reuses the saved key. If you cancel, the key stays in Saved keys.",
  );
  // Secret-free from the moment the row exists: the paste field is gone, replaced by the saved row's name.
  await expect(dialog.getByLabel("API key", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("Key saved (unnamed). It won't be shown again.")).toBeVisible();
  await expect.poll(() => page.content()).not.toContain(SECRET);
  // …and no mutation still carries it while the notice is open: the mint's retained variables are dropped.
  await expect(component.getByTestId("held-secrets")).toHaveText("0");
  // The provider is locked to the saved key's provider.
  await expect(dialog.getByRole("combobox", { name: "Provider" })).toBeDisabled();

  await submit(dialog);
  await expect(dialog).toBeHidden();
  await expect.poll(() => trpc.count("credentials.add")).toBe(1);
  await expect
    .poll(() => trpc.inputs("connection.create").map((input) => (input as { readonly credentialId: string }).credentialId))
    .toEqual(["user_credential_ctminted001", "user_credential_ctminted001"]);
  await expect(component.getByTestId("held-secrets")).toHaveText("0");
});

// A KEYED ENDPOINT keeps its list across the partial failure. The listing is taken for the draft (URL + key);
// the mint empties the key field, and the listing is re-keyed with it — so this test is also the control for
// "the pasted secret is cleared": a mint that left the key in the form would no longer match the re-keyed
// listing, and the retry would drop the list and save the pick unlisted.
test("a keyed endpoint's partial-failure retry keeps the list and saves the listed pick as listed", async ({ mount, page }) => {
  const trpc = await stubConnectionsPane(page, {
    createConnection: failFirstCreate(),
    draftCatalogModels: catalogOf([catalogEntry("Qwen/Qwen3-32B"), catalogEntry("Qwen/Qwen3-8B")]),
  });
  const component = await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "vLLM");
  await dialog.getByLabel("Server URL", { exact: true }).fill(VLLM_URL);
  await dialog.getByLabel("API key (optional)", { exact: true }).fill(SECRET);
  await dialog.getByRole("button", { name: "List models" }).click();
  await dialog.getByRole("option", { name: "Qwen/Qwen3-8B" }).click();
  await submit(dialog);

  await expect(dialog.getByRole("alert").filter({ hasText: "was saved in Saved keys" })).toBeVisible();
  // Both listed rows are still offered, once each: nothing was saved, so nothing joined Recent.
  await expect(dialog.getByRole("option", { name: "Qwen/Qwen3-32B" })).toHaveCount(1);
  await expect(dialog.getByRole("option", { name: "Qwen/Qwen3-8B" })).toHaveCount(1);
  await expect(dialog.getByRole("status").filter({ hasText: "Picked:" })).toHaveText("Picked: Qwen/Qwen3-8B");
  await expect(component.getByTestId("held-secrets")).toHaveText("0");
  // A re-list now names the SAVED key by id, under the provider it was saved for — dialing without it would be a
  // 401 read as "no models", and under another provider the key would not open.
  await dialog.getByRole("button", { name: "List models" }).click();
  await expect
    .poll(() => trpc.lastInput("connection.draftCatalogModels"))
    .toEqual({ providerId: "vllm", baseUrl: VLLM_URL, credentialId: "user_credential_ctminted001" });
  await expect(dialog.getByRole("option", { name: "Qwen/Qwen3-32B" })).toHaveCount(1);

  await submit(dialog);
  await expect(dialog).toBeHidden();
  await expect.poll(() => trpc.inputs("connection.create").map((input) => (input as { readonly modelListed: boolean }).modelListed)).toEqual([true, true]);
  await expect.poll(() => trpc.count("credentials.add")).toBe(1);
});

test("a keyed endpoint add with its list read leaves no key in any mutation", async ({ mount, page }) => {
  await stubConnectionsPane(page, { draftCatalogModels: catalogOf([catalogEntry("Qwen/Qwen3-8B")]) });
  const component = await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "vLLM");
  await dialog.getByLabel("Server URL", { exact: true }).fill(VLLM_URL);
  await dialog.getByLabel("API key (optional)", { exact: true }).fill(SECRET);
  await dialog.getByRole("button", { name: "List models" }).click();
  await dialog.getByRole("option", { name: "Qwen/Qwen3-8B" }).click();
  // The list answer is in hand; the list mutation's variables (which carried the key) are already gone.
  await expect(component.getByTestId("held-secrets")).toHaveText("0");
  await submit(dialog);
  await expect(dialog).toBeHidden();
  await expect(component.getByTestId("held-secrets")).toHaveText("0");
  await expect.poll(() => page.content()).not.toContain(SECRET);
});

// A FAILED MINT keeps the key in the field for the user to fix — and nowhere else: the mint mutation drops
// its retained variables on the throw path as well as on success.
test("a failed key mint leaves the key in the field only, and says nothing was saved", async ({ mount, page }) => {
  await stubConnectionsPane(page, { addCredential: trpcError({ code: "BAD_REQUEST", message: "bad key" }) });
  const component = await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "OpenRouter");
  await dialog.getByLabel("API key", { exact: true }).fill(SECRET);
  await dialog.getByRole("textbox", { name: "Model" }).fill(OPUS);
  await submit(dialog);
  await expect(dialog.locator('[data-slot="add-connection-failure"]')).toHaveText("Nothing was saved — bad key.");
  await expect(dialog.getByLabel("API key", { exact: true })).toHaveValue(SECRET);
  await expect(component.getByTestId("held-secrets")).toHaveText("0");
});

// THE STATEMENT IS ABOUT THE DRAFT THAT WAS SUBMITTED. It takes focus when it appears (the submit may have gone
// disabled under the caret), and the first edit withdraws it — a reason for the old draft is wrong for the new.
test("a failure statement takes focus, names the label the user typed, and is withdrawn at the first edit", async ({ mount, page }) => {
  await stubConnectionsPane(page, { createConnection: failFirstCreate() });
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "OpenRouter");
  await dialog.getByLabel("API key", { exact: true }).fill(SECRET);
  await dialog.getByRole("textbox", { name: "Model" }).fill(OPUS);
  await dialog.getByRole("textbox", { name: "Label" }).fill("work");
  await submit(dialog);
  const failure = dialog.locator('[data-slot="add-connection-failure"]');
  await expect(failure).toContainText("Your key was saved as “work” in Saved keys");
  await expect(failure).toBeFocused();
  await dialog.getByRole("textbox", { name: "Model" }).fill("anthropic/claude-sonnet-5");
  await expect(failure).toHaveCount(0);
  // The saved key is still named and still reused: only the stale reason went away.
  await expect(dialog.getByText("Key saved as “work”. It won't be shown again.")).toBeVisible();
});

// A REFUSAL OF THE URL ITSELF lands on the Server URL field (side-eye P1), stated once inline — no toast —
// and editing the URL clears it.
test("a refused Server URL is an error on that field, and editing the URL clears it", async ({ mount, page }) => {
  await stubConnectionsPane(page, {
    createConnection: trpcError({
      code: "BAD_REQUEST",
      reason: "connection_base_url_refused",
      message: '"10.0.0.5:8000" is a private address this deployment does not admit.',
    }),
  });
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "vLLM");
  const url = dialog.getByLabel("Server URL", { exact: true });
  await url.fill("http://10.0.0.5:8000/v1");
  await dialog.getByRole("textbox", { name: "Model" }).fill("Qwen/Qwen3-8B");
  await submit(dialog);

  await expect(url).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByText('"10.0.0.5:8000" is a private address this deployment does not admit.', { exact: true })).toBeVisible();
  // One inline statement of the failure, with the doubled period stripped.
  await expect(dialog.locator('[data-slot="add-connection-failure"]')).toHaveCount(1);
  await expect(dialog.locator('[data-slot="add-connection-failure"]')).toHaveText(
    'Nothing was saved — "10.0.0.5:8000" is a private address this deployment does not admit.',
  );
  // The refused URL disables the submit under the caret; focus goes to the statement, never the document.
  await expect(dialog.getByRole("button", { name: "Add connection" })).toBeDisabled();
  await expect(dialog.locator('[data-slot="add-connection-failure"]')).toBeFocused();
  await url.fill("http://127.0.0.1:8000/v1");
  await expect(url).not.toHaveAttribute("aria-invalid", "true");
  await expect(dialog.locator('[data-slot="add-connection-failure"]')).toHaveCount(0);
});

// ── every built-in provider ─────────────────────────────────────────────────────────────────────────────

/** The key field each auth kind shows, by its label (`null` = no key field at all). */
const KEY_FIELD_LABELS: Record<ProviderAuth, string | null> = {
  apiKey: "API key",
  oauthToken: "Setup token",
  endpoint: "API key (optional)",
  none: null,
};

/** What each auth kind asks for, and what its add sends. The built-in provider is not here: its catalog is
 *  closed and the add dialog has no list for it, so it refuses the typed id (its own test below). */
const PROVIDER_ADDS = BUILTIN_PROVIDERS.filter((provider) => provider.catalog === "url").map((provider) => ({
  provider,
  key: provider.auth === "apiKey" || provider.auth === "oauthToken" ? `ct-${provider.id}-secret` : null,
  baseUrl: provider.auth === "endpoint" ? VLLM_URL : null,
  model: "ct-model",
}));

for (const add of PROVIDER_ADDS) {
  test(`${add.provider.label} (${add.provider.auth}): the dialog asks for what the auth kind needs and completes the add`, async ({ mount, page }) => {
    const trpc = await stubConnectionsPane(page);
    await mount(<ConnectionsAuthoringStory width={870} />);

    const dialog = await openAddDialog(page);
    await pickProvider(page, dialog, add.provider.label);

    await expect(dialog.getByLabel("Server URL", { exact: true })).toHaveCount(add.baseUrl === null ? 0 : 1);
    // An endpoint lists under its URL and a hosted API-key provider under its key; a subscription token lists only
    // once saved.
    await expect(dialog.getByRole("button", { name: "List models" })).toHaveCount(add.provider.auth === "oauthToken" ? 0 : 1);
    await expect(dialog.getByRole("button", { name: "Copy the command claude setup-token" })).toHaveCount(add.provider.auth === "oauthToken" ? 1 : 0);
    const keyField = KEY_FIELD_LABELS[add.provider.auth];
    await expect(dialog.getByLabel(/^(API key|API key \(optional\)|Setup token)$/)).toHaveCount(keyField === null ? 0 : 1);

    if (add.baseUrl !== null) {
      await dialog.getByLabel("Server URL", { exact: true }).fill(add.baseUrl);
    }
    if (add.key !== null && keyField !== null) {
      await dialog.getByLabel(keyField, { exact: true }).fill(add.key);
    }
    await dialog.getByRole("textbox", { name: "Model" }).fill(add.model);
    await submit(dialog);

    await expect(dialog).toBeHidden();
    await expect.poll(() => trpc.inputs("credentials.add")).toEqual(add.key === null ? [] : [{ provider: add.provider.id, key: add.key }]);
    await expect
      .poll(() => trpc.lastInput("connection.create"))
      .toMatchObject({
        providerId: add.provider.id,
        credentialId: add.key === null ? null : "user_credential_ctminted001",
        baseUrl: add.baseUrl,
        model: add.model,
      });
  });
}

// ── touch targets ───────────────────────────────────────────────────────────────────────────────────────

test.describe("on a touch screen", () => {
  test.use(AUTHORING_ARMS[2].device);

  // The show-key toggle draws a small glyph box; its hit area is the touch-target pseudo around it. Probe the
  // hit area itself: a point 21px from the glyph's centre, on every side, still lands on the toggle.
  test("the show-key toggle takes a tap 44px wide around its glyph", async ({ mount, page }) => {
    await stubConnectionsPane(page);
    await mount(<ConnectionsAuthoringStory width={390} />);
    const dialog = await openAddDialog(page);
    await pickProvider(page, dialog, "OpenRouter");
    const reveal = dialog.getByRole("button", { name: "Show key" });
    await reveal.scrollIntoViewIfNeeded();
    const reach = 21;
    const hits = (): Promise<boolean[]> =>
      reveal.evaluate((element, offset) => {
        const box = element.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        return [
          [x - offset, y],
          [x + offset, y],
          [x, y - offset],
          [x, y + offset],
        ].map(([px, py]) => element.contains(document.elementFromPoint(px ?? 0, py ?? 0)));
      }, reach);
    await expect.poll(hits).toEqual([true, true, true, true]);
  });
});

// ── the subscription step's command ─────────────────────────────────────────────────────────────────────

test.describe("the setup-token command", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copies from the keyboard, keeps the machine-specific instruction, and says it copied", async ({ mount, page }) => {
    await stubConnectionsPane(page);
    await mount(<ConnectionsAuthoringStory width={870} />);
    const dialog = await openAddDialog(page);
    await pickProvider(page, dialog, "Claude subscription");

    await expect(dialog.getByText("Run this on the machine you use Claude Code on, then paste what it prints.")).toBeVisible();
    // The command is read inside a sentence, so it is set at the sentence's size, not the micro key-hint step.
    await expect(dialog.getByText("claude setup-token", { exact: true })).toHaveCSS("font-size", pxOf("text.code"));
    const copy = dialog.getByRole("button", { name: "Copy the command claude setup-token" });
    await copy.focus();
    await page.keyboard.press("Enter");

    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("claude setup-token");
    await expect(dialog.getByRole("status").filter({ hasText: "Copied." })).toHaveText("Copied. Paste it into a terminal on that machine.");
  });

  test("a refused copy says so and points at the command to copy by hand", async ({ mount, page }) => {
    await stubConnectionsPane(page);
    await mount(<ConnectionsAuthoringStory width={870} />);
    const dialog = await openAddDialog(page);
    await pickProvider(page, dialog, "Claude subscription");
    await page.evaluate(() => {
      navigator.clipboard.writeText = (): Promise<void> => Promise.reject(new Error("denied"));
    });

    await dialog.getByRole("button", { name: "Copy the command claude setup-token" }).click();
    await expect(dialog.getByRole("status").filter({ hasText: "Couldn't copy" })).toHaveText("Couldn't copy — select the command and copy it by hand.");
  });
});

// ── the personas ────────────────────────────────────────────────────────────────────────────────────────

test("OpenRouter in one pass: add the key and model, then point every role at it from the row menu", async ({ mount, page }) => {
  const trpc = await stubConnectionsPane(page);
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "OpenRouter");
  await dialog.getByLabel("API key", { exact: true }).fill(SECRET);
  await dialog.getByRole("textbox", { name: "Model" }).fill(OPUS);
  await submit(dialog);
  await expect(dialog).toBeHidden();

  await openRowMenu(page, `OpenRouter · ${OPUS}`);
  await page.getByRole("menuitem", { name: /Use this connection for everything it can serve/ }).click();
  await expect.poll(() => trpc.lastInput("connection.useForEverything")).toEqual({ connectionId: "user_connection_ctcreated01" });
});

test("a subscription added with background work off is refused inline by the Utility role, with the reason", async ({ mount, page }) => {
  await stubConnectionsPane(page);
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "Claude subscription");
  await dialog.getByLabel("Setup token", { exact: true }).fill("sk-ant-oat-ct-token");
  await dialog.getByRole("textbox", { name: "Model" }).fill("sonnet");
  await expect(dialog.getByRole("switch", { name: "Allow background work" })).not.toBeChecked();
  await submit(dialog);
  await expect(dialog).toBeHidden();

  await page.getByRole("combobox", { name: "Utility model connection" }).click();
  const refused = page.getByRole("option", { name: "Claude subscription · sonnet" });
  await expect(refused).toBeDisabled();
  await expect(refused).toHaveAccessibleDescription("This connection doesn't allow background work — turn it on to use it here.");
});

test("an endpoint lists its models and the pick is saved as listed; a failed list falls back to a typed id saved unlisted", async ({ mount, page }) => {
  let lists = 0;
  const trpc = await stubConnectionsPane(page, {
    draftCatalogModels: () => {
      lists += 1;
      return lists === 1 ? catalogOf([catalogEntry("Qwen/Qwen3-32B"), catalogEntry("Qwen/Qwen3-8B")]) : { listed: false, reason: "connect ECONNREFUSED" };
    },
  });
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "vLLM");
  await dialog.getByLabel("Server URL", { exact: true }).fill(VLLM_URL);
  await dialog.getByRole("button", { name: "List models" }).click();

  // Keyboard pick: the search box takes the caret, arrows rove, Enter picks. "8B" is part of an id, not an
  // id, so nothing is highlighted until the arrow.
  const search = dialog.getByRole("combobox", { name: "Search 127.0.0.1:8000 models" });
  await search.fill("8B");
  await expect(dialog.locator('[role="option"][aria-selected="true"]')).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("status").filter({ hasText: "Picked:" })).toHaveText("Picked: Qwen/Qwen3-8B");
  await submit(dialog);
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => trpc.lastInput("connection.create"))
    .toMatchObject({ providerId: "vllm", baseUrl: VLLM_URL, model: "Qwen/Qwen3-8B", modelListed: true });

  // The second endpoint's box is down: the reason is shown and the id is typed.
  const second = await openAddDialog(page);
  await pickProvider(page, second, "vLLM");
  await second.getByLabel("Server URL", { exact: true }).fill(VLLM_URL);
  await second.getByRole("button", { name: "List models" }).click();
  const model = second.getByRole("textbox", { name: "Model" });
  await expect(model).toHaveAccessibleDescription("Couldn't list 127.0.0.1:8000's models — connect ECONNREFUSED. Type the id; it'll be sent as-is.");
  await model.fill("Qwen/Qwen3-32B-AWQ");
  await submit(second);
  await expect(second).toBeHidden();
  await expect.poll(() => trpc.lastInput("connection.create")).toMatchObject({ model: "Qwen/Qwen3-32B-AWQ", modelListed: false });
});

// THE BUILT-IN PROVIDER LISTS WHAT THIS DEVICE RUNS. Its catalog is closed, so the dialog reads it the moment
// the provider is picked (keyless, no URL) and offers only that list — never a typed id, and never a pointer at
// a row menu a first-time user does not have.
test("the built-in provider lists the models this device runs as soon as it is picked, and the pick is saved as listed", async ({ mount, page }) => {
  const trpc = await stubConnectionsPane(page, {
    draftCatalogModels: catalogOf([catalogEntry("jinaai/jina-clip-v2"), catalogEntry("Xenova/bge-reranker-base")]),
  });
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "Built-in (this device)");

  await expect.poll(() => trpc.inputs("connection.draftCatalogModels")).toEqual([{ providerId: "local-light" }]);
  await expect(dialog.getByLabel(/API key|Setup token/)).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Model" })).toHaveCount(0);
  await expect(dialog.getByText(/menu/)).toHaveCount(0);
  await dialog.getByRole("option", { name: "jinaai/jina-clip-v2" }).click();
  await submit(dialog);

  await expect(dialog).toBeHidden();
  await expect.poll(() => trpc.count("credentials.add")).toBe(0);
  await expect
    .poll(() => trpc.lastInput("connection.create"))
    .toMatchObject({ providerId: "local-light", credentialId: null, baseUrl: null, model: "jinaai/jina-clip-v2", modelListed: true });
});

// A KEY BELONGS TO THE PROVIDER IT WAS PASTED FOR. Switching the provider empties the key and URL fields, so a key
// typed for one vendor is never saved under, or sent to, another.
test("switching the provider empties the key and the server URL typed for the previous one", async ({ mount, page }) => {
  const trpc = await stubConnectionsPane(page);
  const component = await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "OpenAI");
  const key = dialog.getByLabel("API key", { exact: true });
  await key.fill(SECRET);
  // The control: the key really is in the field before the switch.
  await expect(key).toHaveValue(SECRET);
  await pickProvider(page, dialog, "Anthropic");
  await expect(dialog.getByLabel("API key", { exact: true })).toHaveValue("");

  await pickProvider(page, dialog, "vLLM");
  await dialog.getByLabel("Server URL", { exact: true }).fill(VLLM_URL);
  await pickProvider(page, dialog, "Ollama");
  await expect(dialog.getByLabel("Server URL", { exact: true })).toHaveValue("");
  await expect(component.getByTestId("held-secrets")).toHaveText("0");
  await expect.poll(() => trpc.count("credentials.add")).toBe(0);
});

// A HOSTED PROVIDER LISTS UNDER ITS PASTED KEY, before anything is saved. The read is a POST (the key rides a body,
// never a URL), the pick is saved as listed, and nothing holds the key afterwards.
test("a hosted draft lists its models under the pasted key, and the listed pick is saved as listed", async ({ mount, page }) => {
  const trpc = await stubConnectionsPane(page, { draftCatalogModels: catalogOf([catalogEntry(OPUS, "Claude Opus 5"), catalogEntry("openai/gpt-6")]) });
  const component = await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "OpenRouter");
  const list = dialog.getByRole("button", { name: "List models" });
  // Nothing to list under before a key is pasted.
  await expect(list).toBeDisabled();
  await dialog.getByLabel("API key", { exact: true }).fill(SECRET);
  const listRequest = page.waitForRequest((request) => request.url().includes("connection.draftCatalogModels"));
  await list.click();
  const sent = await listRequest;
  expect(sent.method()).toBe("POST");
  expect(sent.url()).not.toContain(SECRET);
  await expect.poll(() => trpc.lastInput("connection.draftCatalogModels")).toEqual({ providerId: "openrouter", key: SECRET });

  await dialog.getByRole("option", { name: /Claude Opus 5/ }).click();
  await submit(dialog);
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => trpc.lastInput("connection.create"))
    .toMatchObject({ providerId: "openrouter", credentialId: "user_credential_ctminted001", model: OPUS, modelListed: true });
  await expect(component.getByTestId("held-secrets")).toHaveText("0");
  await expect.poll(() => page.content()).not.toContain(SECRET);
});

test("a hosted list that fails says why and falls back to a typed id", async ({ mount, page }) => {
  await stubConnectionsPane(page, { draftCatalogModels: { listed: false, reason: "openrouter.ai answered 401." } });
  await mount(<ConnectionsAuthoringStory width={870} />);
  const dialog = await openAddDialog(page);
  await pickProvider(page, dialog, "OpenRouter");
  await dialog.getByLabel("API key", { exact: true }).fill(SECRET);
  await dialog.getByRole("button", { name: "List models" }).click();
  await expect(dialog.getByRole("textbox", { name: "Model" })).toHaveAccessibleDescription(
    "Couldn't list OpenRouter's models — openrouter.ai answered 401. Type the id; it'll be sent as-is.",
  );
});

// ── the state matrix, at the two settings-body widths and a phone ───────────────────────────────────────

for (const { arm, width, device } of AUTHORING_ARMS) {
  test.describe(`${arm}`, () => {
    test.use(device);

    test(`${arm}: loading — key storage is checked first, then the model list shows skeleton rows while it loads`, async ({ mount, page }) => {
      const storage = trpcHold();
      const listing = trpcHold();
      await stubConnectionsPane(page, { storageStatus: storage, draftCatalogModels: listing });
      await mount(<ConnectionsAuthoringStory width={width} />);
      const dialog = await openAddDialog(page);
      await expect(dialog.getByText("Checking key storage…")).toBeVisible();
      storage.release({ enabled: true });

      await pickProvider(page, dialog, "vLLM");
      await dialog.getByLabel("Server URL", { exact: true }).fill(VLLM_URL);
      const list = dialog.getByRole("button", { name: "List models" });
      await list.click();
      await listing.requested;
      await expect(dialog.getByRole("progressbar", { name: "Loading 127.0.0.1:8000 models…" })).toBeVisible();
      await expect(dialog.getByRole("combobox", { name: "Search 127.0.0.1:8000 models" })).toBeDisabled();
      // Pending, the button stays focusable (aria-disabled) instead of dropping focus to the document.
      await expect(list).toHaveAttribute("aria-disabled", "true");
      await expect(list).toBeFocused();
      // The skeleton rows are drawn at the list's width, and no "0 results" is announced while loading.
      const skeleton = await dialog.locator('[data-slot="model-picker-skeleton"]').boundingBox();
      expect(skeleton?.width ?? 0).toBeGreaterThan(0);
      await expect(dialog.getByRole("status").filter({ hasText: /result/ })).toHaveCount(0);
      await expectInsideViewport(page, dialog);
      listing.release(catalogOf([catalogEntry("Qwen/Qwen3-32B")]));
      await expect(dialog.getByRole("option", { name: "Qwen/Qwen3-32B" })).toBeVisible();
      // …and the caret moves to the search box the list arrived with.
      await expect(dialog.getByRole("combobox", { name: "Search 127.0.0.1:8000 models" })).toBeFocused();
    });

    test(`${arm}: empty — the pane teaches the add, and an endpoint that lists nothing is typed`, async ({ mount, page }) => {
      await stubConnectionsPane(page);
      await mount(<ConnectionsAuthoringStory width={width} />);
      await expect(page.getByText("No connections yet")).toBeVisible();
      const dialog = await openAddDialog(page);
      await pickProvider(page, dialog, "Ollama");
      await dialog.getByLabel("Server URL", { exact: true }).fill("http://127.0.0.1:11434/v1");
      await dialog.getByRole("button", { name: "List models" }).click();
      await expect(dialog.getByRole("textbox", { name: "Model" })).toHaveAccessibleDescription(
        "Couldn't list 127.0.0.1:11434's models — the provider listed no models. Type the id; it'll be sent as-is.",
      );
      await expectInsideViewport(page, dialog);
    });

    test(`${arm}: refusal — with key storage off the dialog refuses the INPUT, never the save`, async ({ mount, page }) => {
      await stubConnectionsPane(page, { storageEnabled: false });
      await mount(<ConnectionsAuthoringStory width={width} />);
      const dialog = await openAddDialog(page);
      await expect(dialog.getByText("Key storage is turned off on this server")).toBeVisible();
      await expect(dialog.getByRole("combobox", { name: "Provider" })).toHaveCount(0);
      await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
      await expectInsideViewport(page, dialog);
    });

    test(`${arm}: error — a failed connection write after a saved key is stated, with the retry in reach`, async ({ mount, page }) => {
      await stubConnectionsPane(page, { createConnection: trpcError({ code: "BAD_REQUEST", message: "the provider refused the model id" }) });
      await mount(<ConnectionsAuthoringStory width={width} />);
      const dialog = await openAddDialog(page);
      await pickProvider(page, dialog, "OpenAI");
      await dialog.getByLabel("API key", { exact: true }).fill("sk-ct-openai");
      await dialog.getByRole("textbox", { name: "Model" }).fill("gpt-6");
      await submit(dialog);
      const notice = dialog.getByRole("alert").filter({ hasText: "was saved in Saved keys" });
      await expect(notice).toContainText("but the connection wasn't created — the provider refused the model id.");
      // Stated once, inline — the dialog's mutations raise no toast behind the scrim.
      await expect(dialog.locator('[data-slot="add-connection-failure"]')).toHaveCount(1);
      // It takes focus, which brings it on screen — on a phone it lands below the fold otherwise.
      await expect(notice).toBeFocused();
      await expect(notice).toBeInViewport();
      await expect(dialog.getByRole("button", { name: "Add connection" })).toBeEnabled();
      await expectInsideViewport(page, dialog);
    });

    test(`${arm}: unavailable provider — the subscription is listed, disabled, with its cause as a sentence`, async ({ mount, page }) => {
      await stubConnectionsPane(page, { providers: SUBSCRIPTION_RUNTIME_MISSING });
      await mount(<ConnectionsAuthoringStory width={width} />);
      const dialog = await openAddDialog(page);
      await dialog.getByRole("combobox", { name: "Provider" }).click();
      const subscription = page.getByRole("option", { name: /Claude subscription/ });
      await expect(subscription).toBeDisabled();
      await expect(subscription).toContainText("The Claude runtime isn't installed on this server.");
      await expect(page.getByRole("option", { name: "OpenRouter", exact: true })).toBeEnabled();
    });

    test(`${arm}: typed fallback — a hosted draft types its id and is told it can list under its key`, async ({ mount, page }) => {
      const trpc = await stubConnectionsPane(page, { providers: ALL_AVAILABLE });
      await mount(<ConnectionsAuthoringStory width={width} />);
      const dialog = await openAddDialog(page);
      await pickProvider(page, dialog, "Anthropic");
      const model = dialog.getByRole("textbox", { name: "Model" });
      await expect(model).toHaveAccessibleDescription("Paste your key and list the models it can use, or type the id as Anthropic spells it.");
      // The example is in the provider's own spelling, not one id for every provider.
      await expect(model).toHaveAttribute("placeholder", "e.g. claude-opus-5");
      // The notice is sentences, so it is set at the prose step, not the 10.5px gloss step.
      await expect(dialog.locator('[data-slot="model-picker-notice"]')).toHaveCSS("font-size", pxOf("text.label"));
      await expectInsideViewport(page, dialog);
      await dialog.getByLabel("API key", { exact: true }).fill("sk-ant-ct");
      await model.fill("claude-opus-5");
      await submit(dialog);
      await expect(dialog).toBeHidden();
      await expect.poll(() => trpc.lastInput("connection.create")).toMatchObject({ providerId: "anthropic", model: "claude-opus-5", modelListed: false });
    });
  });
}
