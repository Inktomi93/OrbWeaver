// What a character card import says when files could not be imported, said alike by the Characters import dialog and the
// Backup and Restore import. A leaf that reads only the contracts' reason tuple, so a spec's node side reads the sentences without loading the component graph.
//
// The import route answers each failed card with a closed `reason`, and every sentence keys on it. The route's own free-text
// `error` is for the log and is never shown. Each reason says what went wrong and, when there is one, the move that works.

import type { FailedCardReason } from "@orb/contracts/import";
import { FAILED_CARD_REASONS } from "@orb/contracts/import";

/** One file was refused: what a card is, so a plain picture knows why it did not take. */
export const CARD_IMPORT_REFUSED_ONE =
  "That file isn't a character card Orbweaver can read. A card is a SillyTavern PNG with the card data inside it, or a JSON file. A plain picture won't import.";

/** Several files were refused, and none of them imported. */
export const CARD_IMPORT_REFUSED_MANY =
  "None of those files is a character card Orbweaver can read. A card is a SillyTavern PNG with the card data inside it, or a JSON file. A plain picture won't import.";

interface RefusalCopy {
  /** The one-line reason beside a refused file in the import report. */
  readonly detail: string;
  /** What to tell the person when one file failed for this reason and no file landed. */
  readonly one: string;
  /** The same when several files failed for this reason and no file landed. */
  readonly many: string;
}

// A total `Record` over the closed reason tuple, so a new reason fails `tsc` until it has its sentences.
const REFUSAL_COPY: Record<FailedCardReason, RefusalCopy> = {
  card_unreadable: { detail: "Not a character card", one: CARD_IMPORT_REFUSED_ONE, many: CARD_IMPORT_REFUSED_MANY },
  card_invalid: {
    detail: "Card data is incomplete or invalid",
    one: "That file is a character card, but its data is incomplete or invalid, so Orbweaver can't import it.",
    many: "Those files are character cards, but their data is incomplete or invalid, so Orbweaver can't import them.",
  },
  failed: {
    detail: "Couldn't be imported",
    one: "Orbweaver couldn't import that file. Try it again.",
    many: "Orbweaver couldn't import those files. Try them again.",
  },
};

/** The one-line reason beside a refused file in the import report, where the sentences below are said once under the tally. */
export function cardImportFailedDetail(reason: FailedCardReason): string {
  return REFUSAL_COPY[reason].detail;
}

/** The line the dropzone and the import report show when a batch landed no card: one sentence for each reason that refused a file. */
export function cardImportRefusalLine(failed: readonly { readonly reason: FailedCardReason }[]): string {
  const sentences: string[] = [];
  for (const reason of FAILED_CARD_REASONS) {
    const files = failed.filter((card) => card.reason === reason).length;
    if (files > 0) {
      sentences.push(files === 1 ? REFUSAL_COPY[reason].one : REFUSAL_COPY[reason].many);
    }
  }
  return sentences.join(" ");
}

/** The toast for a batch that landed some cards and refused others: how many came in, then the files that did not. */
export function cardImportPartialLine(imported: number, failedFilenames: readonly (string | null)[]): string {
  const total = imported + failedFilenames.length;
  const names = failedFilenames.filter((name): name is string => name !== null);
  const listing = names.length === 0 ? "" : `: ${names.join(", ")}`;
  const refused = failedFilenames.length === 1 ? "One file isn't a character card" : "Some files aren't character cards";
  return `${String(imported)} of ${String(total)} imported. ${refused} Orbweaver can read${listing}.`;
}
