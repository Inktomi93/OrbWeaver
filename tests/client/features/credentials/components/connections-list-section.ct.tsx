// CT: a saved connection whose provider is absent stays identifiable, editable and removable while every
// provider-backed list action is unavailable. The badge and disabled switch state the reason at the row.

import { expect, test } from "@playwright/experimental-ct-react";
// Pure `.ts`, safe in a node-side CT spec; the feature's front door is a barrel that would pull `.tsx` in.
import type { ReindexPreview } from "../../../../../packages/client/src/lib/embedder-rebuild.ts";
import { REINDEX_CONFIRM_COPY, reindexConfirmDescription } from "../../../../../packages/client/src/lib/embedder-rebuild.ts";
import { connectionRow, openRowMenu, stubConnectionsPane } from "../_connection-fixtures.ts";
import { ConnectionsAuthoringStory } from "../_ct-stories.tsx";

const ROW_NAME = "Legacy relay · claude-opus-5";

for (const theme of ["hearth", "light"] as const) {
  for (const width of [870, 320]) {
    test(`the connections funding disclosure stays readable and operable at ${width} in ${theme}`, async ({ mount, page }) => {
      await stubConnectionsPane(page, { connections: [connectionRow()] });
      const component = await mount(
        <div data-theme={theme === "hearth" ? undefined : theme} className="bg-background text-foreground">
          <ConnectionsAuthoringStory width={width} />
        </div>,
      );
      const list = component.locator("#config-anchor-connections-connections");
      const paragraph = list.getByText("One provider and one model per connection.", { exact: false });
      await expect(paragraph).toContainText("Your roles use these connections in rooms you host and for your work outside rooms.");
      await expect(paragraph).toContainText("Shared-room turns use the room host's connections.");
      await expect
        .poll(() =>
          paragraph.evaluate((element) => {
            const style = getComputedStyle(element);
            const probe = document.createElement("span");
            probe.style.font = style.font;
            probe.style.width = "var(--reading-measure-prose)";
            probe.style.display = "block";
            element.append(probe);
            const cap = probe.getBoundingClientRect().width;
            probe.remove();
            return {
              fontMatchesBody:
                Number.parseFloat(style.fontSize) ===
                Number.parseFloat(style.getPropertyValue("--text-body")) * Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
              withinCap: element.getBoundingClientRect().width <= cap + 1,
              capped: style.maxWidth !== "none",
              overflow: element.scrollWidth > element.clientWidth,
            };
          }),
        )
        .toEqual({ fontMatchesBody: true, capped: true, withinCap: true, overflow: false });
      const add = list.getByRole("button", { name: "Add connection", exact: true });
      await expect(add).toBeVisible();
      await add.focus();
      await expect(add).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(add).toBeFocused();
      await test.info().attach("funding-readable", { body: await component.screenshot(), contentType: "image/png" });
    });
  }
}

test("connection chips say what the model can do, while the image role offers only image-capable rows", async ({ mount, page }) => {
  await stubConnectionsPane(page, {
    connections: [
      connectionRow({ label: "Text model", tasks: ["chat", "summarize"] }),
      connectionRow({ id: "user_connection_image01", label: "Image model", model: "image-model", tasks: ["generateImage"] }),
    ],
  });
  const component = await mount(<ConnectionsAuthoringStory width={870} />);
  await expect(component.getByText("Can do:", { exact: true })).toHaveCount(2);
  await expect(component.locator('[data-slot="badge"]').getByText("Image generation", { exact: true })).toHaveCount(1);
  await component.getByRole("combobox", { name: "Image generation connection" }).click();
  await expect(page.getByRole("option", { name: /Image model/u })).toBeVisible();
  await expect(page.getByRole("option", { name: /Text model/u })).toHaveCount(0);
});

