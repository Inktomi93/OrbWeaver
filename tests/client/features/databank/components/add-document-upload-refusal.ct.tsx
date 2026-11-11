// A refused document upload is said in the field's own line, in the copy module's sentence for the refusal's code, and the
// server's wording never reaches the person. The dialog stays usable: the same drop can be retried and the other modes stay open.
// @subject packages/client/src/features/databank/components/add-document-body.tsx
import type { DocumentUploadRefusal } from "@orb/contracts/databank";
import { EXTRACTION_OP_CODES, ExtractionFailedError, ExtractionTooLargeError } from "@orb/contracts/extraction";
import { DATABANK_UPLOAD_ROUTE } from "@orb/contracts/uploads";
import { watchToastMounts } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import { DOCUMENT_UPLOAD_FAILURE, DOCUMENT_UPLOAD_GENERAL_FAILURE } from "#client/features/databank/lib/databank-upload-copy.ts";
import type { AddDocumentStory } from "./_add-document-stories.tsx";

const STORY = "tests/client/features/databank/components/_add-document-stories/AddDocumentStory";
const UPLOAD_ROUTE = `**${DATABANK_UPLOAD_ROUTE}`;
const FILE_INPUT = 'input[type="file"]';
const FIELD_ERROR = '[data-slot="field-error"]';
const CLIENT_ACCEPTED_NAME = "ledger.txt";

interface RefusalCase {
  readonly label: string;
  readonly status: number;
  /** The body the server sends; `null` is an empty body, as a body-limit belt answers. */
  readonly body: DocumentUploadRefusal | null;
  readonly shown: string;
}

const REFUSALS: readonly RefusalCase[] = [
  {
    label: "a damaged file",
    status: 400,
    body: { error: new ExtractionFailedError("docx").message, reason: EXTRACTION_OP_CODES.failed },
    shown: DOCUMENT_UPLOAD_FAILURE[EXTRACTION_OP_CODES.failed],
  },
  {
    label: "a file that unpacks past the size budget",
    status: 400,
    body: { error: new ExtractionTooLargeError("epub").message, reason: EXTRACTION_OP_CODES.tooLarge },
    shown: DOCUMENT_UPLOAD_FAILURE[EXTRACTION_OP_CODES.tooLarge],
  },
  {
    label: "a type the server does not accept",
    status: 415,
    body: { error: "that document type is not accepted", reason: EXTRACTION_OP_CODES.unsupportedType },
    shown: DOCUMENT_UPLOAD_FAILURE[EXTRACTION_OP_CODES.unsupportedType],
  },
  { label: "a refusal that states no code", status: 413, body: null, shown: DOCUMENT_UPLOAD_GENERAL_FAILURE },
];

for (const { label, status, body, shown } of REFUSALS) {
  test(`${label} is said once in the upload field's own line, and the dialog stays usable`, async ({ mount, page }) => {
    const sent: string[] = [];
    await page.route(UPLOAD_ROUTE, (route) => {
      sent.push(route.request().method());
      return route.fulfill(body === null ? { status } : { status, json: body });
    });
    const toastMounts = await watchToastMounts(page);
    await mount<typeof AddDocumentStory>(STORY, {});
    const drop = (): Promise<void> =>
      page.locator(FILE_INPUT).setInputFiles({ name: CLIENT_ACCEPTED_NAME, mimeType: "text/plain", buffer: Buffer.from("The lantern.") });

    await drop();
    // The field's error line holds the copy module's sentence alone: the server's own wording is not shown beside it.
    await expect(page.locator(FIELD_ERROR)).toHaveText(shown);
    expect(await toastMounts()).toBe(0);

    // Usable: the zone takes the same file again and asks the server a second time.
    await expect(page.locator(FILE_INPUT)).toBeEnabled();
    await drop();
    await expect.poll(() => sent.length).toBe(2);
    await expect(page.locator(FIELD_ERROR)).toHaveText(shown);
  });
}
