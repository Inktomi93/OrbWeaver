import type { ChatId } from "@orb/kit/ids";
import type { BundleImportReport } from "../contract/bundle.ts";

/** Every per-file {@link BundleImportFileOutcome.notes} in the report, flattened in file order (#1710). This
 *  is the ONE derivation of "what did a bundle import leave behind" — a caller that needs the operator-facing
 *  notes (the workload result, a future sync route) reads them off HERE rather than re-walking `outcomes`
 *  itself, so a new note-carrying entity plane is visible everywhere without a second traversal to update. */
export function bundleImportNotes(report: BundleImportReport): readonly string[] {
  return report.outcomes.flatMap((outcome) => outcome.notes ?? []);
}

/** Every real conversation the bundle wrote, in file order — the input that decides whether the import has a
 *  memory scope at all, on the {@link bundleImportNotes} precedent. */
export function bundleImportMemoryChatIds(report: BundleImportReport): readonly ChatId[] {
  return report.outcomes.flatMap((outcome) => outcome.memoryChatIds ?? []);
}
