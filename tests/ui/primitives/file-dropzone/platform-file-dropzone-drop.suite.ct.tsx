// The dropzone decides `accept` itself, per file, for both a drop and the picker: the native attribute filters only the OS dialog.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { DropAcceptStory } from "./_drop-accept-stories.tsx";

const STORY = "tests/ui/primitives/file-dropzone/_drop-accept-stories/DropAcceptStory";

interface SampleFile {
  readonly name: string;
  readonly type: string;
  readonly size?: number;
}

interface Batch {
  readonly accepted: readonly string[];
  readonly rejected: readonly { readonly name: string; readonly reason: string }[];
}

async function dropEvent(zone: Locator, type: "dragenter" | "dragover" | "dragleave" | "drop", files: readonly SampleFile[]): Promise<void> {
  const transfer = await zone.page().evaluateHandle((samples) => {
    const dataTransfer = new DataTransfer();
    for (const sample of samples) {
      dataTransfer.items.add(new File([new Uint8Array(sample.size ?? 1)], sample.name, { type: sample.type }));
    }
    return dataTransfer;
  }, files);
  await zone.dispatchEvent(type, { dataTransfer: transfer });
}

async function batches(page: Page): Promise<readonly Batch[]> {
  const text = await page.locator('[data-slot="batches"]').textContent();
  return JSON.parse(text ?? "[]") as readonly Batch[];
}

async function zoneOf(component: Locator): Promise<Locator> {
  const zone = component.locator('[data-slot="file-dropzone"]');
  await expect(zone).toBeVisible();
  return zone;
}

test("a drop admits each file against the accept tokens: family, exact MIME and filename suffix", async ({ mount, page }) => {
  const zone = await zoneOf(await mount<typeof DropAcceptStory>(STORY, { accept: "image/*,application/pdf,.jsonl", multiple: true }));
  await dropEvent(zone, "drop", [
    { name: "portrait.png", type: "image/png" },
    { name: "scan.pdf", type: "application/pdf" },
    // The browser recognises no MIME for `.jsonl`; the suffix token alone admits it.
    { name: "chat.jsonl", type: "" },
    { name: "notes.txt", type: "text/plain" },
    // An empty MIME can never satisfy a MIME token.
    { name: "mystery", type: "" },
  ]);
  expect(await batches(page)).toEqual([
    {
      accepted: ["portrait.png", "scan.pdf", "chat.jsonl"],
      rejected: [
        { name: "notes.txt", reason: "type" },
        { name: "mystery", reason: "type" },
      ],
    },
  ]);
  await expect(zone.getByRole("alert")).toBeVisible();
});

test("a single-file zone takes the first admissible file of a batch, not the first file", async ({ mount, page }) => {
  const zone = await zoneOf(await mount<typeof DropAcceptStory>(STORY, { accept: ".zip" }));
  await dropEvent(zone, "drop", [
    { name: "readme.txt", type: "text/plain" },
    { name: "backup.zip", type: "application/zip" },
    { name: "other.zip", type: "application/zip" },
  ]);
  expect(await batches(page)).toEqual([{ accepted: ["backup.zip"], rejected: [{ name: "readme.txt", reason: "type" }] }]);
});

test("an oversize file is refused for size while its siblings are kept", async ({ mount, page }) => {
  const zone = await zoneOf(await mount<typeof DropAcceptStory>(STORY, { multiple: true, maxSizeBytes: 10 }));
  await dropEvent(zone, "drop", [
    { name: "small.bin", type: "application/octet-stream", size: 4 },
    { name: "large.bin", type: "application/octet-stream", size: 64 },
  ]);
  expect(await batches(page)).toEqual([{ accepted: ["small.bin"], rejected: [{ name: "large.bin", reason: "size" }] }]);
});

test("the picker feeds the same gate as a drop", async ({ mount, page }) => {
  const zone = await zoneOf(await mount<typeof DropAcceptStory>(STORY, { accept: "image/*", multiple: true }));
  await zone.locator('input[type="file"]').setInputFiles([
    { name: "ok.png", mimeType: "image/png", buffer: Buffer.from([1]) },
    { name: "no.txt", mimeType: "text/plain", buffer: Buffer.from([1]) },
  ]);
  await expect.poll(() => batches(page)).toEqual([{ accepted: ["ok.png"], rejected: [{ name: "no.txt", reason: "type" }] }]);
});

test("the drag-over highlight follows enter and leave, and a drop clears it", async ({ mount }) => {
  const zone = await zoneOf(await mount<typeof DropAcceptStory>(STORY, {}));
  await expect(zone).not.toHaveAttribute("data-drag-over", /.*/);
  await dropEvent(zone, "dragenter", [{ name: "a.txt", type: "text/plain" }]);
  await expect(zone).toHaveAttribute("data-drag-over", "");
  await dropEvent(zone, "dragleave", [{ name: "a.txt", type: "text/plain" }]);
  await expect(zone).not.toHaveAttribute("data-drag-over", /.*/);
  await dropEvent(zone, "dragenter", [{ name: "a.txt", type: "text/plain" }]);
  await dropEvent(zone, "drop", [{ name: "a.txt", type: "text/plain" }]);
  await expect(zone).not.toHaveAttribute("data-drag-over", /.*/);
});

const INERT_ZONES = [
  { state: "disabled", props: { disabled: true }, marker: "data-disabled" },
  { state: "loading", props: { loading: true }, marker: "data-loading" },
] as const;

for (const { state, props, marker } of INERT_ZONES) {
  test(`a ${state} zone ignores a drop`, async ({ mount, page }) => {
    const zone = await zoneOf(await mount<typeof DropAcceptStory>(STORY, props));
    await expect(zone).toHaveAttribute(marker, "");
    await dropEvent(zone, "dragenter", [{ name: "a.txt", type: "text/plain" }]);
    await expect(zone).not.toHaveAttribute("data-drag-over", /.*/);
    await dropEvent(zone, "drop", [{ name: "a.txt", type: "text/plain" }]);
    expect(await batches(page)).toEqual([]);
  });
}
