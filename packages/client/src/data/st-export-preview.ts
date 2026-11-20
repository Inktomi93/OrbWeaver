// The SillyTavern export's dry run: a raw GET of the library export door, which answers the report the zip would carry
// and writes nothing.

import type { StExportReport } from "@orb/contracts/import";
import { stExportReportSchema, stProfileExportPath } from "@orb/contracts/import";
import { throwHttpError } from "./http-error.ts";

/** What the SillyTavern export would carry and leave behind. Throws {@link HttpError} on a refused read. */
export async function fetchStExportPreview(signal: AbortSignal): Promise<StExportReport> {
  const response = await fetch(stProfileExportPath(true), { credentials: "same-origin", signal });
  if (!response.ok) {
    await throwHttpError("stExportPreview", response);
  }
  return stExportReportSchema.parse(await response.json());
}
