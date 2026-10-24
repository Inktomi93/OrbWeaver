// A root whose MediaWiki endpoint answers with one scripted body.

import { createServerHarness } from "@orb/testkit/node/composed";

export const ARTICLE = "https://wiki.example/wiki/Northern_Passes";
export const EXTRACT = "The Northern Passes are guarded by toll keepers.";

export async function rootFor(body: string): Promise<{ readonly root: Awaited<ReturnType<typeof createServerHarness>>; readonly requests: string[] }> {
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
