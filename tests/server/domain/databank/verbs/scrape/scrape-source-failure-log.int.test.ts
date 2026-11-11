// A wiki or caption source that cannot be read is refused as a scrape failure, a client error the transport does not
// log; the wrapping verb records the cause for the operator.
// @subject packages/server/src/domain/databank/verbs/scrape/scrape-wiki.ts
// @subject packages/server/src/domain/databank/verbs/scrape/scrape-youtube.ts

import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { z } from "zod";
import { ARTICLE, EXTRACT } from "./scrape-wiki.fixtures.ts";

const UPSTREAM_FAULT = "connection reset by the scrape source";
const UNREADABLE_REPLY = "<html>this is not a MediaWiki reply</html>";
const VIDEO = "https://www.youtube.com/watch?v=abcdefghijk";
const CAPTIONS = '<transcript><text start="0" dur="2">Lanterns line the road.</text></transcript>';
const WIKI_REPLY = JSON.stringify({ query: { pages: [{ title: "Northern Passes", extract: EXTRACT }] } });
const LOG_SCAN_LIMIT = 500;
const logRecordSchema = z.looseObject({ level: z.string(), err: z.looseObject({ message: z.string() }).optional() });

type Step = { readonly body: string } | { readonly fault: string };

/** A root whose egress answers each fetch from `script` in order and refuses past its end. */
async function rootScripted(script: readonly Step[]): Promise<Awaited<ReturnType<typeof createServerHarness>>> {
  const pending = [...script];
  return await createServerHarness({
    logLevel: "warn",
    networkExecution: {
      resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]),
      fetch: (): Promise<Response> => {
        const step = pending.shift();
        if (step === undefined) {
          return Promise.reject(new Error("scrape script exhausted"));
        }
        return "fault" in step ? Promise.reject(new Error(step.fault)) : Promise.resolve(new Response(step.body));
      },
    },
  });
}

function warnings(root: Awaited<ReturnType<typeof createServerHarness>>, cause: string): number {
  return root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => logRecordSchema.parse(JSON.parse(line)))
    .filter((record) => record.level === "warn" && record.err?.message.includes(cause) === true).length;
}

test("a wiki fetch that breaks off is a scrape failure and the log keeps the cause", async () => {
  await using root = await rootScripted([{ body: WIKI_REPLY }, { fault: UPSTREAM_FAULT }]);
  const principal = await root.principalFor(root.ownerId);
  await root.services.databank.scrapeWiki({ principal, url: ARTICLE });
  expect(warnings(root, UPSTREAM_FAULT)).toBe(0);
  await expect(root.services.databank.scrapeWiki({ principal, url: `${ARTICLE}_again` })).rejects.toMatchObject({ code: "scrape_failed" });
  expect(warnings(root, UPSTREAM_FAULT)).toBe(1);
});

test("a wiki reply that cannot be read is a scrape failure and the log keeps the cause", async () => {
  await using root = await rootScripted([{ body: WIKI_REPLY }, { body: UNREADABLE_REPLY }]);
  const principal = await root.principalFor(root.ownerId);
  await root.services.databank.scrapeWiki({ principal, url: ARTICLE });
  expect(warnings(root, "JSON")).toBe(0);
  await expect(root.services.databank.scrapeWiki({ principal, url: `${ARTICLE}_again` })).rejects.toMatchObject({ code: "scrape_failed" });
  expect(warnings(root, "JSON")).toBe(1);
});

test("a caption fetch that breaks off is a scrape failure and the log keeps the cause", async () => {
  await using root = await rootScripted([{ body: CAPTIONS }, { fault: UPSTREAM_FAULT }]);
  const principal = await root.principalFor(root.ownerId);
  await root.services.databank.scrapeYoutube({ principal, url: VIDEO, lang: "en" });
  expect(warnings(root, UPSTREAM_FAULT)).toBe(0);
  await expect(root.services.databank.scrapeYoutube({ principal, url: `${VIDEO}&t=1`, lang: "en" })).rejects.toMatchObject({ code: "scrape_failed" });
  expect(warnings(root, UPSTREAM_FAULT)).toBe(1);
});
