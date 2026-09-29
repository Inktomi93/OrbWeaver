// The client half of the plugin-frame doorway (#679 U7). Two properties matter here and neither needs a
// browser:
//
//   1. the mint body is a SELECTOR — a (pluginId, surfaceId) plus theme values, never document bytes and never
//      a policy. This is the property that makes the whole doorway safe to expose to the browser: a client
//      cannot mint an arbitrary document at our origin. If an `html`/`trust`/`allow*`/`csp` field ever appears
//      in the body, the server's `strictObject` would 400 it AND the client would be claiming something it has
//      no standing to claim. This is the pin for that.
//   2. EVERY failure mode resolves to `undefined`. Unlike the card frame (whose `undefined` renders the srcdoc
//      floor), a plugin frame has NO floor — a script-dead srcdoc plugin frame is a blank box — so `undefined`
//      here is what makes `PluginFrame` render NOTHING (§4.9). A throw or a rejected promise would blank a
//      surface into an error instead of collapsing it cleanly.

import type { PluginFrameRequest } from "@orb/client/data";
import { mintPluginFrame, pluginFrameMintBody, revokePluginFrame } from "@orb/client/data";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

// Neither a document nor a client-asserted policy may be spellable in the mint body — the server owns both.
const FORBIDDEN_WORDS = /html|trust|allow|forbid|csp|script/iu;

const REQUEST: PluginFrameRequest = {
  pluginId: castId<PluginId>("plugin_01h455vb4pex5vsknk084sn02q"),
  surfaceId: "board",
  themeTokens: { "--sandbox-bg": "#101014" },
  styleTokens: { "--sandbox-radius": "0.5rem" },
  fontFamily: undefined,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: () => unknown): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("pluginFrameMintBody", () => {
  test("carries ONLY the selector + theme — no document bytes, nothing that looks like a policy", () => {
    const body = pluginFrameMintBody(REQUEST);
    // `styleTokens` joined the body at #799 (the non-color half of the widened house slice — radius + the
    // mono family). The pin stays an EXACT key list on purpose: it is what makes a new field a decision.
    expect(Object.keys(body).toSorted()).toEqual(["pluginId", "styleTokens", "surfaceId", "themeTokens"]);
    // The server holds the document and decides the policy; neither is even spellable from here.
    expect(JSON.stringify(body)).not.toMatch(FORBIDDEN_WORDS);
  });

  test("omits an absent fontFamily rather than sending explicit undefined — the schema is strict", () => {
    expect(pluginFrameMintBody(REQUEST)).not.toHaveProperty("fontFamily");
    expect(pluginFrameMintBody({ ...REQUEST, fontFamily: "Inter, sans-serif" })).toMatchObject({ fontFamily: "Inter, sans-serif" });
  });
});

describe("mintPluginFrame — degrade to NOTHING, never block", () => {
  test("a granted mint returns the routed URL", async () => {
    stubFetch(() => ({ ok: true, json: () => Promise.resolve({ url: "/api/plugin-frame/0123456789abcdef0123456789abcdef", expiresInMs: 1000 }) }));
    await expect(mintPluginFrame("{}")).resolves.toBe("/api/plugin-frame/0123456789abcdef0123456789abcdef");
  });

  test("sends the CSRF header — the route 403s without it", async () => {
    let seen: Record<string, string> | undefined;
    vi.stubGlobal("fetch", (_url: string, init: { headers: Record<string, string> }) => {
      seen = init.headers;
      return { ok: true, json: () => Promise.resolve({ url: "/x", expiresInMs: 1 }) };
    });
    await mintPluginFrame("{}");
    expect(seen?.[CSRF_HEADER]).toBe("1");
  });

  test("a 401/404/500, a network throw, and a malformed body ALL resolve to undefined (renders nothing)", async () => {
    stubFetch(() => ({ ok: false, status: 404 }));
    await expect(mintPluginFrame("{}")).resolves.toBeUndefined();

    stubFetch(() => {
      throw new Error("offline");
    });
    await expect(mintPluginFrame("{}")).resolves.toBeUndefined();

    // A response that parses as JSON but not as the contract — a proxy's error page, a version skew.
    stubFetch(() => ({ ok: true, json: () => Promise.resolve({ nope: true }) }));
    await expect(mintPluginFrame("{}")).resolves.toBeUndefined();
  });
});

describe("revokePluginFrame — teardown", () => {
  test("deletes the minted handle with the CSRF header", async () => {
    let seen: { readonly url: string; readonly method: string; readonly csrf: string | undefined } | undefined;
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      seen = { url, method: init.method ?? "GET", csrf: (init.headers as Record<string, string>)[CSRF_HEADER] };
      return { ok: true };
    });
    await revokePluginFrame("/api/plugin-frame/0123456789abcdef0123456789abcdef");
    expect(seen).toEqual({
      url: "/api/plugin-frame/0123456789abcdef0123456789abcdef",
      method: "DELETE",
      csrf: "1",
    });
  });

  test("a network loss during cleanup is contained", async () => {
    stubFetch(() => {
      throw new Error("offline");
    });
    await expect(revokePluginFrame("/api/plugin-frame/0123456789abcdef0123456789abcdef")).resolves.toBeUndefined();
  });
});
