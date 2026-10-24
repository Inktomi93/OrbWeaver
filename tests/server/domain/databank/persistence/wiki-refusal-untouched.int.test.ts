// A malformed MediaWiki answer refuses before any effect: no document row, and the stored workload and
// asset rows stay byte-for-byte unchanged.
// @subject packages/server/src/domain/databank/verbs/scrape/scrape-wiki.ts

import { assets, documents, workloads } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { ARTICLE, rootFor } from "../verbs/scrape/scrape-wiki.fixtures.ts";

test.each([
  { body: "{", label: "invalid JSON" },
  { body: "null", label: "null envelope" },
  { body: JSON.stringify({ query: { pages: { page: { title: "Secret title", extract: 42 } } } }), label: "wrong extract type" },
  { body: JSON.stringify({ query: { pages: { page: { title: "Missing", extract: "" } } } }), label: "missing extract" },
])("MediaWiki $label refuses before assets, documents, or queued work", async ({ body }) => {
  const { root: prepared, requests } = await rootFor(body);
  await using root = prepared;
  const principal = await root.principalFor(root.ownerId);
  const before = await root.db.select().from(workloads);
  const storedAssets = await root.db.select().from(assets);
  await expect(root.services.databank.scrapeWiki({ principal, url: ARTICLE })).rejects.toMatchObject({ code: "scrape_failed" });
  expect(requests).toHaveLength(1);
  expect(await root.db.select().from(documents)).toEqual([]);
  expect(await root.db.select().from(workloads)).toEqual(before);
  expect(await root.db.select().from(assets)).toEqual(storedAssets);
});
