// @subject packages/server/src/domain/databank/verbs/scrape/scrape-web.ts
// A user-supplied URL reaches the network only through the composed egress guard, never the ambient fetch.

import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { afterEach, vi } from "vitest";
import { z } from "zod";

const PRIVATE_ADDRESS = "192.168.1.50";
const PRIVATE_HOST = "private-scrape.test";
const PUBLIC_URL = "https://public-scrape.test/page";
const PAGE = "<html><head><title>Public page</title></head><body>Lanterns line the public road.</body></html>";

afterEach(() => vi.unstubAllGlobals());

async function rootWithNetwork(): Promise<{ readonly root: Awaited<ReturnType<typeof createServerHarness>>; readonly dialed: string[] }> {
  const dialed: string[] = [];
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({
      networkExecution: {
        resolver: (hostname) => Promise.resolve([hostname === PRIVATE_HOST ? PRIVATE_ADDRESS : PUBLIC_PEER_ADDRESS]),
        fetch: (input, init) => {
          dialed.push(new Request(input, init).url);
          return Promise.resolve(new Response(PAGE, { headers: { "content-type": "text/html" } }));
        },
      },
    }),
  );
  construction.move();
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
  expect((await root.services.databank.list({ principal })).items).toEqual([]);
});

const UPSTREAM_FAULT = "connection reset by the scrape upstream";
const LOG_SCAN_LIMIT = 500;
const logRecordSchema = z.looseObject({ level: z.string(), security: z.boolean().optional(), err: z.looseObject({ message: z.string() }).optional() });

test.for([
  { name: "a private DNS answer", url: `https://${PRIVATE_HOST}/page` },
  { name: "a private IP literal", url: `https://${PRIVATE_ADDRESS}/page` },
] as const)("$name leaves one warning record, the firewall's security event", async ({ url }) => {
  await using root = await createServerHarness({
    logLevel: "warn",
    networkExecution: {
      resolver: (hostname) => Promise.resolve([hostname === PRIVATE_HOST ? PRIVATE_ADDRESS : PUBLIC_PEER_ADDRESS]),
      fetch: () => Promise.resolve(new Response(PAGE, { headers: { "content-type": "text/html" } })),
    },
  });
  const principal = await root.principalFor(root.ownerId);
  await expect(root.services.databank.scrapeWeb({ principal, url })).rejects.toMatchObject({ code: "scrape_failed" });

  const warnings = root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => logRecordSchema.parse(JSON.parse(line)))
    .filter((record) => record.level === "warn");
  expect(warnings.map((record) => record.security)).toEqual([true]);
});

test("a fetch that breaks off is refused as a scrape failure and the operator's log keeps the cause", async () => {
  let fetches = 0;
  await using root = await createServerHarness({
    logLevel: "warn",
    networkExecution: {
      resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]),
      fetch: () => {
        fetches += 1;
        return fetches === 1 ? Promise.resolve(new Response(PAGE, { headers: { "content-type": "text/html" } })) : Promise.reject(new Error(UPSTREAM_FAULT));
      },
    },
  });
  const principal = await root.principalFor(root.ownerId);
  const causes = (): (string | undefined)[] =>
    root.observability
      .logLines(LOG_SCAN_LIMIT)
      .map((line) => logRecordSchema.parse(JSON.parse(line)))
      .filter((record) => record.level === "warn" && record.err?.message.includes(UPSTREAM_FAULT) === true)
      .map((record) => record.err?.message);

  // The first fetch lands, so a quiet log below is the log of a working scrape and not a dead logger.
  await root.services.databank.scrapeWeb({ principal, url: PUBLIC_URL });
  expect(causes()).toEqual([]);

  await expect(root.services.databank.scrapeWeb({ principal, url: `${PUBLIC_URL}-again` })).rejects.toMatchObject({ code: "scrape_failed" });
  expect(causes()).toHaveLength(1);
});
