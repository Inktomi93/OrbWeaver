// Wire stays portable. Media lazily uses a private clone and native viewer admission; source bytes never become a writable server root.

import { BLOB_ROUTE } from "@orb/contracts/assets";

import { brandedId } from "@orb/kit/ids";
import type { Route } from "@playwright/test";
import { test as base } from "@playwright/test";
import type { CorpusWire } from "../iso/corpus.ts";
import { loadCorpusFixture } from "./corpus.ts";

interface CorpusFixtures {
  readonly corpus: CorpusWire;
  readonly corpusViewer: CorpusWire["reads"]["sessions.me"][number]["output"];
  readonly corpusMedia: () => Promise<void>;
}

const MEDIA_PASSWORD = "synthetic-corpus-ct-media-viewer-password";

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
  corpusViewer: async ({ corpus }, use) => {
    const viewer = corpus.reads["sessions.me"][0]?.output;
    if (viewer === undefined) {
      throw new Error("Corpus media requires its captured viewer");
    }
    await use(viewer);
  },
  corpusMedia: [
    async ({ page, baseURL, corpusDirectory, corpusViewer }, use) => {
      if (baseURL === undefined) {
        throw new Error("Corpus media requires the configured gallery origin");
      }
      const origin = new URL(baseURL).origin;
      const initialize = async () => {
        const { createCorpusHarness } = await import("./corpus.ts");
        const { captureCookieAuth } = await import("./corpus-auth.ts");
        await using construction = new AsyncDisposableStack();
        const root = construction.use(await createCorpusHarness(corpusDirectory));
        const principal = await root.principalFor(brandedId("UserId").parse(corpusViewer.userId));
        const auth = await captureCookieAuth(root, principal, MEDIA_PASSWORD);
        const actual = auth.identity.viewer;
        if (actual.userId !== corpusViewer.userId || actual.handle !== corpusViewer.handle || actual.globalRole !== corpusViewer.globalRole) {
          throw new Error("Corpus media native identity does not match its selected viewer");
        }
        const lifetime = construction.move();
        return { root, cookie: auth.cookie, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
      };
      let started: ReturnType<typeof initialize> | undefined;
      let accepting = true;
      const pending = new Set<Promise<void>>();
      const pattern = (url: URL): boolean => url.pathname.startsWith(`${BLOB_ROUTE}/`);
      const handler = async (route: Route): Promise<void> => {
        const completion = Promise.withResolvers<void>();
        pending.add(completion.promise);
        try {
          const url = new URL(route.request().url());
          if (!accepting || url.origin !== origin) {
            await route.abort("blockedbyclient");
            return;
          }
          started ??= initialize();
          const client = await started;
          const response = await client.root.http.request(`${url.pathname}${url.search}`, {
            method: route.request().method(),
            headers: { cookie: client.cookie, forwarded: "" },
          });
          const body = Buffer.from(await response.arrayBuffer());
          const headers = Object.fromEntries([...response.headers].filter(([name]) => name !== "set-cookie"));
          await route.fulfill({ status: response.status, headers, body });
        } finally {
          pending.delete(completion.promise);
          completion.resolve();
        }
      };
      await using ownership = new AsyncDisposableStack();
      ownership.defer(async () => {
        if (started !== undefined) {
          await using _client = await started;
        }
      });
      await page.route(pattern, handler);
      ownership.defer(async () => {
        accepting = false;
        try {
          await page.unroute(pattern, handler);
        } finally {
          await Promise.all(pending);
        }
      });
      await use(async () => {
        started ??= initialize();
        await started;
      });
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
