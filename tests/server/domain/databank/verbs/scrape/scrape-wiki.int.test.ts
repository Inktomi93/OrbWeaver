// @subject packages/server/src/domain/databank/verbs/scrape/scrape-wiki.ts
import { assets, documents, workloads } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { eq } from "drizzle-orm";

const ARTICLE = "https://wiki.example/wiki/Northern_Passes";
const EXTRACT = "The Northern Passes are guarded by toll keepers.";

async function rootFor(body: string): Promise<{ readonly root: Awaited<ReturnType<typeof createServerHarness>>; readonly requests: string[] }> {
  const requests: string[] = [];
  const root = await createServerHarness({
    networkExecution: {
      resolver: () => Promise.resolve(["93.184.215.14"]),
      fetch: (input): Promise<Response> => {
        requests.push(input instanceof Request ? input.url : String(input));
        return Promise.resolve(new Response(body, { headers: { "content-type": "application/json" } }));
      },
    },
  });
  return { root, requests };
}

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
  expect(await root.db.select().from(documents).where(eq(documents.id, result.document.id))).toMatchObject([{ extractedText: EXTRACT }]);
  expect(await root.db.select().from(workloads).where(eq(workloads.ownerId, principal.userId))).toHaveLength(1);
});

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
