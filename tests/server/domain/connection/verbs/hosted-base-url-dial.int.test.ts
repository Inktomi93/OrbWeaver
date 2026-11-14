// @subject packages/inference/src/backends/http/fetch-json.ts
// A hosted OpenAI-compatible server typed two ways, a website host with a versioned path and an API host bare, through
// the composed root's draft catalog dial with a scripted transport and resolver: both pass admission and reach the
// model list each spelling names, and a redirect from the host the user typed is refused, never followed.
import type { ModelListing } from "@orb/contracts/inference";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const PROVIDER = "custom-openai";
const WEBSITE = { typed: "https://nano-gpt.com/api/v1", host: "nano-gpt.com", models: "/api/v1/models" } as const;
const API = { typed: "https://api.nano-gpt.com", host: "api.nano-gpt.com", models: "/v1/models" } as const;
const MODEL = "vendor/long-context-model";
const PUBLIC_ADDRESS = "93.184.215.14";
const HTTP_MOVED = 301;
const HTTP_NOT_FOUND = 404;

interface Dial {
  readonly listing: ModelListing;
  readonly requested: readonly string[];
}

/** One draft catalog dial for `typed`, with the website host answering `websiteAnswer` and the API host listing one model. */
async function dial(typed: string, websiteAnswer: "list" | "redirect"): Promise<Dial> {
  const requested: string[] = [];
  const scripted: typeof fetch = (input, init) => {
    const url = new URL(new Request(input, init).url);
    requested.push(url.href);
    const listsHere = (url.hostname === API.host && url.pathname === API.models) || (url.hostname === WEBSITE.host && url.pathname === WEBSITE.models);
    if (url.hostname === WEBSITE.host && websiteAnswer === "redirect") {
      return Promise.resolve(new Response(null, { status: HTTP_MOVED, headers: { location: `https://${API.host}${url.pathname}` } }));
    }
    return Promise.resolve(
      listsHere ? Response.json({ object: "list", data: [{ id: MODEL, object: "model" }] }) : new Response("{}", { status: HTTP_NOT_FOUND }),
    );
  };
  await using root = await createServerHarness({
    startJobs: false,
    providerFetch: scripted,
    networkExecution: {
      fetch: scripted,
      resolver: (hostname: string): Promise<string[]> =>
        hostname === WEBSITE.host || hostname === API.host ? Promise.resolve([PUBLIC_ADDRESS]) : Promise.reject(new Error(`Unscripted address: ${hostname}`)),
    },
  });
  const caller = await root.internalCallerFor(root.ownerId);
  const listing = await caller.connection.draftCatalogModels({ providerId: PROVIDER, baseUrl: typed });
  return { listing, requested };
}

test("both spellings pass admission and list from the model route their own path names", async () => {
  for (const spelling of [WEBSITE, API]) {
    const { listing, requested } = await dial(spelling.typed, "list");
    expect(listing, spelling.typed).toMatchObject({ listed: true, models: [{ id: MODEL }] });
    expect(requested, spelling.typed).toContain(`https://${spelling.host}${spelling.models}`);
  }
});

test("a redirect from the host the user typed is refused with a reason, and its target is never dialled", async () => {
  const { listing, requested } = await dial(WEBSITE.typed, "redirect");
  if (listing.listed) {
    throw new Error("The redirected dial listed models");
  }
  expect(listing.reason).toMatch(new RegExp(String(HTTP_MOVED), "u"));
  expect(requested).toContain(`https://${WEBSITE.host}${WEBSITE.models}`);
  expect(nonEmpty(requested).some((href) => new URL(href).hostname === API.host)).toBe(false);
});
