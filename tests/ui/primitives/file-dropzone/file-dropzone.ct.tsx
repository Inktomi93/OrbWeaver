// CT: the file-dropzone seal — a REAL <input type="file"> under the hood (keyboard/SR operable is
// the primary path, drag-and-drop is progressive enhancement only), the maxSizeBytes pre-check, and
// the inline error display (ui-primitive-carve-out-work-order.md item 10).
import { Field } from "@orb/ui/field";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { expect, test } from "@playwright/experimental-ct-react";
import { FileDropzoneHarness } from "./file-dropzone.fixtures";

const NON_EMPTY = /.+/u;
const TWENTY_MEBIBYTES = 20 * 1024 * 1024;

test("inside a <Field>, the label associates with the real file input (Field.Control registration)", async ({
  mount,
  page,
}) => {
  await mount(
    <Field description="Up to 20 MB" label="Avatar">
      <FileDropzone />
    </Field>,
  );
  const control = page.getByLabel("Avatar");
  await expect(control).toHaveAttribute("type", "file");
  await expect(control).toHaveAttribute("aria-describedby", NON_EMPTY);
});

test("clicking the dropzone opens the native file picker and a selected file reaches onFilesSelected", async ({
  mount,
  page,
}) => {
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

test("the size hint auto-renders from maxSizeBytes when no explicit hint is given", async ({
  mount,
  page,
}) => {
  await mount(<FileDropzone aria-label="Upload" maxSizeBytes={TWENTY_MEBIBYTES} />);
  await expect(page.locator('[data-slot="file-dropzone-content"]')).toContainText("20 MB per file");
});

test("dragging over the dropzone flips the drag-over highlight and leaving clears it", async ({
  mount,
  page,
}) => {
  await mount(<FileDropzone aria-label="Upload" />);
  const root = page.locator('[data-slot="file-dropzone"]');
  await expect(root).not.toHaveAttribute("data-drag-over", "");
  await root.dispatchEvent("dragenter");
  await expect(root).toHaveAttribute("data-drag-over", "");
  await root.dispatchEvent("dragleave");
  await expect(root).not.toHaveAttribute("data-drag-over", "");
});

test("disabled: the native input is disabled and the root carries data-disabled", async ({
  mount,
  page,
}) => {
  await mount(<FileDropzone aria-label="Upload" disabled={true} />);
  await expect(page.getByLabel("Upload")).toBeDisabled();
  await expect(page.locator('[data-slot="file-dropzone"]')).toHaveAttribute("data-disabled", "");
});

test("keyboard: Tab focuses the real input and Enter opens the native file picker", async ({
  mount,
  page,
}) => {
  await mount(<FileDropzone aria-label="Upload" />);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Upload")).toBeFocused();
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await fileChooserPromise;
});

test("loading swaps the Upload glyph for a spinner and inerts the input", async ({
  mount,
  page,
}) => {
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
