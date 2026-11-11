// A refused document upload is said in the upload zone's own alert line, in the copy module's sentence for the refusal's code, and
// the server's wording never reaches the person. Focus returns to the File control so the line is read and in view, one refusal
// shows at a time (the newest), and the dialog stays usable: the same drop can be retried and the other modes stay open.
// @subject packages/client/src/features/databank/components/add-document-body.tsx
import type { DocumentUploadRefusal } from "@orb/contracts/databank";
import { EXTRACTION_OP_CODES, ExtractionFailedError, ExtractionTooLargeError } from "@orb/contracts/extraction";
import { DATABANK_UPLOAD_ROUTE } from "@orb/contracts/uploads";
import { FONT_SCALE } from "@orb/kit/font-scale";
import { setRootFontScale, watchToastMounts } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { DOCUMENT_UPLOAD_FAILURE, DOCUMENT_UPLOAD_GENERAL_FAILURE } from "#client/features/databank/lib/databank-upload-copy.ts";
import type { AddDocumentStory } from "./_add-document-stories.tsx";

const STORY = "tests/client/features/databank/components/_add-document-stories/AddDocumentStory";
const UPLOAD_ROUTE = `**${DATABANK_UPLOAD_ROUTE}`;
const FILE_INPUT = 'input[type="file"]';
const REFUSAL_LINE = '[data-slot="file-dropzone-error"]';
const DIALOG_FOOTER = '[data-slot="dialog-footer"]';
const CLIENT_ACCEPTED_NAME = "ledger.txt";
// A name the zone's own type check refuses before any request is made.
const CLIENT_REFUSED_NAME = "roster.csv";

interface RefusalCase {
  readonly label: string;
  readonly status: number;
  /** The body the server sends; `null` is an empty body, as a body-limit belt answers. */
  readonly body: DocumentUploadRefusal | null;
  readonly shown: string;
}

const DAMAGED: RefusalCase = {
  label: "a damaged file",
  status: 400,
  body: { error: new ExtractionFailedError("docx").message, reason: EXTRACTION_OP_CODES.failed },
  shown: DOCUMENT_UPLOAD_FAILURE[EXTRACTION_OP_CODES.failed],
};

// The longest sentence the zone can show, so the case that most needs room is the one the short-viewport test uses.
const TOO_LARGE: RefusalCase = {
  label: "a file that unpacks past the size budget",
  status: 400,
  body: { error: new ExtractionTooLargeError("epub").message, reason: EXTRACTION_OP_CODES.tooLarge },
  shown: DOCUMENT_UPLOAD_FAILURE[EXTRACTION_OP_CODES.tooLarge],
};

const REFUSALS: readonly RefusalCase[] = [
  DAMAGED,
  TOO_LARGE,
  {
    label: "a type the server does not accept",
    status: 415,
    body: { error: "that document type is not accepted", reason: EXTRACTION_OP_CODES.unsupportedType },
    shown: DOCUMENT_UPLOAD_FAILURE[EXTRACTION_OP_CODES.unsupportedType],
  },
  { label: "a refusal that states no code", status: 413, body: null, shown: DOCUMENT_UPLOAD_GENERAL_FAILURE },
];

/** Answers every upload with `refusal` at the network edge and returns the count of requests that reached it. */
async function refuseUploads(page: Page, { status, body }: RefusalCase): Promise<() => number> {
  let sent = 0;
  await page.route(UPLOAD_ROUTE, (route) => {
    sent += 1;
    return route.fulfill(body === null ? { status } : { status, json: body });
  });
  return (): number => sent;
}

function drop(page: Page, name: string, mimeType = "text/plain"): Promise<void> {
  return page.locator(FILE_INPUT).setInputFiles({ name, mimeType, buffer: Buffer.from("The lantern.") });
}

async function pickThroughChooser(page: Page, name: string): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.locator(FILE_INPUT).click();
  await (await chooser).setFiles({ name, mimeType: "text/plain", buffer: Buffer.from("The lantern.") });
}

for (const refusal of REFUSALS) {
  const { label, shown } = refusal;
  test(`${label} is said once in the upload zone's alert line, focus returns to the File control, and the dialog stays usable`, async ({ mount, page }) => {
    const sent = await refuseUploads(page, refusal);
    const toastMounts = await watchToastMounts(page);
    await mount<typeof AddDocumentStory>(STORY, {});

    await drop(page, CLIENT_ACCEPTED_NAME);
    // The zone's alert line holds the copy module's sentence alone: the server's own wording is not shown beside it.
    const line = page.locator(REFUSAL_LINE);
    await expect(line).toHaveAttribute("role", "alert");
    await expect(line).toHaveText(shown);
    expect(await toastMounts()).toBe(0);

    // The control that took the pick is the one that holds focus again, so the line is read with it, and the line is part of the
    // control's description: a screen-reader user returning later hears why it is invalid.
    await expect(page.locator(FILE_INPUT)).toBeFocused();
    await expect(page.locator(FILE_INPUT)).toHaveAccessibleDescription(new RegExp(RegExp.escape(shown), "u"));

    // Usable: the zone takes the same file again and asks the server a second time.
    await expect(page.locator(FILE_INPUT)).toBeEnabled();
    await drop(page, CLIENT_ACCEPTED_NAME);
    await expect.poll(sent).toBe(2);
    await expect(line).toHaveText(shown);
  });
}

test("a zone refusal of the next file replaces the server's refusal of the one before it", async ({ mount, page }) => {
  const sent = await refuseUploads(page, DAMAGED);
  await mount<typeof AddDocumentStory>(STORY, {});

  await drop(page, CLIENT_ACCEPTED_NAME);
  await expect(page.locator(REFUSAL_LINE)).toHaveText(DAMAGED.shown);

  await drop(page, CLIENT_REFUSED_NAME, "text/csv");
  // One line, about the file just picked: the zone's own refusal names it, and the earlier server sentence is gone.
  const line = page.locator(REFUSAL_LINE);
  await expect(line).toHaveCount(1);
  await expect(line).toContainText(CLIENT_REFUSED_NAME);
  await expect(line).not.toContainText(DAMAGED.shown);
  expect(sent()).toBe(1);
  // The zone's own refusal marks the File control invalid, as the server's does, so the control's state matches its description.
  await expect(page.locator(FILE_INPUT)).toHaveAttribute("aria-invalid", "true");
});

test("at a short viewport with the largest text the longest refusal line is clear of the dialog footer", async ({ mount, page }) => {
  await page.setViewportSize({ width: 640, height: 400 });
  await refuseUploads(page, TOO_LARGE);
  await mount<typeof AddDocumentStory>(STORY, {});
  await setRootFontScale(page, channelName("fontScale"), FONT_SCALE.max);

  // The way a person picks: the click on the zone focuses the File control and opens the chooser, so the refusal that follows has no
  // focus move of its own to bring the line into view.
  await pickThroughChooser(page, CLIENT_ACCEPTED_NAME);
  const line = page.locator(REFUSAL_LINE);
  await expect(line).toHaveText(TOO_LARGE.shown);
  await expect(line).toBeInViewport({ ratio: 1 });
  // In the viewport is not enough: the sticky footer paints over the scroll body's last rows, so the line's bottom edge has to sit
  // above the footer's top edge.
  const footer = page.locator(DIALOG_FOOTER);
  await expect
    .poll(async () => {
      const lineBox = await line.boundingBox();
      const footerBox = await footer.boundingBox();
      return lineBox === null || footerBox === null ? null : footerBox.y - (lineBox.y + lineBox.height);
    })
    .toBeGreaterThanOrEqual(0);
});
