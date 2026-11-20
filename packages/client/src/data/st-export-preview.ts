// The SillyTavern export's dry run: a raw GET of the library export door, which answers the report the zip would carry
// and writes nothing, or refuses while the owner's export or dry run already runs.

import type { StExportRefusal, StExportReport } from "@orb/contracts/import";
import { stExportRefusalSchema, stExportReportSchema, stProfileExportPath } from "@orb/contracts/import";
import { throwHttpError } from "./http-error.ts";

const CONFLICT = 409;

/** The dry run's report, or the code it was refused with while another export runs. */
export type StExportPreviewAnswer = { readonly report: StExportReport } | { readonly refused: StExportRefusal["code"] };

/** What the SillyTavern export would carry and leave behind. Throws {@link HttpError} on any other refused read. */
export async function fetchStExportPreview(signal: AbortSignal): Promise<StExportPreviewAnswer> {
  const response = await fetch(stProfileExportPath(true), { credentials: "same-origin", signal });
  if (response.status === CONFLICT) {
    return { refused: stExportRefusalSchema.parse(await response.json()).code };
  }
  if (!response.ok) {
    await throwHttpError("stExportPreview", response);
  }
  return { report: stExportReportSchema.parse(await response.json()) };
}
