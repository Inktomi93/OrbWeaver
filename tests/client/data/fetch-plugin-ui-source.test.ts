// data/fetch-plugin-ui-source — the Tier-C guest-source GET. `fetch` is stubbed at
// the global boundary (the `upload-asset.test.ts` / `safeFetch` precedent — fake at the edges, never a hand-mock
// of the function under test).
//
// THE THREE-WAY OUTCOME IS THE WHOLE CONTRACT, and it is easy to collapse by accident:
//   200 → the source TEXT (which a worker will `evalCode`, so it must arrive byte-exact)
//   404 → `null`, a NORMAL answer. Every plugin shipped before U4 has no client half, and the route also
//         collapses "not yours" and "torn bundle" into this status ON PURPOSE (an existence oracle otherwise) —
//         so the caller gets one bit and the surface stays silent.
//   anything else → a THROW. A 500 is not "no client half"; treating it as one would make a broken server look
//         like a plugin that simply has no UI, which is the failure a person could never diagnose.
// The `response.ok ? text : null` shape this replaced had exactly that bug: it folded every failure into the
// silent arm.

import { fetchPluginUiSource } from "@orb/client/data";
import { PLUGIN_UI_ROUTE } from "@orb/contracts/plugin";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { afterEach, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

// MINTED, never a hand-written literal — the route parses this segment with `typeIdSchema` in production.
const PLUGIN_ID = mintTypeId(ID_PREFIX.plugin);
const SOURCE = "orb.ui(1).render('panel', { kind: 'text', value: 'hi' });";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("GETs the owner-gated route with same-origin credentials and returns the source TEXT", async () => {
  let captured: { url: string; init: RequestInit } | undefined;
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    captured = { url, init };
    return Promise.resolve(new Response(SOURCE, { status: 200, headers: { "Content-Type": "application/octet-stream" } }));
  });

  expect(await fetchPluginUiSource(PLUGIN_ID)).toBe(SOURCE);
  expect(captured?.url).toBe(`${PLUGIN_UI_ROUTE}/${PLUGIN_ID}`);
  // The route is gated on the SESSION COOKIE — without this the request is anonymous and always 401s.
  expect(captured?.init.credentials).toBe("same-origin");
});

test("404 is `null` — a plugin with no client half is a normal answer, not a failure", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 404 })));
  expect(await fetchPluginUiSource(PLUGIN_ID)).toBeNull();
});

test("a NON-404 failure THROWS — a broken server must not read as 'this plugin has no UI'", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 500, statusText: "Internal Server Error" })));
  await expect(fetchPluginUiSource(PLUGIN_ID)).rejects.toThrow("500");
});
