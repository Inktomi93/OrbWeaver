// @subject packages/server/src/domain/databank/verbs/scrape/scrape-wiki.ts

import { expect, test } from "@orb/testkit/node";
import { ARTICLE, EXTRACT, rootFor } from "./scrape-wiki.fixtures.ts";

test.each([
  { pages: { bad: { title: 12, extract: "ignore" }, good: { title: "Northern Passes", extract: EXTRACT } }, label: "keyed pages" },
  {
    pages: [
      { title: "Missing", missing: true },
      { title: "Northern Passes", extract: EXTRACT },
    ],
    label: "array pages",
  },
])("MediaWiki $label preserves first valid extract and native ingestion", async ({ pages }) => {
  const { root: prepared, requests } = await rootFor(JSON.stringify({ query: { pages }, batchcomplete: "" }));
  await using root = prepared;
  const principal = await root.principalFor(root.ownerId);
  const result = await root.services.databank.scrapeWiki({ principal, url: ARTICLE });
  expect(result).toMatchObject({ outcome: "created", ingest: "queued", document: { name: "Northern Passes", origin: "wiki", sourceUrl: ARTICLE } });
  expect(requests).toEqual(["https://wiki.example/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=Northern%20Passes"]);
  expect(await root.services.databank.get({ principal, id: result.document.id, includeText: true })).toMatchObject({ extractedText: EXTRACT });
  expect(await root.services.workloads.list({ caller: principal, ownerId: principal.userId })).toHaveLength(1);
});
