// The dropzone decides `accept` itself, per file, for both a drop and the picker: the native attribute filters only the OS dialog.

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { z } from "zod";
import type { DropAcceptStory, DropBatch } from "./_drop-accept-stories.tsx";

const STORY = "tests/ui/primitives/file-dropzone/_drop-accept-stories/DropAcceptStory";

interface SampleFile {
  readonly name: string;
  readonly type: string;
  readonly size?: number;
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

// The log crosses the page as JSON; its reader is pinned to the story's batch type, whose reasons are the dropzone's own.
const BATCH = z.object({
  accepted: z.array(z.string()),
  rejected: z.array(z.object({ name: z.string(), reason: z.enum(["size", "type"]) })),
}) satisfies z.ZodType<DropBatch>;

async function batches(page: Page): Promise<readonly DropBatch[]> {
  const text = await page.locator('[data-slot="batches"]').textContent();
  return z.array(BATCH).parse(JSON.parse(text ?? "[]"));
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

test("a refusal by the zone itself marks the control invalid until a pick it accepts clears the line", async ({ mount }) => {
  const component = await mount<typeof DropAcceptStory>(STORY, { accept: "image/*" });
  const zone = await zoneOf(component);
  const control = zone.locator('input[type="file"]');
  await expect(control).not.toHaveAttribute("aria-invalid", /.*/);
  await control.setInputFiles({ name: "no.txt", mimeType: "text/plain", buffer: Buffer.from([1]) });
  await expect(zone.getByRole("alert")).toBeVisible();
  await expect(control).toHaveAttribute("aria-invalid", "true");
  await control.setInputFiles({ name: "ok.png", mimeType: "image/png", buffer: Buffer.from([1]) });
  await expect(zone.getByRole("alert")).toHaveCount(0);
  await expect(control).not.toHaveAttribute("aria-invalid", /.*/);
});

test("a refusal the zone says itself is described to the control, so a return to the invalid zone hears why", async ({ mount }) => {
  const zone = await zoneOf(await mount<typeof DropAcceptStory>(STORY, { accept: "image/*" }));
  const control = zone.locator('input[type="file"]');
  // The control: a zone with nothing refused describes nothing.
  await expect(control).not.toHaveAttribute("aria-describedby", /.*/);
  await control.setInputFiles({ name: "no.txt", mimeType: "text/plain", buffer: Buffer.from([1]) });
  const line = zone.getByRole("alert");
  await expect(line).toBeVisible();
  const lineId = await line.getAttribute("id");
  expect(lineId).not.toBeNull();
  const described = (await control.getAttribute("aria-describedby")) ?? "";
  expect(described.split(" ")).toContain(lineId);
});

test("the refusal line takes the press, not the covering file input, so its text can be selected", async ({ mount }) => {
  const zone = await zoneOf(await mount<typeof DropAcceptStory>(STORY, { accept: "image/*" }));
  await zone.locator('input[type="file"]').setInputFiles({ name: "no.txt", mimeType: "text/plain", buffer: Buffer.from([1]) });
  const line = zone.getByRole("alert");
  await expect(line).toBeVisible();
  // An unpolled read of what sits at the line's centre.
  const lineOwnsItsCentre = await line.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit !== null && node.contains(hit);
  });
  expect(lineOwnsItsCentre).toBe(true);
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
    const component = await mount<typeof DropAcceptStory>(STORY, props);
    const zone = await zoneOf(component);
    await expect(zone).toHaveAttribute(marker, "");
    await dropEvent(zone, "dragenter", [{ name: "a.txt", type: "text/plain" }]);
    await expect(zone).not.toHaveAttribute("data-drag-over", /.*/);
    await dropEvent(zone, "drop", [{ name: "a.txt", type: "text/plain" }]);
    expect(await batches(page)).toEqual([]);
    // The control: the same mount with the zone live again takes the same drop.
    await component.update({});
    await expect(zone).not.toHaveAttribute(marker, /.*/);
    await dropEvent(zone, "drop", [{ name: "a.txt", type: "text/plain" }]);
    await expect.poll(() => batches(page)).toEqual([{ accepted: ["a.txt"], rejected: [] }]);
  });
}
