// The client half of the card-frame doorway. Two properties matter here and neither needs a browser:
//
//   1. the mint body carries a SELECTOR and bytes — never a policy. If a `trust`/`allow*` field ever
//      appears in it, the server's `strictObject` would 400 the request AND the client would be asserting
//      a security verdict it has no standing to assert. This is the pin for that.
//   2. EVERY failure mode resolves to `undefined`, because `undefined` is what makes `SandboxFrame` render
//      the srcdoc FLOOR. A throw or a rejected promise here would blank a card instead of degrading it.

import type { CardFrameRequest } from "@orb/client/data";
import { cardFrameMintBody, mintCardFrame } from "@orb/client/data";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

// A client-asserted policy field must not be spellable in the mint body — the server owns the verdict.
const POLICY_WORDS = /trust|allow|forbid/iu;

const REQUEST: CardFrameRequest = {
  chatId: castId<ChatId>("chat_01h455vb4pex5vsknk084sn02q"),
  characterId: castId<CharacterId>("character_01h455vb4pex5vsknk084sn02r"),
  html: "<p>a sealed letter</p>",
  css: undefined,
  themeTokens: { "--sandbox-bg": "#101014" },
  fontFamily: undefined,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: () => unknown): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("cardFrameMintBody", () => {
  test("carries the selector + the bytes, and NOTHING that looks like a policy", () => {
    const body = cardFrameMintBody(REQUEST);
    expect(Object.keys(body).toSorted()).toEqual(["characterId", "chatId", "html", "themeTokens"]);
    // The server decides trust; a client-sent verdict must not even be spellable here.
    expect(JSON.stringify(body)).not.toMatch(POLICY_WORDS);
  });

  test("omits absent optionals rather than sending explicit undefined — the schema is strict", () => {
    expect(cardFrameMintBody(REQUEST)).not.toHaveProperty("css");
    expect(cardFrameMintBody(REQUEST)).not.toHaveProperty("fontFamily");
    expect(cardFrameMintBody({ ...REQUEST, css: "p{color:red}", fontFamily: "Inter, sans-serif" })).toMatchObject({
      css: "p{color:red}",
      fontFamily: "Inter, sans-serif",
    });
  });
});

describe("mintCardFrame — degrade, never block", () => {
  test("a granted mint returns the routed URL", async () => {
    stubFetch(() => ({
      ok: true,
      json: () =>
        Promise.resolve({ url: "/api/card-frame/0123456789abcdef0123456789abcdef", expiresInMs: 1000, granted: { externalMedia: true, inlineData: true } }),
    }));
    await expect(mintCardFrame("{}")).resolves.toBe("/api/card-frame/0123456789abcdef0123456789abcdef");
  });

  test("sends the CSRF header — the route 403s without it", async () => {
    let seen: Record<string, string> | undefined;
    vi.stubGlobal("fetch", (_url: string, init: { headers: Record<string, string> }) => {
      seen = init.headers;
      return { ok: true, json: () => Promise.resolve({ url: "/x", expiresInMs: 1, granted: { externalMedia: false, inlineData: false } }) };
    });
    await mintCardFrame("{}");
    expect(seen?.[CSRF_HEADER]).toBe("1");
  });

  test("a 401/403/500, a network throw, and a malformed body ALL resolve to undefined (the floor)", async () => {
    stubFetch(() => ({ ok: false, status: 401 }));
    await expect(mintCardFrame("{}")).resolves.toBeUndefined();

    stubFetch(() => {
      throw new Error("offline");
    });
    await expect(mintCardFrame("{}")).resolves.toBeUndefined();

    // A response that parses as JSON but not as the contract — a proxy's error page, a version skew.
    stubFetch(() => ({ ok: true, json: () => Promise.resolve({ nope: true }) }));
    await expect(mintCardFrame("{}")).resolves.toBeUndefined();
  });
});
