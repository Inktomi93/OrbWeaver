// CT: the bound avatar field owns async upload completion. The FileDropzone inerts ordinary input while
// loading, but programmatic callback re-entry can still overlap two requests; only the newest request may
// commit the form identity/preview after completions arrive out of order.

import { expect, test } from "@playwright/experimental-ct-react";
import { AvatarUploadEpochStory } from "./_ct-stories.tsx";

const ONE_PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

async function dispatchFile(input: import("@playwright/test").Locator, name: string): Promise<void> {
  await input.evaluate((element, filename) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([filename], filename, { type: "image/png" }));
    Object.defineProperty(element, "files", { configurable: true, value: transfer.files });
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, name);
}

async function paintedBarrier(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

// The REAL bound-Field mount of the #1660 naming seam (the primitive's own three arms are pinned in
// `tests/ui/primitives/file-dropzone/file-dropzone.ct.tsx`). This site is the one that regresses if the
// dropzone ever self-names UNCONDITIONALLY: the field's whole job is to put the form's label on the
// control, and a `<Field>`-supplied name arrives through the SAME `aria-labelledby` the fallback uses.
test("the bound field's label is what the file input announces, not the dropzone's instruction line", async ({ mount }) => {
  const story = await mount(<AvatarUploadEpochStory />);
  await expect(story.getByLabel("Portrait", { exact: true })).toHaveAttribute("data-slot", "file-dropzone-input");
  await expect(story.getByLabel("Drag and drop, or click to browse", { exact: true })).toHaveCount(0);
  // …and the NAME surviving is not enough (#1679): `Field.Label` also emits a native `<label for>`, so the
  // name holds even when Base UI's own `aria-labelledby` has been clobbered away. Pin the attribute too.
  await expect(story.locator('[data-slot="file-dropzone-input"]')).toHaveAttribute("aria-labelledby", /^base-ui-/u);
});

test("an older upload completion cannot overwrite the newer avatar identity or preview", async ({ mount, page }) => {
  await page.route("**/api/blob/**", (route) => route.fulfill({ contentType: "image/png", body: ONE_PIXEL_PNG }));
  const story = await mount(<AvatarUploadEpochStory />);
  const input = story.locator('[data-slot="file-dropzone-input"]');

  await dispatchFile(input, "old.png");
  await dispatchFile(input, "new.png");

  await story.getByRole("button", { name: "Resolve new upload" }).click();
  await expect(story.getByTestId("avatar-asset-id")).toHaveText("asset_seed_new");
  await expect(story.locator('[data-slot="avatar-image"]')).toHaveAttribute("src", "/api/blob/new-hash");

  await story.getByRole("button", { name: "Resolve old upload" }).click();
  await paintedBarrier(page);

  await expect(story.getByTestId("avatar-asset-id")).toHaveText("asset_seed_new");
  await expect(story.locator('[data-slot="avatar-image"]')).toHaveAttribute("src", "/api/blob/new-hash");
});
