// The "From a link" scrape form, built on `createSavedEntityForm` at MODULE scope (the run-workload-form
// precedent — a transient mutation form with no server row, so `serverValues` is always undefined and the
// defaults seed every open). The dialog supplies the call-time `save`, which closes over the three scraper
// mutations and the landed-document callback.

import { createSavedEntityForm } from "#forms/editor";
import type { ScrapeFormValues } from "../lib/scrape-form-model.ts";
import { SCRAPE_FORM_DEFAULTS } from "../lib/scrape-form-model.ts";

export const useScrapeForm = createSavedEntityForm<ScrapeFormValues>({ defaultValues: SCRAPE_FORM_DEFAULTS });