test("an unavailable-provider row stays operable while provider-backed actions are disabled", async ({ mount, page }) => {
  const row = connectionRow({
    label: "Legacy relay",
    providerId: "plugin:relay/anthropic",
    providerLabel: "plugin:relay/anthropic",
    model: "anthropic/claude-opus-5",
    tasks: [],
    allowBackground: true,
  });
  await stubConnectionsPane(page, { connections: [row], providers: [] });
  const component = await mount(<ConnectionsAuthoringStory width={870} />);

  await expect(component.getByText("Provider unavailable", { exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: ROW_NAME, exact: true })).toBeEnabled();
  await expect(
    component.getByRole("switch", {
      name: `Allow background work unavailable on ${ROW_NAME} because its provider is unavailable`,
    }),
  ).toBeDisabled();

  await openRowMenu(page, ROW_NAME);
  const remove = page.getByRole("menuitem", { name: "Remove", exact: true });
  await expect(remove).toBeEnabled();
  await expect(page.getByRole("menuitem", { name: /Use this connection for everything it can serve/u })).toHaveCount(0);
  await expect(page.getByText(/Sets\s+to this connection/u)).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /Add another model/u })).toHaveCount(0);
  await remove.click();
  await expect(page.getByRole("alertdialog", { name: 'Remove "Legacy relay"?' })).toBeVisible();
});

// "Use for everything" re-points the embedders too, so over a stored index it asks first, like the role picker.
const EMBEDDER_ROW = connectionRow({
  id: "user_connection_cteverywhere1",
  label: "Local embedder",
  providerId: "custom-openai",
  providerLabel: "Your own server",
  credentialId: null,
  baseUrl: "http://127.0.0.1:8000/v1",
  model: "Qwen/Qwen3-VL-Embedding-2B",
  tasks: ["embed", "imageEmbed"],
  allowBackground: true,
});
const EMBEDDER_ROW_NAME = "Local embedder · Qwen3-VL-Embedding-2B";
const STORED_REBUILD: ReindexPreview = { reindex: true, stored: { cards: 12, memory: 40, documents: 0, images: 3 }, embedCalls: 55, utilityModelSet: true };
const SWEEP_ITEM = /Use this connection for everything it can serve/u;

test("using an embedder for everything over a stored index asks first, and Cancel writes nothing", async ({ mount, page }) => {
  const recorder = await stubConnectionsPane(page, { connections: [EMBEDDER_ROW], reindexPreview: STORED_REBUILD });
  await mount(<ConnectionsAuthoringStory width={870} />);

  await openRowMenu(page, EMBEDDER_ROW_NAME);
  await page.getByRole("menuitem", { name: SWEEP_ITEM }).click();

  const confirm = page.getByRole("alertdialog", { name: REINDEX_CONFIRM_COPY.title });
  await expect(confirm.getByText(reindexConfirmDescription(STORED_REBUILD), { exact: true })).toBeVisible();
  await expect
    .poll(() => recorder.lastInput("connection.embedSpaceChangePreview"), { intervals: [20, 50, 100] })
    .toEqual({ change: { kind: "everywhere", connectionId: EMBEDDER_ROW.id } });
  await confirm.getByRole("button", { name: "Cancel" }).click();

  await expect(confirm).toHaveCount(0);
  await expect.poll(() => recorder.count("connection.useForEverything"), { intervals: [20, 50, 100] }).toBe(0);
});

test("confirming the rebuild uses the embedder for everything once", async ({ mount, page }) => {
  const recorder = await stubConnectionsPane(page, { connections: [EMBEDDER_ROW], reindexPreview: STORED_REBUILD });
  await mount(<ConnectionsAuthoringStory width={870} />);

  await openRowMenu(page, EMBEDDER_ROW_NAME);
  await page.getByRole("menuitem", { name: SWEEP_ITEM }).click();
  await page.getByRole("alertdialog", { name: REINDEX_CONFIRM_COPY.title }).getByRole("button", { name: REINDEX_CONFIRM_COPY.confirmLabel }).click();

  await expect.poll(() => recorder.lastInput("connection.useForEverything"), { intervals: [20, 50, 100] }).toEqual({ connectionId: EMBEDDER_ROW.id });
  await expect.poll(() => recorder.count("connection.useForEverything"), { intervals: [20, 50, 100] }).toBe(1);
});

test("using a chat-only row for everything writes straight through without a preview", async ({ mount, page }) => {
  const recorder = await stubConnectionsPane(page, { connections: [connectionRow()], reindexPreview: STORED_REBUILD });
  await mount(<ConnectionsAuthoringStory width={870} />);

  await openRowMenu(page, "OpenRouter · Claude Opus 5");
  await page.getByRole("menuitem", { name: SWEEP_ITEM }).click();

  await expect.poll(() => recorder.count("connection.useForEverything"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => recorder.count("connection.embedSpaceChangePreview"), { intervals: [20, 50, 100] }).toBe(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});
