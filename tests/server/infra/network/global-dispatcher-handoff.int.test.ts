// The firewall reaches Node's built-in fetch only through the global dispatcher the npm undici package installs, and
// Node reads it from its own bundled undici copy. A node or undici bump that breaks that handoff leaves every bare
// fetch unguarded with no other test red, so this suite runs the platform fetch with no dispatcher in its init.
// The install is a boot step, and no test root runs boot steps: the slot is process-global and shared by the worker.
// So the suite calls the boot's own `installEgressFirewall` with the physical seams `createProcessSeams` hands it.
// @subject packages/server/src/infra/network/egress.ts

import { createRequire } from "node:module";
import process from "node:process";
import { installEgressFirewall, systemConnector, systemFetch, systemResolver } from "@orb/server/infra/network";
import { createQuietTimers } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createTestLogger, servePhysicalPeer } from "@orb/testkit/node/composed";
import { createTestEnv } from "@orb/testkit/node/helpers";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { z } from "zod";
import { SSRF_BLOCKED } from "#server/infra/network/contract/egress.ts";

/** A bare platform fetch, the path a provider SDK call takes, settled to the answered status or the refusal. */
async function bareFetch(url: string): Promise<string> {
  return await systemFetch(url).then(
    async (response) => {
      await response.arrayBuffer();
      return String(response.status);
    },
    (rejection: unknown) => {
      const cause = rejection instanceof Error ? rejection.cause : rejection;
      return cause instanceof Error && cause.message.includes(SSRF_BLOCKED) ? SSRF_BLOCKED : String(cause);
    },
  );
}

test("the installed firewall refuses a private literal on a fetch that names no dispatcher, and its dispatcher still dials an admitted endpoint", async () => {
  const received: string[] = [];
  await using admitted = await servePhysicalPeer((request) => {
    received.push(`admitted ${new URL(request.url).pathname}`);
    return Promise.resolve(new Response("ok"));
  });
  await using refused = await servePhysicalPeer((request) => {
    received.push(`refused ${new URL(request.url).pathname}`);
    return Promise.resolve(new Response("ok"));
  });

  // Before the install the platform's own dispatcher reaches the loopback peer, so a refusal below is the firewall's.
  expect(await bareFetch(`${refused.origin}/before`)).toBe("200");

  const platform = getGlobalDispatcher();
  try {
    installEgressFirewall({
      env: createTestEnv({ ["EGRESS_ALLOWLIST"]: new URL(admitted.origin).host }),
      fetch: systemFetch,
      resolver: systemResolver,
      buildConnector: systemConnector,
      timers: createQuietTimers(),
      log: createTestLogger(),
      traces: null,
    });

    expect(await bareFetch(`${refused.origin}/after`)).toBe(SSRF_BLOCKED);
    expect(await bareFetch(`${admitted.origin}/after`)).toBe("200");
    expect(received).toEqual(["refused /before", "admitted /after"]);
  } finally {
    // The dispatcher slot is process-global and this worker runs other suites next; hand it back before anything else.
    const installed = getGlobalDispatcher();
    setGlobalDispatcher(platform);
    if (installed !== platform) {
      await installed.destroy();
    }
  }
});

test("the declared undici major matches the copy Node bundles, the skew under which the handoff has moved before", () => {
  const declared = z.object({ version: z.string() }).parse(createRequire(import.meta.url)("undici/package.json")).version;
  const bundled = z.string().parse(process.versions["undici"]);
  const major = (version: string): string => version.split(".")[0] ?? "";

  expect(major(declared), `declared undici ${declared}, bundled ${bundled}`).toBe(major(bundled));
});
