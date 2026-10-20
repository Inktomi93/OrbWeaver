// @subject packages/server/src/domain/databank/verbs/scrape/scrape-web.ts
// A user-supplied URL reaches the network only through the composed egress guard, never the ambient fetch.
import "@orb/testkit/node/composed-real.ts";
import { documents } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { afterEach, vi } from "vitest";

const PUBLIC_ADDRESS = "93.184.215.14";
const PRIVATE_ADDRESS = "192.168.1.50";
const PRIVATE_HOST = "private-scrape.test";
const PUBLIC_URL = "https://public-scrape.test/page";
const PAGE = "<html><head><title>Public page</title></head><body>Lanterns line the public road.</body></html>";

afterEach(() => vi.unstubAllGlobals());

async function rootWithNetwork(): Promise<{ readonly root: Awaited<ReturnType<typeof createServerHarness>>; readonly dialed: string[] }> {
  const dialed: string[] = [];
  const root = await createServerHarness({
    networkExecution: {
      resolver: (hostname) => Promise.resolve([hostname === PRIVATE_HOST ? PRIVATE_ADDRESS : PUBLIC_ADDRESS]),
      fetch: (input, init) => {
        dialed.push(new Request(input, init).url);
        return Promise.resolve(new Response(PAGE, { headers: { "content-type": "text/html" } }));
      },
    },
  });
  return { root, dialed };
}

function stubAmbientFetch(): ReturnType<typeof vi.fn<typeof fetch>> {
  const ambient = vi.fn<typeof fetch>(() => Promise.reject(new Error("the ambient global fetch was reached")));
  vi.stubGlobal("fetch", ambient);
  return ambient;
}

test("a public page is fetched once through the composed guard and lands as a document", async () => {
  const ambient = stubAmbientFetch();
  const { root: prepared, dialed } = await rootWithNetwork();
  await using root = prepared;
  const principal = await root.principalFor(root.ownerId);
  const result = await root.services.databank.scrapeWeb({ principal, url: PUBLIC_URL });
  expect(result).toMatchObject({ outcome: "created", document: { origin: "web", sourceUrl: PUBLIC_URL } });
  expect(dialed).toEqual([PUBLIC_URL]);
  expect(ambient).not.toHaveBeenCalled();
});

test.for([
  { name: "a private DNS answer", url: `https://${PRIVATE_HOST}/page`, reason: "private-address" },
  { name: "a plain-HTTP scheme", url: "http://public-scrape.test/page", reason: "scheme" },
  { name: "a private IP literal", url: `https://${PRIVATE_ADDRESS}/page`, reason: "ip-literal" },
] as const)("$name is refused before any physical request or stored document", async ({ url, reason }) => {
  const ambient = stubAmbientFetch();
  const { root: prepared, dialed } = await rootWithNetwork();
  await using root = prepared;
  const principal = await root.principalFor(root.ownerId);
  await expect(root.services.databank.scrapeWeb({ principal, url })).rejects.toMatchObject({
    code: "scrape_failed",
    cause: { name: "EgressBlockedError", reason },
  });
  expect(dialed).toEqual([]);
  expect(ambient).not.toHaveBeenCalled();
  expect(await root.db.select().from(documents)).toEqual([]);
});
