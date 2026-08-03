// The "From a link" scrape form's values + defaults — a TRANSIENT mutation form (there is no server row to
// seed from), so the defaults seed every open. Zero I/O, zero React.
//
// The source axis is `ScraperKind` from `@orb/contracts/databank` — the DERIVED subset of the document
// origin tuple (`SCRAPER_KINDS satisfies readonly DocOrigin[]`), so a new scraper lands here by failing tsc
// at the runner Record rather than by anyone remembering to add an option. Legacy spelled its own
// `ScrapeSource` union in `#lib`; that second spelling dies with this port.

import type { ScraperKind } from "@orb/contracts/databank";
import { SCRAPER_KINDS } from "@orb/contracts/databank";

/** The picker's labels per scraper — the LABEL data is the feature's; the axis itself is the contract's. */
const SCRAPER_LABELS: Record<ScraperKind, string> = {
  web: "Web page",
  youtube: "YouTube captions",
  wiki: "Wiki article",
};

/** The Select's options, derived from the axis so the two can never drift apart. */
export const SCRAPER_OPTIONS: readonly { readonly label: string; readonly value: ScraperKind }[] = SCRAPER_KINDS.map((value) => ({
  label: SCRAPER_LABELS[value],
  value,
}));

/** The server's own default (`scrapeYoutube`'s `lang` is `.default("en")`) — the caption-language control is
 *  a REVEAL, not a required field, so this value is what an untouched form sends. */
export const DEFAULT_CAPTION_LANG = "en";

export interface ScrapeFormValues {
  readonly source: ScraperKind;
  readonly url: string;
  readonly lang: string;
}

export const SCRAPE_FORM_DEFAULTS: ScrapeFormValues = { source: "web", url: "", lang: DEFAULT_CAPTION_LANG };
