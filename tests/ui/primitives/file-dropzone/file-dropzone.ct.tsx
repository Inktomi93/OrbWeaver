// CT: the file-dropzone seal — a REAL <input type="file"> under the hood (keyboard/SR operable is
// the primary path, drag-and-drop is progressive enhancement only), the maxSizeBytes pre-check, and
// the inline error display (ui-primitive-carve-out-work-order.md item 10).
import { Field } from "@orb/ui/field";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { expect, test } from "@playwright/experimental-ct-react";
import { dropFiles } from "../../../support/ct/drop-files";
import { FileDropzoneHarness } from "./file-dropzone.fixtures";

const NON_EMPTY = /.+/u;
const TWENTY_MEBIBYTES = 20 * 1024 * 1024;
const DROPZONE_ROOT = '[data-slot="file-dropzone"]';
const A_CARD = { name: "villain.png", mimeType: "image/png", content: "PNG" };
const A_SECOND_CARD = { name: "hero.png", mimeType: "image/png", content: "PNG2" };

test("inside a <Field>, the label associates with the real file input (Field.Control registration)", async ({ mount, page }) => {
  await mount(
    <Field description="Up to 20 MB" label="Avatar">
      <FileDropzone />
    </Field>,
  );
  const control = page.getByLabel("Avatar");
  await expect(control).toHaveAttribute("type", "file");
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});

test("clicking the dropzone opens the native file picker and a selected file reaches onFilesSelected", async ({ mount, page }) => {
  await mount(<FileDropzoneHarness />);
  const fileChooserPromise = page.waitForEvent("filechooser");
  // Clicking ANYWHERE in the box hits the real input — it covers the full dropzone.
  await page.locator('[data-slot="file-dropzone"]').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    buffer: Buffer.from("hi"),
    mimeType: "image/png",
    name: "avatar.png",
  });
  await expect(page.getByTestId("accepted-names")).toContainText("avatar.png");
});

test("a file over maxSizeBytes is rejected and the error is announced", async ({ mount, page }) => {
  const results: { accepted: number; rejected: number }[] = [];
  await mount(
    <FileDropzone
      aria-label="Upload"
      maxSizeBytes={10}
      onFilesSelected={({ accepted, rejected }): void => {
        results.push({ accepted: accepted.length, rejected: rejected.length });
      }}
    />,
  );
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator('[data-slot="file-dropzone"]').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    buffer: Buffer.from("this payload is well over ten bytes"),
    mimeType: "text/plain",
    name: "too-big.txt",
  });
  // Wait on the real DOM consequence (the rendered error alert) instead of polling the JS callback
  // array — `onFilesSelected` and the alert render land in the same synchronous state update.
  const error = page.getByRole("alert");
  await expect(error).toBeVisible();
  await expect(error).toContainText("too-big.txt");
  await expect(error).toContainText("exceeds");
  expect(results).toEqual([{ accepted: 0, rejected: 1 }]);
});

test("the size hint auto-renders from maxSizeBytes when no explicit hint is given", async ({ mount, page }) => {
  await mount(<FileDropzone aria-label="Upload" maxSizeBytes={TWENTY_MEBIBYTES} />);
  await expect(page.locator('[data-slot="file-dropzone-content"]')).toContainText("20 MB per file");
});

test("dragging over the dropzone flips the drag-over highlight and leaving clears it", async ({ mount, page }) => {
  await mount(<FileDropzone aria-label="Upload" />);
  const root = page.locator('[data-slot="file-dropzone"]');
  await expect(root).not.toHaveAttribute("data-drag-over", "");
  await root.dispatchEvent("dragenter");
  await expect(root).toHaveAttribute("data-drag-over", "");
  await root.dispatchEvent("dragleave");
  await expect(root).not.toHaveAttribute("data-drag-over", "");
});

// ── The DROP feeder (the P1: a dropped card used to vanish) ────────────────────────────────────────
// `preventDefault` on the drop is mandatory (else the browser navigates away to the file) and it also
// cancels the covering input's native file-accept — so the handler must read `dataTransfer.files`
// itself. Measured in Chromium with a trusted CDP drag: with the old code the ancestor saw the file and
// the input never fired `change`, i.e. the drop was silently swallowed. These drive the real drop path.

