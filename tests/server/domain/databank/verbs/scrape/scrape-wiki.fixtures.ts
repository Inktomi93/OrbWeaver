// A root whose MediaWiki endpoint answers with one scripted body.

import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";

export const ARTICLE = "https://wiki.example/wiki/Northern_Passes";
export const EXTRACT = "The Northern Passes are guarded by toll keepers.";

export async function rootFor(body: string): Promise<{ readonly root: Awaited<ReturnType<typeof createServerHarness>>; readonly requests: string[] }> {
  const requests: string[] = [];
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({
      networkExecution: {
        resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]),
        fetch: (input): Promise<Response> => {
          requests.push(input instanceof Request ? input.url : String(input));
          return Promise.resolve(new Response(body, { headers: { "content-type": "application/json" } }));
        },
      },
    }),
  );
  construction.move();
  return { root, requests };
}
