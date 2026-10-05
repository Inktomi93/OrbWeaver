import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { dropFiles } from "../../../../support/browser/drop-files.ts";
import { characterListResponder, makeCharacterSummary } from "../../character/fixtures.ts";
import { CHAT_ROOM_ROUTES } from "../../chat/fixtures.ts";
import { DatabankListHeaderStory } from "../_ct-stories.tsx";
import { READY_DOC, stubDatabank } from "../fixtures.ts";

const EFFECTIVE_CAP_BYTES = 2 * 1024 * 1024;
const FORMAT_DESCRIPTION = /Supported formats:.*PDF.*Markdown.*Plain text.*Word document.*EPUB book/u;
const DOCUMENT_ID = mintTypeId(ID_PREFIX.document);

for (const mode of ["Upload a file", "Paste text", "From a link"]) {
  test(`${mode} offers an explicit shared destination defaulting to Every chat`, async ({ mount, page }) => {
    await stubDatabank(page);
    const band = await mount(<DatabankListHeaderStory />);
    await band.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: mode, exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Every chat", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("button", { name: "This character", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "This chat", exact: true })).toBeVisible();
  });
}

for (const mimeType of ["text/html", "application/javascript", "image/png"]) {
  for (const feeder of ["picker", "drop"] as const) {
    test(`${feeder} refuses a Markdown suffix with explicit ${mimeType} before uploading`, async ({ mount, page }) => {
      await stubDatabank(page);
      await page.route("**/api/auth/config", async (route) => {
        await route.fulfill({ json: { uploads: { ...DEFAULT_UPLOAD_CAPS, databankUpload: EFFECTIVE_CAP_BYTES } } });
      });
      const uploads: string[] = [];
      await page.route("**/api/databank/upload", async (route) => {
        uploads.push(route.request().postData() ?? "");
        await route.fulfill({
          json: { document: { ...READY_DOC, id: DOCUMENT_ID, name: "good.md", mime: "text/markdown" }, outcome: "created", ingest: "queued" },
        });
      });
      const band = await mount(<DatabankListHeaderStory />);
      await band.getByRole("button", { name: "Add", exact: true }).click();
      const dialog = page.getByRole("dialog");
      const dropzone = dialog.locator('[data-slot="file-dropzone"]');
      const input = dialog.getByLabel("File", { exact: true });
      await expect(input).toHaveAccessibleDescription(FORMAT_DESCRIPTION);
      const guide = dialog.locator('[data-slot="field-description"]');
      await expect(guide).toBeVisible();
      await expect(guide).toContainText("Word document (.docx)");
      await expect(dropzone.locator('[data-slot="file-dropzone-content"]')).toContainText("Up to 2 MB per file");
      if (feeder === "picker") {
        const chooserPromise = page.waitForEvent("filechooser");
        await dropzone.click();
        const chooser = await chooserPromise;
        await chooser.setFiles({ buffer: Buffer.from("content"), mimeType, name: "conflicting.md" });
      } else {
        await dropFiles(dropzone, [{ name: "conflicting.md", mimeType, content: "content" }]);
      }
      await expect(dialog.getByRole("alert")).toContainText("conflicting.md isn't an accepted file type");
      expect(uploads).toEqual([]);
      await expect(input).toHaveAccessibleDescription(FORMAT_DESCRIPTION);
      await dropFiles(dropzone, [{ name: "good.md", mimeType: "", content: "# Notes" }]);
      await expect(dialog).toBeHidden();
      expect(uploads).toHaveLength(1);
      expect(uploads[0]).toContain('filename="good.md"');
      expect(uploads[0]).toContain('{"kind":"global"}');
    });
  }
}

test("paste uses the selected owned character rather than the default global destination", async ({ mount, page }) => {
  const characterId = mintTypeId(ID_PREFIX.character);
  const routes = await stubDatabank(page, {
    "character.list": characterListResponder([makeCharacterSummary({ id: characterId, name: "Chosen character" })]),
    "databank.createFromText": () => ({ document: { ...READY_DOC, id: DOCUMENT_ID }, outcome: "created", ingest: "queued" }),
  });
  const band = await mount(<DatabankListHeaderStory />);
  await band.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Paste text", exact: true }).click();
  await dialog.getByRole("button", { name: "This character", exact: true }).click();
  await dialog.getByRole("option", { name: "Chosen character" }).click();
  await dialog.getByLabel("Name", { exact: true }).fill("Notes");
  await dialog.getByLabel("Text", { exact: true }).fill("Chosen lore");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => routes.lastInput("databank.createFromText"))
    .toEqual({ name: "Notes", text: "Chosen lore", destination: { kind: "character", characterId } });
});

test("link uses the current hosted chat destination", async ({ mount, page }) => {
  const chatId = mintTypeId(ID_PREFIX.chat);
  const routes = await stubDatabank(page, {
    "chat.getChat": CHAT_ROOM_ROUTES["chat.getChat"],
    "databank.scrapeWeb": () => ({ document: { ...READY_DOC, id: DOCUMENT_ID }, outcome: "created", ingest: "queued" }),
  });
  const band = await mount(<DatabankListHeaderStory chatId={chatId} />);
  await band.getByRole("button", { name: "Open test chat", exact: true }).click();
  await band.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "From a link", exact: true }).click();
  await dialog.getByRole("button", { name: "This chat", exact: true }).click();
  await dialog.getByLabel("Link", { exact: true }).fill("https://example.org/notes");
  await dialog.getByRole("button", { name: "Fetch and add", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => routes.lastInput("databank.scrapeWeb")).toEqual({ url: "https://example.org/notes", destination: { kind: "chat", chatId } });
});

test.describe("phone mode layout", () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test("every mode fits the phone dialog and stays reachable without horizontal scrolling", async ({ mount, page }) => {
    await stubDatabank(page);
    const band = await mount(<DatabankListHeaderStory />);
    await band.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const upload = dialog.getByRole("button", { name: "Upload a file", exact: true });
    await expect(upload).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByLabel("File", { exact: true })).toHaveAccessibleDescription(FORMAT_DESCRIPTION);
    await expect(dialog.locator('[data-slot="field-description"]')).toBeVisible();
    await expect
      .poll(() =>
        dialog.evaluate((el) => {
          const body = el.querySelector(':scope > div[tabindex="-1"]');
          if (!(body instanceof HTMLElement)) {
            throw new Error("modal scrolling body missing");
          }
          const bodyRect = body.getBoundingClientRect();
          const labels = ["Upload a file", "Paste text", "From a link"];
          const modes = [...el.querySelectorAll("button")].filter((button) => labels.includes(button.textContent?.trim() ?? ""));
          const clipped = modes
            .filter((button) => {
              const box = button.getBoundingClientRect();
              return box.left < bodyRect.left || box.right > bodyRect.right;
            })
            .map((button) => button.textContent?.trim());
          return { count: modes.length, overflow: body.scrollWidth - body.clientWidth, clipped };
        }),
      )
      .toEqual({ count: 3, overflow: 0, clipped: [] });

    const ys: number[] = [];
    for (const label of ["Paste text", "From a link", "Upload a file"]) {
      const mode = dialog.getByRole("button", { name: label, exact: true });
      await expect(mode).toBeVisible();
      await mode.click();
      await expect(mode).toHaveAttribute("aria-pressed", "true");
      ys.push((await upload.boundingBox())?.y ?? Number.NaN);
    }
    expect(ys.some(Number.isNaN)).toBe(false);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
    await expect(dialog.getByLabel("File", { exact: true })).toHaveAccessibleDescription(FORMAT_DESCRIPTION);
  });
});
