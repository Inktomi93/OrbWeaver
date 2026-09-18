// CT: the file-dropzone seal — a REAL <input type="file"> under the hood (keyboard/SR operable is
// the primary path, drag-and-drop is progressive enhancement only), the maxSizeBytes pre-check, and
// the inline error display (the retired ui-primitive-carve-out-work-order plan item 10).
import { Field } from "@orb/ui/field";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { expect, test } from "@playwright/experimental-ct-react";
import { dropFiles } from "../../../support/browser/drop-files.ts";
import { FileDropzoneHarness } from "./file-dropzone.fixtures.tsx";

const NON_EMPTY = /.+/u;
const TWENTY_MEBIBYTES = 20 * 1024 * 1024;
const DROPZONE_ROOT = '[data-slot="file-dropzone"]';
const A_CARD = { name: "villain.png", mimeType: "image/png", content: "PNG" };
const A_SECOND_CARD = { name: "hero.png", mimeType: "image/png", content: "PNG2" };
// The character-import dialog's real vocabulary (`CARD_ACCEPT`) — suffix AND exact-MIME tokens in one list.
const CARD_ACCEPT = ".png,.json,image/png,application/json";
const A_SCRIPT = { name: "payload.exe", mimeType: "application/x-msdownload", content: "MZ" };
// A transcript the browser recognizes no MIME for (the common `.jsonl`/`.orb.json` case) — only a suffix
// token can admit it, and the double extension is why suffix matching is a TAIL test, not a split-on-dot.
const A_TRANSCRIPT = { name: "session.orb.json", mimeType: "", content: "{}" };

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

// ── THE ACCESSIBLE NAME (#1660) ─────────────────────────────────
// The real control is an `opacity-0 inset-0 size-full` file input: the PIXELS are this primitive's copy
// while the NAME was the UA's own "Choose File" wherever nothing else named it — the character / chat /
// preset import dialogs, i.e. every door a screen-reader user reaches for to get content in. The fix is a
// FALLBACK, and the ordering is the whole design, so all three arms are pinned: the caller's own name and
// a wrapping `<Field>`'s label both outrank the primitive's, because an unconditional self-name would
// SHADOW them (accname ranks `aria-labelledby` over `aria-label`, and Base UI's `Field.Control` writes the
// Field label through that same attribute).
//
// The fallback points at the instruction NODE rather than copying the string into an `aria-label`, so
// WCAG 2.5.3 (the visible label is contained in the name) holds by construction instead of by discipline.

test("with nothing else labelling it, the input announces its own instruction line, not the UA default", async ({ mount, page }) => {
  await mount(<FileDropzone instructions="Drop a preset .json, or click to browse" />);
  await expect(page.getByLabel("Drop a preset .json, or click to browse", { exact: true })).toHaveAttribute("data-slot", "file-dropzone-input");
});

test("a caller's own aria-label outranks the instruction fallback (the plugin/backup zones keep their names)", async ({ mount, page }) => {
  await mount(<FileDropzone aria-label="Choose a plugin bundle" instructions="Drop a plugin bundle" />);
  await expect(page.getByLabel("Choose a plugin bundle", { exact: true })).toHaveAttribute("data-slot", "file-dropzone-input");
  await expect(page.getByLabel("Drop a plugin bundle", { exact: true })).toHaveCount(0);
});

test("inside a Field the Field's label still wins — the instruction fallback never shadows it", async ({ mount, page }) => {
  await mount(
    <Field label="Avatar">
      <FileDropzone instructions="Drag and drop, or click to browse" />
    </Field>,
  );
  await expect(page.getByLabel("Avatar", { exact: true })).toHaveAttribute("data-slot", "file-dropzone-input");
  await expect(page.getByLabel("Drag and drop, or click to browse", { exact: true })).toHaveCount(0);
});

