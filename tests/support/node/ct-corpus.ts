// The CT runner borrows published wire data; it never boots, mutates or disposes the source fixture.

import { test as base } from "@playwright/experimental-ct-react";
import type { CorpusWire } from "../iso/corpus.ts";
import { loadCorpusFixture } from "./corpus.ts";

interface CorpusFixtures {
  readonly corpus: CorpusWire;
}

/** An explicit directory selects alternate published data; absence delegates to the canonical committed input. */
export interface CtCorpusOptions {
  readonly corpusDirectory: string | undefined;
}

/** Load only when a maintained component requests the shared corpus, not during runner collection. */
export const test = base.extend<CorpusFixtures & CtCorpusOptions>({
  corpusDirectory: [undefined, { option: true }],
  corpus: async ({ corpusDirectory }, use) => {
    await use(loadCorpusFixture(corpusDirectory).wire);
  },
});

export { expect } from "@playwright/experimental-ct-react";