test("dropping a file delivers it to onFilesSelected (the drop is handled, not left to the input)", async ({ mount, page }) => {
  await mount(<FileDropzoneHarness />);
  await dropFiles(page.locator(DROPZONE_ROOT), [A_CARD]);
  await expect(page.getByTestId("accepted-names")).toContainText("villain.png");
  // …and the drop clears the drag-over highlight the dragenter set.
  await expect(page.locator(DROPZONE_ROOT)).not.toHaveAttribute("data-drag-over", "");
});

test("a multi-file drop on a multiple zone delivers every file", async ({ mount, page }) => {
  await mount(<FileDropzoneHarness multiple={true} />);
  await dropFiles(page.locator(DROPZONE_ROOT), [A_CARD, A_SECOND_CARD]);
  const names = page.getByTestId("accepted-names");
  await expect(names).toContainText("villain.png");
  await expect(names).toContainText("hero.png");
});

test("a multi-file drop on a single-file zone takes only the first (its picker can't hand back more)", async ({ mount, page }) => {
  await mount(<FileDropzoneHarness />);
  await dropFiles(page.locator(DROPZONE_ROOT), [A_CARD, A_SECOND_CARD]);
  const names = page.getByTestId("accepted-names");
  await expect(names).toContainText("villain.png");
  await expect(names).not.toContainText("hero.png");
});

test("a DROPPED file over maxSizeBytes hits the same size pre-check as a picked one", async ({ mount, page }) => {
  await mount(<FileDropzoneHarness maxSizeBytes={2} />);
  await dropFiles(page.locator(DROPZONE_ROOT), [A_CARD]);
  const error = page.getByRole("alert");
  await expect(error).toBeVisible();
  await expect(error).toContainText("villain.png");
  await expect(page.getByTestId("accepted-names")).not.toContainText("villain.png");
});

test("disabled: the native input is disabled and the root carries data-disabled", async ({ mount, page }) => {
  await mount(<FileDropzone aria-label="Upload" disabled={true} />);
  await expect(page.getByLabel("Upload")).toBeDisabled();
  await expect(page.locator('[data-slot="file-dropzone"]')).toHaveAttribute("data-disabled", "");
});

test("keyboard: Tab focuses the real input and Enter opens the native file picker", async ({ mount, page }) => {
  await mount(<FileDropzone aria-label="Upload" />);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Upload")).toBeFocused();
  // Chromium drops the FIRST Enter->activate on a freshly-mounted+focused file input under parallel
  // scheduler load: the key event fires and focus stays on the input, but the native picker's
  // default-action isn't wired yet, so no `filechooser` (confirmed — a second Enter always opens it;
  // a real user's post-Tab keypress is never this tight). Poll the activation until the picker fires
  // instead of betting on a single keypress — this still proves Enter (never click) opens it.
  let opened = false;
  const fileChooserPromise = page.waitForEvent("filechooser").then(() => {
    opened = true;
  });
  await expect
    .poll(async () => {
      if (!opened) {
        await page.keyboard.press("Enter");
      }
      return opened;
    })
    .toBe(true);
  await fileChooserPromise;
});

test("loading swaps the Upload glyph for a spinner and inerts the input", async ({ mount, page }) => {
  await mount(<FileDropzone aria-label="Upload" loading={true} />);
  const root = page.locator('[data-slot="file-dropzone"]');
  await expect(root).toHaveAttribute("data-loading", "");
  await expect(page.getByLabel("Upload")).toBeDisabled();
  await expect(root.getByRole("status")).toBeVisible();
});

test("success shows a checkmark glyph and the success border token", async ({ mount, page }) => {
  await mount(<FileDropzone aria-label="Upload" success={true} />);
  const root = page.locator('[data-slot="file-dropzone"]');
  await expect(root).toHaveAttribute("data-success", "");
});