test("inside a Field the input keeps Base UI's OWN aria-labelledby — the fallback must not clobber the attribute", async ({ mount, page }) => {
  await mount(
    <Field label="Avatar">
      <FileDropzone instructions="Drag and drop, or click to browse" />
    </Field>,
  );
  // THE ATTRIBUTE, not the name (#1679). The name arm above is a FENCE for this regression and cannot
  // stand in for it: `Field.Label` defaults to `nativeLabel` and therefore also emits a real
  // `<label for>` (`@base-ui/react` 1.7 `internals/labelable-provider/useLabel.js` returns
  // `htmlFor: resolvedControlId` when `native`), so clobbering `aria-labelledby` to `undefined` leaves the
  // COMPUTED NAME intact and every name assertion green. Measured: with the `aria-labelledby={undefined}`
  // render-prop form planted, this pin reds (attribute absent) while the name pin above stays green.
  await expect(page.locator('[data-slot="file-dropzone-input"]')).toHaveAttribute("aria-labelledby", /^base-ui-/u);
});

test("an EMPTY instructions line mints no name of its own (an empty labelledby target is worse than the UA default)", async ({ mount, page }) => {
  await mount(<FileDropzone instructions="" />);
  await expect(page.locator('[data-slot="file-dropzone-input"]')).not.toHaveAttribute("aria-labelledby", /.+/u);
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

// ── The ACCEPT gate (#423) ─────────────────────────────────────────────────────────────────────────
// `accept` filters the OS DIALOG and nothing else, so before this the drop feeder took arbitrary bytes and
// every consumer's vocabulary (character cards, transcripts, presets, databank documents, avatars) was
// advisory on the gesture users actually reach for. The gate is PER FILE on both feeders: a mixed batch
// keeps its matching files instead of being refused wholesale, and a refusal is announced, never silent.

test("a DROPPED file outside accept is refused and announced (the picker dialog is not the gate)", async ({ mount, page }) => {
  await mount(<FileDropzoneHarness accept={CARD_ACCEPT} />);
  await dropFiles(page.locator(DROPZONE_ROOT), [A_SCRIPT]);
  const error = page.getByRole("alert");
  await expect(error).toBeVisible();
  await expect(error).toContainText("payload.exe");
  await expect(page.getByTestId("accepted-names")).not.toContainText("payload.exe");
});

test("a MIXED drop keeps every accepted file and refuses only the rest (never a wholesale rejection)", async ({ mount, page }) => {
  await mount(<FileDropzoneHarness accept={CARD_ACCEPT} multiple={true} />);
  await dropFiles(page.locator(DROPZONE_ROOT), [A_CARD, A_SCRIPT, A_SECOND_CARD]);
  const names = page.getByTestId("accepted-names");
  await expect(names).toContainText("villain.png");
  await expect(names).toContainText("hero.png");
  await expect(names).not.toContainText("payload.exe");
  await expect(page.getByRole("alert")).toContainText("payload.exe");
});

test("a suffix token matches a file the browser gave no MIME (a .json transcript drop still lands)", async ({ mount, page }) => {
  await mount(<FileDropzoneHarness accept=".jsonl,.json,application/x-ndjson,application/json" />);
  await dropFiles(page.locator(DROPZONE_ROOT), [A_TRANSCRIPT]);
  await expect(page.getByTestId("accepted-names")).toContainText("session.orb.json");
  await expect(page.getByRole("alert")).toBeHidden();
});

test("a family wildcard admits the whole MIME family and refuses outside it", async ({ mount, page }) => {
  await mount(<FileDropzoneHarness accept="image/*" multiple={true} />);
  await dropFiles(page.locator(DROPZONE_ROOT), [A_CARD, A_TRANSCRIPT]);
  const names = page.getByTestId("accepted-names");
  await expect(names).toContainText("villain.png");
  await expect(names).not.toContainText("session.orb.json");
});

test("the PICKER feeder obeys accept too — the two feeders take the same vocabulary", async ({ mount, page }) => {
  await mount(<FileDropzoneHarness accept={CARD_ACCEPT} />);
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator(DROPZONE_ROOT).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ buffer: Buffer.from("MZ"), mimeType: "application/x-msdownload", name: "payload.exe" });
  await expect(page.getByRole("alert")).toContainText("payload.exe");
  await expect(page.getByTestId("accepted-names")).not.toContainText("payload.exe");
});

test("a zone with no accept still takes anything (the attribute's own contract)", async ({ mount, page }) => {
  await mount(<FileDropzoneHarness />);
  await dropFiles(page.locator(DROPZONE_ROOT), [A_SCRIPT]);
  await expect(page.getByTestId("accepted-names")).toContainText("payload.exe");
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
