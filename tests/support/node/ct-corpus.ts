// The CT runner borrows published wire data; it never boots, mutates or disposes the source fixture.

import { test as base } from "@playwright/experimental-ct-react";
import type { CorpusWire } from "../iso/corpus.ts";
import { loadCorpusFixture } from "./corpus.ts";

interface CorpusFixtures {
  readonly corpus: CorpusWire;
}

/** The maintained CT configuration selects a borrowed publication; browser stories receive no path. */
export interface CtCorpusOptions {
  readonly corpusDirectory: string | undefined;
}

/** Load only when a maintained component requests the shared corpus, not during runner collection. */
export const test = base.extend<CorpusFixtures & CtCorpusOptions>({
  corpusDirectory: [undefined, { option: true }],
  corpus: async ({ corpusDirectory }, use) => {
    if (corpusDirectory === undefined) {
      throw new Error("Corpus-backed CT requires CT_CORPUS_FIXTURE to select a published corpus directory");
    }
    await use(loadCorpusFixture(corpusDirectory).wire);
  },
});

export { expect } from "@playwright/experimental-ct-react";
